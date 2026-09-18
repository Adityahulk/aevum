"""Provider adapters. No vendor recovery/strain scores become clinical signals."""

import csv
import io
import json
import re
import zipfile
from defusedxml import ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean

SOURCES = frozenset({"oura", "whoop", "fitbit", "polar", "withings", "apple_health", "garmin", "samsung_health", "health_connect", "suunto", "coros", "amazfit", "ultrahuman", "wearable_csv"})


def is_wearable(source):
    return source in SOURCES or str(source).startswith("ow:")


def open_wearables_rows(payload):
    provider = payload["wearable_provider"]
    if not isinstance(provider, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,39}", provider):
        raise ValueError("Invalid wearable provider.")
    rows, samples = [], defaultdict(list)

    def source_of(r):
        source = r.get("source") or {}
        return source if source.get("provider") == provider else None

    def add(r, code, value, unit, day, method=""):
        source = source_of(r)
        if source is not None and value is not None:
            rows.append(dict(concept_id=code, value=value, unit=unit, date=day,
                             device_name=source.get("device") or "",
                             source_record_id=provider + ":" + str(source.get("source")) + ":" + str(day) + ":" + code,
                             measurement_method=method))

    for r in payload.get("activity", []):
        add(r, "STEPS", r.get("steps"), "steps", r.get("date"))
    for r in payload.get("sleep", []):
        add(r, "SLEEP", r.get("duration_minutes"), "min", r.get("date"))
        add(r, "HRV", r.get("avg_hrv_rmssd_ms"), "ms", r.get("date"), "RMSSD")
        # SDNN and ordinary sleeping heart rate are deliberately not relabelled.
    for r in payload.get("timeseries", []):
        source = source_of(r)
        if source is None:
            continue
        code = {"resting_heart_rate": "RHR", "heart_rate_variability_rmssd": "HRV"}.get(r.get("type"))
        if not code:
            continue
        expected = "bpm" if code == "RHR" else "ms"
        if r.get("unit") != expected:
            raise ValueError("Unexpected Open Wearables measurement unit.")
        day = datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")).date().isoformat()
        samples[(code, day, source.get("source"), source.get("device"))].append(r)
    for (code, day, writer, device), values in samples.items():
        # One daily average per source/device; do not combine overlapping devices.
        add(values[0], code, mean(float(v["value"]) for v in values), "bpm" if code == "RHR" else "ms", day, "RMSSD" if code == "HRV" else "")
    # Stable source preference, no double counting of phone/watch summaries or duplicate HRV routes.
    daily = {}
    for row in sorted(rows, key=lambda r: (r["device_name"], r["source_record_id"])):
        daily.setdefault((row["concept_id"], row["date"]), row)
    return "ow:" + provider, list(daily.values())


def apple_rows(content):
    # Apple exports contain a DOCTYPE; reject entity declarations and never fetch DTDs.
    if b"<!ENTITY" in content.upper():
        raise ValueError("XML entity declarations are not supported.")
    groups = defaultdict(list)
    for event, element in ET.iterparse(io.BytesIO(content), events=("end",)):
        if element.tag != "Record":
            element.clear()
            continue
        r = element.attrib
        metric = r.get("type")
        if metric not in {"HKQuantityTypeIdentifierRestingHeartRate", "HKQuantityTypeIdentifierStepCount", "HKCategoryTypeIdentifierSleepAnalysis"}:
            element.clear()
            continue
        start = datetime.strptime(r["startDate"], "%Y-%m-%d %H:%M:%S %z")
        end = datetime.strptime(r["endDate"], "%Y-%m-%d %H:%M:%S %z")
        source = r.get("sourceName", "Apple Health")
        if metric == "HKCategoryTypeIdentifierSleepAnalysis":
            if r.get("value") not in {"HKCategoryValueSleepAnalysisAsleep", "HKCategoryValueSleepAnalysisAsleepUnspecified", "HKCategoryValueSleepAnalysisAsleepCore", "HKCategoryValueSleepAnalysisAsleepDeep", "HKCategoryValueSleepAnalysisAsleepREM"}:
                element.clear()
                continue
            if end <= start:
                raise ValueError("Sleep interval must end after it starts.")
            groups[(source, "SLEEP", end.date().isoformat())].append((start, end))
        else:
            code = "RHR" if "RestingHeartRate" in metric else "STEPS"
            expected = "count/min" if code == "RHR" else "count"
            if r.get("unit") != expected:
                raise ValueError("Unexpected Apple Health measurement unit.")
            groups[(source, code, start.date().isoformat())].append((start, end, float(r["value"])))
        element.clear()
    # Choose one device/source for a metric/day. Never sum phone and watch step totals.
    daily = {}
    for (source, code, day), samples in sorted(groups.items()):
        if code == "SLEEP":
            intervals = sorted(set(samples)); merged = []
            for start, end in intervals:
                if merged and start <= merged[-1][1]:
                    merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
                else:
                    merged.append((start, end))
            value = sum((end - start).total_seconds() for start, end in merged)
        else:
            values = [r[2] for r in set(samples)]
            value = mean(values) if code == "RHR" else sum(values)
        row = dict(concept_id=code, value=value, unit={"RHR": "bpm", "STEPS": "steps", "SLEEP": "s"}[code], date=day, source_record_id=source + ":" + code + ":" + day, device_name=source)
        existing = daily.get((code, day))
        if existing is None or ("watch" in source.lower() and "watch" not in existing["device_name"].lower()):
            daily[code, day] = row
    return list(daily.values())


def parse_wearable(content, filename, artifact):
    from ingestion import normalized_row, parse_oura
    if filename.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            files = [f for f in archive.infolist() if f.filename == "export.xml" or f.filename.endswith("/export.xml")]
            if len(files) != 1 or files[0].file_size > 100 * 1024 * 1024:
                raise ValueError("Choose an Apple Health ZIP containing one export.xml up to 100 MB.")
            with archive.open(files[0]) as stream:
                content = stream.read(100 * 1024 * 1024 + 1)
                if len(content) > 100 * 1024 * 1024:
                    raise ValueError("Apple Health XML exceeds the expanded size limit.")
            filename = "export.xml"
    if filename.lower().endswith(".xml"):
        provider, records = "apple_health", apple_rows(content)
    elif filename.lower().endswith(".csv"):
        provider, records = "wearable_csv", list(csv.DictReader(io.StringIO(content.decode("utf-8-sig"))))
        sources = {r.get("provider") or "wearable_csv" for r in records}
        if len(sources) > 1:
            raise ValueError("Use one provider per CSV so provenance remains unambiguous.")
        provider = next(iter(sources), "wearable_csv")
    else:
        payload = json.loads(content)
        if not isinstance(payload, dict) or "provider" not in payload:
            return parse_oura(content, artifact)
        if payload["provider"] != "open_wearables":
            raise ValueError("Use an Open Wearables sync JSON, Oura export, or the wearable CSV template.")
        provider, records = open_wearables_rows(payload)
    if len(records) > 20000:
        raise ValueError("Wearable import exceeds 20,000 daily measurements. Export a shorter period.")
    rows, errors = [], []
    for i, r in enumerate(records):
        try:
            source = r.get("provider") or provider
            if not is_wearable(source):
                raise ValueError("Unknown wearable provider.")
            row = normalized_row(r, source, artifact)
            if row["concept_id"] not in {"HRV", "RHR", "SLEEP", "STEPS"}:
                raise ValueError("Wearable imports support HRV, resting heart rate, sleep and steps.")
            if row["concept_id"] == "HRV" and r.get("measurement_method") != "RMSSD":
                raise ValueError("HRV must explicitly identify RMSSD; SDNN must not be mixed with RMSSD.")
            row["measurement_method"] = r.get("measurement_method", "")
            row["device_name"] = r.get("device_name", "")
            rows.append(row)
        except (ValueError, TypeError) as e:
            errors.append({"row": i + 1, "message": str(e), "raw": r})
    return dict(kind="wearable", source=provider, rows=rows, errors=errors, status="review_required")
