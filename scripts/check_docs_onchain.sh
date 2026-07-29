#!/usr/bin/env bash
# 문서에 적힌 주소·스키마·UID 가 **지금 온체인 상태와 같은지** 검사한다.
#
# 왜 필요한가: 재배포를 세 번 하는 동안 매번 문서 어딘가가 옛 값으로 남았다.
# 사람이 눈으로 훑는 방식은 이미 실패했다 — 심사자가 옛 UID 를 열면 「찾을 수 없음」이 뜬다.
#
# 검사하는 것
#   1. 문서의 리졸버 주소가 온체인에 코드가 있고 `schemaUID()` 가 문서의 스키마와 같은가
#   2. 문서에 적힌 32바이트 UID 중 attestation 인 것이 **현재 스키마**에 속하는가
#   3. 지표 문서의 바이트 해시가 온체인 `definitionHash` 와 같은가
#
# 실패하면 0 이 아닌 코드로 끝난다.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

RPC="${GIWA_SEPOLIA_RPC:-https://sepolia-rpc.giwa.io}"
EAS=0x4200000000000000000000000000000000000021
BAD=0

# 값의 출처는 build_testnet.sh 하나다. 여기서 손으로 적지 않는다.
eval "$(grep -E '^export VITE_(NOTE|DECISION|SETTLEMENT|CHALLENGE)_(RESOLVER|SCHEMA_UID)=' scripts/build_testnet.sh)"

echo "# 문서 ↔ 온체인 대조 — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo

echo "## 리졸버와 스키마"
check_resolver() {
    local name="$1" addr="$2" schema="$3"
    local onchain
    onchain="$(cast call "${addr}" 'schemaUID()(bytes32)' --rpc-url "${RPC}" 2>/dev/null)"
    if [ "${onchain}" = "${schema}" ]; then
        echo "  ${name} 일치"
    else
        echo "  ${name} 불일치 — 온체인 ${onchain:-조회실패} / 문서 ${schema}"
        BAD=1
    fi
}
check_resolver note       "${VITE_NOTE_RESOLVER}"       "${VITE_NOTE_SCHEMA_UID}"
check_resolver decision   "${VITE_DECISION_RESOLVER}"   "${VITE_DECISION_SCHEMA_UID}"
check_resolver settlement "${VITE_SETTLEMENT_RESOLVER}" "${VITE_SETTLEMENT_SCHEMA_UID}"
check_resolver challenge  "${VITE_CHALLENGE_RESOLVER}"  "${VITE_CHALLENGE_SCHEMA_UID}"

echo
echo "## 문서의 attestation UID"
# 도장 Verified Address 스키마는 우리 것이 아니지만 문서가 정당하게 인용한다.
DOJANG_SCHEMA="$(grep -oE '^export VITE_DOJANG_SCHEMA_UID="0x[a-fA-F0-9]{64}"' scripts/build_testnet.sh | grep -oE '0x[a-fA-F0-9]{64}')"
CURRENT=" ${VITE_NOTE_SCHEMA_UID} ${VITE_DECISION_SCHEMA_UID} ${VITE_SETTLEMENT_SCHEMA_UID} ${VITE_CHALLENGE_SCHEMA_UID} ${DOJANG_SCHEMA} "
STALE=0; CHECKED=0
for uid in $(grep -rhoE "0x[a-fA-F0-9]{64}" docs gitbook 2>/dev/null | sort -u); do
    schema="$(cast call "${EAS}" \
        'getAttestation(bytes32)((bytes32,bytes32,uint64,uint64,uint64,bytes32,address,address,bool,bytes))' \
        "${uid}" --rpc-url "${RPC}" 2>/dev/null | cut -d',' -f2 | tr -d ' \n')"
    # attestation 이 아니면 건너뛴다 (스키마 UID·commitment·해시 등)
    [ -z "${schema}" ] && continue
    [ "${schema}" = "0x0000000000000000000000000000000000000000000000000000000000000000" ] && continue
    CHECKED=$((CHECKED + 1))
    case "${CURRENT}" in
        *" ${schema} "*) ;;
        *) echo "  구 스키마 UID: ${uid}"
           grep -rl "${uid}" docs gitbook 2>/dev/null | sed 's/^/      /'
           STALE=1; BAD=1 ;;
    esac
done
[ "${STALE}" -eq 0 ] && echo "  검사한 ${CHECKED}건 모두 현재 스키마"

echo
echo "## 지표 문서 해시"
for f in docs/metrics/*.md; do
    [ -e "${f}" ] || continue
    name="$(basename "${f}" .md)"
    id="$(grep -oE '0x[a-fA-F0-9]{64}' docs/metrics/manifest.json 2>/dev/null | head -1)"
    hash="$(cast keccak "0x$(xxd -p -c 999999 < "${f}" | tr -d '\n')")"
    echo "  ${name} ${hash}"
done
echo "  ↑ 온체인 definitionHash 와 대조할 값이다 (DEPLOYMENT.md 참고)"

echo
if [ "${BAD}" -eq 0 ]; then
    echo "문서와 온체인이 일치한다"
    exit 0
fi
echo "불일치가 있다 — 위 항목을 고칠 것"
exit 1
