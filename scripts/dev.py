#!/usr/bin/env python3
"""Run all three services locally; stop them together with Ctrl+C."""

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / ".runtime/tools"
LOGS = ROOT / ".runtime/logs"
LOGS.mkdir(parents=True, exist_ok=True)
config = (
    (TOOLS / "tooling.txt").read_text().splitlines() if (TOOLS / "tooling.txt").exists() else []
)
node = os.getenv("AEVUM_NODE") or (config[0] if config else shutil.which("node"))
if (
    not node
    or int(
        subprocess.check_output([node, "--version"], text=True).strip().lstrip("v").split(".")[0]
    )
    < 22
):
    raise SystemExit(
        "Run python3 scripts/bootstrap.py to install a supported project-local Node runtime."
    )
for port in [8080, 8090, 5173]:
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            raise SystemExit(
                f"Port {port} is already in use. Stop the existing service before starting another instance."
            )
jar = ROOT / "backend/target/aevum-api-0.1.0.jar"
if not jar.exists():
    raise SystemExit("Run python3 scripts/bootstrap.py first.")
live = ROOT / "backend/.runtime/service.jar"
live.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(jar, live)
env = {
    **os.environ,
    "PATH": str(Path(node).parent) + os.pathsep + os.environ.get("PATH", ""),
}
processes = []
handles = []


def start(name, args, cwd):
    log = open(LOGS / (name + ".log"), "w")
    handles.append(log)
    p = subprocess.Popen(
        [str(a) for a in args], cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT
    )
    processes.append(p)


def stop(*args, exit_code=0):
    for p in processes:
        if p.poll() is None:
            p.terminate()
    for p in processes:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill()
    for h in handles:
        h.close()
    sys.exit(exit_code)


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
start(
    "analytics",
    [
        ROOT / ".venv/bin/python",
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8090",
        "--no-access-log",
    ],
    ROOT / "analytics",
)
start("api", ["java", "-jar", live], ROOT / "backend")
start(
    "web",
    [node, ROOT / "web/node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    ROOT / "web",
)
for attempt in range(60):
    if any(p.poll() is not None for p in processes):
        print("A service failed to start. Inspect .runtime/logs.")
        stop(exit_code=1)
    try:
        for url in [
            "http://127.0.0.1:8090/health",
            "http://127.0.0.1:8080/api/health",
            "http://127.0.0.1:5173",
        ]:
            urllib.request.urlopen(url, timeout=1).close()
        break
    except Exception:
        time.sleep(1)
else:
    print("Startup timed out. Inspect .runtime/logs.")
    stop(exit_code=1)
print(
    "\nAevum is ready: http://127.0.0.1:5173\nChoose “Explore a sample Twin” or create your own account.\nPress Ctrl+C to stop all services.\n",
    flush=True,
)
while True:
    if any(p.poll() is not None for p in processes):
        print("A service stopped unexpectedly. Inspect .runtime/logs.", flush=True)
        stop(exit_code=1)
    time.sleep(2)
