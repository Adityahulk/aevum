"""Question-aware context assembly and grounded Ask Aevum orchestration."""

import re
import uuid
from typing import Any

from catalog import CONCEPTS, EVIDENCE, MODEL_VERSION
from llm import LlmUnavailable, UngroundedAnswer, generate
from retrieval import search

_GENERIC_DOMAIN_WORDS = frozenset({"health", "profile", "context"})


def _selected_domain(
    question: str,
    twin: dict[str, Any],
    requested: str | None,
    fallback: str | None = None,
) -> str | None:
    available = {domain["id"]: domain for domain in twin.get("domains", [])}
    if requested in available:
        return requested
    lower = question.lower()
    for domain_id, domain in available.items():
        domain_name = domain.get("name", "").lower()
        terms = [
            domain_id,
            *(
                term
                for term in domain_name.replace("&", " ").split()
                if term not in _GENERIC_DOMAIN_WORDS
            ),
        ]
        if domain_name and domain_name in lower:
            return domain_id
        if any(
            len(term) > 3 and re.search(r"\b" + re.escape(term) + r"\b", lower)
            for term in terms
        ):
            return domain_id
    for code, concept in CONCEPTS.items():
        terms = [code.lower(), concept[0].lower(), *(term.lower() for term in concept[5])]
        if any(re.search(r"\b" + re.escape(term) + r"\b", lower) for term in terms):
            for domain_id in concept[2]:
                if domain_id in available:
                    return domain_id
    if fallback in available:
        return fallback
    priorities = twin.get("priorities", [])
    return priorities[0] if priorities else next(iter(available), None)


def _source(source_id: str, source_type: str, **fields) -> dict[str, Any]:
    return {"source_id": source_id, "source_type": source_type, **fields}


def build_context(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    question = str(payload.get("question", ""))[:2000]
    twin = payload["twin"]
    history = payload.get("conversation_history", [])[-4:]
    previous_domain = history[-1].get("domain") if history else None
    selected = _selected_domain(question, twin, payload.get("domain"), previous_domain)
    lower = question.lower()
    broad = any(
        term in lower
        for term in [
            "overall",
            "anything",
            "priorit",
            "what should",
            "my health",
            "next",
            "biomarker",
            "bloodwork",
            "lab result",
        ]
    )
    wearable_question = any(
        term in lower for term in ["wearable", "device data", "oura", "whoop", "apple watch"]
    )
    nutrition_question = any(
        term in lower for term in ["food", "eat", "diet", "meal", "nutrition"]
    )
    exercise_question = any(
        term in lower for term in ["workout", "exercise", "training", "strength", "cardio"]
    )
    intervention_question = any(
        term in lower
        for term in ["intervention", "recommend", "ranked", "option", "alternative"]
    )
    domain_ids = {selected} if selected else set()
    detailed_domain_ids = set(domain_ids)
    if broad:
        domain_ids.update(domain.get("id") for domain in twin.get("domains", []))
        detailed_domain_ids.update(twin.get("priorities", [])[:3])
    domains = [domain for domain in twin.get("domains", []) if domain.get("id") in domain_ids]
    if not domains:
        domains = twin.get("domains", [])[:1]

    sources: dict[str, dict[str, Any]] = {}
    domain_context = []
    for domain in domains:
        domain_id = domain["id"]
        domain_source = _source(
            f"domain:{domain_id}",
            "computed_domain",
            name=domain.get("name"),
            state=domain.get("state"),
            trajectory=domain.get("trend"),
            confidence=domain.get("confidence"),
            coverage=domain.get("coverage"),
            phenotype=domain.get("phenotype"),
            interpretation=domain.get("phenotype_explanation"),
            uncertainty=domain.get("uncertainty", []),
        )
        sources[domain_source["source_id"]] = domain_source
        signal_sources = []
        for signal in (
            domain.get("signals", [])[:12] if domain_id in detailed_domain_ids else []
        ):
            observation_ids = signal.get("observation_ids", [])
            stable_id = observation_ids[-1] if observation_ids else signal.get("concept_id", "unknown")
            signal_source = _source(
                f"measurement:{stable_id}",
                "verified_measurement_summary",
                concept_id=signal.get("concept_id"),
                label=signal.get("label"),
                current=signal.get("current"),
                unit=signal.get("unit"),
                baseline=signal.get("baseline"),
                personal_change_pct=signal.get("personal_change_pct"),
                trajectory=signal.get("trend"),
                reference_status=signal.get("reference_status"),
                latest_date=signal.get("latest_date"),
                source=signal.get("source"),
                stale=signal.get("stale"),
                observation_ids=observation_ids,
            )
            sources[signal_source["source_id"]] = signal_source
            signal_sources.append(signal_source["source_id"])
        domain_context.append(
            {"source_id": domain_source["source_id"], "signal_source_ids": signal_sources}
        )

    included_observations = {
        observation_id
        for source in sources.values()
        for observation_id in source.get("observation_ids", [])
    }
    direct_terms = set()
    for code, concept in CONCEPTS.items():
        names = [code.lower(), concept[0].lower(), *(term.lower() for term in concept[5])]
        if any(re.search(r"\b" + re.escape(term) + r"\b", lower) for term in names):
            direct_terms.add(code)
        if any(
            re.search(r"\b" + re.escape(domain_id) + r"\b", lower)
            for domain_id in concept[2]
        ):
            direct_terms.add(code)
    feature_candidates = [
        feature
        for code, feature in twin.get("features", {}).items()
        if code in direct_terms
        or (wearable_question and feature.get("mean_7d") is not None)
        or (
            broad
            and (
                feature.get("abnormal")
                or feature.get("trend") in {"Improving", "Worsening", "Uncertain"}
            )
        )
    ]
    for feature in feature_candidates[:24]:
        observation_ids = feature.get("observation_ids", [])
        if observation_ids and observation_ids[-1] in included_observations:
            continue
        stable_id = observation_ids[-1] if observation_ids else feature.get("concept_id", "unknown")
        source = _source(
            f"measurement:{stable_id}",
            "verified_supporting_measurement",
            concept_id=feature.get("concept_id"),
            label=feature.get("label"),
            current=feature.get("current"),
            unit=feature.get("unit"),
            baseline=feature.get("baseline"),
            personal_change_pct=feature.get("personal_change_pct"),
            trajectory=feature.get("trend"),
            reference_status=feature.get("reference_status"),
            latest_date=feature.get("latest_date"),
            source=feature.get("source"),
            stale=feature.get("stale"),
            observation_ids=observation_ids,
        )
        sources[source["source_id"]] = source

    relationships = []
    for relationship in twin.get("relationships", []):
        if relationship.get("domain") not in {domain["id"] for domain in domains}:
            continue
        source = _source(
            f"relationship:{relationship['id']}",
            "curated_biological_relationship",
            domain=relationship.get("domain"),
            phenotype=relationship.get("phenotype"),
            possible_process=relationship.get("process"),
            pathway=relationship.get("pathway"),
            hallmark_id=relationship.get("hallmark_id"),
            evidence_level=relationship.get("evidence_level"),
            confidence=relationship.get("confidence"),
            direction=relationship.get("direction"),
            limitations=relationship.get("limitations"),
            evidence_ids=relationship.get("evidence_ids", []),
        )
        sources[source["source_id"]] = source
        relationships.append(source["source_id"])

    profile = payload.get("profile", {})
    safe_profile = {
        key: profile.get(key)
        for key in [
            "age",
            "sex",
            "goal",
            "secondary_goal",
            "conditions",
            "medications",
            "allergies",
            "symptoms",
            "exercise_frequency",
            "exercise_type",
            "sleep_duration",
            "sleep_schedule",
            "diet",
            "alcohol",
            "smoking",
            "stress",
            "family_history",
            "preferences",
        ]
        if profile.get(key) not in (None, "", [], {})
    }
    profile_source = _source(
        "context:reported",
        "user_reported_context",
        profile=safe_profile,
        historical_lifestyle_facts=payload.get("lifestyle_facts", [])[-40:],
        limitation="Self-reported context; it is not a verified measurement or diagnosis.",
    )
    sources[profile_source["source_id"]] = profile_source

    recommendation_ids = []
    for recommendation in payload.get("recommendations", [])[:8]:
        category = recommendation.get("category")
        intent_match = (
            intervention_question
            or (nutrition_question and category == "Nutrition")
            or (exercise_question and category == "Exercise")
        )
        if (
            selected
            and selected
            not in [recommendation.get("domain"), *recommendation.get("also", [])]
            and not broad
            and not intent_match
        ):
            continue
        source = _source(
            f"recommendation:{recommendation.get('id')}",
            "ranked_intervention",
            name=recommendation.get("name"),
            category=recommendation.get("category"),
            target_domains=[recommendation.get("domain"), *recommendation.get("also", [])],
            evidence_level=recommendation.get("level"),
            personal_relevance=recommendation.get("personal_relevance"),
            rationale=recommendation.get("why", []),
            protocol=recommendation.get("protocol"),
            implementation_options=recommendation.get("implementation_options", []),
            expected_effect=recommendation.get("expected_effect"),
            duration_weeks=recommendation.get("weeks"),
            available_baselines=recommendation.get("available_baselines", []),
            measurement_plan=recommendation.get("measurement_plan", {}),
            risk=recommendation.get("risk"),
            review_required=recommendation.get("review_required"),
            blocked_reasons=recommendation.get("blocked_reasons", []),
            interaction_flags=recommendation.get("interaction_flags", []),
            evidence_ids=recommendation.get("evidence_ids", []),
        )
        sources[source["source_id"]] = source
        recommendation_ids.append(source["source_id"])

    experiment_ids = []
    for experiment in payload.get("experiments", [])[-5:]:
        source = _source(
            f"experiment:{experiment.get('id')}",
            "personal_experiment",
            intervention_id=experiment.get("intervention_id"),
            name=experiment.get("name"),
            status=experiment.get("status"),
            start_date=experiment.get("start_date"),
            protocol=experiment.get("protocol"),
            adherence=experiment.get("adherence"),
            response=experiment.get("response"),
        )
        sources[source["source_id"]] = source
        experiment_ids.append(source["source_id"])

    genomic_ids = []
    for finding in payload.get("genomic_findings", [])[:20]:
        source = _source(
            f"genomic_finding:{finding.get('id')}",
            "curated_genomic_interpretation",
            gene=finding.get("gene"),
            variant=finding.get("variant"),
            interpretation=finding.get("interpretation"),
            impact=finding.get("impact"),
            evidence=finding.get("evidence"),
            limitation=(
                "Context only; does not establish present biological state or treatment response."
            ),
        )
        sources[source["source_id"]] = source
        genomic_ids.append(source["source_id"])

    relevant_evidence_ids = {
        evidence_id
        for source in sources.values()
        for evidence_id in source.get("evidence_ids", [])
    }
    evidence_ids = []
    evidence_query = question + " " + " ".join(domain.get("name", "") for domain in domains)
    for item in search(evidence_query, 8):
        if relevant_evidence_ids and item["id"] not in relevant_evidence_ids:
            continue
        source = _source(
            f"evidence:{item['id']}",
            "curated_scientific_evidence",
            title=item.get("title"),
            population=item.get("population"),
            study_design=item.get("study_design"),
            endpoint=item.get("endpoint"),
            effect=item.get("effect"),
            limitations=item.get("limitations"),
        )
        sources[source["source_id"]] = source
        evidence_ids.append(source["source_id"])

    context = {
        "twin": {
            "version": twin.get("version"),
            "model_version": twin.get("model_version"),
            "generated_at": twin.get("generated_at"),
            "overall_trajectory": twin.get("overall_trajectory"),
            "priority_domains": twin.get("priorities", []),
        },
        "selected_domain": selected,
        "domain_context": domain_context,
        "relationship_source_ids": relationships,
        "reported_context_source_id": profile_source["source_id"],
        "recommendation_source_ids": recommendation_ids,
        "experiment_source_ids": experiment_ids,
        "genomic_source_ids": genomic_ids,
        "evidence_source_ids": evidence_ids,
        "conversation_history": [
            {
                "question": turn.get("question"),
                "summary": turn.get("answer"),
                "domain": turn.get("domain"),
                "claim_source_ids": [
                    source_id
                    for claim in turn.get("claims", [])
                    for source_id in claim.get("source_ids", [])
                    if source_id in sources
                ],
            }
            for turn in history
        ],
        "sources": list(sources.values()),
        "global_limits": [
            "The Twin is a research interpretation and does not diagnose disease.",
            "Associations and pathways do not establish an active cause in this person.",
            "Before/after experiment changes do not prove causality.",
            "Missing data must remain missing; DNA cannot fill current measurement gaps.",
        ],
    }
    return context, sources


def answer(payload: dict[str, Any]) -> dict[str, Any]:
    question = str(payload.get("question", ""))[:2000]
    context, sources = build_context(payload)
    generated = generate(question, context, set(sources))
    cited_ids = list(
        dict.fromkeys(
            source_id
            for claim in generated["claims"]
            for source_id in claim["source_ids"]
        )
    )
    cited = [sources[source_id] for source_id in cited_ids]
    evidence_ids = [
        source_id.split(":", 1)[1]
        for source_id in cited_ids
        if source_id.startswith("evidence:")
    ]
    confidence_order = {"Low": 0, "Moderate": 1, "High": 2}
    confidence = min(
        (claim["confidence"] for claim in generated["claims"]),
        key=lambda value: confidence_order[value],
    )
    claims = []
    for claim in generated["claims"]:
        claim_sources = [sources[source_id] for source_id in claim["source_ids"]]
        claims.append(
            {
                **claim,
                "observation_ids": list(
                    dict.fromkeys(
                        observation_id
                        for source in claim_sources
                        for observation_id in source.get("observation_ids", [])
                    )
                ),
                "relationship_ids": [
                    source_id.split(":", 1)[1]
                    for source_id in claim["source_ids"]
                    if source_id.startswith("relationship:")
                ],
                "evidence_ids": [
                    source_id.split(":", 1)[1]
                    for source_id in claim["source_ids"]
                    if source_id.startswith("evidence:")
                ],
                "model_version": MODEL_VERSION,
            }
        )
    return {
        "id": str(uuid.uuid4()),
        "question": question,
        "answer": generated["summary"],
        "mode": "Grounded AI",
        "mode_detail": (
            "LLM explanation generated from a consent-gated Twin projection and "
            "validated source identifiers."
        ),
        "domain": context.get("selected_domain"),
        "claims": claims,
        "confidence": confidence,
        "source_cards": cited,
        "evidence": [item for item in EVIDENCE if item["id"] in evidence_ids],
        "action_items": generated["action_items"],
        "suggestions": generated["follow_up_questions"],
        "medical_boundary": generated["medical_boundary"],
        "provenance": {
            "observation_ids": list(
                dict.fromkeys(
                    observation_id
                    for source in cited
                    for observation_id in source.get("observation_ids", [])
                )
            ),
            "relationship_ids": [
                source_id.split(":", 1)[1]
                for source_id in cited_ids
                if source_id.startswith("relationship:")
            ],
            "evidence_ids": evidence_ids,
            "twin_version": payload["twin"].get("version"),
        },
    }


__all__ = ["answer", "build_context", "LlmUnavailable", "UngroundedAnswer"]
