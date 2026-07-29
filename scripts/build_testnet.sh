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
# 도장 Verified Address 스키마 (bool isVerified). 이게 없으면 프론트가 스냅샷 UID 를
# 찾지 못하고 verifiedAddressUID 가 0 으로 기록된다.
export VITE_DOJANG_SCHEMA_UID="0x072d75e18b2be4f89a13a7147240477481c4b526d5795802acba59046b426e08"

export VITE_NOTE_RESOLVER="0x7eefdd7d89d434061cbdb22244d52e78c94e6008"
export VITE_DECISION_RESOLVER="0x0f25917176a405bb9022e5b417e0d57348b30f89"
export VITE_SETTLEMENT_RESOLVER="0x167cf06df663c5ddde9f20a748e724b4fb6c14fa"
export VITE_CHALLENGE_RESOLVER="0xef4422c035bcce0599e4c951a24059abf707595f"

export VITE_NOTE_SCHEMA_UID="0x817dd70fe2cc9f2de98259ec25b181504b94be0448c54c5a329266fc4619efac"
export VITE_DECISION_SCHEMA_UID="0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749"
export VITE_SETTLEMENT_SCHEMA_UID="0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e"
export VITE_CHALLENGE_SCHEMA_UID="0x3557adc085b634167345fe0529a3aab5a5bb27ecddf9f9640acb17b43d90b141"

# getLogs 시작 블록. 공개 RPC 가 100,000 블록으로 제한하므로 0 부터 조회하면 실패한다.
export VITE_DEPLOY_BLOCK="31997246"

# 홈의 예시 증서. 비우면 로컬 시드(seed.json)로 폴백해 테스트넷에 없는 UID 를 보여준다.
export VITE_EXAMPLE_UIDS="0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938,0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888,0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21"

cd "${ROOT_DIR}/web"
npm run build

# 빌드 결과에 테스트넷 주소가 실제로 들어갔는지 확인한다.
# .env.local 이 이겼다면 여기서 걸린다 — 조용히 로컬 주소로 배포되는 것이 최악이다.
for needle in \
    "0x0f25917176a405bb9022e5b417e0d57348b30f89" \
    "0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749" \
    "sepolia-rpc.giwa.io" \
    "31997246" \
    "0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938"; do
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
