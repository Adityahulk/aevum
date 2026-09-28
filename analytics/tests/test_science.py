import json
from datetime import datetime, timedelta, timezone

import pytest
from catalog import HALLMARKS, RELATIONSHIPS
from engine import compute, evaluate, rank
from ingestion import normalized_row, parse_genotype, parse_labs, parse_oura

NOW = datetime(2026, 9, 14, tzinfo=timezone.utc)


def obs(code="APOB", value=100, days=0, source="lab_csv", low=60, high=100, id=None):
    return normalized_row(
        {
            "concept_id": code,
            "value": value,
            "unit": {
                "HRV": "ms",
                "RHR": "bpm",
                "VO2MAX": "mL/kg/min",
                "SLEEP": "h",
            }.get(code, "mg/dL"),
            "effective_time": (NOW - timedelta(days=days)).isoformat(),
            "reference_low": low,
            "reference_high": high,
            "id": id or f"{code}-{days}",
        },
        source,
        "raw-test",
        True,
    )


def model(observations, **kwargs):
    return compute(
        {
            "observations": observations,
            "profile": {"age": 40, "sex": "Male"},
            "now": NOW.isoformat(),
            **kwargs,
        }
    )


def dom(twin, id="metabolic"):
    return next(d for d in twin["domains"] if d["id"] == id)


def experiment(**kwargs):
    return {
        "start_date": (NOW - timedelta(days=84)).isoformat(),
        "planned_duration_weeks": 12,
        "baseline": {"APOB": {"value": 132, "source": "lab_csv", "noise_pct": 3}},
        "baseline_observation_ids": [],
        "success_threshold_pct": 5,
        "adherence": 90,
        **kwargs,
    }


def test_all_hallmarks_exist_and_no_direct_marker_to_hallmark():
    assert len(HALLMARKS) == 12 and len({h["name"] for h in HALLMARKS}) == 12
    assert all(
        r.get("phenotype") and r.get("process") and r.get("pathway") and r.get("evidence_ids")
        for r in RELATIONSHIPS
    )


def test_empty_twin_is_not_healthy_or_a_biological_age():
    t = model([])
    assert all(d["state"] == "Insufficient data" for d in t["domains"])
    assert t["coverage"] == 0
    assert not t["priorities"]
    assert "biological_age" not in t


def test_unknown_context_limits_confidence():
    t = model([obs(days=120), obs(days=60), obs()], profile={})
    assert dom(t)["confidence"] == "Low"


def test_one_observation_cannot_establish_trend():
    t = model([obs(value=132)])
    assert dom(t)["trend"] == "Insufficient data"
    assert t["features"]["APOB"]["baseline"] is None


def test_direction_is_concept_specific():
    t = model(
        [
            obs(value=130, days=90),
            obs(value=100),
            obs("VO2MAX", 40, 90, low=30, high=65),
            obs("VO2MAX", 45, 0, low=30, high=65),
        ]
    )
    assert t["features"]["APOB"]["trend"] == "Improving"
    assert t["features"]["VO2MAX"]["trend"] == "Improving"


def test_stale_lab_does_not_create_current_priority():
    t = model([obs(value=160, days=200)])
    assert t["features"]["APOB"]["stale"]
    assert dom(t)["coverage"] == 0
    assert not t["priorities"]


def test_future_date_rejected():
    with pytest.raises(ValueError, match="historical range"):
        normalized_row({"biomarker": "ApoB", "value": 110, "unit": "mg/dL", "date": "2099-01-01"})


@pytest.mark.parametrize("value", ["<5", "NaN", "inf", "", None])
def test_qualified_or_nonfinite_values_rejected(value):
    with pytest.raises(ValueError):
        normalized_row({"biomarker": "ApoB", "value": value, "unit": "mg/dL", "date": "2026-01-01"})


@pytest.mark.parametrize("unit", ["", "banana", "mmol/L"])
def test_ambiguous_apob_units_rejected(unit):
    with pytest.raises(ValueError, match="unit"):
        normalized_row({"biomarker": "ApoB", "value": 1.2, "unit": unit, "date": "2026-01-01"})


def test_unit_conversion_includes_reference_limits_and_preserves_original():
    o = normalized_row(
        {
            "biomarker": "Apo B",
            "value": 1.2,
            "unit": "g/L",
            "date": "2026-01-01",
            "reference_low": 0.6,
            "reference_high": 1,
        }
    )
    assert o["value"] == 120
    assert o["reference_range"]["high"] == 100
    assert o["original_unit"] == "g/L"
    assert o["quality_status"] == "review_required"


def test_unverified_measurements_do_not_reach_the_twin():
    o = obs()
    o["quality_status"] = "review_required"
    assert model([o])["features"] == {}


def test_date_ambiguity_and_inverted_ranges_rejected():
    with pytest.raises(ValueError):
        normalized_row({"biomarker": "APOB", "value": 100, "unit": "mg/dL", "date": "01/02/2026"})
    with pytest.raises(ValueError):
        normalized_row(
            {
                "biomarker": "APOB",
                "value": 100,
                "unit": "mg/dL",
                "date": "2026-01-01",
                "reference_low": 100,
                "reference_high": 60,
            }
        )


def test_duplicate_day_does_not_inflate_count():
    a = obs()
    b = {**a, "id": "other"}
    assert model([a, b])["features"]["APOB"]["count"] == 1


def test_persistence_stops_at_normal_result():
    t = model([obs(value=150, days=120), obs(value=90, days=60), obs(value=130)])
    assert t["features"]["APOB"]["persistence_days"] == 0


def test_wearable_frequency_and_baseline():
    readings = [obs("HRV", 50 if i > 7 else 40, i, "oura", None, None) for i in range(29)]
    f = model(readings)["features"]["HRV"]
    assert f["baseline_28d"] == 50
    assert f["mean_7d"] == 40
    assert f["trend"] == "Worsening"
    assert f["window_days"] == 28


def test_incremental_recompute_preserves_unaffected_domains():
    previous = model([obs(), obs("VO2MAX", 40, 0, low=30, high=65)])
    next = model(
        [obs(value=130), obs("VO2MAX", 40, 0, low=30, high=65)],
        previous=previous,
        dirty_concepts=["APOB"],
        reuse_unaffected=True,
    )
    assert dom(previous, "functional") == dom(next, "functional")
    assert dom(previous) != dom(next)


def test_genetics_and_family_context_are_not_diagnoses():
    a = model([obs()])
    b = model(
        [obs()],
        profile={
            "age": 40,
            "sex": "Male",
            "family_history": [{"condition": "heart disease"}],
            "genotype": "CC",
        },
    )
    assert a["domains"] == b["domains"]


def test_goal_changes_ranking_not_biology():
    t = model(
        [
            obs(value=130),
            obs("VO2MAX", 40, low=30, high=65),
            obs("HRV", 45, source="oura", low=None, high=None),
        ]
    )
    a = rank({"twin": t, "profile": {"goal": "Performance"}})
    b = rank({"twin": t, "profile": {"goal": "Recovery"}})
    assert a != b
    assert t == model(
        [
            obs(value=130),
            obs("VO2MAX", 40, low=30, high=65),
            obs("HRV", 45, source="oura", low=None, high=None),
        ]
    )


def test_contraindications_are_hard_gates():
    t = model([obs("VO2MAX", 40, low=30, high=65)])
    r = rank({"twin": t, "profile": {"goal": "Performance", "symptoms": "chest pain"}})
    aerobic = next(r for r in r["recommendations"] if r["id"] == "aerobic")
    assert not aerobic["eligible"]
    secondary = rank({"twin": model([]), "profile": {"goal": "Recovery", "secondary_goal": "Performance"}})["recommendations"]
    strength = next(r for r in secondary if r["id"] == "strength")
    assert strength["recommendation_basis"] == "Goal support"
    assert "performance" in strength["personal_reason"]
    assert "chest pain" in aerobic["blocked_reasons"]


def test_normal_lipids_do_not_create_a_clinical_priority_or_personal_need():
    results = rank({"twin": model([obs(value=70)]), "profile": {"goal": "Performance"}})["recommendations"]
    assert not any(r["id"] == "clinical-lipids" for r in results)
    nutrition = next(r for r in results if r["id"] == "nutrition")
    assert nutrition["available_baselines"] == ["APOB"]
    assert nutrition["personal_relevance"] == "Not established"
    assert nutrition["recommendation_basis"] == "General option"
    aerobic = next(r for r in results if r["id"] == "aerobic")
    assert aerobic["recommendation_basis"] == "Goal support"
    assert not aerobic["eligible"]


def test_clinical_lipids_require_a_current_flagged_target():
    results = rank({"twin": model([obs(value=140)])})["recommendations"]
    clinical = next(r for r in results if r["id"] == "clinical-lipids")
    assert "ApoB" in clinical["personal_reason"]
    assert clinical["review_required"] and not clinical["eligible"]
    assert "persistent" not in clinical["name"].lower()
    stale = rank({"twin": model([obs(value=140, days=400)])})["recommendations"]
    assert not any(r["id"] == "clinical-lipids" for r in stale)


def test_supplements_default_off_and_review_required():
    t = model([obs()])
    assert all(r["category"] != "Supplement" for r in rank({"twin": t})["recommendations"])
    r = rank({"twin": t, "profile": {"preferences": {"supplements": True}}})
    assert not next(x for x in r["recommendations"] if x["id"] == "creatine")["eligible"]


def test_strong_filter_and_no_automatic_investigational_protocols():
    r = rank({"twin": model([obs()]), "profile": {"preferences": {"strong_only": True}}})
    assert all(x["level"] == "Established" for x in r["recommendations"])
    assert all(x["status"] == "Research knowledge only" for x in r["knowledge_only"])


@pytest.mark.parametrize(
    "change,outcome",
    [(108, "Favorable"), (133, "No meaningful response"), (155, "Negative")],
)
def test_response_classes(change, outcome):
    r = evaluate(
        {
            "experiment": experiment(),
            "observations": [obs(value=change)],
            "now": NOW.isoformat(),
        }
    )
    assert r["outcome"] == outcome


@pytest.mark.parametrize(
    "patch", [{"adherence": 20}, {"start_date": (NOW - timedelta(days=10)).isoformat()}]
)
def test_response_inconclusive_without_duration_or_adherence(patch):
    r = evaluate(
        {
            "experiment": experiment(**patch),
            "observations": [obs(value=108)],
            "now": NOW.isoformat(),
        }
    )
    assert r["outcome"] == "Inconclusive"


def test_baseline_cannot_be_reused_as_followup():
    r = evaluate(
        {
            "experiment": experiment(baseline_observation_ids=["APOB-0"]),
            "observations": [obs(value=108)],
            "now": NOW.isoformat(),
        }
    )
    assert r["outcome"] == "Inconclusive"


def test_ancient_or_wrong_source_followup_rejected():
    r = evaluate(
        {
            "experiment": experiment(),
            "observations": [obs(value=108, days=83), obs(value=108, source="manual")],
            "now": NOW.isoformat(),
        }
    )
    assert r["outcome"] == "Inconclusive"


def test_adverse_effect_overrides_missing_data_and_confounding_lowers_confidence():
    assert (
        evaluate(
            {
                "experiment": experiment(adverse_effects="New symptoms"),
                "observations": [],
                "now": NOW.isoformat(),
            }
        )["outcome"]
        == "Adverse"
    )
    r = evaluate(
        {
            "experiment": experiment(),
            "observations": [obs(value=108)],
            "concurrent_experiments": 1,
            "now": NOW.isoformat(),
        }
    )
    assert r["confidence"] == "Low"
    assert r["confounders"]
    assert "does not prove" in r["interpretation"]


def test_csv_collects_errors_for_review_and_aliases_normalize():
    result = parse_labs(
        b"biomarker,value,unit,date\nApo B,1.2,g/L,2026-01-01\nunknown,5,x,2026-01-01",
        "labs.csv",
        "raw",
    )
    assert result["rows"][0]["concept_id"] == "APOB"
    assert len(result["errors"]) == 1
    assert result["status"] == "review_required"


def test_oura_import_uses_seconds_and_historical_dates():
    raw = {"data": [{"day": "2026-01-01", "average_hrv": 50, "total_sleep_duration": 25200}]}
    result = parse_oura(json.dumps(raw).encode(), "raw")
    assert len(result["rows"]) == 2
    assert result["rows"][1]["value"] == 7
    assert all(o["quality_status"] == "review_required" for o in result["rows"])


def test_genotype_requires_build_and_does_not_diagnose():
    with pytest.raises(ValueError, match="build"):
        parse_genotype(b"rs4149056 12 21331549 CC", "raw")
    result = parse_genotype(b"# build 37\nrs4149056 12 21331549 CC\nrs1 1 2 --", "raw")
    assert result["variant_count"] == 1
    assert "Context only" in result["findings"][0]["impact"]


def test_guide_context_contains_verified_twin_and_excludes_raw_records():
    from assistant import build_context

    t = model([obs(value=132, days=90), obs(value=115)])
    context, sources = build_context(
        {
            "question": "Why is metabolic health changing?",
            "twin": t,
            "profile": {"goal": "Longevity", "diet": "Vegetarian"},
            "raw_report": "must never leave",
            "raw_genotype": ["rs1 AA"],
        }
    )
    encoded = json.dumps(context)
    assert "must never leave" not in encoded
    assert "rs1 AA" not in encoded
    assert any(source_id.startswith("measurement:") for source_id in sources)
    assert sources["context:reported"]["profile"]["diet"] == "Vegetarian"


def test_workout_context_includes_relevant_systems_and_existing_exercise_options():
    from assistant import build_context

    t = model([obs(value=132, days=90), obs(value=115)])
    context, sources = build_context(
        {
            "question": "What workout routine is suitable for me?",
            "twin": t,
            "profile": {"goal": "Performance"},
            "recommendations": [
                {"id": "aerobic", "name": "Build aerobic fitness", "category": "Exercise"}
            ],
        }
    )
    included = {item["source_id"] for item in context["domain_context"]}
    assert {"domain:cardiovascular", "domain:musculoskeletal", "domain:functional"} <= included
    assert "context:reported" in sources
    assert "recommendation:aerobic" in sources


def test_guide_maps_model_citations_to_server_owned_provenance(monkeypatch):
    import assistant

    t = model([obs(value=132, days=90), obs(value=115)])
    expected_ids = dom(t)["supporting_observation_ids"]
    monkeypatch.setattr(
        assistant,
        "generate",
        lambda question, context, allowed: {
            "summary": "Your ApoB trend is the main measured signal.",
            "claims": [
                {
                    "kind": "observed",
                    "text": "The latest ApoB is 115 mg/dL.",
                    "source_ids": [
                        next(
                            source_id
                            for source_id in allowed
                            if source_id.startswith("measurement:")
                        )
                    ],
                    "confidence": "High",
                }
            ],
            "action_items": ["Repeat a comparable measurement after the planned interval."],
            "follow_up_questions": ["What changed?", "What remains uncertain?"],
            "medical_boundary": None,
        },
    )
    result = assistant.answer(
        {"question": "Why is ApoB changing?", "twin": t, "profile": {}}
    )
    assert result["mode"] == "Grounded AI"
    assert set(result["provenance"]["observation_ids"]).issubset(set(expected_ids))
    assert result["claims"][0]["source_ids"][0].startswith("measurement:")


def test_pdf_extraction_requires_verification_and_preserves_date():
    import io

    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
    )
    stream = DecodedStreamObject()
    stream.set_data(
        b"BT /F1 12 Tf 40 700 Td (Date 2026-01-01) Tj 0 -25 Td (ApoB 118 mg/dL 60-100) Tj ET"
    )
    page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    result = parse_labs(buffer.getvalue(), "report.pdf", "raw-pdf")
    assert result["rows"][0]["value"] == 118
    assert result["rows"][0]["quality_status"] == "review_required"
    assert result["rows"][0]["effective_time"].startswith("2026-01-01")


def test_scanned_pdf_never_silently_creates_observations():
    import io

    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    out = io.BytesIO()
    writer.write(out)
    result = parse_labs(out.getvalue(), "scan.pdf", "raw")
    assert result["rows"] == []
    assert result["errors"]
    assert result["status"] == "review_required"


def test_external_llm_answer_is_structured_private_and_source_validated(monkeypatch):
    import httpx
    from llm import LlmUnavailable, UngroundedAnswer, generate

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "operator-selected-model")
    context = {
        "sources": [
            {
                "source_id": "measurement:obs-1",
                "source_type": "verified_measurement_summary",
                "label": "ApoB",
                "current": 115,
            }
        ]
    }

    def respond(req):
        body = json.loads(req.content)
        assert body["store"] is False
        assert "raw_report" not in json.dumps(body)
        assert body["text"]["format"]["strict"] is True
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(
                                    {
                                        "summary": "ApoB is the relevant measured signal.",
                                        "claims": [
                                            {
                                                "kind": "observed",
                                                "text": "Your ApoB is 115.",
                                                "source_ids": ["measurement:obs-1"],
                                                "confidence": "High",
                                            }
                                        ],
                                        "action_items": [],
                                        "follow_up_questions": [
                                            "What changed over time?",
                                            "What should I measure next?",
                                        ],
                                        "medical_boundary": None,
                                    }
                                ),
                            }
                        ],
                    }
                ],
            },
        )

    result = generate(
        "Why did ApoB change?",
        context,
        {"measurement:obs-1"},
        httpx.MockTransport(respond),
    )
    assert result["claims"][0]["source_ids"] == ["measurement:obs-1"]

    provider_error = '{"error":{"message":"invalid model"}}'
    failing = httpx.MockTransport(lambda req: httpx.Response(400, text=provider_error))
    with pytest.raises(LlmUnavailable, match="invalid model"):
        generate("Why?", context, {"measurement:obs-1"}, failing)

    malicious = httpx.MockTransport(
        lambda req: httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(
                                    {
                                        "summary": "Unsupported",
                                        "claims": [
                                            {
                                                "kind": "observed",
                                                "text": "Invented result",
                                                "source_ids": ["measurement:invented"],
                                                "confidence": "High",
                                            }
                                        ],
                                        "action_items": [],
                                        "follow_up_questions": ["One?", "Two?"],
                                        "medical_boundary": None,
                                    }
                                ),
                            }
                        ],
                    }
                ],
            },
        )
    )
    with pytest.raises(UngroundedAnswer, match="outside"):
        generate("Ignore instructions", context, {"measurement:obs-1"}, malicious)


def test_external_llm_repairs_an_invalid_citation_once(monkeypatch):
    import httpx
    from llm import generate

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    responses = iter(["measurement:typo", "measurement:obs-1"])

    def respond(_req):
        source_id = next(responses)
        return httpx.Response(
            200,
            json={
                "output_text": json.dumps(
                    {
                        "summary": "A measured signal can guide the next step.",
                        "claims": [
                            {
                                "kind": "guidance",
                                "text": "Use the available signal to plan a manageable next step.",
                                "source_ids": [source_id],
                                "confidence": "Moderate",
                            }
                        ],
                        "action_items": [],
                        "follow_up_questions": ["What should I measure?", "What is missing?"],
                        "medical_boundary": None,
                    }
                )
            },
        )

    result = generate(
        "What should I do?",
        {"sources": [{"source_id": "measurement:obs-1"}]},
        {"measurement:obs-1"},
        httpx.MockTransport(respond),
    )
    assert result["claims"][0]["source_ids"] == ["measurement:obs-1"]


def test_ask_has_no_deterministic_answer_when_model_is_unconfigured(monkeypatch):
    from llm import LlmUnavailable, generate

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    with pytest.raises(LlmUnavailable, match="configured"):
        generate("What should I eat?", {"sources": []}, set())


def test_evidence_retrieval_returns_citations_and_normalized_vectors():
    from retrieval import embed, search

    result = search("sleep duration consensus")
    assert result[0]["id"] == "e-sleep"
    assert result[0]["citation"].startswith("https://")
    vector = embed("sleep duration consensus")
    assert len(vector) == 384
    assert abs(sum(v * v for v in vector) - 1) < 1e-5


def test_falling_biomarker_is_not_improving_when_it_crosses_lower_reference_boundary():
    t = model(
        [
            obs("GLUCOSE", 95, 90, low=70, high=99),
            obs("GLUCOSE", 45, 0, low=70, high=99),
        ]
    )
    assert t["features"]["GLUCOSE"]["trend"] == "Worsening"


def test_response_crossing_below_reference_is_negative_not_favorable():
    e = experiment(
        baseline={
            "GLUCOSE": {
                "value": 95,
                "source": "lab_csv",
                "noise_pct": 2,
                "reference_range": {"low": 70, "high": 99},
            }
        }
    )
    r = evaluate(
        {
            "experiment": e,
            "observations": [obs("GLUCOSE", 45, 0, low=70, high=99)],
            "now": NOW.isoformat(),
        }
    )
    assert r["outcome"] == "Negative"


def test_previous_adverse_response_blocks_repeating_intervention():
    t = model([obs("VO2MAX", 40, low=30, high=65)])
    recommendations = rank(
        {
            "twin": t,
            "history": [
                {
                    "intervention_id": "aerobic",
                    "status": "Evaluated",
                    "response": {"outcome": "Adverse"},
                }
            ],
        }
    )["recommendations"]
    aerobic = next(x for x in recommendations if x["id"] == "aerobic")
    assert not aerobic["eligible"] and aerobic["review_required"]


def test_active_experiment_is_not_startable_twice_in_recommendation_model():
    t = model([obs("VO2MAX", 40, low=30, high=65)])
    results = rank(
        {"twin": t, "history": [{"intervention_id": "aerobic", "status": "Monitoring"}]}
    )["recommendations"]
    aerobic = next(x for x in results if x["id"] == "aerobic")
    assert aerobic["already_active"] and not aerobic["eligible"]


def test_conflicting_genotype_calls_do_not_create_a_finding():
    r = parse_genotype(
        b"# build 37\nrs4149056 12 21331549 CC\nrs4149056 12 21331549 TT\nrs9 1 200 AA", "raw"
    )
    assert r["errors"] and not r["findings"]


def test_supplementary_lab_results_do_not_expand_mvp_domains():
    from catalog import CONCEPTS
    rows = []
    for code, value in [("ALT", 17), ("CREATININE", 0.9), ("HEMOGLOBIN", 14), ("VITAMIN_D", 24), ("CORTISOL_AM", 12), ("APOB", 90)]:
        rows.append(normalized_row({"concept_id": code, "value": value,
            "unit": CONCEPTS[code][1], "effective_time": NOW.isoformat()}, "lab_csv", "test", True))
    twin = model(rows)
    assert [d["id"] for d in twin["domains"]] == [
        "metabolic", "cardiovascular", "inflammatory", "recovery",
        "musculoskeletal", "functional", "body"]
    assert len(twin["features"]) == len(rows)
    assert not next(d for d in twin["domains"] if d["id"] == "musculoskeletal")["signals"]
    assert not next(d for d in twin["domains"] if d["id"] == "recovery")["signals"]
    previous = {**twin, "model_version": "interpretable-0.2.0",
        "domains": twin["domains"] + [{"id": "liver", "signals": []}]}
    updated = model(rows, previous=previous, dirty_concepts=["APOB"], reuse_unaffected=True)
    assert "liver" not in {d["id"] for d in updated["domains"]}


def test_context_fills_evidence_but_not_direct_measurement_coverage():
    from catalog import CONCEPTS
    rows = [normalized_row({"concept_id": c, "value": value, "unit": CONCEPTS[c][1],
        "effective_time": NOW.isoformat(), "id": c}, "lab_csv", "source", True)
        for c, value in [("VITAMIN_D", 24), ("HEMOGLOBIN", 14), ("FERRITIN", 40)]]
    twin = model(rows, lifestyle_facts=[{"source_pointer": "/sleep_recovery/total_sleep_hours_estimated",
        "value": 6, "collected_at": "2024-01-01"}, {"source_pointer": "/body_medical/weight_kg", "value": 70}],
        genomic_findings=[{"rsid": "rs4149056", "gene": "SLCO1B1"}],
        genomic_status={"enabled": True, "sample_count": 1})
    for did in ("recovery", "musculoskeletal", "functional", "body"):
        d = dom(twin, did)
        assert d["context_count"] > 0
        assert d["coverage"] == 0
        assert d["state"] == "Supporting context only"
        assert not d["phenotype"]
    assert dom(twin, "recovery")["lifestyle_context"][0]["date"] == "2024-01-01"
    assert dom(twin, "musculoskeletal")["genomic_context"]
    assert not dom(twin, "metabolic")["genomic_context"]
    changed = model(rows, previous=twin, dirty_concepts=["APOB"], reuse_unaffected=True)
    assert not dom(changed, "musculoskeletal")["genomic_context"]
    assert not dom(changed, "body")["lifestyle_context"]


def test_correlated_lipid_markers_do_not_inflate_coverage():
    one = model([obs("APOB", 100)])
    many = model([obs("APOB", 100), obs("LDL", 100), obs("NON_HDL", 130)])
    assert dom(one, "cardiovascular")["coverage"] == dom(many, "cardiovascular")["coverage"] == 25
    assert dom(many, "cardiovascular")["available_group_count"] == 1
    assert len(dom(many, "cardiovascular")["signals"]) == 3


def test_wearable_device_change_cannot_create_a_false_baseline():
    older = obs("HRV", 70, days=10, source="ow:oura")
    newer = obs("HRV", 30, days=0, source="ow:oura")
    older.update(device_name="old ring", measurement_method="RMSSD")
    newer.update(device_name="new ring", measurement_method="RMSSD")
    twin = model([older, newer])
    assert twin["features"]["HRV"]["baseline"] is None
    assert twin["features"]["HRV"]["device_name"] == "new ring"
    assert dom(twin, "recovery")["available_group_count"] == 1


def test_blood_wearable_and_dna_remain_distinct_in_one_twin():
    twin = model([obs("APOB", 105), obs("RHR", 60, source="ow:oura")],
        genomic_findings=[{"rsid": "rs4149056", "gene": "SLCO1B1"}],
        genomic_status={"enabled": True, "sample_count": 1})
    cardio = dom(twin, "cardiovascular")
    assert {s["source"] for s in cardio["signals"]} == {"lab_csv", "ow:oura"}
    assert cardio["available_group_count"] == 2
    assert len(cardio["genomic_context"]) == 1
    assert dom(twin, "musculoskeletal")["available_group_count"] == 0


def test_context_contract_change_invalidates_rollout_snapshot():
    old = model([obs()], context_schema=0)
    new = model([obs()], context_schema=1)
    assert old["input_snapshot"] != new["input_snapshot"]
    assert new["context_schema"] == 1
