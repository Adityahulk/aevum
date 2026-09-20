import copy

import pytest
from engine import compute
from history_import import parse_history
from ingestion import normalize_concept


def bundle():
    return {
        "schema_version": "aevum-history-1",
        "client_name": "Synthetic Client",
        "measurements": [
            {
                "name": "ApoB",
                "value": "112",
                "unit": "mg/dL",
                "date": "2026-01-01",
                "source_file": "synthetic.csv",
                "source_sha256": "a" * 64,
                "source_kind": "transcribed_table",
                "reference_high": 80,
            }
        ],
        "lifestyle": {
            "collected_at": "2026-01-02T12:00:00Z",
            "source_file": "intake.json",
            "source_sha256": "b" * 64,
            "facts": [{"source_pointer": "/sleep", "value": "unknown"}],
        },
        "fresh_review": {"headline": "Informational text only"},
    }


def test_secondary_source_confidence_and_no_invented_references():
    b = bundle()
    result = parse_history(b, "artifact")
    assert result["rows"][0]["confidence"] == 0.65
    assert result["rows"][0]["reference_range"]["high"] is None
    assert result["rows"][0]["quality_status"] == "review_required"
    assert result["rows"][0]["provenance_id"] == "artifact"
    assert result["lifestyle"] == b["lifestyle"]
    assert "fresh_review" not in result["rows"][0]


def test_all_qualified_unknown_and_missing_unit_results_survive():
    b = bundle()
    for name, value, unit in [
        ("Vitamin B12", ">2000", "pg/mL"),
        ("ApoB", "100", ""),
        ("CRP", "3", "mg/L"),
        ("Glucose", "Negative", ""),
    ]:
        row = copy.deepcopy(b["measurements"][0])
        row.update(name=name, value=value, unit=unit)
        b["measurements"].append(row)
    result = parse_history(b)
    assert len(result["measurements"]) == 5
    assert len(result["rows"]) == 1
    assert len(result["retained"]) == 4
    assert result["measurements"][1]["value"] == ">2000"


@pytest.mark.parametrize(
    "change",
    [
        {"date": "2099-01-01"},
        {"source_sha256": "invalid"},
        {"source_kind": "verified"},
    ],
)
def test_invalid_provenance_rejected(change):
    b = bundle()
    b["measurements"][0].update(change)
    with pytest.raises(ValueError):
        parse_history(b)


def test_missing_historical_answer_timestamp_rejected():
    b = bundle()
    del b["lifestyle"]["collected_at"]
    with pytest.raises(ValueError):
        parse_history(b)


def test_ordinary_crp_never_becomes_hscrp():
    with pytest.raises(ValueError):
        normalize_concept("CRP")
    assert normalize_concept("hs-CRP") == "HSCRP"


def test_one_time_point_is_not_stable_trajectory():
    b = bundle()
    b["measurements"][0]["date"] = "2026-09-01"
    row = parse_history(b)["rows"][0]
    row.update(id="synthetic", quality_status="verified")
    result = compute({"observations": [row], "now": "2026-09-20T00:00:00+00:00"})
    assert result["overall_trajectory"] == "Insufficient longitudinal data"
    assert result["features"]["APOB"]["trend"] == "Insufficient data"


def test_model_version_invalidates_old_snapshot_and_cached_domains(monkeypatch):
    import engine

    payload = {"observations": [], "now": "2026-09-20T00:00:00+00:00"}
    before = compute(payload)
    monkeypatch.setattr(engine, "MODEL_VERSION", "test-next-version")
    before["domains"][0]["state"] = "obsolete-cached-value"
    after = compute(
        {**payload, "previous": before, "dirty_concepts": ["HSCRP"], "reuse_unaffected": True}
    )
    assert before["input_snapshot"] != after["input_snapshot"]
    assert after["domains"][0]["state"] != "obsolete-cached-value"
