#!/usr/bin/env bash
# Pleos SDK AAR 의 public API 를 출력합니다. NaviHelper/Vehicle 호출부(TODO(verify-sdk))를 채울 때 사용하세요.
# 사용: ./scripts/dump-pleos-api.sh NaviHelper 3.0.5   (먼저 usePleosSdk=true 로 한 번 Gradle Sync 해서 AAR 을 받아 두세요)
set -euo pipefail
MOD="${1:-NaviHelper}"; VER="${2:-3.0.5}"
AAR=$(find "${GRADLE_USER_HOME:-$HOME/.gradle}/caches" -name "${MOD}-${VER}.aar" | head -1)
[ -z "$AAR" ] && { echo "AAR 을 찾지 못했어요: ${MOD}-${VER}.aar (Gradle Sync 먼저)"; exit 1; }
TMP=$(mktemp -d); unzip -q -o "$AAR" classes.jar -d "$TMP"
OUT="pleos-${MOD}-${VER}-api.txt"
for c in $(unzip -Z1 "$TMP/classes.jar" | grep '\.class$' | grep -v '\$' | sed 's/\.class$//; s#/#.#g'); do
  javap -cp "$TMP/classes.jar" -public "$c"
done > "$OUT"
echo "저장: $OUT ($(grep -c 'public' "$OUT") lines)"
