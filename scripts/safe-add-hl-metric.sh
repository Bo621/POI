#!/usr/bin/env bash
# HL_PERP_OPEN_LONG_QTY 지표를 2-of-2 Safe 로 등록한다.
#
#   1) 대표가 두 번째 소유자 지갑에서 approveHash 트랜잭션 1건을 보낸다
#   2) 이 스크립트가 배포 지갑 서명과 그 승인을 합쳐 execTransaction 을 실행한다
#
#   ./scripts/safe-add-hl-metric.sh check     지금 상태만 본다 (트랜잭션 없음)
#   ./scripts/safe-add-hl-metric.sh approve   ← 대표가 실행. approveHash 를 보낸다
#   ./scripts/safe-add-hl-metric.sh execute   승인이 확인되면 최종 실행
#
# 키는 .env 에서 읽고 출력하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

RPC="${GIWA_SEPOLIA_RPC_URL:-https://sepolia-rpc.giwa.io/}"
SAFE=0x215253B830D51df7f8364fF6dA32140006E4DCE1
REG=0x0f25917176a405bb9022e5b417e0d57348b30f89        # POIDecisionResolver 가 레지스트리를 겸한다
OWNER1=0x77E8DFC44Da9A9eaF71D341c9285ad6BA3C2dfaa     # 주소 오름차순으로 먼저
OWNER2=0xA1Cb5CbC9D7a0B7164a1bFE4B19bfe1Bf38BF310     # = 배포 지갑, .env 에 키가 있다
Z=0x0000000000000000000000000000000000000000

MID=0x6c02f2a190b1aaf8d2b9f33160683a9878bb3a46fb71b06bf389d9d2ac3edff5
DEF=0x13b91bb8b4d6a2705c580e9e3cfb317c85aa132875df1630eae82993ec92d026

DATA=$(cast calldata "addMetric(bytes32,(bool,uint8,uint8,bytes32,bool))" "$MID" "(true,8,0,$DEF,true)")
NONCE=$(cast call "$SAFE" "nonce()(uint256)" --rpc-url "$RPC")
TXHASH=$(cast call "$SAFE" \
  "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  "$REG" 0 "$DATA" 0 0 0 0 "$Z" "$Z" "$NONCE" --rpc-url "$RPC")

banner() {
  echo "지표     HL_PERP_OPEN_LONG_QTY"
  echo "  metricId       $MID"
  echo "  definitionHash $DEF"
  echo "대상     $REG   (POIMetricRegistry)"
  echo "Safe     $SAFE   nonce $NONCE"
  echo "safeTxHash  $TXHASH"
}

approved() { cast call "$SAFE" "approvedHashes(address,bytes32)(uint256)" "$1" "$TXHASH" --rpc-url "$RPC"; }

case "${1:-check}" in
check)
  banner
  echo
  echo "승인 상태"
  echo "  $OWNER1  $( [ "$(approved $OWNER1)" = "1" ] && echo '✅ 승인됨' || echo '⬜ 대기' )"
  echo "  $OWNER2  (배포 지갑 — 서명으로 대신한다)"
  echo
  echo "등록 여부"
  cast call "$REG" "metrics(bytes32)(bool,uint8,uint8,bytes32,bool)" "$MID" --rpc-url "$RPC"
  ;;

approve)
  # 대표가 두 번째 소유자 지갑으로 실행한다. 키를 이 저장소에 두지 않는다.
  : "${OWNER2_PRIVATE_KEY:?두 번째 소유자 키를 OWNER2_PRIVATE_KEY 로 넘겨 주세요}"
  banner
  echo
  echo "approveHash 를 보냅니다…"
  cast send "$SAFE" "approveHash(bytes32)" "$TXHASH" \
    --private-key "$OWNER2_PRIVATE_KEY" --rpc-url "$RPC"
  ;;

execute)
  if [ "$(approved $OWNER1)" != "1" ]; then
    echo "❌ $OWNER1 의 승인이 없습니다. 먼저 approve 를 실행하세요."; exit 1
  fi
  # Safe 는 서명을 소유자 주소 오름차순으로 이어 붙일 것을 요구한다.
  # OWNER1 은 approveHash 로 승인했으므로 사전 검증 형식 (r=주소, s=0, v=1) 을 쓴다.
  PRE="000000000000000000000000${OWNER1:2}0000000000000000000000000000000000000000000000000000000000000000""01"
  SIG2=$(cast wallet sign --no-hash "$TXHASH" --private-key "$DEPLOYER_PRIVATE_KEY")
  SIGS="0x${PRE}${SIG2:2}"

  banner
  echo
  echo "execTransaction 을 실행합니다…"
  cast send "$SAFE" \
    "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)" \
    "$REG" 0 "$DATA" 0 0 0 0 "$Z" "$Z" "$SIGS" \
    --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$RPC"

  echo
  echo "등록 확인 — 로그가 아니라 체인에서 읽는다"
  cast call "$REG" "metrics(bytes32)(bool,uint8,uint8,bytes32,bool)" "$MID" --rpc-url "$RPC"
  ;;

*) echo "사용법: $0 {check|approve|execute}"; exit 1 ;;
esac
