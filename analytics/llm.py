"""Grounded LLM adapter for Ask Aevum.

The provider receives a compact, consent-gated projection of the structured Twin. It never
receives source documents, account identifiers, raw genotype rows, or the full canonical record.
Every returned claim must cite identifiers present in that projection and is rejected otherwise.
"""

import json
import os
from typing import Any

import httpx

DEFAULT_OPENAI_MODEL = "gpt-6-luna"
MODEL_ALIASES = {
    "gpt-4-luna": DEFAULT_OPENAI_MODEL,
    "gpt4-luna": DEFAULT_OPENAI_MODEL,
    "luna": DEFAULT_OPENAI_MODEL,
    "gpt-6": DEFAULT_OPENAI_MODEL,
}


def _env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    cleaned = value.strip().strip('"').strip("'")
    return cleaned or None


def _model() -> str:
    configured = _env("OPENAI_MODEL") or _env("LLM_MODEL") or DEFAULT_OPENAI_MODEL
    return MODEL_ALIASES.get(configured.lower(), configured)


def configured_provider() -> dict[str, str] | None:
    return {"provider": "openai", "model": _model()} if _env("OPENAI_API_KEY") else None


def last_routing_error() -> None:
    # Ask does not route to a fallback model. Per-request errors are returned to the caller.
    return None


ANSWER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["observed", "interpretation", "guidance", "uncertainty"],
                    },
                    "text": {"type": "string"},
                    "source_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "confidence": {"type": "string", "enum": ["High", "Moderate", "Low"]},
                },
                "required": ["kind", "text", "source_ids", "confidence"],
            },
        },
        "action_items": {
            "type": "array",
            "items": {"type": "string"},
        },
        "follow_up_questions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "medical_boundary": {"type": ["string", "null"]},
    },
    "required": [
        "summary",
        "claims",
        "action_items",
        "follow_up_questions",
        "medical_boundary",
    ],
}


INSTRUCTIONS = """You are Ask Aevum, a personal longevity intelligence guide.

Answer the user's actual question directly, in clear language, using only ASK_CONTEXT. You know the
person only through this supplied context. Never invent a measurement, diagnosis, symptom, lifestyle
fact, genetic finding, causal mechanism, intervention effect, or scientific citation.
Conversation history may resolve follow-up wording such as "that" or "why", but it is not an
independent factual source. Support every new claim with current source identifiers.

Reason in four distinct layers:
1. Observed: verified personal measurements, trends, reported context, and experiment records.
2. Interpretation: the Twin's computed phenotype and evidence-classified biological relationships.
3. Guidance: practical food, exercise, sleep, measurement, or discussion options that fit the known
   context. Describe options and tradeoffs; do not prescribe medication, doses, or treatment.
4. Uncertainty: missing, stale, conflicting, or insufficient information.

For pathway questions, start from observed signals, then explain only relationships included in the
context. Say plausible, consistent with, or may contribute when causality is not established. A
hallmark is a framework relationship, not a directly measured process.

For diet, food, or workout questions, be specific enough to be useful. Connect each suggestion to the
user's goal and available signals, account for recorded preferences/conditions/medications/allergies,
and identify what should be measured to learn whether it helped. Do not claim a personalized safety
assessment when context is missing.

For intervention questions, explain why it ranked, which personal signals support it, evidence and
population limits, safety/review gates, the measurement plan, and reasonable alternatives present in
the context. Never recommend knowledge-only or investigational gerotherapeutics for self-use.

For symptoms, disease, medication, urgent, or high-risk questions, give bounded educational context
and an appropriate medical boundary. Do not diagnose, prescribe, advise stopping medication, or
delay urgent care. Do not use a generic disclaimer when no boundary is relevant.

Every claim must cite one or more exact source_id values from ASK_CONTEXT. A source supports only the
fields written inside it. Do not cite a source merely because its title sounds relevant. Keep the
summary concise and put detail in claims. Return only the required JSON object."""


class LlmUnavailable(RuntimeError):
    pass


class UngroundedAnswer(RuntimeError):
    pass


def _provider_error(status: int, body: str) -> str:
    """Return a user-safe provider failure without reflecting credentials or request context."""
    code = ""
    message = ""
    try:
        error = json.loads(body).get("error", {})
        if isinstance(error, dict):
            code = str(error.get("code") or error.get("type") or "").strip()
            message = str(error.get("message") or "").strip()
    except (json.JSONDecodeError, AttributeError):
        pass
    if status == 401:
        return "OpenAI rejected the API key configured for Ask Aevum."
    if status == 403:
        return "The OpenAI project does not have permission to use Ask Aevum's configured model."
    if status == 404:
        return f"The configured model ({_model()}) is unavailable to this OpenAI project."
    if status == 429:
        return "OpenAI rate limits or the project's usage limit were reached."
    detail = " ".join(part for part in [code, message] if part)
    detail = detail.replace("sk-", "[redacted]-")[:180]
    return f"OpenAI returned HTTP {status}" + (f": {detail}" if detail else ".")


def _output_text(body: dict[str, Any]) -> str:
    if isinstance(body.get("output_text"), str):
        return body["output_text"]
    for item in body.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise UngroundedAnswer("The model returned no structured answer.")


def _validate(answer: dict[str, Any], allowed_source_ids: set[str]) -> dict[str, Any]:
    if not isinstance(answer, dict) or not isinstance(answer.get("claims"), list):
        raise UngroundedAnswer("The model response did not match the answer contract.")
    if not isinstance(answer.get("summary"), str) or not answer["summary"].strip():
        raise UngroundedAnswer("The model response had no summary.")
    if len(answer["summary"]) > 900 or not 1 <= len(answer["claims"]) <= 6:
        raise UngroundedAnswer("The model response contained no grounded claims.")
    for claim in answer["claims"]:
        source_ids = claim.get("source_ids") if isinstance(claim, dict) else None
        if (
            not isinstance(claim, dict)
            or claim.get("kind") not in {"observed", "interpretation", "guidance", "uncertainty"}
            or claim.get("confidence") not in {"High", "Moderate", "Low"}
            or not isinstance(claim.get("text"), str)
            or not claim["text"].strip()
            or len(claim["text"]) > 700
            or not isinstance(source_ids, list)
            or not 1 <= len(source_ids) <= 12
        ):
            raise UngroundedAnswer("A model claim had no supporting source.")
        if any(
            not isinstance(source_id, str) or source_id not in allowed_source_ids
            for source_id in source_ids
        ):
            raise UngroundedAnswer("A model claim cited a source outside the retrieved context.")
    actions = answer.get("action_items")
    follow_ups = answer.get("follow_up_questions")
    if (
        not isinstance(actions, list)
        or len(actions) > 5
        or any(not isinstance(item, str) or len(item) > 240 for item in actions)
        or not isinstance(follow_ups, list)
        or not 2 <= len(follow_ups) <= 3
        or any(not isinstance(item, str) or len(item) > 160 for item in follow_ups)
    ):
        raise UngroundedAnswer("The model response exceeded the answer contract.")
    boundary = answer.get("medical_boundary")
    if boundary is not None and (not isinstance(boundary, str) or len(boundary) > 400):
        raise UngroundedAnswer("The model response exceeded the medical-boundary contract.")
    return answer


def generate(
    question: str,
    context: dict[str, Any],
    allowed_source_ids: set[str],
    transport=None,
) -> dict[str, Any]:
    key = _env("OPENAI_API_KEY")
    model = _model()
    if not key:
        raise LlmUnavailable("Ask Aevum has not been configured with an AI model.")

    request = {
        "model": model,
        "store": False,
        "instructions": INSTRUCTIONS,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "USER_QUESTION:\n"
                        + question[:2000]
                        + "\n\nASK_CONTEXT:\n"
                        + json.dumps(context, separators=(",", ":"), ensure_ascii=False),
                    }
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "aevum_grounded_answer",
                "strict": True,
                "schema": ANSWER_SCHEMA,
            }
        },
        "max_output_tokens": 1800,
    }
    service_tier = os.getenv("OPENAI_SERVICE_TIER", "").strip()
    if service_tier in {"fast", "priority"}:
        request["service_tier"] = service_tier
    try:
        with httpx.Client(timeout=httpx.Timeout(18.0, connect=4.0), transport=transport) as client:
            response = client.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=request,
            )
            if response.status_code >= 400:
                raise LlmUnavailable(_provider_error(response.status_code, response.text))
            body = response.json()
        return _validate(json.loads(_output_text(body)), allowed_source_ids)
    except UngroundedAnswer:
        raise
    except LlmUnavailable:
        raise
    except httpx.TimeoutException as exc:
        raise LlmUnavailable("Ask Aevum's model request timed out. Please try again.") from exc
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise LlmUnavailable("The configured AI model could not complete this answer.") from exc
