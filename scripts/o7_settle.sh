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
export O7_SETTLEMENT_SCHEMA_UID=0x017887d2b08c27d4bc084f6c9cdca331e80601e4d0622f93ee56f9791fa80379
export O7_CHALLENGE_SCHEMA_UID=0xe21648ef88b4be1e5eb7f86512d911970ea699a0dbb44a08fa9587ee30ab4cb6
export O7_VERIFIER_VERSION="poi-verifier/1.0.0"
export O7_SOURCE="upbit-1m-candles"

WINDOW_START=1785322482
export O7_OBSERVED_AT=1785323082
D_SETTLED=0x3f845e794b96ba9df4383aaf5bd1b886730538e3aa9b5c8d5d91d8b4ec51ce0d
D_REVOKED=0x22f65981071834acd8ec6efae7ca9f4874cb845e635f2e9453d8c17634fc6f7d

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
