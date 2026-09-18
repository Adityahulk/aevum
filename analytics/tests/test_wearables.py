import io
import json
import zipfile
from datetime import datetime, timezone

import pytest
from wearables import parse_wearable
from engine import features


def payload(**extra):
    return {"provider": "open_wearables", "wearable_provider": "garmin", **extra}


def parse(data):
    return parse_wearable(json.dumps(data).encode(), "sync.json", "artifact-1")


def test_provider_source_units_and_noninterchangeable_signals():
    result = parse(payload(
        activity=[{"source": {"provider": "garmin"}, "date": "2026-09-01", "steps": 8000},
                  {"source": {"provider": "whoop"}, "date": "2026-09-01", "steps": 99999}],
        sleep=[{"source": {"provider": "garmin"}, "date": "2026-09-01", "duration_minutes": 450,
                "avg_hrv_sdnn_ms": 200, "avg_heart_rate_bpm": 65}],
        timeseries=[{"source": {"provider": "garmin"}, "timestamp": "2026-09-01T06:00:00Z",
                     "type": "resting_heart_rate", "value": 55, "unit": "bpm"}]))
    assert {r["concept_id"]: r["value"] for r in result["rows"]} == {"STEPS": 8000, "SLEEP": 7.5, "RHR": 55}
    assert all(r["source"] == "ow:garmin" and r["provenance_id"] == "artifact-1" for r in result["rows"])
    assert all(r["quality_status"] == "review_required" for r in result["rows"])


def test_rmssd_daily_average_and_no_duplicate_hrv():
    source = {"provider": "garmin", "device": "watch"}
    samples = [{"source": source, "timestamp": f"2026-09-01T0{i}:00:00Z", "type": "heart_rate_variability_rmssd", "unit": "ms", "value": value} for i, value in enumerate([40, 60])]
    result = parse(payload(timeseries=samples))
    assert len(result["rows"]) == 1
    assert result["rows"][0]["value"] == 50
    assert result["rows"][0]["measurement_method"] == "RMSSD"


def test_unit_mismatch_is_rejected():
    with pytest.raises(ValueError, match="unit"):
        parse(payload(timeseries=[{"source": {"provider": "garmin"}, "timestamp": "2026-09-01", "type": "resting_heart_rate", "unit": "ms", "value": 50}]))


def test_csv_requires_explicit_hrv_method_and_single_provider():
    result = parse_wearable(b"provider,concept_id,value,unit,date,measurement_method\ngarmin,HRV,40,ms,2026-09-01,SDNN", "wearable.csv", "a")
    assert not result["rows"] and result["errors"]
    with pytest.raises(ValueError, match="one provider"):
        parse_wearable(b"provider,concept_id,value,unit,date\ngarmin,RHR,50,bpm,2026-09-01\noura,RHR,52,bpm,2026-09-01", "w.csv", "a")


def test_apple_zip_overlapping_sleep_and_duplicate_device_steps():
    xml = b'''<HealthData>
    <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Phone" unit="count" value="5000" startDate="2026-09-01 10:00:00 +0000" endDate="2026-09-01 11:00:00 +0000"/>
    <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" value="6000" startDate="2026-09-01 10:00:00 +0000" endDate="2026-09-01 11:00:00 +0000"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-09-01 01:00:00 +0000" endDate="2026-09-01 08:00:00 +0000"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-09-01 02:00:00 +0000" endDate="2026-09-01 03:00:00 +0000"/>
    </HealthData>'''
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("apple_health_export/export.xml", xml)
    result = parse_wearable(archive.getvalue(), "export.zip", "a")
    assert {r["concept_id"]: r["value"] for r in result["rows"]} == {"SLEEP": 7, "STEPS": 6000}


def test_xml_entities_rejected():
    with pytest.raises(ValueError, match="entity"):
        parse_wearable(b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><HealthData/>', "x.xml", "a")


def test_switching_providers_does_not_reuse_old_baseline():
    rows = []
    for day in range(1, 30):
        parsed = parse(payload(timeseries=[{"source": {"provider": "garmin"}, "timestamp": f"2026-08-{day:02}T00:00:00Z", "type": "resting_heart_rate", "unit": "bpm", "value": 60}]))
        row = parsed["rows"][0]; row["quality_status"] = "verified"; rows.append(row)
    other = dict(rows[-1], source="ow:whoop", effective_time="2026-09-01T00:00:00Z", value=45)
    result = features(rows + [other], datetime(2026, 9, 2, tzinfo=timezone.utc))
    assert result["RHR"]["baseline"] is None
