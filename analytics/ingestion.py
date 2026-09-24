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
    supplied = str(row.get("unit", "")).strip().replace("μ", "u").replace("µ", "u").replace(" ", "")
    factor = 1
    if supplied.lower() != unit.lower():
        conversions = {
            ("GLUCOSE", "mmol/l"): 18.018,
            ("TRIGLYCERIDES", "mmol/l"): 88.57,
            ("HDL", "mmol/l"): 38.67,
            ("LDL", "mmol/l"): 38.67,
            ("APOB", "g/l"): 100,
            ("RBC", "10^6/cu.mm"): 1,
            ("RBC", "mili/cu.mm"): 1,
            ("RBC", "10^6/cumm"): 1,
            ("INSULIN", "uu/ml"): 1,
            ("WBC", "10^3/ul"): 1,
            ("PLATELETS", "10^3/ul"): 1,
            ("ANC", "10^3/ul"): 1,
            ("ALC", "10^3/ul"): 1,
            ("AMC", "10^3/ul"): 1,
            ("AEC", "10^3/ul"): 1,
            ("ABC", "10^3/ul"): 1,
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
        "measurement_method": row.get("measurement_method", ""),
        "device_name": row.get("device_name", ""),
    }


def tata_1mg_rows(reader):
    """Extract dated, tabular facts from a Tata 1mg PDF without inferring missing values.

    These reports have a seven-page result summary followed by test-method pages.  The
    summary is authoritative for the panel values; the first detailed CBC page adds
    indices and absolute cell counts which the summary omits.  We intentionally keep
    one canonical observation per concept/date: Direct LDL is preferred to the
    calculated LDL result when both are reported on the same specimen.
    """
    pages = [re.sub(r"\s+", " ", page.extract_text() or "") for page in reader.pages]
    full_text = "\n".join(pages)
    date_match = re.search(r"Collection Date\s*:\s*(\d{2})/(\w{3})/(\d{4})", full_text)
    if not date_match:
        return []
    try:
        collected = datetime.strptime("/".join(date_match.groups()), "%d/%b/%Y").date().isoformat()
    except ValueError:
        return []

    # Pages 2-7 are the generated result table. Page 8 is the detailed CBC table.
    # Scan later pages only for tests absent from the summary (fasting insulin/cortisol).
    primary = pages[1:8]
    later = pages[8:]
    units = r"(?:mg/dL|mg/dl|mg/L|mmol/L|g/dL|U/L|%|ng/mL|ng/dL|pg/mL|pg|ug/dL|µg/dL|µmol/L|uIU/mL|µIU/mL|µU/mL|IU/mL|mIU/mL|mm/hr|fL|f L|mili/cu\.mm|10\^3/µL|mL/min/1\.73m2|Ratio)"
    specs = [
        ("HEMOGLOBIN", r"Hemoglobin", "g/dL"), ("RBC", r"RBC", "mili/cu.mm"),
        ("HCT", r"HCT", "%"), ("MCV", r"MCV", "fL"), ("MCH", r"MCH", "pg"),
        ("MCHC", r"MCHC", "g/dL"), ("RDW", r"RDW-CV", "%"),
        ("WBC", r"Total Leucocyte Count", "10^3/µL"),
        ("NEUTROPHILS", r"Neutrophils", "%"), ("LYMPHOCYTES", r"Lymphocytes", "%"),
        ("MONOCYTES", r"Monocytes", "%"), ("EOSINOPHILS", r"Eosinophils", "%"),
        ("BASOPHILS", r"Basophils", "%"),
        ("ANC", r"Absolute Neutrophil Count", "10^3/µL"),
        ("ALC", r"Absolute Lymphocyte Count", "10^3/µL"),
        ("AMC", r"Absolute Monocyte Count", "10^3/µL"),
        ("AEC", r"Absolute Eosinophil Count", "10^3/µL"),
        ("ABC", r"Absolute Basophil Count", "10^3/µL"),
        ("PLATELETS", r"Platelet Count", "10^3/µL"), ("MPV", r"MPV", "f L"),
        ("PDW", r"PDW", "f L"), ("ESR", r"Erythrocyte Sedimentation Rate", "mm/hr"),
        ("CRP", r"C-Reactive Protein \(Quantitative\)", "mg/L"),
        ("IRON", r"Iron Serum", "µg/dL"), ("TIBC", r"Total Iron Binding Capacity \(TIBC\)", "µg/dL"),
        ("FERRITIN", r"Ferritin", "ng/mL"), ("HBA1C", r"Glycosylated Hemoglobin \(HbA1c\)", "%"),
        ("EAG", r"Estimated average glucose \(eAG\)", "mg/dL"),
        ("GLUCOSE", r"Glucose - Fasting", "mg/dL"), ("CREATININE", r"Creatinine", "mg/dL"),
        ("URIC_ACID", r"Uric Acid", "mg/dL"), ("SODIUM", r"Sodium", "mmol/L"),
        ("POTASSIUM", r"Potassium", "mmol/L"), ("CHLORIDE", r"Chloride", "mmol/L"),
        ("EGFR", r"e GFR", "mL/min/1.73m2"), ("TOTAL_CHOLESTEROL", r"Cholesterol - Total", "mg/dL"),
        ("TRIGLYCERIDES", r"Triglycerides", "mg/dL"), ("HDL", r"Cholesterol - HDL", "mg/dL"),
        ("LDL", r"Direct LDL", "mg/dL"), ("VLDL", r"Cholesterol- VLDL", "mg/dl"),
        ("TC_HDL_RATIO", r"Cholesterol : HDL Cholesterol", "Ratio"),
        ("LDL_HDL_RATIO", r"LDL : HDL Cholesterol", "Ratio"),
        ("NON_HDL", r"Non HDL Cholesterol", "mg/dL"), ("LPA", r"Lipoprotein \(a\)", "mg/dL"),
        ("HOMOCYSTEINE", r"Homocysteine", "µmol/L"), ("HSCRP", r"High sensitivity CRP", "mg/L"),
        ("APOA1", r"Apolipoprotein - A1", "mg/dL"), ("APOB", r"Apolipoprotein - B", "mg/dL"),
        ("APOB_APOA1_RATIO", r"Apolipoprotein B/A1 Ratio", "Ratio"),
        ("BILIRUBIN_TOTAL", r"Bilirubin - Total", "mg/dL"), ("TOTAL_PROTEIN", r"Protein, Total", "g/dL"),
        ("ALBUMIN", r"Albumin", "g/dL"), ("AST", r"Aspartate Transaminase \(SGOT\)", "U/L"),
        ("ALT", r"Alanine Transaminase \(SGPT\)", "U/L"), ("ALP", r"Alkaline Phosphatase", "U/L"),
        ("GGT", r"Glutamyltransferase \(GGT\)", "U/L"), ("LIPASE", r"Lipase", "U/L"),
        ("AMYLASE", r"Amylase", "U/L"), ("CALCIUM", r"Calcium", "mg/dL"),
        ("VITAMIN_D", r"Vitamin D \(25-OH\)", "ng/mL"), ("PHOSPHORUS", r"Phosphorus", "mg/dL"),
        ("VITAMIN_B12", r"Vitamin B12", "pg/mL"), ("FOLATE", r"Vitamin B9", "ng/mL"),
        ("T3_TOTAL", r"T3, Total", "ng/mL"), ("T4_TOTAL", r"T4, Total", "µg/dL"),
        ("TSH", r"Hormone - Ultra Sensitive", "µIU/mL"), ("FREE_T4", r"Free T4", "ng/dl"),
        ("FREE_T3", r"Free T3", "pg/mL"), ("IGE", r"Immunoglobulin E \(IgE\) Total", "IU/mL"),
        ("TESTOSTERONE_TOTAL", r"Testosterone, total", "ng/dL"),
        ("PSA_TOTAL", r"Prostate Specific Antigen, total", "ng/mL"),
        ("CORTISOL_AM", r"Cortisol \(morning sample\)", "µg/dL"),
        ("INSULIN", r"Insulin - Fasting", "µU/mL"),
    ]
    results = []
    for code, label, expected_unit in specs:
        found = None
        for page_no, text in enumerate(primary, start=2):
            match = re.search(rf"{label}\s+([0-9]+(?:\.[0-9]+)?)\s+({units})", text, re.I)
            if match:
                found = (page_no, match)
                break
        if not found and code in {"CORTISOL_AM", "INSULIN"}:
            for page_no, text in enumerate(later, start=9):
                label = r"Cortisol \(morning sample\)" if code == "CORTISOL_AM" else r"Insulin - Fasting"
                match = re.search(rf"{label}\s+([0-9]+(?:\.[0-9]+)?)\s+({units})", text, re.I)
                if match:
                    found = (page_no, match)
                    break
        if not found:
            continue
        page_no, match = found
        supplied = match.group(2)
        # Do not guess a unit when a generated summary renders a value without one.
        if supplied.lower().replace("µ", "u").replace(" ", "") != expected_unit.lower().replace("µ", "u").replace(" ", ""):
            continue
        suffix = primary[page_no - 2][match.end():match.end() + 48] if page_no <= 8 else ""
        interval = re.search(r"([0-9.]+)\s*-\s*([0-9.]+)", suffix)
        results.append({
            "concept_id": code, "value": match.group(1), "unit": supplied, "date": collected,
            "reference_low": interval.group(1) if interval else "",
            "reference_high": interval.group(2) if interval else "",
            "source_record_id": f"tata-1mg:{page_no}:{code}",
            "measurement_method": "Tata 1mg original laboratory report",
        })
    return results


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
        extracted = tata_1mg_rows(reader) if "TATA 1MG" in text.upper() else []
        if not extracted:
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
                            "biomarker": m[1], "value": m[2], "unit": m[3],
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
        from wearables import parse_wearable
        return parse_wearable(content, filename, artifact)
    if kind == "genomics":
        return parse_genotype(content, artifact)
    raise ValueError("Unsupported upload type.")
