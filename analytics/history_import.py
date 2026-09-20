"""Lossless historical records with a conservative, separately validated scoring subset."""

import json
import re
from datetime import datetime, timezone

from ingestion import normalize_concept, normalized_row

ALIASES = {
    "Glycosylated Hemoglobin (HbA1c)": "HBA1C",
    "Glucose - Fasting": "GLUCOSE",
    "Glucose, Fasting": "GLUCOSE",
    "Insulin - Fasting": "INSULIN",
    "Insulin, Fasting": "INSULIN",
    "Cholesterol - HDL": "HDL",
    "Cholesterol - LDL": "LDL",
    "Direct LDL cholesterol": "LDL",
    "Direct LDL": "LDL",
    "SGOT (Aspartate Aminotransferase)": "AST",
    "SGPT (Alanine Transaminase)": "ALT",
    "AST (SGOT)": "AST",
    "ALT (SGPT)": "ALT",
    "Gamma Glutamyltransferase (GGT)": "GGT",
    "Total Leucocyte Count": "WBC",
    "Platelet Count": "PLATELETS",
    "Apolipoprotein - B": "APOB",
    "Glomerular Filtration Rate (estimated)": "EGFR",
}


def historical_date(value):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        dt = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
        if dt.year < 1900 or dt > datetime.now(timezone.utc):
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("A valid historical collection date is required")
    return str(value)


def parse_history(bundle, artifact=""):
    if not isinstance(bundle, dict) or bundle.get("schema_version") != "aevum-history-1":
        raise ValueError("Unsupported historical-record schema")
    name = bundle.get("client_name")
    if not isinstance(name, str) or not name.strip() or len(name) > 150:
        raise ValueError("A client name is required")
    measurements = bundle.get("measurements")
    if not isinstance(measurements, list) or not 1 <= len(measurements) <= 2000:
        raise ValueError("Include 1–2,000 source results")
    if len(json.dumps(bundle, allow_nan=False).encode()) > 2 * 1024 * 1024:
        raise ValueError("Historical imports are limited to 2 MB")
    rows, retained = [], []
    for i, raw in enumerate(measurements):
        if not isinstance(raw, dict) or not all(
            k in raw
            for k in (
                "name",
                "value",
                "unit",
                "date",
                "source_file",
                "source_sha256",
                "source_kind",
            )
        ):
            raise ValueError(f"Result {i + 1}: missing source metadata")
        if not re.fullmatch(r"[a-f0-9]{64}", str(raw["source_sha256"])):
            raise ValueError(f"Result {i + 1}: invalid source hash")
        if raw["source_kind"] not in {"original_lab", "transcribed_table"}:
            raise ValueError("Source kind must distinguish original lab from table transcription")
        historical_date(raw["date"])
        try:
            if raw.get("specimen") == "urine":
                raise ValueError("Urine result retained without blood-assay normalization")
            if re.search(r"c.reactive", raw["name"], re.I) and not re.search(
                r"high|hs", raw["name"], re.I
            ):
                raise ValueError("Ordinary CRP is not a high-sensitivity assay")
            code = ALIASES.get(raw["name"]) or normalize_concept(raw["name"])
            unit = str(raw["unit"]).replace("µ", "u").replace("μ", "u")
            if code == "INSULIN" and unit == "uU/mL":
                unit = "uIU/mL"
            if code in {"WBC", "PLATELETS"} and unit == "10^3/uL":
                unit = "10^9/L"
            original = raw["source_kind"] == "original_lab"
            locator = f"{raw['source_sha256']}:{raw.get('source_page', raw.get('source_line', i))}:{raw['name']}"
            r = normalized_row(
                {
                    "concept_id": code,
                    "value": raw["value"],
                    "unit": unit,
                    "date": raw["date"],
                    "source_record_id": locator,
                    "reference_range": {
                        "low": raw.get("reference_low") if original else None,
                        "high": raw.get("reference_high") if original else None,
                        "origin": "Original laboratory report"
                        if original
                        else "Unavailable; historical targets excluded",
                    },
                    "measurement_method": raw.get("measurement_method", ""),
                },
                "lab_pdf" if original else "historical_table",
                artifact,
            )
            r.update(
                confidence=1.0 if original else 0.65,
                source_value=raw["value"],
                source_unit=raw["unit"],
                source_locator={
                    k: raw.get(k)
                    for k in ("source_file", "source_page", "source_line", "source_sha256")
                },
                source_kind=raw["source_kind"],
                verification_scope="Checked against supplied source; transcription is not an original laboratory report",
            )
            rows.append(r)
        except (ValueError, TypeError) as e:
            retained.append({"row": i + 1, "reason": str(e)})
    lifestyle = bundle.get("lifestyle", {})
    if (
        not isinstance(lifestyle, dict)
        or not isinstance(lifestyle.get("facts", []), list)
        or len(lifestyle.get("facts", [])) > 2000
    ):
        raise ValueError("Invalid historical questionnaire")
    if lifestyle.get("facts"):
        historical_date(lifestyle.get("collected_at"))
        if not lifestyle.get("source_file") or not re.fullmatch(
            r"[a-f0-9]{64}", str(lifestyle.get("source_sha256", ""))
        ):
            raise ValueError("Historical questionnaire requires source provenance")
        for fact in lifestyle["facts"]:
            if (
                not isinstance(fact, dict)
                or not isinstance(fact.get("source_pointer"), str)
                or "value" not in fact
            ):
                raise ValueError("Questionnaire answers require source pointers and values")
    review = bundle.get("fresh_review", {})
    if not isinstance(review, dict):
        raise ValueError("Review must be a structured object")
    # Reviews remain attributed imported documents; they never become model inputs or diagnoses.
    return {
        "client_name": name.strip(),
        "rows": rows,
        "retained": retained,
        "measurements": measurements,
        "lifestyle": lifestyle,
        "fresh_review": review,
        "status": "review_required",
        "kind": "history",
        "limitations": "Historical answers remain dated records and do not overwrite current profile answers. Imported review text is not clinician-verified and is not a model input.",
    }
