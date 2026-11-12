#!/usr/bin/env python3
"""스크린샷을 작은 JPEG 로 줄여 로그에 base64 로 출력(아티팩트 다운로드가 막힌 환경에서 확인용)."""
import base64, glob, io, subprocess, sys
try:
    from PIL import Image
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "--break-system-packages", "pillow"])
    try:
        import site, importlib; importlib.reload(site); from PIL import Image
    except ImportError:
        Image = None
for f in sorted(glob.glob("shots/*.png")):
    if Image:
        im = Image.open(f).convert("RGB"); im.thumbnail((1200, 1200))
        b = io.BytesIO(); im.save(b, "JPEG", quality=62); data = b.getvalue()
    else:
        data = open(f, "rb").read()
    print(f"===SHOT {f}===")
    print(base64.b64encode(data).decode())
    print("===END===")
