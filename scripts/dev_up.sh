#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_RPC="http://127.0.0.1:8545"
PID_FILE="${ROOT_DIR}/.anvil-seed.pid"
ANVIL_LOG="${TMPDIR:-/tmp}/poi-seed-anvil.log"
KEY_A="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
KEY_B="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ACTOR_A="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
ACTOR_B="0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
ACTOR_C="0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
ATTESTED_TOPIC="$(cast keccak 'Attested(address,address,bytes32,bytes32)')"
TX_LOGS=()
ATTEST_UIDS=()

if ! command -v jq >/dev/null 2>&1; then
    echo "jq가 필요합니다. jq를 설치한 뒤 다시 실행해 주세요." >&2
    exit 1
fi

cleanup_on_error() {
    local status=$?
    local file
    for file in ${TX_LOGS[@]+"${TX_LOGS[@]}"}; do
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

lower() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
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
    cast rpc --rpc-url "${LOCAL_RPC}" evm_increaseTime "${delta}" >/dev/null
    cast rpc --rpc-url "${LOCAL_RPC}" evm_mine >/dev/null
}

send_tx() {
    local key=$1
    shift
    cast send --private-key "${key}" --rpc-url "${LOCAL_RPC}" --async \
        --gas-limit 8000000 "$@"
}

wait_receipt() {
    local hash=$1
    local i=0
    local receipt
    local status
    while (( i < 60 )); do
        receipt="$(cast receipt "${hash}" --rpc-url "${LOCAL_RPC}" --json 2>/dev/null || true)"
        if [[ -n "${receipt}" && "${receipt}" != "null" ]]; then
            status="$(jq -r '.status' <<<"${receipt}")"
            if [[ "${status}" != "0x1" && "${status}" != "1" ]]; then
                echo "트랜잭션 실패: ${hash}" >&2
                cast run "${hash}" --rpc-url "${LOCAL_RPC}" >&2 || true
                return 1
            fi
            printf '%s' "${receipt}"
            return 0
        fi
        sleep 0.5
        i=$((i + 1))
    done
    echo "영수증을 받지 못했습니다: ${hash}" >&2
    return 1
}

send_and_wait() {
    local key=$1
    local hash
    shift
    hash="$(send_tx "${key}" "$@")"
    wait_receipt "${hash}"
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

    send_and_wait "${key}" "${to}" "${calldata}"
}

deploy_resolver() {
    local contract=$1
    local bytecode
    local constructor
    local receipt
    local address
    bytecode="$(cd "${ROOT_DIR}/contracts" && forge inspect "src/${contract}.sol:${contract}" bytecode)"
    constructor="$(cast abi-encode 'constructor(address)' "${EAS}")"
    receipt="$(send_and_wait "${KEY_A}" --create "${bytecode}${constructor#0x}")"
    address="$(jq -r '.contractAddress // .contract_address // empty' <<<"${receipt}")"
    require_value "${contract} 배포 주소" "${address}"
    printf '%s\n' "${address}"
}

deploy_contract() {
    local contract=$1
    local constructor=${2:-}
    local bytecode
    local receipt
    local address
    bytecode="$(
        cd "${ROOT_DIR}/contracts"
        forge inspect "lib/eas-contracts/contracts/${contract}.sol:${contract}" bytecode \
            --use 0.8.28 --contracts lib/eas-contracts/contracts \
            --remappings '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/'
    )"
    receipt="$(send_and_wait "${KEY_A}" --create "${bytecode}${constructor#0x}")"
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
    predicted="$(cast call --from "${ACTOR_A}" --rpc-url "${LOCAL_RPC}" \
        "${SCHEMA_REGISTRY}" 'register(string,address,bool)(bytes32)' \
        "${schema}" "${resolver}" "${revocable}")"
    receipt="$(send_and_wait "${KEY_A}" "${SCHEMA_REGISTRY}" \
        'register(string,address,bool)' "${schema}" "${resolver}" "${revocable}")"
    emitted="$(jq -r --arg address "$(lower "${SCHEMA_REGISTRY}")" '
        [.logs[]? | select((.address | ascii_downcase) == $address) | .topics[1]] | first // empty
    ' <<<"${receipt}")"
    if [[ "$(lower "${emitted}")" != "$(lower "${predicted}")" ]]; then
        echo "SchemaRegistry 반환 UID와 Registered 로그가 다릅니다: ${predicted} != ${emitted}" >&2
        return 1
    fi
    printf '%s\n' "${predicted}"
}

initialize_resolvers() {
    send_and_wait "${KEY_A}" \
        "${NOTE_RESOLVER}" 'initialize(bytes32)' "${NOTE_SCHEMA}" >/dev/null
    send_and_wait "${KEY_A}" \
        "${DECISION_RESOLVER}" 'initialize(bytes32,bytes32)' "${DECISION_SCHEMA}" "${NOTE_SCHEMA}" >/dev/null
    send_and_wait "${KEY_A}" \
        "${SETTLEMENT_RESOLVER}" 'initialize(bytes32,bytes32)' "${SETTLEMENT_SCHEMA}" "${DECISION_SCHEMA}" >/dev/null
    send_and_wait "${KEY_A}" \
        "${CHALLENGE_RESOLVER}" 'initialize(bytes32,bytes32)' "${CHALLENGE_SCHEMA}" "${SETTLEMENT_SCHEMA}" >/dev/null
}

calculate_phase() {
    local phase=$1
    local output=$2
    shift 2
    (
        cd "${ROOT_DIR}/contracts"
        env SEED_PHASE="${phase}" SEED_EAS_ADDRESS="${EAS}" "$@" \
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
        uid="$(jq -r --arg topic "$(lower "${ATTESTED_TOPIC}")" '
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
REAL_NOW="$(date +%s)"
T0_TARGET="$(( REAL_NOW - 10800 ))"
anvil --port 8545 --chain-id 91342 --timestamp "${T0_TARGET}" >"${ANVIL_LOG}" 2>&1 &
ANVIL_PID=$!
printf '%s\n' "${ANVIL_PID}" >"${PID_FILE}"

for _ in {1..60}; do
    if cast block-number --rpc-url "${LOCAL_RPC}" >/dev/null 2>&1; then
        break
    fi
    sleep 0.25
done
cast block-number --rpc-url "${LOCAL_RPC}" >/dev/null

T0="$(cast block latest --rpc-url "${LOCAL_RPC}" --json | jq -r '.timestamp')"
WINDOW_START="$(( T0 + 1800 ))"
WINDOW_END="$(( T0 + 2400 ))"
GRACE_SECONDS=3600
FINAL_TS="$(( WINDOW_END + GRACE_SECONDS + 300 ))"
F5_WINDOW_START="$(( FINAL_TS + 7200 ))"

PRICE_VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts BTC_PRICE_KRW_AT_END "${WINDOW_START}" "${WINDOW_END}")"
DRAWDOWN_VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts BTC_MAX_DRAWDOWN_IN_WINDOW "${WINDOW_START}" "${WINDOW_END}")"
PRICE_THRESHOLD="$(( PRICE_VALUE - 1000000 ))"
DRAWDOWN_THRESHOLD="$(( DRAWDOWN_VALUE + 50 ))"

SCHEMA_REGISTRY="$(deploy_contract SchemaRegistry)"
EAS_CONSTRUCTOR="$(cast abi-encode 'constructor(address)' "${SCHEMA_REGISTRY}")"
EAS="$(deploy_contract EAS "${EAS_CONSTRUCTOR}")"

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
    SEED_FINAL_TS="${FINAL_TS}" \
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

set_time "$((WINDOW_END + 100))"
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

set_time "$((WINDOW_END + 200))"
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

set_time "${FINAL_TS}"

ZERO_UID="0x0000000000000000000000000000000000000000000000000000000000000000"
VERIFY_FAILED=0
CHAIN_TS="$(cast block latest --rpc-url "${LOCAL_RPC}" --json | jq -r '.timestamp')"

verify_fixture() {
    local name=$1
    local uid=$2
    local expected_head=$3
    local expected_revoke_count=$4
    local actual_head
    local actual_revoke_count
    actual_head="$(cast call --rpc-url "${LOCAL_RPC}" "${SETTLEMENT_RESOLVER}" \
        'activeHead(bytes32)(bytes32)' "${uid}")"
    actual_revoke_count="$(cast call --rpc-url "${LOCAL_RPC}" "${SETTLEMENT_RESOLVER}" \
        'revokeCount(bytes32)(uint32)' "${uid}")"
    if [[ "$(lower "${actual_head}")" != "$(lower "${expected_head}")" ||
        "${actual_revoke_count}" != "${expected_revoke_count}" ]]; then
        echo "${name} 상태 불일치: activeHead=${actual_head}, revokeCount=${actual_revoke_count}" >&2
        VERIFY_FAILED=1
    fi
}

verify_fixture F1 "${F1_UID}" "${F1_SETTLEMENT}" 0
verify_fixture F2 "${F2_UID}" "${F2_S2}" 1
verify_fixture F4 "${F4_UID}" "${ZERO_UID}" 0
verify_fixture F5 "${F5_UID}" "${ZERO_UID}" 0

if (( CHAIN_TS < WINDOW_END + GRACE_SECONDS )); then
    echo "F4 상태 불일치: chainTime=${CHAIN_TS}, overdueAt=$(( WINDOW_END + GRACE_SECONDS ))" >&2
    VERIFY_FAILED=1
fi
if (( CHAIN_TS >= F5_WINDOW_START )); then
    echo "F5 상태 불일치: chainTime=${CHAIN_TS}, windowStart=${F5_WINDOW_START}" >&2
    VERIFY_FAILED=1
fi
if (( VERIFY_FAILED != 0 )); then
    exit 1
fi

{
    printf 'POI_EAS_ADDRESS=%s\n' "${EAS}"
    printf 'POI_SETTLEMENT_RESOLVER_ADDRESS=%s\n' "${SETTLEMENT_RESOLVER}"
    printf 'POI_METRIC_REGISTRY_ADDRESS=%s\n' "${DECISION_RESOLVER}"
} >"${ROOT_DIR}/.env.verifier"

verify_with_cli() {
    local name=$1
    local uid=$2
    local output
    local status=0
    local verdict
    local snapshot_hash
    output="$(cd "${ROOT_DIR}" && env \
        POI_EAS_ADDRESS="${EAS}" \
        POI_SETTLEMENT_RESOLVER_ADDRESS="${SETTLEMENT_RESOLVER}" \
        POI_METRIC_REGISTRY_ADDRESS="${DECISION_RESOLVER}" \
        node --experimental-strip-types verifier/src/cli.ts \
        "${uid}" --rpc "${LOCAL_RPC}" --json)" || status=$?
    if (( status != 0 )); then
        echo "verifier(${name}) 실패 (종료코드 ${status}):" >&2
        printf '%s\n' "${output}" >&2
        exit 1
    fi
    verdict="$(jq -r '.verdict // empty' <<<"${output}")"
    snapshot_hash="$(jq -r '.independent.snapshotHash // empty' <<<"${output}")"
    if [[ "${verdict}" != "MATCH" || -z "${snapshot_hash}" ]]; then
        echo "verifier(${name}) 결과 불일치: verdict=${verdict}, snapshotHash=${snapshot_hash}" >&2
        exit 1
    fi
    printf '%s %s\n' "${verdict}" "${snapshot_hash}"
}

read -r F1_VERDICT F1_SNAPSHOT_HASH < <(verify_with_cli F1 "${F1_UID}")
read -r F2_VERDICT F2_SNAPSHOT_HASH < <(verify_with_cli F2 "${F2_UID}")

mkdir -p "${ROOT_DIR}/docs/fixtures"
{
    printf '{\n'
    printf '  "generatedBy": "scripts/dev_up.sh",\n'
    printf '  "accounts": {"A": "%s", "B": "%s", "C": "%s"},\n' "${ACTOR_A}" "${ACTOR_B}" "${ACTOR_C}"
    printf '  "eas": {"version": "lib v1.4.0", "address": "%s", "schemaRegistryAddress": "%s"},\n' "${EAS}" "${SCHEMA_REGISTRY}"
    printf '  "addresses": {"schemaRegistry": "%s", "eas": "%s", "note": "%s", "decision": "%s", "settlement": "%s", "challenge": "%s"},\n' \
        "${SCHEMA_REGISTRY}" "${EAS}" "${NOTE_RESOLVER}" "${DECISION_RESOLVER}" "${SETTLEMENT_RESOLVER}" "${CHALLENGE_RESOLVER}"
    printf '  "t0": "%s",\n' "${T0}"
    printf '  "window": {"start": "%s", "end": "%s", "graceSeconds": %s},\n' "${WINDOW_START}" "${WINDOW_END}" "${GRACE_SECONDS}"
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
    printf 'VITE_EAS_ADDRESS=%s\n' "${EAS}"
    printf 'VITE_SCHEMA_REGISTRY_ADDRESS=%s\n' "${SCHEMA_REGISTRY}"
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
printf 'verifier: %s  F1 snapshotHash=%s\n' "${F1_VERDICT}" "${F1_SNAPSHOT_HASH}"
printf 'verifier: %s  F2 snapshotHash=%s\n' "${F2_VERDICT}" "${F2_SNAPSHOT_HASH}"
printf '검증 F1: set -a; source .env.verifier; set +a; node --experimental-strip-types verifier/src/cli.ts %s --rpc %s --json\n' "${F1_UID}" "${LOCAL_RPC}"
printf '공개 검증 F1: set -a; source .env.verifier; set +a; node --experimental-strip-types verifier/src/reveal-cli.ts %s --salt 0x00112233445566778899aabbccddeeff --payload <(printf '"'"'%%s'"'"' '"'"'{"fixture":"F1","intent":"seed-success"}'"'"') --rpc %s\n' "${F1_UID}" "${LOCAL_RPC}"
printf '검증 F2: set -a; source .env.verifier; set +a; node --experimental-strip-types verifier/src/cli.ts %s --rpc %s --json\n' "${F2_UID}" "${LOCAL_RPC}"
