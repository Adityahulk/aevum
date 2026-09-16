#!/usr/bin/env python3
"""Install project-local tooling and dependencies. No existing project sources are inspected."""

import hashlib
import os
import platform
import shutil
import subprocess
import tarfile
import urllib.request
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / ".runtime/tools"
TOOLS.mkdir(parents=True, exist_ok=True)


def run(args, **kw):
    subprocess.run([str(a) for a in args], check=True, **kw)


def download(url, destination):
    print("Downloading", url, flush=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        destination.write_bytes(response.read())


def extract(archive, directory):
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            target = (directory / member.name).resolve()
            if not target.is_relative_to(directory.resolve()):
                raise ValueError("Unsafe archive entry")
            if member.issym() or member.islnk():
                link = (target.parent / member.linkname).resolve()
                if not link.is_relative_to(directory.resolve()):
                    raise ValueError("Unsafe archive link")
        tar.extractall(directory)


def node_runtime():
    candidate = os.getenv("AEVUM_NODE") or shutil.which("node")
    if candidate:
        version = subprocess.check_output([candidate, "--version"], text=True).strip()
        if int(version.lstrip("v").split(".")[0]) >= 22:
            return Path(candidate).resolve()
    existing = TOOLS / "node/bin/node"
    if existing.exists():
        return existing
    system = {"Darwin": "darwin", "Linux": "linux"}.get(platform.system())
    arch = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64", "AMD64": "x64"}.get(
        platform.machine()
    )
    if not system or not arch:
        raise SystemExit("Install Node 22+ and rerun bootstrap on this platform.")
    base = "https://nodejs.org/dist/latest-v24.x/"
    manifest = urllib.request.urlopen(base + "SHASUMS256.txt", timeout=30).read().decode()
    checksum, filename = next(
        line.split() for line in manifest.splitlines() if line.endswith(f"-{system}-{arch}.tar.gz")
    )
    archive = TOOLS / filename
    download(base + filename, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
        raise SystemExit("Node checksum mismatch")
    extract(archive, TOOLS)
    (TOOLS / filename[:-7]).rename(TOOLS / "node")
    archive.unlink()
    return existing


if __name__ == "__main__":
    if not shutil.which("java"):
        raise SystemExit("Java 21+ is required. Install a JDK, then rerun bootstrap.")
    node = node_runtime()
    env = {
        **os.environ,
        "PATH": str(node.parent) + os.pathsep + os.environ.get("PATH", ""),
    }
    npm = node.parent / "npm"
    if not npm.exists():
        npm = Path(shutil.which("npm") or "npm")
    maven = (
        Path(os.getenv("AEVUM_MAVEN", ""))
        if os.getenv("AEVUM_MAVEN")
        else TOOLS / "apache-maven-3.9.9/bin/mvn"
    )
    if not maven.exists():
        base = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.tar.gz"
        archive = TOOLS / "maven.tar.gz"
        download(base, archive)
        expected = urllib.request.urlopen(base + ".sha512", timeout=30).read().decode().split()[0]
        if hashlib.sha512(archive.read_bytes()).hexdigest() != expected:
            raise SystemExit("Maven checksum mismatch")
        extract(archive, TOOLS)
        archive.unlink()
    virtual = ROOT / ".venv"
    if not virtual.exists():
        venv.EnvBuilder(with_pip=True).create(virtual)
    py = virtual / "bin/python"
    # uv-created environments may not include pip; use uv when available.
    if shutil.which("uv"):
        run(
            [
                "uv",
                "pip",
                "install",
                "--python",
                py,
                "-r",
                ROOT / "analytics/requirements.txt",
            ]
        )
    else:
        run([py, "-m", "pip", "install", "-r", ROOT / "analytics/requirements.txt"])
    run([npm, "ci", "--no-audit", "--no-fund"], cwd=ROOT / "web", env=env)
    run(
        [
            node,
            ROOT / "web/node_modules/typescript/bin/tsc",
            "-p",
            ROOT / "web/tsconfig.json",
        ]
    )
    run(
        [node, ROOT / "web/node_modules/vite/bin/vite.js", "build"],
        cwd=ROOT / "web",
        env=env,
    )
    run(
        [
            maven,
            "-q",
            "-Dmaven.repo.local=" + str(TOOLS / "m2"),
            "-DskipTests",
            "package",
        ],
        cwd=ROOT / "backend",
    )
    (TOOLS / "tooling.txt").write_text(str(node) + "\n" + str(maven) + "\n")
    print("Ready. Run: python3 scripts/dev.py")
