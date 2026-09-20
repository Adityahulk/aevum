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
    assert len(result["rows"]) == 2
    assert len(result["retained"]) == 3
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


def test_ordinary_crp_is_distinct_from_hscrp():
    assert normalize_concept("CRP") == "CRP"
    assert normalize_concept("hs-CRP") == "HSCRP"


def test_expanded_blood_panel_concepts_keep_identity_and_units():
    b = bundle()
    b["measurements"] = []
    for name, value, unit in [
        ("RBC", "5.25", "10^6/cu.mm"),
        ("Cholesterol- VLDL", "11", "mg/dl"),
        ("C-Reactive Protein (Quantitative)", "1.1", "mg/L"),
        ("Thyroid Stimulating Hormone -", "2.064", "µIU/mL"),
        ("Vitamin D (25-OH)", "15", "ng/mL"),
    ]:
        row = copy.deepcopy(bundle()["measurements"][0])
        row.update(name=name, value=value, unit=unit, source_kind="original_lab")
        b["measurements"].append(row)
    result = parse_history(b)
    assert [row["concept_id"] for row in result["rows"]] == [
        "RBC",
        "VLDL",
        "CRP",
        "TSH",
        "VITAMIN_D",
    ]
    assert result["retained"] == []


def test_reference_status_and_coverage_are_not_a_health_score():
    b = bundle()
    b["measurements"][0].update(
        source_kind="original_lab",
        reference_low=60,
        reference_high=120,
        date="2026-09-01",
    )
    row = parse_history(b)["rows"][0]
    row.update(id="synthetic", quality_status="verified")
    result = compute({"observations": [row], "now": "2026-09-20T00:00:00+00:00"})
    feature = result["features"]["APOB"]
    domain = next(d for d in result["domains"] if d["id"] == "metabolic")
    assert feature["reference_status"] == "Within source interval"
    assert feature["trend"] == "Insufficient data"
    assert domain["coverage_explanation"] == "Availability of configured markers; not a health score"
    assert domain["available_marker_count"] == 1


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
