#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${RPC:-}"
LOCAL_RPC="http://127.0.0.1:8545"
PID_FILE="${ROOT_DIR}/.anvil-seed.pid"
ANVIL_LOG="${TMPDIR:-/tmp}/poi-seed-anvil.log"
KEY_A="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
KEY_B="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ACTOR_A="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
EAS="0x4200000000000000000000000000000000000021"
SCHEMA_REGISTRY="0x4200000000000000000000000000000000000020"
FORK_BLOCK=31820323
ATTESTED_TOPIC="$(cast keccak 'Attested(address,address,bytes32,bytes32)')"
TX_LOGS=()
ATTEST_UIDS=()

if [[ -z "${RPC_URL}" ]]; then
    echo "RPC 환경변수에 GIWA Sepolia fork URL을 지정해 주세요." >&2
    exit 1
fi

cleanup_on_error() {
    local status=$?
    local file
    for file in "${TX_LOGS[@]:-}"; do
        [[ -z "${file}" ]] || rm -f "${file}"
    done
    if (( status != 0 )); then
        if [[ "${KEEP_ANVIL_ON_FAILURE:-0}" == "1" ]]; then
            echo "시드가 실패했지만 KEEP_ANVIL_ON_FAILURE=1로 anvil을 유지합니다. 로그: ${ANVIL_LOG}" >&2
        else
            "${ROOT_DIR}/scripts/dev_down.sh"
            echo "시드가 실패해 anvil을 종료했습니다. 로그: ${ANVIL_LOG}" >&2
        fi
    fi
    exit "${status}"
}
trap cleanup_on_error EXIT

require_value() {
    local name=$1
    local value=$2
    if [[ -z "${value}" || "${value}" == "null" ]]; then
        echo "${name} 값을 찾지 못했습니다." >&2
        exit 1
    fi
}

set_time() {
    local target=$1
    local now_ts
    local delta
    now_ts="$(cast block latest --rpc-url "${LOCAL_RPC}" --json | jq -r '.timestamp')"
    delta="$(( target - now_ts ))"
    if (( delta <= 0 )); then
        echo "체인 시각을 되돌릴 수 없습니다 (현재=${now_ts}, 목표=${target})." >&2
        exit 1
    fi
    cast rpc evm_increaseTime "${delta}" --rpc-url "${LOCAL_RPC}" >/dev/null
    cast rpc evm_mine --rpc-url "${LOCAL_RPC}" >/dev/null
}

send_transaction() {
    local actor=$1
    local to=$2
    local calldata=$3
    local key
    if [[ "${actor}" == "A" ]]; then
        key="${KEY_A}"
    elif [[ "${actor}" == "B" ]]; then
        key="${KEY_B}"
    else
        echo "알 수 없는 seed actor: ${actor}" >&2
        return 1
    fi

    # cast send prints decoded revert information and exits non-zero on failure.
    cast send "${to}" "${calldata}" \
        --private-key "${key}" --rpc-url "${LOCAL_RPC}" --confirmations 1 --json
}

deploy_resolver() {
    local contract=$1
    local bytecode
    local constructor
    local receipt
    local address
    bytecode="$(cd "${ROOT_DIR}/contracts" && forge inspect "src/${contract}.sol:${contract}" bytecode)"
    constructor="$(cast abi-encode 'constructor(address)' "${EAS}")"
    receipt="$(cast send --create "${bytecode}${constructor#0x}" \
        --private-key "${KEY_A}" --rpc-url "${LOCAL_RPC}" --confirmations 1 --json)"
    address="$(jq -r '.contractAddress // .contract_address // empty' <<<"${receipt}")"
    require_value "${contract} 배포 주소" "${address}"
    printf '%s\n' "${address}"
}

register_schema() {
    local schema=$1
    local resolver=$2
    local revocable=$3
    local predicted
    local receipt
    local emitted
    predicted="$(cast call "${SCHEMA_REGISTRY}" \
        'register(string,address,bool)(bytes32)' "${schema}" "${resolver}" "${revocable}" \
        --from "${ACTOR_A}" --rpc-url "${LOCAL_RPC}")"
    receipt="$(cast send "${SCHEMA_REGISTRY}" \
        'register(string,address,bool)' "${schema}" "${resolver}" "${revocable}" \
        --private-key "${KEY_A}" --rpc-url "${LOCAL_RPC}" --confirmations 1 --json)"
    emitted="$(jq -r --arg address "${SCHEMA_REGISTRY,,}" '
        [.logs[]? | select((.address | ascii_downcase) == $address) | .topics[1]] | first // empty
    ' <<<"${receipt}")"
    if [[ "${emitted,,}" != "${predicted,,}" ]]; then
        echo "SchemaRegistry 반환 UID와 Registered 로그가 다릅니다: ${predicted} != ${emitted}" >&2
        return 1
    fi
    printf '%s\n' "${predicted}"
}

initialize_resolvers() {
    cast send "${NOTE_RESOLVER}" 'initialize(bytes32)' "${NOTE_SCHEMA}" \
        --private-key "${KEY_A}" --rpc-url "${LOCAL_RPC}" --confirmations 1 >/dev/null
    cast send "${DECISION_RESOLVER}" 'initialize(bytes32,bytes32)' "${DECISION_SCHEMA}" "${NOTE_SCHEMA}" \
        --private-key "${KEY_A}" --rpc-url "${LOCAL_RPC}" --confirmations 1 >/dev/null
    cast send "${SETTLEMENT_RESOLVER}" 'initialize(bytes32,bytes32)' "${SETTLEMENT_SCHEMA}" "${DECISION_SCHEMA}" \
        --private-key "${KEY_A}" --rpc-url "${LOCAL_RPC}" --confirmations 1 >/dev/null
    cast send "${CHALLENGE_RESOLVER}" 'initialize(bytes32,bytes32)' "${CHALLENGE_SCHEMA}" "${SETTLEMENT_SCHEMA}" \
        --private-key "${KEY_A}" --rpc-url "${LOCAL_RPC}" --confirmations 1 >/dev/null
}

calculate_phase() {
    local phase=$1
    local output=$2
    shift 2
    (
        cd "${ROOT_DIR}/contracts"
        env SEED_PHASE="${phase}" "$@" \
            forge script script/SeedFixtures.s.sol:SeedFixtures \
            --sig 'runSeed()' --rpc-url "${LOCAL_RPC}" -vv
    ) >"${output}"
}

execute_phase() {
    local input=$1
    local actor
    local to
    local calldata
    local receipt
    local uid
    ATTEST_UIDS=()
    while read -r actor to calldata; do
        receipt="$(send_transaction "${actor}" "${to}" "${calldata}")"
        uid="$(jq -r --arg topic "${ATTESTED_TOPIC,,}" '
            [.logs[]?
                | select((.topics[0] | ascii_downcase) == $topic)
                | .data]
            | first // empty
        ' <<<"${receipt}")"
        if [[ -n "${uid}" ]]; then
            ATTEST_UIDS+=("${uid}")
        fi
    done < <(sed -n 's/^[[:space:]]*TX //p' "${input}")
}

"${ROOT_DIR}/scripts/dev_down.sh"
anvil --fork-url "${RPC_URL}" --fork-block-number "${FORK_BLOCK}" \
    --port 8545 --chain-id 91342 >"${ANVIL_LOG}" 2>&1 &
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
T0="$(( (REAL_NOW - 10800) / 60 * 60 ))"
WINDOW_START="$(( T0 + 1800 ))"
WINDOW_END="$(( T0 + 2400 ))"

PRICE_VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts BTC_PRICE_KRW_AT_END "${WINDOW_START}" "${WINDOW_END}")"
DRAWDOWN_VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts BTC_MAX_DRAWDOWN_IN_WINDOW "${WINDOW_START}" "${WINDOW_END}")"
PRICE_THRESHOLD="$(( PRICE_VALUE - 1000000 ))"
DRAWDOWN_THRESHOLD="$(( DRAWDOWN_VALUE + 50 ))"

set_time "${T0}"

NOTE_RESOLVER="$(deploy_resolver POINoteResolver)"
DECISION_RESOLVER="$(deploy_resolver POIDecisionResolver)"
SETTLEMENT_RESOLVER="$(deploy_resolver POISettlementResolver)"
CHALLENGE_RESOLVER="$(deploy_resolver POIChallengeResolver)"

NOTE_SCHEMA="$(register_schema \
    'bytes32 contentCommitment' "${NOTE_RESOLVER}" false)"
DECISION_SCHEMA="$(register_schema \
    'bytes32[] parents,bytes32 promotedFromNote,bytes32 verifiedAddressUID,bytes32 decisionCommitment,bytes32 triggerCommitment,bytes32 evidenceCommitment,bytes32 reasonCommitment,bool hasExpectedOutcome,bytes32 outcomeMetricId,uint8 outcomeOp,int128 outcomeThreshold,uint64 windowStart,uint64 windowEnd,uint32 graceSeconds' \
    "${DECISION_RESOLVER}" false)"
SETTLEMENT_SCHEMA="$(register_schema \
    'bytes32 decisionUID,uint8 result,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,string verifierVersion,bytes32 supersedes' \
    "${SETTLEMENT_RESOLVER}" true)"
CHALLENGE_SCHEMA="$(register_schema \
    'bytes32 settlementUID,uint8 claimedResult,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,bytes32 noteCommitment' \
    "${CHALLENGE_RESOLVER}" true)"
initialize_resolvers

PHASE1_LOG="$(mktemp "${TMPDIR:-/tmp}/poi-seed-phase1.XXXXXX")"
PHASE2_LOG="$(mktemp "${TMPDIR:-/tmp}/poi-seed-phase2.XXXXXX")"
PHASE3_LOG="$(mktemp "${TMPDIR:-/tmp}/poi-seed-phase3.XXXXXX")"
TX_LOGS=("${PHASE1_LOG}" "${PHASE2_LOG}" "${PHASE3_LOG}")

calculate_phase 1 "${PHASE1_LOG}" \
    SEED_ACTOR_A="${ACTOR_A}" SEED_DECISION_RESOLVER="${DECISION_RESOLVER}" \
    SEED_DECISION_SCHEMA_UID="${DECISION_SCHEMA}" SEED_T0="${T0}" \
    SEED_PRICE_THRESHOLD="${PRICE_THRESHOLD}" SEED_DRAWDOWN_THRESHOLD="${DRAWDOWN_THRESHOLD}"
F1_COMMITMENT="$(sed -n '/SEED_F1_COMMITMENT/{n;s/^[[:space:]]*//;p;q;}' "${PHASE1_LOG}")"
require_value F1_COMMITMENT "${F1_COMMITMENT}"
execute_phase "${PHASE1_LOG}"
if (( ${#ATTEST_UIDS[@]} != 4 )); then
    echo "phase 1 Attested 로그가 4개여야 합니다: ${#ATTEST_UIDS[@]}" >&2
    exit 1
fi
F1_UID="${ATTEST_UIDS[0]}"
F2_UID="${ATTEST_UIDS[1]}"
F4_UID="${ATTEST_UIDS[2]}"
F5_UID="${ATTEST_UIDS[3]}"

set_time "$((T0 + 2500))"
calculate_phase 2 "${PHASE2_LOG}" \
    SEED_SETTLEMENT_SCHEMA_UID="${SETTLEMENT_SCHEMA}" SEED_WINDOW_END="${WINDOW_END}" \
    SEED_PRICE_VALUE="${PRICE_VALUE}" SEED_DRAWDOWN_VALUE="${DRAWDOWN_VALUE}" \
    SEED_F1_UID="${F1_UID}" SEED_F2_UID="${F2_UID}"
execute_phase "${PHASE2_LOG}"
if (( ${#ATTEST_UIDS[@]} != 2 )); then
    echo "phase 2 Attested 로그가 2개여야 합니다: ${#ATTEST_UIDS[@]}" >&2
    exit 1
fi
F1_SETTLEMENT="${ATTEST_UIDS[0]}"
F2_S1="${ATTEST_UIDS[1]}"

set_time "$((T0 + 2600))"
calculate_phase 3 "${PHASE3_LOG}" \
    SEED_DECISION_SCHEMA_UID="${DECISION_SCHEMA}" \
    SEED_SETTLEMENT_SCHEMA_UID="${SETTLEMENT_SCHEMA}" \
    SEED_CHALLENGE_SCHEMA_UID="${CHALLENGE_SCHEMA}" \
    SEED_WINDOW_END="${WINDOW_END}" SEED_PRICE_VALUE="${PRICE_VALUE}" \
    SEED_DRAWDOWN_VALUE="${DRAWDOWN_VALUE}" SEED_F2_UID="${F2_UID}" \
    SEED_F1_COMMITMENT="${F1_COMMITMENT}" SEED_F1_SETTLEMENT_UID="${F1_SETTLEMENT}" \
    SEED_F2_SETTLEMENT_S1_UID="${F2_S1}"
execute_phase "${PHASE3_LOG}"
if (( ${#ATTEST_UIDS[@]} != 3 )); then
    echo "phase 3 Attested 로그가 3개여야 합니다: ${#ATTEST_UIDS[@]}" >&2
    exit 1
fi
F2_S2="${ATTEST_UIDS[0]}"
F1_CHALLENGE="${ATTEST_UIDS[1]}"
F_COPY_UID="${ATTEST_UIDS[2]}"

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
TX_LOGS=()
trap - EXIT
printf '\n시드 완료 (T0=%s)\n' "${T0}"
printf 'F1 SETTLED  %s\nF2 SETTLED+철회  %s\nF4 OVERDUE  %s\nF5 PENDING  %s\n' \
    "${F1_UID}" "${F2_UID}" "${F4_UID}" "${F5_UID}"
printf 'CT18 copy  %s\n' "${F_COPY_UID}"
printf '검증: poi-verify %s --rpc %s --json\n' "${F1_UID}" "${LOCAL_RPC}"
