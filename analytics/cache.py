"""Optional Redis cache exclusively for the public scientific catalog; never personal health data."""

import json
import os

from catalog import MODEL_VERSION


def public_catalog(factory):
    url = os.getenv("REDIS_URL")
    if not url:
        return factory()
    try:
        import redis

        r = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        key = f"aevum:public-catalog:curated-2026-09-v1:{MODEL_VERSION}"
        cached = r.get(key)
        if cached:
            return json.loads(cached)
        value = factory()
        r.setex(key, 3600, json.dumps(value))
        return value
    except Exception:
        return factory()
