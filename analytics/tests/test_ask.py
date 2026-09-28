import json

import httpx
import pytest

import assistant
from llm import LlmUnavailable, generate


def test_all_personal_context_and_progress_survive_any_question():
    twin = {"version": 4, "features": {
        "APOB": {"current": 90, "baseline": 120, "trend": "Improving", "history": [
            {"id": "old", "date": "2026-01-01", "value": 120},
            {"id": "new", "date": "2026-04-01", "value": 90}]},
        "HRV": {"mean_7d": 52, "baseline_28d": 44, "device_name": "Oura"},
    }, "domains": [{"id": "recovery", "state": "Baseline forming"}]}
    payload = {
        "question": "What would work for me?", "twin": twin,
        "profile": {"goal": "Performance", "diet": "Vegetarian", "email": "private@example.com"},
        "lifestyle_facts": [{"question": "Sleep?", "answer": "6 hours"}],
        "genomic_findings": [{"id": "g1", "gene": "SLCO1B1", "interpretation": "Context only"}],
        "experiments": [{"id": "e1", "adherence": 80, "response": {"outcome": "Favorable"}}],
        "recommendations": [{"id": "r1", "category": "Exercise", "protocol": "Gradual progression"}],
        "conversation_history": [{"question": "No gym access", "answer": "Consider home training."}],
        "raw_report": "PRIVATE RAW REPORT",
    }
    context, sources = assistant.build_context(payload)
    assert sources["measurement:APOB"]["history"][0]["value"] == 120
    assert sources["measurement:APOB"]["observation_ids"] == ["old", "new"]
    assert sources["measurement:HRV"]["mean_7d"] == 52
    assert sources["context:reported"]["profile"]["diet"] == "Vegetarian"
    assert sources["context:reported"]["historical_lifestyle_facts"]
    assert sources["experiment:e1"]["response"]["outcome"] == "Favorable"
    assert sources["genomic_finding:g1"]["gene"] == "SLCO1B1"
    assert sources["recommendation:r1"]["protocol"]
    assert context["conversation_history"][0]["question"] == "No gym access"
    assert "private@example.com" not in json.dumps(context)
    assert "PRIVATE RAW REPORT" not in json.dumps(context)
    other, _ = assistant.build_context({**payload, "twin": {"features": {}},
        "genomic_findings": [], "experiments": [], "recommendations": [], "lifestyle_facts": [],
        "conversation_history": [], "profile": {}})
    assert "measurement:APOB" not in json.dumps(other)
    assert "SLCO1B1" not in json.dumps(other)


@pytest.mark.parametrize("references", [[], ["measurement:APOB", "invented", "measurement:APOB"]])
def test_answer_survives_optional_or_invalid_references(monkeypatch, references):
    monkeypatch.setattr(assistant, "generate", lambda question, context: {
        "answer": "A practical workout starts with your current routine.\n1. Start gradually.",
        "source_ids": references, "follow_up_questions": [],
    })
    result = assistant.answer({"question": "Workout?", "twin": {"features": {
        "APOB": {"history": [{"id": "obs1", "value": 90}]}}}})
    assert "practical workout" in result["answer"]
    assert result["claims"] == []
    assert "confidence" not in result
    assert all(s["source_id"] == "measurement:APOB" for s in result["source_cards"])
    assert result["provenance"]["observation_ids"] == (["obs1"] if references else [])


@pytest.mark.parametrize("question", ["Workout for me?", "What is a mitochondrion?", "Hello", "How do I cook lentils?"])
def test_one_call_returns_answers_without_required_claims_or_followups(monkeypatch, question):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "operator-selected-model")
    requests = []
    def respond(req):
        body = json.loads(req.content)
        requests.append(body)
        assert body["model"] == "operator-selected-model"
        assert body["store"] is False
        assert json.loads(body["input"])["question"] == question
        return httpx.Response(200, json={"output_text": json.dumps({
            "answer": "A useful answer. " * 200, "source_ids": [], "follow_up_questions": []})})
    result = generate(question, {"sources": []}, transport=httpx.MockTransport(respond))
    assert len(result["answer"]) > 900
    assert len(requests) == 1


@pytest.mark.parametrize("body, expected", [
    ({"output": [{"type": "message", "content": [{"type": "refusal", "refusal": "I can help with a safer alternative."}]}]}, "safer alternative"),
    ({"output_text": "Here is a helpful plain-text answer."}, "helpful plain-text"),
])
def test_model_refusal_and_plain_text_are_conversation_not_errors(monkeypatch, body, expected):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    result = generate("Question", {}, transport=httpx.MockTransport(lambda req: httpx.Response(200, json=body)))
    assert expected in result["answer"]


def test_real_provider_failure_is_preserved(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    with pytest.raises(LlmUnavailable, match="invalid model"):
        generate("Hi", {}, transport=httpx.MockTransport(lambda req: httpx.Response(400, text='{"error":"invalid model"}')))
    monkeypatch.delenv("OPENAI_API_KEY")
    with pytest.raises(LlmUnavailable, match="configured"):
        generate("Hi", {})


def test_answer_endpoint_delivers_uncited_reply(monkeypatch):
    from fastapi.testclient import TestClient
    from main import app

    monkeypatch.setenv("ANALYTICS_SECRET", "test-service-key")
    monkeypatch.setattr(assistant, "generate", lambda question, context: {
        "answer": "I can explain that. What would you like to know?",
        "source_ids": [], "follow_up_questions": [],
    })
    client = TestClient(app)
    response = client.post("/answer", json={"question": "Hello", "twin": {}},
        headers={"X-Service-Key": "test-service-key"})
    assert response.status_code == 200
    assert response.json()["answer"].startswith("I can explain")
    assert response.json()["source_cards"] == []
    assert client.post("/answer", json={"question": "Hello", "twin": {}}).status_code == 401
