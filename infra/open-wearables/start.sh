#!/bin/sh
set -eu
case "${OW_ROLE:-api}" in
  worker) exec uv run celery -A app.main:celery_app worker --loglevel=warning --pool=threads --concurrency=4 -Q default,sdk_sync,garmin_sync,webhook_sync,xml_sync ;;
  scheduler) exec uv run celery -A app.main:celery_app beat --loglevel=warning --schedule=/tmp/ow-celerybeat ;;
  api)
    uv run alembic upgrade head
    uv run python scripts/init_provider_settings.py
    uv run python scripts/init_device_priorities.py
    uv run python scripts/init/seed_admin.py
    uv run python scripts/init/seed_series_types.py
    uv run python scripts/init/seed_archival_settings.py
    exec uv run python aevum_serve.py ;;
  *) echo 'OW_ROLE must be api, worker or scheduler' >&2; exit 1 ;;
esac
