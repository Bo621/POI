#!/usr/bin/env bash
# 다섯 스위트를 한 자리에서 연속 실행한다. TEST_RECORD.md 의 수치를 재현하는 유일한 방법.
# 서로 다른 시점에 돌린 숫자를 합치면 근거가 되지 않는다 — 실제로 그렇게 썼다가 지적받았다.
#
# **이 스크립트는 게이트다.** 한 스위트라도 실패하면 0 이 아닌 코드로 끝난다.
# 예전에는 `forge test | grep ...` 처럼 파이프를 써서 **grep 의 종료코드**만 남았고,
# 테스트가 깨져도 스크립트는 성공으로 끝났다. 실행과 출력 필터를 분리해 원 코드를 보존한다.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

LOG_DIR="$(mktemp -d)"
FAILED=()

# run <이름> <출력필터 정규식> <명령...>
run() {
    local name="$1" filter="$2"; shift 2
    local log="${LOG_DIR}/${name}.log"
    echo "## ${name}"
    if "$@" >"${log}" 2>&1; then
        grep -E "${filter}" "${log}" | tail -1
    else
        FAILED+=("${name}")
        echo "실패 — 마지막 20줄:"
        tail -20 "${log}" | sed 's/^/    /'
    fi
}

echo "# 테스트 전수 실행 — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "# 커밋 $(git rev-parse --short HEAD)$([ -n "$(git status --porcelain)" ] && echo ' (워킹트리 변경 있음)')"
echo

run contracts "tests passed"         bash -c 'cd contracts && forge test'
run core      "^# (tests|pass|fail)" bash -c 'cd core && npm test'
run verifier  "^# (tests|pass|fail)" bash -c 'cd verifier && npm test'
run web       "Tests "               bash -c 'cd web && npm test'
run e2e       "passed|failed"        bash -c 'cd web && npm run test:e2e'

echo
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "전부 통과"
    exit 0
fi
echo "실패한 스위트: ${FAILED[*]}"
echo "로그: ${LOG_DIR}"
exit 1
