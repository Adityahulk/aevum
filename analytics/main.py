import os
import secrets

from assistant import answer
from cache import public_catalog
from catalog import (
    CONCEPTS,
    EVIDENCE,
    HALLMARKS,
    INTERVENTIONS,
    KNOWLEDGE_ONLY,
    RELATIONSHIPS,
)
from engine import compute, evaluate, rank
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from history_import import parse_history
from ingestion import normalized_row, parse_upload
from retrieval import corpus, embed, search

app = FastAPI(title="Aevum scientific service", version="0.1.0", docs_url=None, redoc_url=None)


@app.middleware("http")
async def private_api(request: Request, call_next):
    key = os.getenv("ANALYTICS_SECRET", "local-development-only")
    if request.url.path != "/health" and not secrets.compare_digest(
        request.headers.get("X-Service-Key", ""), key
    ):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    try:
        return await call_next(request)
    except (ValueError, KeyError, TypeError) as e:
        return JSONResponse({"detail": str(e)}, status_code=422)


@app.exception_handler(ValueError)
async def invalid(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.get("/health")
def health():
    return {"status": "ok", "model": "interpretable-0.1.0"}


@app.get("/catalog")
def catalog():
    return public_catalog(
        lambda: {
            "concepts": [
                {"id": k, "name": v[0], "unit": v[1], "domains": v[2]} for k, v in CONCEPTS.items()
            ],
            "evidence": EVIDENCE,
            "hallmarks": HALLMARKS,
            "relationships": RELATIONSHIPS,
            "interventions": INTERVENTIONS,
            "knowledge_only": KNOWLEDGE_ONLY,
        }
    )


@app.post("/parse")
def parse(p: dict):
    return parse_upload(p)


@app.post("/validate")
def validate(p: dict):
    return {
        "rows": [
            normalized_row(r, p.get("source", "manual"), p.get("artifact_id", ""), True)
            for r in p["rows"]
        ]
    }


@app.post("/history/parse")
def historical_import(p: dict):
    return parse_history(p["bundle"], p.get("artifact_id", ""))


@app.post("/compute")
def twin(p: dict):
    return compute(p)


@app.post("/rank")
def recommendations(p: dict):
    return rank(p)


@app.post("/evaluate")
def response(p: dict):
    return evaluate(p)


@app.post("/answer")
def guide(p: dict):
    return answer(p)


@app.get("/evidence/corpus")
def evidence_corpus():
    return {"documents": corpus()}


@app.post("/evidence/search")
def evidence_search(p: dict):
    return {
        "results": search(str(p.get("query", ""))),
        "query_vector": embed(str(p.get("query", ""))),
    }
