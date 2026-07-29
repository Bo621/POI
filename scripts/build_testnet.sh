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

export VITE_NOTE_RESOLVER="0x03822d12dddb59d28cf1197853c5ae85beb1d165"
export VITE_DECISION_RESOLVER="0x2b379095a8b296e2c61f8153e06fc4cdef56af57"
export VITE_SETTLEMENT_RESOLVER="0x87c7a8b3970986e51a8b24e78078540115a70c8c"
export VITE_CHALLENGE_RESOLVER="0xa7203c170dedb490e32c492cdbe9e968c57168aa"

export VITE_NOTE_SCHEMA_UID="0x12817297a9c8381a81d2b22ff35ca98ce0ee4e21618e3e39fb638e161a475d11"
export VITE_DECISION_SCHEMA_UID="0x2038d08d688d9e4532de17c9ee9634ebbd3b5b853c654726fff94e50604d0151"
export VITE_SETTLEMENT_SCHEMA_UID="0xb9d802583bb9fecf0846389b40d584510cada0f685d6a25774a1a54f0fb857c4"
export VITE_CHALLENGE_SCHEMA_UID="0x34405f11f0450d75d061fccb958fe5133a51c9a0851c7c4708dbe52925e0efff"

# getLogs 시작 블록. 공개 RPC 가 100,000 블록으로 제한하므로 0 부터 조회하면 실패한다.
export VITE_DEPLOY_BLOCK="31992748"

# 홈의 예시 증서. 비우면 로컬 시드(seed.json)로 폴백해 테스트넷에 없는 UID 를 보여준다.
export VITE_EXAMPLE_UIDS="0xc2b03f0192ded81e7d3e5d5a1d75bec0250ab5735bf1cee63aba6b601ff22c5e,0x4fd150e4f2b0891c89693e05b37691be5e9700e216f73247170c4bfb1fabb3f8,0xaced96705a1806810bc469938071f692f6c7c249ce6ecacfc27e34a11149c49b"

cd "${ROOT_DIR}/web"
npm run build

# 빌드 결과에 테스트넷 주소가 실제로 들어갔는지 확인한다.
# .env.local 이 이겼다면 여기서 걸린다 — 조용히 로컬 주소로 배포되는 것이 최악이다.
for needle in \
    "0x2b379095a8b296e2c61f8153e06fc4cdef56af57" \
    "0x2038d08d688d9e4532de17c9ee9634ebbd3b5b853c654726fff94e50604d0151" \
    "sepolia-rpc.giwa.io" \
    "31992748" \
    "0xc2b03f0192ded81e7d3e5d5a1d75bec0250ab5735bf1cee63aba6b601ff22c5e"; do
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
