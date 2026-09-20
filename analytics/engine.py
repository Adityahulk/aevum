import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from statistics import mean, median, pstdev
from wearables import is_wearable

from catalog import (
    CONCEPTS,
    DOMAINS,
    EVIDENCE_VERSION,
    HALLMARKS,
    INTERVENTIONS,
    KNOWLEDGE_ONLY,
    MODEL_VERSION,
    ONTOLOGY_VERSION,
    RELATIONSHIPS,
)


def when(o):
    return datetime.fromisoformat(o["effective_time"].replace("Z", "+00:00")).replace(
        tzinfo=timezone.utc
    )


def outside(o):
    r = o.get("reference_range") or {}
    v = o["value"]
    lo, hi = r.get("low"), r.get("high")
    return (lo is not None and v < lo) or (hi is not None and v > hi)


def ref_deviation(o):
    r = o.get("reference_range") or {}
    v = o["value"]
    lo, hi = r.get("low"), r.get("high")
    if hi is not None and v > hi:
        return (v - hi) / max(abs(hi), 1)
    if lo is not None and v < lo:
        return (lo - v) / max(abs(lo), 1)
    return 0


def favorable_change(code, baseline, current, reference_range):
    if baseline in (None, 0):
        return 0.0
    pct = (current - baseline) / abs(baseline) * 100
    direction = CONCEPTS[code][3]
    if direction == 0:
        return 0.0
    before = {"value": baseline, "reference_range": reference_range}
    after = {"value": current, "reference_range": reference_range}
    if outside(before) or outside(after):
        old_distance, new_distance = ref_deviation(before), ref_deviation(after)
        if new_distance > old_distance:
            return -abs(pct)
        if new_distance < old_distance:
            return abs(pct)
    return pct * direction


def features(observations, now):
    grouped = defaultdict(list)
    for o in observations:
        if o.get("quality_status") == "verified" and o["concept_id"] in CONCEPTS:
            grouped[o["concept_id"]].append(o)
    out = {}
    for code, obs in grouped.items():
        # Different devices/methods cannot form a single personal baseline.
        latest_source = max(obs, key=when)["source"]
        if is_wearable(latest_source):
            obs = [o for o in obs if o["source"] == latest_source]
        # A sample/day contributes once, so duplicate providers cannot inflate confidence.
        by_day = {}
        for o in sorted(obs, key=when):
            by_day[when(o).date()] = o
        obs = sorted(by_day.values(), key=when)
        current = obs[-1]
        wearable = is_wearable(current["source"])
        window = 28 if wearable else 730
        recent = [o for o in obs if (when(current) - when(o)).days <= window]
        if wearable:
            base = [o for o in recent if 7 < (when(current) - when(o)).days <= 28]
            follow = [o for o in recent if (when(current) - when(o)).days <= 7]
        else:
            base = recent[:-1]
            follow = [current]
        baseline = median(o["value"] for o in base) if base else None
        latest = mean(o["value"] for o in follow)
        change = (latest - baseline) / abs(baseline) * 100 if baseline not in (None, 0) else None
        xs = [(when(o) - when(recent[0])).total_seconds() / 86400 for o in recent]
        ys = [o["value"] for o in recent]
        denom = sum((x - mean(xs)) ** 2 for x in xs)
        slope = (
            sum((x - mean(xs)) * (y - mean(ys)) for x, y in zip(xs, ys)) / denom if denom else None
        )
        noise = pstdev(o["value"] for o in base) if len(base) > 1 else 0
        meaningful = max(5, noise / abs(baseline) * 100 if baseline else 5)
        direction = CONCEPTS[code][3]
        days = (when(current) - when(recent[0])).days
        enough = len(base) >= (7 if wearable else 1) and days >= (14 if wearable else 14)
        stale = (now - when(current)).days > (7 if wearable else 180)
        benefit = favorable_change(code, baseline, latest, current.get("reference_range"))
        trend = (
            "Insufficient data"
            if not enough
            else "Stable"
            if change is None or abs(change) < meaningful or direction == 0
            else "Improving"
            if benefit > 0
            else "Worsening"
        )
        if stale:
            trend = "Uncertain"
        # Persistence is the current consecutive run, not time since any old abnormality.
        run = []
        for o in reversed(recent):
            if not outside(o):
                break
            run.append(o)
        persistence = (when(run[0]) - when(run[-1])).days if len(run) > 1 else 0
        quality = mean(o.get("confidence", 0.7) for o in recent)
        f = {
            "concept_id": code,
            "label": CONCEPTS[code][0],
            "unit": CONCEPTS[code][1],
            "current": current["value"],
            "current_window_mean": round(latest, 2),
            "baseline": round(baseline, 2) if baseline is not None else None,
            "personal_change_pct": round(change, 1) if change is not None else None,
            "personal_zscore": round((latest - baseline) / noise, 2)
            if baseline is not None and noise
            else None,
            "slope_per_day": round(slope, 5) if slope is not None else None,
            "trend": trend,
            "abnormal": outside(current),
            "population_deviation": round(ref_deviation(current), 3),
            "persistence_days": persistence,
            "count": len(recent),
            "span_days": days,
            "stale": stale,
            "latest_date": current["effective_time"],
            "quality": round(quality, 2),
            "observation_ids": [o["id"] for o in recent],
            "source": current["source"],
            "reference_range": current.get("reference_range"),
            "history": [
                {"date": o["effective_time"], "value": o["value"], "id": o["id"]} for o in recent
            ],
            "window_days": window,
            "algorithm_version": MODEL_VERSION,
        }
        if wearable:
            f.update(
                {
                    "mean_7d": round(latest, 2),
                    "baseline_28d": round(baseline, 2) if baseline is not None else None,
                    "sleep_variability_30d": round(pstdev(ys), 2) if code == "SLEEP" else None,
                }
            )
        out[code] = f
    return out


def compute(payload):
    now = datetime.fromisoformat(
        payload.get("now", datetime.now(timezone.utc).isoformat()).replace("Z", "+00:00")
    )
    fs = features(payload.get("observations", []), now)
    domains = []
    previous = payload.get("previous") or {}
    dirty = set(payload.get("dirty_concepts", []))
    previous_domains = {d["id"]: d for d in previous.get("domains", [])}
    for did, name, subtitle, phenotype in DOMAINS:
        codes = [c for c, v in CONCEPTS.items() if did in v[2]]
        if (
            dirty
            and did in previous_domains
            and not dirty.intersection(codes)
            and payload.get("reuse_unaffected", False)
            and previous.get("model_version") == MODEL_VERSION
        ):
            domains.append(previous_domains[did])
            continue
        signals = [fs[c] for c in codes if c in fs]
        fresh = [f for f in signals if not f["stale"]]
        coverage = round(len(fresh) / len(codes) * 100) if codes else 0
        concerning = [f for f in fresh if f["abnormal"] or f["trend"] == "Worsening"]
        improving = [f for f in fresh if f["trend"] == "Improving"]
        worsening = [f for f in fresh if f["trend"] == "Worsening"]
        refs = [
            f
            for f in fresh
            if any(
                v is not None
                for k, v in (f.get("reference_range") or {}).items()
                if k in ("low", "high")
            )
        ]
        state = (
            "Insufficient data"
            if not fresh
            else "Elevated concern"
            if len(concerning) >= 3
            else "Moderate concern"
            if concerning
            else "Favorable"
            if refs
            else "Within personal baseline"
            if any(f["baseline"] is not None for f in fresh)
            else "Baseline forming"
        )
        trend = (
            "Insufficient data"
            if not fresh or all(f["trend"] in ("Insufficient data", "Uncertain") for f in fresh)
            else "Mixed"
            if improving and worsening
            else "Worsening"
            if worsening
            else "Improving"
            if improving
            else "Stable"
        )
        concordance = round(len(concerning) / len(fresh), 2) if fresh else 0
        repeats = sum(1 for f in fresh if f["count"] >= 3 and f["span_days"] >= 28)
        confidence = (
            "High"
            if len(fresh) >= 3 and repeats >= 3 and coverage >= 60
            else "Moderate"
            if fresh and (repeats >= 1 or len(fresh) >= 2)
            else "Low"
        )
        if not payload.get("profile", {}).get("age") or not payload.get("profile", {}).get("sex"):
            confidence = "Low"
        severity = "Elevated" if len(concerning) >= 3 else "Moderate" if concerning else "None"
        priority = round(
            len(concerning) * 2
            + sum(f["population_deviation"] for f in fresh)
            + len(worsening) * 0.7,
            2,
        )
        ds = {
            "id": did,
            "name": name,
            "subtitle": subtitle,
            "state": state,
            "trend": trend,
            "confidence": confidence,
            "coverage": coverage,
            "signals": signals,
            "supporting_observation_ids": list(
                dict.fromkeys(o for f in signals for o in f["observation_ids"])
            ),
            "severity": severity,
            "priority": priority,
            "phenotype": phenotype if concerning else None,
            "persistence_days": max([f["persistence_days"] for f in concerning] or [0]),
            "concordance": concordance,
            "functional_relevance": "Observed functional change"
            if did in ("functional", "musculoskeletal") and concerning
            else "Not established from these measurements",
            "clinical_significance": "Discuss persistent or unexpected changes with your clinician"
            if concerning
            else "No automated diagnosis",
            "intervention_relevance": "Measurable candidate target"
            if concerning
            else "Maintenance / insufficient evidence",
            "context_limitations": [
                "Lab-provided reference intervals are used; no validated age/sex percentile model is available.",
                "These are research rules, not a diagnosis or a biological-age estimate.",
            ],
            "computed_at": now.isoformat(),
        }
        domains.append(ds)
    priorities = sorted(
        [d for d in domains if d["priority"] > 0],
        key=lambda d: d["priority"],
        reverse=True,
    )[:3]
    meaningful = [d for d in domains if d["trend"] in ("Improving", "Worsening", "Mixed")]
    overall = (
        "Mixed"
        if any(d["trend"] == "Mixed" for d in meaningful)
        or len({d["trend"] for d in meaningful}) > 1
        else meaningful[0]["trend"]
        if meaningful
        else "Stable"
        if any(d["trend"] == "Stable" for d in domains)
        else "Insufficient longitudinal data"
        if any(d["coverage"] for d in domains)
        else "Building your baseline"
    )
    changes = sorted(
        [
            dict(
                f,
                domain=next((d["id"] for d in domains if f in d["signals"]), "metabolic"),
            )
            for f in fs.values()
            if f["trend"] in ("Improving", "Worsening")
        ],
        key=lambda f: abs(f["personal_change_pct"] or 0),
        reverse=True,
    )
    relationships = [
        r for r in RELATIONSHIPS if any(d["id"] == r["domain"] and d["phenotype"] for d in domains)
    ]
    narrative = (
        " ".join(
            f"{d['name']} is {d['trend'].lower()} ({d['confidence'].lower()} confidence)."
            for d in domains
            if d["coverage"]
        )
        or "Your story begins with your first verified measurements. Add bloodwork and personal context to build your baseline."
    )
    if priorities:
        narrative += f" Your current priority is {priorities[0]['name'].lower()}."
    narrative += (
        " Changes describe observed signals; they do not establish causes or reversal of aging."
    )
    snapshot = hashlib.sha256(
        json.dumps(
            {
                "model_version": MODEL_VERSION,
                "obs": payload.get("observations", []),
                "profile": payload.get("profile", {}),
                "experiments": payload.get("experiments", []),
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()
    return {
        "domains": domains,
        "features": fs,
        "priorities": [d["id"] for d in priorities],
        "overall_trajectory": overall,
        "changes": changes[:6],
        "narrative": narrative,
        "relationships": relationships,
        "hallmarks": HALLMARKS,
        "model_version": MODEL_VERSION,
        "ontology_version": ONTOLOGY_VERSION,
        "evidence_snapshot": EVIDENCE_VERSION,
        "input_snapshot": snapshot,
        "generated_at": now.isoformat(),
        "observation_count": len(payload.get("observations", [])),
        "coverage": round(sum(d["coverage"] for d in domains[:7]) / 7),
        "strengths": [
            d["id"]
            for d in domains
            if d["state"] in ("Favorable", "Within personal baseline") and d["coverage"] > 0
        ],
    }


def rank(payload):
    twin = payload["twin"]
    profile = payload.get("profile", {})
    prefs = profile.get("preferences", {})
    goal = profile.get("goal", "Longevity")
    domains = {d["id"]: d for d in twin["domains"]}
    context = " ".join(
        str(profile.get(k, "")) for k in ["conditions", "medications", "allergies", "symptoms"]
    ).lower()
    results = []
    for it in INTERVENTIONS:
        if it["category"] == "Supplement" and not prefs.get("supplements", False):
            continue
        if prefs.get("strong_only", False) and it["level"] != "Established":
            continue
        target_domains = [it["domain"], *it["also"]]
        target = [domains[x] for x in target_domains if x in domains]
        relevance = max([d["priority"] for d in target] or [0])
        available = [
            c for c in it["targets"] if c in twin["features"] and not twin["features"][c]["stale"]
        ]
        goalmatch = {
            "Longevity": target_domains,
            "General health": target_domains,
            "Performance": ["functional", "musculoskeletal"],
            "Fitness / performance": ["functional", "musculoskeletal"],
            "Body composition": ["body"],
            "Recovery": ["recovery"],
            "Metabolic health": ["metabolic"],
            "Cardiovascular health": ["cardiovascular"],
            "Cognitive health": ["cognitive"],
        }.get(goal, [])
        goalboost = 1.5 if any(d in goalmatch for d in target_domains) else 0
        if (
            profile.get("secondary_goal")
            and any(
                x in str(profile["secondary_goal"]).lower()
                for x in ["performance", "fitness", "athletic"]
            )
            and it["category"] == "Exercise"
        ):
            goalboost += 0.5
        blocked = [c for c in it["contraindications"] if c in context]
        interactions = [x for x in it["interactions"] if x in context]
        needs_review = (
            it["review_required"]
            or bool(interactions)
            or (it["category"] == "Exercise" and bool(str(profile.get("conditions", "")).strip()))
        )
        history = [e for e in payload.get("history", []) if e.get("intervention_id") == it["id"]]
        prior_adverse = any(
            e.get("response", {}).get("outcome") in ("Adverse", "Negative") for e in history
        )
        active = any(e.get("status") not in ("Evaluated", "Stopped") for e in history)
        needs_review = needs_review or prior_adverse
        observed_favorable = any(
            e.get("response", {}).get("outcome") == "Favorable" for e in history
        )
        applicability = "Population match remains uncertain; review the study context."
        population_weight = 1.0
        if it["id"] == "nutrition" and not 55 <= float(profile.get("age") or 0) <= 80:
            applicability = "The cited trial studied adults aged 55–80 at high cardiovascular risk; your age is outside that cohort."
            population_weight = 0.8
        evidence = 1 if it["level"] == "Established" else 0.8
        feasibility = max(0.2, 1 - it["burden"] - (0.15 if profile.get("stress") == "High" else 0))
        score = round(
            evidence
            * (1 + relevance + goalboost)
            * feasibility
            * population_weight
            * (1.05 if observed_favorable and not prior_adverse else 1)
            * (1 if available else 0.3)
            - len(interactions)
            - (1 if needs_review else 0),
            2,
        )
        reasons = [
            f"Targets {', '.join(d['name'].lower() for d in target[:2])}.",
            f"{it['level']} evidence; {'existing baseline available' if available else 'baseline measurement needed'}.",
            f"Ranked for your {goal.lower()} goal; practical burden is {'moderate' if it['burden'] >= 0.4 else 'low'}.",
        ]
        reasons.append(applicability)
        if active:
            reasons.append(
                "This experiment is already active. Review its progress before starting another cycle."
            )
        if prior_adverse:
            reasons.append(
                "A prior negative or adverse response requires professional review before repeating this option."
            )
        elif observed_favorable:
            reasons.append(
                "Your prior favorable response modestly increases personal relevance; causality remains uncertain."
            )
        if blocked:
            reasons.append("Not eligible: " + ", ".join(blocked))
        if needs_review:
            reasons.append("Professional review is required before starting.")
        if profile.get("family_history") and "cardiovascular" in target_domains:
            reasons.append("Family history adds monitoring context; it is not a diagnosis.")
        results.append(
            {
                **it,
                "score": score,
                "personal_relevance": "High"
                if relevance >= 3
                else "Moderate"
                if available
                else "Unknown",
                "why": reasons,
                "available_baselines": available,
                "eligible": not blocked and not needs_review and not active and bool(available),
                "already_active": active,
                "population_applicability": applicability,
                "review_required": needs_review,
                "blocked_reasons": blocked,
                "interaction_flags": interactions,
                "measurement_plan": {
                    "baseline": available,
                    "follow_up_weeks": it["weeks"],
                    "success_criteria": "At least 5% favorable change beyond baseline variation; a research threshold, not a validated clinical endpoint.",
                },
                "ranking_version": MODEL_VERSION,
            }
        )
    return {
        "recommendations": sorted(results, key=lambda r: (bool(r["blocked_reasons"]), -r["score"])),
        "knowledge_only": KNOWLEDGE_ONLY,
    }


def evaluate(payload):
    exp = payload["experiment"]
    obs = payload.get("observations", [])
    now = datetime.fromisoformat(
        payload.get("now", datetime.now(timezone.utc).isoformat()).replace("Z", "+00:00")
    )
    start = datetime.fromisoformat(exp["start_date"].replace("Z", "+00:00")).replace(
        tzinfo=timezone.utc
    )
    duration = (now - start).days
    min_days = exp["planned_duration_weeks"] * 7
    adherence = float(exp.get("adherence", 0))
    changes = []
    for code, base in exp.get("baseline", {}).items():
        comparable = [
            o
            for o in obs
            if o["concept_id"] == code
            and o.get("quality_status") == "verified"
            and when(o) > start
            and (when(o) - start).days >= min_days - 7
            and o["id"] not in exp.get("baseline_observation_ids", [])
            and (now - when(o)).days <= 30
        ]
        if not comparable or base.get("value") in (None, 0):
            continue
        comparable.sort(key=when)
        same_source = [o for o in comparable if o.get("source") == base.get("source")]
        if not same_source:
            continue
        follow = (
            mean(o["value"] for o in same_source[-7:])
            if is_wearable(same_source[-1]["source"])
            else same_source[-1]["value"]
        )
        pct = (follow - base["value"]) / abs(base["value"]) * 100
        direction = CONCEPTS[code][3]
        benefit = favorable_change(
            code,
            base["value"],
            follow,
            base.get("reference_range") or same_source[-1].get("reference_range"),
        )
        threshold = max(float(exp.get("success_threshold_pct", 5)), float(base.get("noise_pct", 0)))
        changes.append(
            {
                "concept_id": code,
                "label": CONCEPTS[code][0],
                "baseline": base["value"],
                "follow_up": round(follow, 2),
                "change_pct": round(pct, 1),
                "favorable_change_pct": round(benefit, 1),
                "threshold_pct": threshold,
                "meaningful": abs(pct) > threshold and direction != 0,
                "observation_ids": [o["id"] for o in same_source],
            }
        )
    confounders = []
    if payload.get("concurrent_experiments", 0) > 0:
        confounders.append("Concurrent interventions limit attribution.")
    if exp.get("concurrent_changes"):
        confounders.append("Reported concurrent behavior or medication changes.")
    if exp.get("adverse_effects"):
        outcome = "Adverse"
        interpretation = "An adverse effect was reported. Pause the experiment and seek appropriate medical review."
    elif (
        duration < min_days
        or adherence < 70
        or len(changes) < max(1, len(exp.get("baseline", {})) // 2)
    ):
        outcome = "Inconclusive"
        interpretation = "The planned duration, adherence or comparable follow-up data is insufficient to judge a response."
    elif any(c["meaningful"] and c["favorable_change_pct"] < 0 for c in changes):
        outcome = "Negative"
        interpretation = "At least one target worsened beyond the configured variability threshold. Review the plan and relevant clinical context."
    elif any(c["meaningful"] and c["favorable_change_pct"] > 0 for c in changes):
        outcome = "Favorable"
        interpretation = "A favorable change was observed after the intervention. This does not prove that the intervention caused it or reversed biological aging."
    else:
        outcome = "No meaningful response"
        interpretation = "No target exceeded the predefined change threshold despite sufficient duration and reported adherence."
    return {
        "outcome": outcome,
        "confidence": "Low" if confounders or outcome == "Inconclusive" else "Moderate",
        "changes": changes,
        "confounders": confounders,
        "interpretation": interpretation,
        "duration_days": duration,
        "adherence": adherence,
        "evaluated_at": now.isoformat(),
        "model_version": MODEL_VERSION,
        "limitations": [
            "Before/after comparison cannot establish causality.",
            "Thresholds are transparent research heuristics and require prospective validation.",
            "Prior trajectories and variability are available in the frozen baseline; regression to the mean remains possible.",
        ],
    }
