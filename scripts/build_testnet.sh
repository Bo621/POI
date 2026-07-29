#!/usr/bin/env bash
# GIWA Sepolia에 연결된 프론트를 빌드한다.
#
# web/.env.local 은 dev_up.sh 가 로컬 anvil 주소로 덮어쓰는 파일이고
# Vite 에서 .env.* 보다 우선한다. 그래서 파일을 만들지 않고 **셸 환경변수로 넣는다** —
# 셸의 VITE_* 는 .env.local 보다 우선한다.
#
# 값의 출처는 docs/DEPLOYMENT.md 하나뿐이다. 여기서 손으로 고치지 말 것.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export VITE_RPC_URL="https://sepolia-rpc.giwa.io/"
export VITE_EXPLORER_URL="https://sepolia-explorer.giwa.io"
export VITE_EAS_ADDRESS="0x4200000000000000000000000000000000000021"
export VITE_SCHEMA_REGISTRY_ADDRESS="0x4200000000000000000000000000000000000020"
export VITE_DOJANG_ADDRESS="0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9"

export VITE_NOTE_RESOLVER="0x83d5c7ad0a024effe6a5d92640f93a19c5be77d0"
export VITE_DECISION_RESOLVER="0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66"
export VITE_SETTLEMENT_RESOLVER="0xbc386addcd3cabbbb62dfcb521939fe4610029d1"
export VITE_CHALLENGE_RESOLVER="0x56809bb2aeea0f043fa40ea0ae09411c8af0e127"

export VITE_NOTE_SCHEMA_UID="0xbeb96f68b7232b3205fa8bfb65f3d7e260b013088b4db415578d3eafa8db836c"
export VITE_DECISION_SCHEMA_UID="0x393daa0863ba418bd31c2026eae9a96305a57d513fa6a74b9a2120b4ce2469ea"
export VITE_SETTLEMENT_SCHEMA_UID="0x84f169dc66866931bb510e14f04c7d7f62df530dbde50e40a7d7f2eb3ee97c54"
export VITE_CHALLENGE_SCHEMA_UID="0x68c45508ba2a133013581cfa70cdc736847f554224a1876ffd0feb5930ef6d43"

# getLogs 시작 블록. 공개 RPC 가 100,000 블록으로 제한하므로 0 부터 조회하면 실패한다.
export VITE_DEPLOY_BLOCK="31906262"

# 홈의 예시 증서. 비우면 로컬 시드(seed.json)로 폴백해 테스트넷에 없는 UID 를 보여준다.
export VITE_EXAMPLE_UIDS="0x06ccb34d85d43a9bcde4c343c10b233e9d4a9a7aab2a2571f476205429545ebe,0x061ac961bb031dfb9436478f92c898e64bb600871d0f461c394a00b0aa591a69,0x8516ac866e93a933ea89bc6302dbad7709ea259e72af79549e9337993256ba21"

cd "${ROOT_DIR}/web"
npm run build

# 빌드 결과에 테스트넷 주소가 실제로 들어갔는지 확인한다.
# .env.local 이 이겼다면 여기서 걸린다 — 조용히 로컬 주소로 배포되는 것이 최악이다.
for needle in \
    "0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66" \
    "0x393daa0863ba418bd31c2026eae9a96305a57d513fa6a74b9a2120b4ce2469ea" \
    "sepolia-rpc.giwa.io" \
    "31906262" \
    "0x06ccb34d85d43a9bcde4c343c10b233e9d4a9a7aab2a2571f476205429545ebe"; do
    if ! grep -rqi "${needle}" dist/assets/*.js; then
        echo "빌드 결과에 ${needle} 가 없습니다 — .env.local 이 우선했을 수 있습니다." >&2
        exit 1
    fi
done

if grep -rq "127.0.0.1:8545" dist/assets/*.js; then
    echo "빌드 결과에 로컬 RPC가 남아 있습니다." >&2
    exit 1
fi

echo "테스트넷 빌드 완료 — web/dist"
echo "미리보기: cd web && npx vite preview"
