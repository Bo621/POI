#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${RPC:-}"
LOCAL_RPC="http://127.0.0.1:8545"
PID_FILE="${ROOT_DIR}/.anvil-seed.pid"
ANVIL_LOG="${TMPDIR:-/tmp}/poi-seed-anvil.log"
KEY_A="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
KEY_B="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
FORK_BLOCK=31820323
PHASE1_LOG=""
PHASE2_LOG=""
PHASE3_LOG=""

if [[ -z "${RPC_URL}" ]]; then
    echo "RPC 환경변수에 GIWA Sepolia fork URL을 지정해 주세요." >&2
    exit 1
fi

cleanup_on_error() {
    local status=$?
    if (( status != 0 )); then
        "${ROOT_DIR}/scripts/dev_down.sh"
        [[ -z "${PHASE1_LOG}" ]] || rm -f "${PHASE1_LOG}"
        [[ -z "${PHASE2_LOG}" ]] || rm -f "${PHASE2_LOG}"
        [[ -z "${PHASE3_LOG}" ]] || rm -f "${PHASE3_LOG}"
        echo "시드가 실패해 anvil을 종료했습니다. 로그: ${ANVIL_LOG}" >&2
    fi
    exit "${status}"
}
trap cleanup_on_error EXIT

value_after_label() {
    local label=$1
    local file=$2
    sed -n "/${label}/{n;s/^[[:space:]]*//;p;q;}" "${file}"
}

address_on_label() {
    local label=$1
    local file=$2
    sed -n "s/.*${label}[[:space:]]*\\(0x[0-9a-fA-F]\\{40\\}\\).*/\\1/p" "${file}" | head -n 1
}

require_value() {
    local name=$1
    local value=$2
    if [[ -z "${value}" ]]; then
        echo "forge 출력에서 ${name} 값을 찾지 못했습니다." >&2
        exit 1
    fi
}

set_time() {
    cast rpc evm_setNextBlockTimestamp "$1" --rpc-url "${LOCAL_RPC}" >/dev/null
    cast rpc evm_mine --rpc-url "${LOCAL_RPC}" >/dev/null
}

run_phase() {
    local phase=$1
    local output=$2
    shift 2
    (
        cd "${ROOT_DIR}/contracts"
        env SEED_PHASE="${phase}" SEED_KEY_A="${KEY_A}" SEED_KEY_B="${KEY_B}" "$@" \
            forge script script/SeedFixtures.s.sol:SeedFixtures \
            --sig "runSeed()" --rpc-url "${LOCAL_RPC}" --broadcast -vv
    ) | tee "${output}"
}

"${ROOT_DIR}/scripts/dev_down.sh"
# --block-time 1 이 없으면 forge script --broadcast 가 확인 블록을 기다리며 멈춘다.
# anvil 기본은 온디맨드 채굴이라 트랜잭션이 없으면 새 블록이 나오지 않는다.
anvil --fork-url "${RPC_URL}" --fork-block-number "${FORK_BLOCK}" \
    --port 8545 --chain-id 91342 --block-time 1 >"${ANVIL_LOG}" 2>&1 &
ANVIL_PID=$!
printf '%s\n' "${ANVIL_PID}" >"${PID_FILE}"

for _ in {1..60}; do
    if cast block-number --rpc-url "${LOCAL_RPC}" >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done
cast block-number --rpc-url "${LOCAL_RPC}" >/dev/null

REAL_NOW="$(date +%s)"
T0="$(( (REAL_NOW - 4800) / 60 * 60 ))"
WINDOW_END="$(( T0 + 660 ))"

PRICE_VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts BTC_PRICE_KRW_AT_END "$((T0 + 60))" "${WINDOW_END}")"
DRAWDOWN_VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts BTC_MAX_DRAWDOWN_IN_WINDOW "$((T0 + 60))" "${WINDOW_END}")"
PRICE_THRESHOLD="$(( PRICE_VALUE - 1000000 ))"
DRAWDOWN_THRESHOLD="$(( DRAWDOWN_VALUE + 50 ))"

PHASE1_LOG="$(mktemp "${TMPDIR:-/tmp}/poi-seed-phase1.XXXXXX")"
PHASE2_LOG="$(mktemp "${TMPDIR:-/tmp}/poi-seed-phase2.XXXXXX")"
PHASE3_LOG="$(mktemp "${TMPDIR:-/tmp}/poi-seed-phase3.XXXXXX")"

set_time "${T0}"
run_phase 1 "${PHASE1_LOG}" \
    SEED_T0="${T0}" SEED_PRICE_THRESHOLD="${PRICE_THRESHOLD}" \
    SEED_DRAWDOWN_THRESHOLD="${DRAWDOWN_THRESHOLD}"

NOTE_RESOLVER="$(address_on_label SEED_NOTE_RESOLVER= "${PHASE1_LOG}")"
DECISION_RESOLVER="$(address_on_label SEED_DECISION_RESOLVER= "${PHASE1_LOG}")"
SETTLEMENT_RESOLVER="$(address_on_label SEED_SETTLEMENT_RESOLVER= "${PHASE1_LOG}")"
CHALLENGE_RESOLVER="$(address_on_label SEED_CHALLENGE_RESOLVER= "${PHASE1_LOG}")"
NOTE_SCHEMA="$(value_after_label SEED_NOTE_SCHEMA_UID= "${PHASE1_LOG}")"
DECISION_SCHEMA="$(value_after_label SEED_DECISION_SCHEMA_UID= "${PHASE1_LOG}")"
SETTLEMENT_SCHEMA="$(value_after_label SEED_SETTLEMENT_SCHEMA_UID= "${PHASE1_LOG}")"
CHALLENGE_SCHEMA="$(value_after_label SEED_CHALLENGE_SCHEMA_UID= "${PHASE1_LOG}")"
F1_UID="$(value_after_label SEED_F1_UID= "${PHASE1_LOG}")"
F2_UID="$(value_after_label SEED_F2_UID= "${PHASE1_LOG}")"
F4_UID="$(value_after_label SEED_F4_UID= "${PHASE1_LOG}")"
F5_UID="$(value_after_label SEED_F5_UID= "${PHASE1_LOG}")"
F1_COMMITMENT="$(value_after_label SEED_F1_COMMITMENT= "${PHASE1_LOG}")"

for pair in \
    "NOTE_RESOLVER:${NOTE_RESOLVER}" "DECISION_RESOLVER:${DECISION_RESOLVER}" \
    "SETTLEMENT_RESOLVER:${SETTLEMENT_RESOLVER}" "CHALLENGE_RESOLVER:${CHALLENGE_RESOLVER}" \
    "NOTE_SCHEMA:${NOTE_SCHEMA}" "DECISION_SCHEMA:${DECISION_SCHEMA}" \
    "SETTLEMENT_SCHEMA:${SETTLEMENT_SCHEMA}" "CHALLENGE_SCHEMA:${CHALLENGE_SCHEMA}" \
    "F1_UID:${F1_UID}" "F2_UID:${F2_UID}" "F4_UID:${F4_UID}" "F5_UID:${F5_UID}" \
    "F1_COMMITMENT:${F1_COMMITMENT}"; do
    require_value "${pair%%:*}" "${pair#*:}"
done

set_time "$((T0 + 700))"
run_phase 2 "${PHASE2_LOG}" \
    SEED_SETTLEMENT_SCHEMA_UID="${SETTLEMENT_SCHEMA}" SEED_WINDOW_END="${WINDOW_END}" \
    SEED_PRICE_VALUE="${PRICE_VALUE}" SEED_DRAWDOWN_VALUE="${DRAWDOWN_VALUE}" \
    SEED_F1_UID="${F1_UID}" SEED_F2_UID="${F2_UID}"
F1_SETTLEMENT="$(value_after_label SEED_F1_SETTLEMENT_UID= "${PHASE2_LOG}")"
F2_S1="$(value_after_label SEED_F2_SETTLEMENT_S1_UID= "${PHASE2_LOG}")"
require_value F1_SETTLEMENT "${F1_SETTLEMENT}"
require_value F2_S1 "${F2_S1}"

set_time "$((T0 + 800))"
run_phase 3 "${PHASE3_LOG}" \
    SEED_DECISION_SCHEMA_UID="${DECISION_SCHEMA}" \
    SEED_SETTLEMENT_SCHEMA_UID="${SETTLEMENT_SCHEMA}" \
    SEED_CHALLENGE_SCHEMA_UID="${CHALLENGE_SCHEMA}" \
    SEED_WINDOW_END="${WINDOW_END}" SEED_PRICE_VALUE="${PRICE_VALUE}" \
    SEED_DRAWDOWN_VALUE="${DRAWDOWN_VALUE}" SEED_F1_UID="${F1_UID}" \
    SEED_F2_UID="${F2_UID}" SEED_F1_COMMITMENT="${F1_COMMITMENT}" \
    SEED_F1_SETTLEMENT_UID="${F1_SETTLEMENT}" SEED_F2_SETTLEMENT_S1_UID="${F2_S1}"
F2_S2="$(value_after_label SEED_F2_SETTLEMENT_S2_UID= "${PHASE3_LOG}")"
F1_CHALLENGE="$(value_after_label SEED_F1_CHALLENGE_UID= "${PHASE3_LOG}")"
F_COPY_UID="$(value_after_label SEED_F_COPY_UID= "${PHASE3_LOG}")"
require_value F2_S2 "${F2_S2}"
require_value F1_CHALLENGE "${F1_CHALLENGE}"
require_value F_COPY_UID "${F_COPY_UID}"

set_time "${REAL_NOW}"

mkdir -p "${ROOT_DIR}/docs/fixtures"
{
    printf '{\n'
    printf '  "generatedBy": "scripts/dev_up.sh",\n'
    printf '  "t0": "%s",\n' "${T0}"
    printf '  "observations": {"BTC_PRICE_KRW_AT_END": "%s", "BTC_MAX_DRAWDOWN_IN_WINDOW": "%s"},\n' "${PRICE_VALUE}" "${DRAWDOWN_VALUE}"
    printf '  "schemas": {"note": "%s", "decision": "%s", "settlement": "%s", "challenge": "%s"},\n' "${NOTE_SCHEMA}" "${DECISION_SCHEMA}" "${SETTLEMENT_SCHEMA}" "${CHALLENGE_SCHEMA}"
    printf '  "fixtures": {\n'
    printf '    "f1": {"decisionUID": "%s", "settlementUID": "%s", "expectedState": "SETTLED"},\n' "${F1_UID}" "${F1_SETTLEMENT}"
    printf '    "f2": {"decisionUID": "%s", "revokedSettlementUID": "%s", "activeSettlementUID": "%s", "expectedState": "SETTLED", "hasRevokedSettlement": true},\n' "${F2_UID}" "${F2_S1}" "${F2_S2}"
    printf '    "f4": {"decisionUID": "%s", "expectedState": "OVERDUE"},\n' "${F4_UID}"
    printf '    "f5": {"decisionUID": "%s", "expectedState": "PENDING"},\n' "${F5_UID}"
    printf '    "f_copy": {"decisionUID": "%s", "decisionCommitment": "%s", "copiedFromDecisionUID": "%s", "expectation": "A의 salt/payload로 대조하면 attester가 B이므로 실패한다"}\n' "${F_COPY_UID}" "${F1_COMMITMENT}" "${F1_UID}"
    printf '  },\n'
    printf '  "challengeUID": "%s",\n' "${F1_CHALLENGE}"
    printf '  "f1Reveal": {"salt": "0x00112233445566778899aabbccddeeff", "payload": {"fixture": "F1", "intent": "seed-success"}}\n'
    printf '}\n'
} >"${ROOT_DIR}/docs/fixtures/seed.json"

{
    printf 'VITE_RPC_URL=%s\n' "${LOCAL_RPC}"
    printf 'VITE_NOTE_SCHEMA_UID=%s\n' "${NOTE_SCHEMA}"
    printf 'VITE_DECISION_SCHEMA_UID=%s\n' "${DECISION_SCHEMA}"
    printf 'VITE_SETTLEMENT_SCHEMA_UID=%s\n' "${SETTLEMENT_SCHEMA}"
    printf 'VITE_CHALLENGE_SCHEMA_UID=%s\n' "${CHALLENGE_SCHEMA}"
    printf 'VITE_NOTE_RESOLVER=%s\n' "${NOTE_RESOLVER}"
    printf 'VITE_DECISION_RESOLVER=%s\n' "${DECISION_RESOLVER}"
    printf 'VITE_SETTLEMENT_RESOLVER=%s\n' "${SETTLEMENT_RESOLVER}"
    printf 'VITE_CHALLENGE_RESOLVER=%s\n' "${CHALLENGE_RESOLVER}"
} >"${ROOT_DIR}/web/.env.local"

rm -f "${PHASE1_LOG}" "${PHASE2_LOG}" "${PHASE3_LOG}"
trap - EXIT
printf '\n시드 완료 (T0=%s)\n' "${T0}"
printf 'F1 SETTLED  %s\nF2 SETTLED+철회  %s\nF4 OVERDUE  %s\nF5 PENDING  %s\n' \
    "${F1_UID}" "${F2_UID}" "${F4_UID}" "${F5_UID}"
printf 'CT18 copy  %s\n' "${F_COPY_UID}"
printf '검증: poi-verify %s --rpc %s --json\n' "${F1_UID}" "${LOCAL_RPC}"
