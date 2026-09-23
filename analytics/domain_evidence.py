"""Explicit MVP measurement groups and supporting context; context never fills coverage."""
from catalog import CONCEPTS

# Correlated lab aliases/ratios do not each count as an independent coverage group.
MEASUREMENT_GROUPS = {
    "metabolic": [("Glucose regulation", ["GLUCOSE", "HBA1C"]), ("Insulin", ["INSULIN"]), ("Lipid regulation", ["APOB", "TRIGLYCERIDES", "HDL", "NON_HDL"])],
    "cardiovascular": [("Atherogenic lipids", ["APOB", "LDL", "NON_HDL", "LPA"]), ("Blood pressure", ["SBP", "DBP"]), ("Resting heart rate", ["RHR"]), ("Cardiorespiratory capacity", ["VO2MAX"])],
    "inflammatory": [("C-reactive protein", ["HSCRP", "CRP"]), ("Sedimentation rate", ["ESR"]), ("White-cell count", ["WBC"])],
    "recovery": [("Sleep duration", ["SLEEP"]), ("Heart-rate variability (RMSSD)", ["HRV"]), ("Resting heart rate", ["RHR"])],
    "musculoskeletal": [("Strength", ["GRIP"]), ("Lean mass", ["MUSCLE"])],
    "functional": [("Cardiorespiratory capacity", ["VO2MAX"]), ("Daily activity", ["STEPS"]), ("Training volume", ["TRAINING"]), ("Gait speed", ["GAIT"])],
    "body": [("Body weight", ["WEIGHT"]), ("Waist circumference", ["WAIST"])],
}
# Sources support contextual relevance, not individual causal or functional inference.
IRON = "https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/"
VITD = "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/"
CONTEXT_LABS = {
    "metabolic": [("ALT", "Liver-associated context; not a direct measure of glucose regulation.", None), ("AST", "Liver-associated context; interpret with the full panel.", None), ("GGT", "Liver-associated context; interpret with the full panel.", None)],
    "cardiovascular": [("CREATININE", "Kidney-function context for clinical interpretation.", None), ("EGFR", "Kidney-function context for clinical interpretation.", None)],
    "inflammatory": [("FERRITIN", "Iron-status context; interpret alongside inflammatory markers.", IRON)],
    "recovery": [("HEMOGLOBIN", "Oxygen-carrying context relevant to fatigue; does not measure recovery.", IRON), ("FERRITIN", "Iron-status context relevant to fatigue; does not measure recovery.", IRON)],
    "musculoskeletal": [("VITAMIN_D", "Nutrient context relevant to bone and muscle health; does not measure strength or lean mass.", VITD)],
    "functional": [("HEMOGLOBIN", "Oxygen-carrying context relevant to exercise capacity; not a fitness test.", IRON), ("FERRITIN", "Iron-status context relevant to exercise capacity; not a fitness test.", IRON)],
    "body": [],
}
LIFESTYLE = {
    "metabolic": ["diet", "alcohol", "exercise_frequency"],
    "cardiovascular": ["smoking", "exercise_frequency", "exercise_type"],
    "inflammatory": ["smoking", "stress"],
    "recovery": ["sleep_duration", "sleep_schedule", "stress", "alcohol"],
    "musculoskeletal": ["exercise_frequency", "exercise_type"],
    "functional": ["exercise_frequency", "exercise_type", "occupation"],
    "body": ["diet", "exercise_frequency"],
}
GENOMIC_DOMAINS = {"rs4149056": ["cardiovascular", "musculoskeletal"]}


def fact_domains(fact):
    pointer = str(fact.get("source_pointer", ""))
    key = fact.get("concept") or pointer.strip("/").split("/")[-1]
    matched = {d for d, keys in LIFESTYLE.items() if key in keys}
    if pointer.startswith(("/sleep_recovery/", "/sleep_stress/", "/stress_mood_mind/")) or key in {"sleep_quality", "stress_level"}:
        matched.add("recovery")
    if pointer.startswith("/exercise/") or key == "exercise":
        matched.update({"functional", "musculoskeletal"})
    if pointer.startswith("/diet/") or key in {"diet_type", "typical_diet", "eating_window"}:
        matched.add("metabolic")
    if key in {"weight_kg", "height_cm", "waist_cm", "waist_cm_note", "weight_current_note", "hip_cm", "body_fat_distribution", "clothes_fit_trend"}:
        matched.add("body")
    if key in {"blood_pressure", "smoking_vaping"}:
        matched.add("cardiovascular")
    return matched


def domain_evidence(did, fs, payload):
    groups = []
    for name, codes in MEASUREMENT_GROUPS.get(did, []):
        available = [c for c in codes if c in fs and not fs[c]["stale"]]
        # A blood-pressure reading needs both components.
        complete = len(available) == 2 if name == "Blood pressure" else bool(available)
        groups.append({"name": name, "concept_ids": codes,
                       "expected": [CONCEPTS[c][0] for c in codes],
                       "available": available, "covered": complete})
    labs = [dict(fs[c], context_reason=reason, citation=citation)
            for c, reason, citation in CONTEXT_LABS.get(did, []) if c in fs]
    profile = payload.get("profile") or {}
    facts = []
    for key in LIFESTYLE.get(did, []):
        if profile.get(key) is not None and str(profile[key]).strip():
            facts.append({"label": key.replace("_", " ").capitalize(), "value": profile[key],
                          "date": profile.get("created_at"), "source": "Current questionnaire"})
    # Imported answers retain their original date and are never treated as today's measurements.
    for fact in payload.get("lifestyle_facts", []):
        key = fact.get("concept") or str(fact.get("source_pointer", "")).strip("/").split("/")[-1]
        if did in fact_domains(fact) and fact.get("value") is not None:
            item = {"label": key.replace("_", " ").capitalize(), "value": fact["value"],
                    "date": fact.get("collected_at") or fact.get("start_date"),
                    "source": "Historical questionnaire"}
            if item not in facts:
                facts.append(item)
    findings = []
    for finding in payload.get("genomic_findings", []):
        if did in GENOMIC_DOMAINS.get(finding.get("rsid"), []):
            findings.append(finding)
    return {"coverage_groups": groups,
            "available_group_count": sum(g["covered"] for g in groups),
            "configured_group_count": len(groups),
            "context_signals": labs, "lifestyle_context": facts,
            "genomic_context": findings,
            "genomic_status": payload.get("genomic_status", {"enabled": False, "sample_count": 0}),
            "context_count": len(labs) + len(facts) + len(findings)}
