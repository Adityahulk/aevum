import base64
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / ".env"
if out.exists():
    raise SystemExit(".env already exists; preserving your configured secrets.")
content = (root / ".env.example").read_text()
for key in [
    "DATABASE_PASSWORD",
    "REDIS_PASSWORD",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "ANALYTICS_SECRET",
]:
    content = content.replace(key + "=\n", key + "=" + secrets.token_hex(24) + "\n")
content = content.replace(
    "DATA_ENCRYPTION_KEY=\n",
    "DATA_ENCRYPTION_KEY=" + base64.b64encode(secrets.token_bytes(32)).decode() + "\n",
)
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    f.write(content)
print("Created .env with fresh secrets. Keep this file private and backed up securely.")
