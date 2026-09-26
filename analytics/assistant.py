import re
import uuid

from catalog import CONCEPTS, EVIDENCE, MODEL_VERSION
from llm import configured_provider, route
from retrieval import search

OVERVIEW = re.compile(
    r"\b(reports?|results?|overall|summary|summari[sz]e|everything|how am i|my health)\b"
)


def _mentioned_domain(lower, twin):
    for d in twin["domains"]:
        if d["id"] in lower or any(
            w in lower for w in d["name"].lower().replace("&", "").split() if len(w) > 4
        ):
            return d["id"]
    for code, concept in CONCEPTS.items():
        names = [code.lower(), concept[0].lower(), *concept[5]]
        if any(re.search(r"\b" + re.escape(n) + r"\b", lower) for n in names):
            return next(
                (
                    domain
                    for domain in concept[2]
                    if any(d["id"] == domain for d in twin["domains"])
                ),
                None,
            )
    return None


def _num(value):
    return f"{value:g}" if isinstance(value, (int, float)) else str(value)


def _range_note(signal):
    r = signal.get("reference_range") or {}
    low, high = r.get("low"), r.get("high")
    if low is None and high is None:
        return ""
    where = "outside" if signal.get("abnormal") else "within"
    bounds = (
        f"{_num(low)}–{_num(high)}"
        if low is not None and high is not None
        else f"{'above ' + _num(low) if low is not None else 'below ' + _num(high)}"
    )
    return f" ({where} the lab range {bounds})"


def _overview(twin):
    measured = [d for d in twin["domains"] if d["signals"]]
    unmeasured = [d for d in twin["domains"] if not d["signals"]]
    if not measured:
        return "There are no verified measurements yet. Add a lab report to build your Twin."
    text = (
        "Here is where your measured systems stand. "
        + "; ".join(f"{d['name']}: {d['state'].lower()}" for d in measured)
        + ". "
    )
    signals = [s for d in measured for s in d["signals"]]
    outside = list(dict.fromkeys(s["label"] for s in signals if s.get("abnormal")))
    ranged = [s for s in signals if _range_note(s)]
    if outside:
        text += f"{len(outside)} {'result is' if len(outside) == 1 else 'results are'} outside the lab range: {', '.join(outside[:6])}. "
    elif ranged:
        text += "Every result that came with a lab range is within it. "
    else:
        text += "These results don’t include lab reference ranges, so they can’t be judged high or low yet. "
    if all(d["trend"] in ("Insufficient data", "Uncertain") for d in measured):
        text += "There is only one test date so far, so trends will appear after your next measurements. "
    if unmeasured:
        text += f"Not yet measured: {', '.join(d['name'] for d in unmeasured)}. "
    return text + "Ask about any system for more detail. Coverage and measurement timing limit certainty."


def answer(payload):
    q = str(payload.get("question", ""))[:2000]
    lower = q.lower()
    twin = payload["twin"]
    profile = payload.get("profile", {})
    selected = payload.get("domain")
    routed = route(q)
    provider = configured_provider()
    if routed:
        selected = selected or routed["domain"]
        if routed["tool"] == "get_interventions":
            lower += " intervention ranking"
        elif routed["tool"] == "get_response":
            lower += " did it work?"
        elif routed["tool"] == "get_genomic_findings":
            lower += " genomic context"
    mentioned = _mentioned_domain(lower, twin)
    overview = bool(
        not payload.get("domain") and not mentioned and OVERVIEW.search(lower)
    )
    selected = selected or mentioned
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
    elif overview:
        text = _overview(twin)
        ids = list(
            dict.fromkeys(
                o for x in twin["domains"] for o in x.get("supporting_observation_ids", [])
            )
        )
        rels = []
        eids = []
    else:
        if d["trend"] in ("Insufficient data", "Uncertain"):
            text = f"Your {d['name'].lower()} is classified as {d['state'].lower()} with {d['confidence'].lower()} confidence. There aren’t enough repeat measurements to show a trend yet. "
        else:
            text = f"Your {d['name'].lower()} is classified as {d['state'].lower()}, with a {d['trend'].lower()} trajectory and {d['confidence'].lower()} confidence. "
        for f in d["signals"][:3]:
            text += f"{f['label']} is {_num(f['current'])} {f['unit']}"
            if f["baseline"] is not None:
                text += f", compared with your baseline of {f['baseline']} ({f['personal_change_pct']:+g}%)"
            else:
                text += _range_note(f)
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
        else (
            "External routing is configured ("
            + provider["provider"]
            + "/"
            + provider["model"]
            + ") but the provider call failed or returned an invalid tool; using the deterministic guide."
            if provider
            else "Deterministic explanations from your structured model; external routing is unavailable or unconfigured."
        ),
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
