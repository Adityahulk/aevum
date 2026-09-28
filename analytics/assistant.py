"""Personal context → one LLM answer → optional references, resolved by the server."""

import uuid
from datetime import datetime, timezone
from typing import Any

from catalog import EVIDENCE
from llm import LlmUnavailable, generate


def _pick(record, keys):
    return {key: record[key] for key in keys.split() if key in record}


def build_context(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    # Payload is assembled for the authenticated user after health/AI and source consent checks.
    # Project only health fields, never account identifiers or uploaded raw documents.
    twin = payload["twin"]
    sources = {}

    def add(source_id, source_type, fields):
        sources[source_id] = {"source_id": source_id, "source_type": source_type, **fields}

    add("context:reported", "user_reported_context", {
        "profile": _pick(payload.get("profile", {}),
            "age sex goal secondary_goal conditions medications allergies symptoms exercise_frequency "
            "exercise_type sleep_duration sleep_schedule diet alcohol smoking stress family_history preferences "
            "procedures supplements occupation exposures"),
        "historical_lifestyle_facts": payload.get("lifestyle_facts", []),
    })
    for code, feature in twin.get("features", {}).items():
        fields = _pick(feature,
            "concept_id label current unit baseline personal_change_pct trend reference_range "
            "reference_status longitudinal_status latest_date stale source device_name measurement_method "
            "mean_7d baseline_28d sleep_variability_30d count span_days")
        history = feature.get("history", [])
        # Keep the earliest point and recent progression without forwarding unbounded device streams.
        selected_history = history if len(history) <= 60 else [history[0], *history[-59:]]
        fields["history"] = selected_history
        fields["history_truncated"] = len(history) > len(selected_history)
        fields["observation_ids"] = [point["id"] for point in selected_history if point.get("id")]
        add(f"measurement:{code}", "measurement_history", fields)

    for domain in twin.get("domains", []):
        add(f"domain:{domain['id']}", "computed_domain", _pick(domain,
            "id name state trend confidence coverage phenotype phenotype_explanation uncertainty"))
    for relationship in twin.get("relationships", []):
        add(f"relationship:{relationship['id']}", "curated_biological_relationship", _pick(relationship,
            "domain phenotype process pathway hallmark_id evidence_level confidence limitations evidence_ids"))
    for recommendation in payload.get("recommendations", []):
        add(f"recommendation:{recommendation['id']}", "ranked_intervention", _pick(recommendation,
            "name category domain also level personal_relevance why protocol implementation_options "
            "expected_effect weeks available_baselines measurement_plan risk review_required blocked_reasons "
            "interaction_flags evidence_ids"))
    for experiment in payload.get("experiments", []):
        add(f"experiment:{experiment['id']}", "personal_experiment", _pick(experiment,
            "name intervention_id status start_date protocol baseline adherence response "
            "planned_duration_weeks success_threshold_pct"))
    for finding in payload.get("genomic_findings", []):
        add(f"genomic_finding:{finding['id']}", "curated_genomic_interpretation", _pick(finding,
            "gene variant interpretation impact evidence"))
    for item in EVIDENCE:
        add(f"evidence:{item['id']}", "curated_scientific_evidence", _pick(item,
            "title population study_design endpoint effect limitations citation"))

    context = {
        "as_of": datetime.now(timezone.utc).isoformat(),
        "twin": _pick(twin, "version model_version generated_at overall_trajectory priorities"),
        "requested_domain": payload.get("domain"),
        "sources": list(sources.values()),
        "conversation_history": [
            {"question": turn.get("question"), "answer": turn.get("answer")}
            for turn in payload.get("conversation_history", [])[-6:]
        ],
    }
    return context, sources


def answer(payload: dict[str, Any]) -> dict[str, Any]:
    context, sources = build_context(payload)
    generated = generate(payload["question"], context)
    # References are optional metadata. Invalid links never block the answer or acquire provenance.
    cited_ids = list(dict.fromkeys(
        source_id for source_id in generated.get("source_ids", [])
        if isinstance(source_id, str) and source_id in sources
    ))
    cited = [sources[source_id] for source_id in cited_ids]
    evidence_ids = [s.split(":", 1)[1] for s in cited_ids if s.startswith("evidence:")]
    return {
        "id": str(uuid.uuid4()),
        "question": payload["question"],
        "answer": generated["answer"],
        "mode": "Personal AI",
        "mode_detail": "Uses your available health record and conversation alongside general knowledge.",
        "domain": payload.get("domain"),
        "claims": [],
        "source_cards": cited,
        "evidence": [item for item in EVIDENCE if item["id"] in evidence_ids],
        "suggestions": [q for q in generated.get("follow_up_questions", []) if isinstance(q, str)][:2],
        "provenance": {
            "observation_ids": list(dict.fromkeys(
                oid for source in cited for oid in source.get("observation_ids", [])
            )),
            "relationship_ids": [s.split(":", 1)[1] for s in cited_ids if s.startswith("relationship:")],
            "evidence_ids": evidence_ids,
            "twin_version": payload["twin"].get("version"),
        },
    }
