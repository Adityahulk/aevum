FROM alpine/git:2.47.2 AS source
WORKDIR /src
RUN git clone https://github.com/the-momentum/open-wearables.git . && git checkout --detach ff8527a52ad8a96cd1ebe8c19344295c934ae9dc
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /uvx /bin/
WORKDIR /root_project
COPY --from=source /src/backend/ ./
COPY --from=source /src/LICENSE /licenses/open-wearables-LICENSE
ENV UV_PROJECT_ENVIRONMENT=/opt/venv PATH=/opt/venv/bin:$PATH UV_NO_SYNC=true
RUN uv sync --locked --no-dev --no-editable
COPY serve.py /root_project/aevum_serve.py
COPY admin.py /root_project/aevum_admin.py
COPY --chmod=755 start.sh /root_project/aevum_start.sh
EXPOSE 8000
CMD ["/root_project/aevum_start.sh"]
