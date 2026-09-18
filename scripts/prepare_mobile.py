#!/usr/bin/env python3
"""Prepare the pinned upstream native shell with Aevum's authenticated UI."""
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / '.runtime' / 'mobile-sdk'
REVISION = '7439acd71fa76439b7c473b2f99befd291aeb589'
if not DEST.exists():
    subprocess.run(['git', 'clone', 'https://github.com/the-momentum/open_wearables_health_sdk.git', str(DEST)], check=True)
subprocess.run(['git', 'checkout', '--detach', REVISION], cwd=DEST, check=True)
shutil.copy2(ROOT / 'mobile' / 'main.dart', DEST / 'example' / 'lib' / 'main.dart')
print(f'Prepared {DEST / "example"}. Run flutter pub get, flutter analyze lib/main.dart, then flutter run --dart-define=AEVUM_URL=https://YOUR_APP_DOMAIN.')
