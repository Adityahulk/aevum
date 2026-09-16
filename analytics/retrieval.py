"""Small auditable scientific corpus; signed feature hashing supports pgvector without an embedding API.
These are catalog evidence summaries, not unlicensed full-text papers. Never imply broader retrieval.
"""

import hashlib
import math
import re

from catalog import EVIDENCE


def embed(text, dimensions=384):
    values = [0.0] * dimensions
    for word in re.findall(r"[a-z]{3,}", text.lower()):
        h = hashlib.sha256(word.encode()).digest()
        values[int.from_bytes(h[:4], "big") % dimensions] += 1 if h[4] % 2 else -1
    norm = math.sqrt(sum(v * v for v in values)) or 1
    return [round(v / norm, 7) for v in values]


def corpus():
    return [
        {
            **e,
            "source_text": " ".join(
                str(e.get(k, ""))
                for k in [
                    "title",
                    "population",
                    "study_design",
                    "endpoint",
                    "effect",
                    "limitations",
                ]
            ),
            "embedding": embed(
                " ".join(
                    str(e.get(k, ""))
                    for k in [
                        "title",
                        "population",
                        "endpoint",
                        "effect",
                        "limitations",
                    ]
                )
            ),
        }
        for e in EVIDENCE
    ]


def search(query, limit=5):
    vector = embed(query)
    ranked = [
        {
            **e,
            "similarity": round(sum(a * b for a, b in zip(vector, e["embedding"])), 4),
        }
        for e in corpus()
    ]
    return sorted(ranked, key=lambda e: e["similarity"], reverse=True)[: min(max(limit, 1), 10)]
