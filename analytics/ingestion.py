import base64
import csv
import io
import json
import math
import re
from datetime import date, datetime, timezone

from catalog import CONCEPTS
from pypdf import PdfReader


def normalize_concept(name):
    key = re.sub(r"[^a-z0-9]", "", str(name).lower())
    for code, c in CONCEPTS.items():
        if key in [re.sub(r"[^a-z0-9]", "", x.lower()) for x in [code, c[0], *c[5]]]:
            return code
    raise ValueError(f"Unrecognized biomarker: {name}. Keep this source for manual review.")


def normalized_row(row, source="lab_csv", provenance_id="", reviewed=False):
    code = normalize_concept(row.get("concept_id") or row.get("biomarker") or row.get("name", ""))
    label, unit, domains, direction, bounds, aliases = CONCEPTS[code]
    try:
        value = float(row.get("value", row.get("value_numeric")))
    except (TypeError, ValueError):
        raise ValueError(
            "A finite numeric result is required; qualified results need manual review."
        )
    if not math.isfinite(value):
        raise ValueError("Result must be finite.")
    supplied = str(row.get("unit", "")).strip().replace("μ", "u").replace("µ", "u")
    factor = 1
    if supplied.lower() != unit.lower():
        conversions = {
            ("GLUCOSE", "mmol/l"): 18.018,
            ("TRIGLYCERIDES", "mmol/l"): 88.57,
            ("HDL", "mmol/l"): 38.67,
            ("LDL", "mmol/l"): 38.67,
            ("APOB", "g/l"): 100,
            ("CREATININE", "umol/l"): 1 / 88.4,
            ("SLEEP", "s"): 1 / 3600,
            ("SLEEP", "min"): 1 / 60,
            ("WEIGHT", "lb"): 0.45359237,
            ("WAIST", "in"): 2.54,
        }
        factor = conversions.get((code, supplied.lower()))
        if factor is None:
            raise ValueError(
                f"Unsupported or missing unit {supplied!r} for {label}. Expected {unit}."
            )
    value *= factor
    if not bounds[0] <= value <= bounds[1]:
        raise ValueError(
            f"{label}: value outside plausibility bounds. Verify the source and units."
        )
    when = str(row.get("effective_time") or row.get("date") or "")
    try:
        dt = datetime.fromisoformat(when.replace("Z", "+00:00"))
        dt = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    except ValueError:
        raise ValueError("An unambiguous ISO date (YYYY-MM-DD) is required.")
    if dt.date() > date.today() or dt.year < 1900:
        raise ValueError("Measurement date is outside the supported historical range.")
    refs = row.get("reference_range") or {}

    def refnum(key):
        raw = refs.get(key, row.get("reference_" + key))
        if raw is None or raw == "":
            return None
        number = float(raw) * factor
        if not math.isfinite(number):
            raise ValueError("Reference limits must be finite.")
        return number

    low, high = refnum("low"), refnum("high")
    if low is not None and high is not None and low >= high:
        raise ValueError("Reference range must have low < high.")
    return {
        "id": row.get("id", ""),
        "concept_id": code,
        "label": label,
        "value": round(value, 5),
        "unit": unit,
        "effective_time": dt.isoformat(),
        "result_time": row.get("result_time") or dt.isoformat(),
        "source": source,
        "source_record_id": str(row.get("source_record_id", "")),
        "reference_range": {
            "low": low,
            "high": high,
            "origin": refs.get(
                "origin",
                "Source report; user verified"
                if reviewed
                else "Source report; awaiting verification",
            ),
        },
        "quality_status": "verified" if reviewed else "review_required",
        "confidence": 1.0 if reviewed else 0.65,
        "provenance_id": provenance_id,
        "original_value": row.get("value"),
        "original_unit": supplied,
    }


def parse_labs(content, filename, artifact):
    errors = []
    rows = []
    extracted = []
    if filename.lower().endswith(".pdf"):
        if not content.startswith(b"%PDF-"):
            raise ValueError("The file is not a valid PDF.")
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise ValueError("Password-protected PDF: export an unlocked copy before importing.")
        if len(reader.pages) > 100:
            raise ValueError("Reports are limited to 100 pages.")
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
        dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text)
        for line in text.splitlines():
            # Conservative line-based parser; never accepts a PDF result without human verification.
            m = re.match(
                r"^\s*([A-Za-z][A-Za-z0-9 _-]*?)\s+([0-9]+(?:\.[0-9]+)?)\s+(mg/dL|mg/L|mmol/L|g/L|g/dL|U/L|%|uIU/mL|mmHg|kg|cm|ms|bpm)(.*)$",
                line,
            )
            if m:
                interval = re.search(r"(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)", m[4])
                extracted.append(
                    {
                        "biomarker": m[1],
                        "value": m[2],
                        "unit": m[3],
                        "date": dates[0] if len(set(dates)) == 1 else "",
                        "reference_low": interval[1] if interval else "",
                        "reference_high": interval[2] if interval else "",
                    }
                )
        if not extracted:
            errors.append(
                {
                    "row": 0,
                    "message": "No reliable tabular results found. Scanned or complex PDFs require manual entry using the source preview.",
                    "raw": {},
                }
            )
        source = "lab_pdf"
    else:
        decoded = content.decode("utf-8-sig")
        extracted = list(csv.DictReader(io.StringIO(decoded)))
        if not extracted:
            raise ValueError(
                "No rows found. Use columns biomarker,value,unit,date,reference_low,reference_high."
            )
        source = "lab_csv"
    for i, r in enumerate(extracted):
        try:
            rows.append(normalized_row(r, source, artifact))
        except (ValueError, TypeError) as e:
            errors.append({"row": i + 1, "message": str(e), "raw": r})
    return {
        "rows": rows,
        "errors": errors,
        "status": "review_required",
        "kind": "labs",
        "source": source,
    }


def parse_oura(content, artifact):
    data = json.loads(content)
    records = data if isinstance(data, list) else data.get("data", [])
    if not isinstance(records, list) or len(records) > 20000:
        raise ValueError("Expected an Oura v2 JSON data array, up to 20,000 records.")
    rows = []
    errors = []
    for i, r in enumerate(records):
        if not isinstance(r, dict):
            errors.append({"row": i + 1, "message": "Expected an object", "raw": {}})
            continue
        for field, code, unit in [
            ("average_hrv", "HRV", "ms"),
            ("average_heart_rate", "RHR", "bpm"),
            ("total_sleep_duration", "SLEEP", "s"),
            ("steps", "STEPS", "steps"),
        ]:
            if r.get(field) is None:
                continue
            raw = {
                "concept_id": code,
                "value": r[field],
                "unit": unit,
                "date": r.get("day") or r.get("timestamp"),
                "source_record_id": r.get("id", ""),
            }
            try:
                rows.append(normalized_row(raw, "oura", artifact))
            except (ValueError, TypeError) as e:
                errors.append({"row": i + 1, "message": str(e), "raw": raw})
    if not rows and not errors:
        raise ValueError("No supported Oura sleep/activity signals were found.")
    return {
        "kind": "wearable",
        "source": "oura",
        "rows": rows,
        "errors": errors,
        "status": "review_required",
    }


def parse_genotype(content, artifact):
    text = content.decode("utf-8-sig")
    buildmatch = re.search(r"(?:build|GRCh)\s*[=:]?\s*(37|38)", text, re.I)
    if not buildmatch:
        raise ValueError(
            "Genome build is required. Include a # build 37 or # build 38 header; unknown builds are not guessed."
        )
    build = "GRCh" + buildmatch[1]
    variants = []
    errors = []
    seen = set()
    for i, line in enumerate(text.splitlines()):
        if not line.strip() or line.startswith("#") or line.lower().startswith("rsid"):
            continue
        parts = re.split(r"[\t, ]+", line.strip())
        if len(parts) < 4:
            errors.append(
                {
                    "row": i + 1,
                    "message": "Expected rsID chromosome position genotype",
                    "raw": {},
                }
            )
            continue
        rs, chrom, pos, gt = parts[:4]
        gt = gt.upper()
        if gt in ("--", "00", "NN"):
            continue
        if (
            not re.fullmatch(r"rs\d+", rs)
            or not pos.isdigit()
            or int(pos) < 1
            or chrom not in [str(x) for x in range(1, 23)] + ["X", "Y", "MT"]
            or not re.fullmatch("[ACGT]{1,2}", gt)
        ):
            errors.append(
                {
                    "row": i + 1,
                    "message": "Invalid or unsupported variant representation",
                    "raw": {},
                }
            )
            continue
        if rs in seen:
            variants = [v for v in variants if v["rsid"] != rs]
            errors.append(
                {
                    "row": i + 1,
                    "message": "Duplicate locus; all conflicting copies excluded from interpretation",
                    "raw": {},
                }
            )
            continue
        seen.add(rs)
        variants.append(
            {
                "rsid": rs,
                "chromosome": chrom,
                "position": int(pos),
                "genotype": gt,
                "genome_build": build,
                "provenance_id": artifact,
            }
        )
    if not variants:
        raise ValueError("No valid consumer genotype rows found.")
    findings = []
    if any(
        v["rsid"] == "rs4149056"
        and v["chromosome"] == "12"
        and v["position"] == ({"GRCh37": 21331549, "GRCh38": 21178615}[build])
        for v in variants
    ):
        findings.append(
            {
                "id": "g-slco1b1",
                "name": "A pharmacogenomic locus is available",
                "category": "Medication context",
                "gene": "SLCO1B1",
                "rsid": "rs4149056",
                "confidence": "Low",
                "level": "Supported",
                "interpretation": "This locus is relevant to statin pharmacogenomics. Clinical confirmation, strand/haplotype review and professional interpretation are required before it affects treatment.",
                "impact": "Context only. No diagnosis, biological state change or automatic drug recommendation.",
                "citation": "https://blog.clinpgx.org/cpic-publishes-guideline-for-slco1b1/",
                "provenance_id": artifact,
            }
        )
    return {
        "kind": "genomics",
        "source": "consumer_genotype",
        "variants": variants,
        "findings": findings,
        "rows": [],
        "errors": errors,
        "genome_build": build,
        "status": "review_required",
        "variant_count": len(variants),
        "limitations": "Build-specific coordinates are preserved. No liftover or raw-genotype LLM submission. Annotation breadth is limited to a curated medication-context locus; no clinical risk score.",
    }


def parse_upload(payload):
    content = base64.b64decode(payload["content"], validate=True)
    if len(content) > 15 * 1024 * 1024:
        raise ValueError("Maximum upload size is 15 MB.")
    kind = payload["kind"]
    filename = payload["filename"]
    artifact = payload["artifact_id"]
    if kind == "labs":
        return parse_labs(content, filename, artifact)
    if kind == "wearable":
        return parse_oura(content, artifact)
    if kind == "genomics":
        return parse_genotype(content, artifact)
    raise ValueError("Unsupported upload type.")
