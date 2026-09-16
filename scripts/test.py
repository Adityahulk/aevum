#!/usr/bin/env python3
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / ".runtime/tools"
config = (
    (TOOLS / "tooling.txt").read_text().splitlines() if (TOOLS / "tooling.txt").exists() else []
)
node = os.getenv("AEVUM_NODE") or (config[0] if config else shutil.which("node"))
maven = os.getenv("AEVUM_MAVEN") or (config[1] if config else shutil.which("mvn"))
if not node or not maven:
    raise SystemExit("Run bootstrap.py or set AEVUM_NODE and AEVUM_MAVEN.")


def run(args, cwd):
    subprocess.run(
        [str(x) for x in args],
        cwd=cwd,
        check=True,
        env={**os.environ, "PLAYWRIGHT_BROWSERS_PATH": str(ROOT / ".runtime/browsers")},
    )


run([ROOT / ".venv/bin/python", "-m", "pytest", "tests", "-q"], ROOT / "analytics")
run([maven, "-q", "-Dmaven.repo.local=" + str(TOOLS / "m2"), "test"], ROOT / "backend")
run([node, "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], ROOT / "web")
run([node, "node_modules/vite/bin/vite.js", "build"], ROOT / "web")
if "--browser" in sys.argv:
    run([node, "node_modules/playwright/cli.js", "install", "chromium"], ROOT / "web")
    run([node, "node_modules/playwright/cli.js", "test"], ROOT / "web")
print("All requested test gates passed.")
