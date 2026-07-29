#!/usr/bin/env bash
# O7 2~3단계 — 정산·철회·재발행·이의를 순서대로 발행한다.
#
# windowEnd 이후에만 성공한다(I7). observedAt은 반드시 windowEnd와 같아야 한다(I8).
#
# **UID는 스크립트 출력이 아니라 broadcast 영수증의 Attested 이벤트 data에서 읽는다.**
# EAS UID는 블록 시각을 포함해 시뮬레이션 값과 다르다. O4에서 실제로 틀린 값을 기록했다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/contracts"
set -a; source "${ROOT_DIR}/.env"; set +a

export O7_EAS=0x4200000000000000000000000000000000000021
export O7_SETTLEMENT_SCHEMA_UID=0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e
export O7_CHALLENGE_SCHEMA_UID=0x3557adc085b634167345fe0529a3aab5a5bb27ecddf9f9640acb17b43d90b141
export O7_VERIFIER_VERSION="poi-verifier/1.0.0"
export O7_SOURCE="upbit-1m-candles"

WINDOW_START=1785342794
export O7_OBSERVED_AT=1785343394
D_SETTLED=0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888
D_REVOKED=0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21

# broadcast 영수증에서 방금 발행된 attestation UID를 읽는다.
last_uid() {
    python3 - "$1" <<'PY'
import json,sys
d=json.load(open(f"broadcast/{sys.argv[1]}/91342/run-latest.json"))
u=[lg['data'] for r in d.get('receipts',[]) for lg in r.get('logs',[])
   if lg['address'].lower()=='0x4200000000000000000000000000000000000021' and len(lg['topics'])==4]
print(u[-1] if u else "")
PY
}

echo "== 관측 (업비트 1분봉, ${WINDOW_START}~${O7_OBSERVED_AT})"
VALUE="$(cd "${ROOT_DIR}" && node --experimental-strip-types scripts/observe.ts \
    BTC_PRICE_KRW_AT_END "${WINDOW_START}" "${O7_OBSERVED_AT}")"
echo "관측값: ${VALUE}"
export O7_OBSERVED_VALUE="${VALUE}"
# op=0(GT), threshold=1. BTC 원화 가격은 항상 1보다 크므로 조건 충족 → result 0.
# 컨트랙트가 _eval로 다시 계산해 대조하므로(I17) 여기서 틀리면 되돌아간다.
export O7_RESULT=0

echo "== 1. SETTLED 결정 정산"
O7_DECISION_UID="${D_SETTLED}" forge script script/O7Settle.s.sol:O7Settle \
    --rpc-url "${GIWA_SEPOLIA_RPC_URL}" --private-key "${DEPLOYER_PRIVATE_KEY}" --broadcast >/dev/null
S_SETTLED="$(last_uid O7Settle.s.sol)"
echo "settlement: ${S_SETTLED}"

echo "== 2. 철회용 결정 정산 (S1)"
O7_DECISION_UID="${D_REVOKED}" forge script script/O7Settle.s.sol:O7Settle \
    --rpc-url "${GIWA_SEPOLIA_RPC_URL}" --private-key "${DEPLOYER_PRIVATE_KEY}" --broadcast >/dev/null
S1="$(last_uid O7Settle.s.sol)"
echo "S1: ${S1}"

echo "== 3. S1 철회"
O7_REVOKE_UID="${S1}" forge script script/O7Settle.s.sol:O7Settle --sig "revokeOnly()" \
    --rpc-url "${GIWA_SEPOLIA_RPC_URL}" --private-key "${DEPLOYER_PRIVATE_KEY}" --broadcast >/dev/null
echo "철회 완료"

echo "== 4. 정정 재발행 (supersedes=S1)"
O7_DECISION_UID="${D_REVOKED}" O7_SUPERSEDES="${S1}" \
    forge script script/O7Settle.s.sol:O7Settle \
    --rpc-url "${GIWA_SEPOLIA_RPC_URL}" --private-key "${DEPLOYER_PRIVATE_KEY}" --broadcast >/dev/null
S2="$(last_uid O7Settle.s.sol)"
echo "S2: ${S2}"

echo "== 5. 제3자 이의 (지갑 B)"
# 이의자는 배포 지갑이 아니다 — 정산자와 이의자가 같으면 제3자 이의로 읽히지 않는다.
export O7_SETTLEMENT_UID="${S_SETTLED}"
export O7_CLAIMED_RESULT=0
export O7_CLAIMED_VALUE=$(( VALUE - 1000000 ))
export O7_CLAIM_SOURCE="upbit-1m-candles(재계산)"
forge script script/O7Challenge.s.sol:O7Challenge \
    --rpc-url "${GIWA_SEPOLIA_RPC_URL}" --private-key "${CHALLENGER_PRIVATE_KEY}" --broadcast >/dev/null
C1="$(last_uid O7Challenge.s.sol)"
echo "challenge: ${C1}"

cat <<SUMMARY

== O7 결과 ==
SETTLED 결정      ${D_SETTLED}
  정산            ${S_SETTLED}
  이의(지갑 B)    ${C1}
철회 이력 결정    ${D_REVOKED}
  S1 (철회됨)     ${S1}
  S2 (정정)       ${S2}
관측값            ${VALUE}
SUMMARY
