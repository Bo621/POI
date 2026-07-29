#!/usr/bin/env bash
# 다섯 스위트를 한 자리에서 연속 실행한다. TEST_RECORD.md 의 수치를 재현하는 유일한 방법.
# 서로 다른 시점에 돌린 숫자를 합치면 근거가 되지 않는다 — 실제로 그렇게 썼다가 지적받았다.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "# 테스트 전수 실행 — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "# 커밋 $(git rev-parse --short HEAD)$([ -n "$(git status --porcelain)" ] && echo ' (워킹트리 변경 있음)')"
echo
echo "## contracts"; (cd contracts && forge test 2>&1 | grep -E "tests passed" | tail -1)
echo "## core";      (cd core     && npm test  2>&1 | grep -E "^# (tests|pass|fail)" | tr '\n' ' '; echo)
echo "## verifier";  (cd verifier && npm test  2>&1 | grep -E "^# (tests|pass|fail)" | tr '\n' ' '; echo)
echo "## web";       (cd web      && npm test  2>&1 | grep -E "Tests " | tail -1)
echo "## e2e";       (cd web      && npm run test:e2e 2>&1 | grep -E "passed|failed" | tail -1)
