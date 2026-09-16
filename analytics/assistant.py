import re
import uuid

from catalog import CONCEPTS, EVIDENCE, MODEL_VERSION
from llm import route
from retrieval import search


def answer(payload):
    q = str(payload.get("question", ""))[:2000]
    lower = q.lower()
    twin = payload["twin"]
    profile = payload.get("profile", {})
    selected = payload.get("domain")
    routed = route(q)
    if routed:
        selected = selected or routed["domain"]
        if routed["tool"] == "get_interventions":
            lower += " intervention ranking"
        elif routed["tool"] == "get_response":
            lower += " did it work?"
        elif routed["tool"] == "get_genomic_findings":
            lower += " genomic context"
    if not selected:
        for d in twin["domains"]:
            if d["id"] in lower or any(
                w in lower for w in d["name"].lower().replace("&", "").split() if len(w) > 4
            ):
                selected = d["id"]
                break
    if not selected:
        for code, concept in CONCEPTS.items():
            names = [code.lower(), concept[0].lower(), *concept[5]]
            if any(re.search(r"\b" + re.escape(n) + r"\b", lower) for n in names):
                selected = next(
                    (
                        domain
                        for domain in concept[2]
                        if any(d["id"] == domain for d in twin["domains"])
                    ),
                    None,
                )
                break
    d = next((d for d in twin["domains"] if d["id"] == selected), None)
    if not d:
        d = next(
            (d for d in twin["domains"] if d["id"] in twin["priorities"]),
            twin["domains"][0],
        )
    ids = d.get("supporting_observation_ids", [])
    rels = [r for r in twin.get("relationships", []) if r["domain"] == d["id"]]
    eids = list(dict.fromkeys(e for r in rels for e in r["evidence_ids"]))
    if re.search(
        r"\b(dose|dosage|prescribe|diagnose|stop my medication|cure|reverse aging)\b",
        lower,
    ):
        text = "I can explain your measurements and the evidence behind your Twin. I cannot diagnose a condition, prescribe a dose, or advise stopping medication. A biomarker change does not establish reversal of aging. Bring these longitudinal measurements to a qualified clinician."
    elif any(w in lower for w in ["genetic", "dna", "genom", "family"]):
        family = profile.get("family_history", [])
        text = f"Your recorded family history contains {len(family)} {'entry' if len(family) == 1 else 'entries'}. Family history and genetic findings are context and may influence monitoring; they do not establish a current condition. "
        findings = payload.get("genomic_findings", [])
        text += (
            " ".join(f["interpretation"] for f in findings)
            if findings
            else "No interpreted genomic finding is available in the current context."
        )
        ids = []
        eids = []
        rels = []
    elif any(w in lower for w in ["rank", "recommend", "intervention", "what should", "priority"]):
        recs = payload.get("recommendations", [])
        r = next(
            (r for r in recs if d["id"] in [r["domain"], *r["also"]] and not r["blocked_reasons"]),
            recs[0] if recs else None,
        )
        text = (
            f"{r['name']} is ranked for your {profile.get('goal', 'Longevity').lower()} goal. "
            + " ".join(r["why"])
            + f" Measurement window: {r['weeks']} weeks. {r['risk']}"
            if r
            else "Add verified baseline measurements before choosing a measurable experiment."
        )
        if r:
            eids = r["evidence_ids"]
    elif any(w in lower for w in ["did it", "response", "work?"]):
        exps = payload.get("experiments", [])
        evaluated = [e for e in exps if e.get("response")]
        text = (
            evaluated[-1]["response"]["interpretation"]
            if evaluated
            else "There is no evaluated response yet. An experiment needs a frozen baseline, sufficient duration, adherence and comparable follow-up measurements. Coinciding changes alone cannot prove causality."
        )
        ids = [
            o
            for e in evaluated[-1:]
            for c in e["response"]["changes"]
            for o in c["observation_ids"]
        ]
    else:
        text = f"Your {d['name'].lower()} is classified as {d['state'].lower()}, with a {d['trend'].lower()} trajectory and {d['confidence'].lower()} confidence. "
        for f in d["signals"][:3]:
            text += f"{f['label']} is {f['current']} {f['unit']}"
            if f["baseline"] is not None:
                text += f", compared with your baseline of {f['baseline']} ({f['personal_change_pct']:+g}%)"
            text += ". "
        if rels:
            text += (
                "Possible biological interpretations include "
                + ", ".join(r["process"].lower() for r in rels)
                + ". These are evidence-classified interpretations, not measured causes. "
            )
        if not d["signals"]:
            text += "There is not enough verified data to interpret this domain. "
        text += "Coverage and measurement timing limit certainty. A source result and an inferred mechanism are different layers of evidence."
    return {
        "id": str(uuid.uuid4()),
        "question": q,
        "answer": text,
        "mode": "LLM-routed guide" if routed else "Grounded guide",
        "mode_detail": (
            "External intent routing: "
            + routed["model"]
            + ". Claims rendered from authoritative structured data."
        )
        if routed
        else "Deterministic explanations from your structured model; external routing is unavailable or unconfigured.",
        "retrieval_tool": routed["tool"] if routed else "get_domain",
        "related_evidence_ids": [e["id"] for e in search(q, 3)],
        "domain": d["id"],
        "claims": [
            {
                "text": text,
                "observation_ids": ids,
                "relationship_ids": [r["id"] for r in rels],
                "evidence_ids": eids,
                "confidence": d["confidence"],
                "model_version": MODEL_VERSION,
            }
        ],
        "evidence": [e for e in EVIDENCE if e["id"] in eids],
        "suggestions": [
            "What should I measure next?",
            "Why was this intervention ranked first?",
            "What remains uncertain?",
        ],
    }
