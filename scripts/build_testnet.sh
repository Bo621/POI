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

export VITE_NOTE_RESOLVER="0xa8bd89b229dcb07e90e84df18e0fae27fa965f0c"
export VITE_DECISION_RESOLVER="0xd4786313817f1bfd14fc6047fdce9db8382e879a"
export VITE_SETTLEMENT_RESOLVER="0x2b21d233b51bc08d0e54458470c4bfef364baee6"
export VITE_CHALLENGE_RESOLVER="0x74e6165fa656d4ad89cad1bcc0af32598193f3e0"

export VITE_NOTE_SCHEMA_UID="0x6fe68a0d4cc7b82ec548a7d0f438b496e6a7c93086a6481d9a836abb51539f6a"
export VITE_DECISION_SCHEMA_UID="0xd129ba8915e7d92f61c544d557ddd9ddf6a40ae0defed80faebdb6955e4b3b34"
export VITE_SETTLEMENT_SCHEMA_UID="0x017887d2b08c27d4bc084f6c9cdca331e80601e4d0622f93ee56f9791fa80379"
export VITE_CHALLENGE_SCHEMA_UID="0xe21648ef88b4be1e5eb7f86512d911970ea699a0dbb44a08fa9587ee30ab4cb6"

# getLogs 시작 블록. 공개 RPC 가 100,000 블록으로 제한하므로 0 부터 조회하면 실패한다.
export VITE_DEPLOY_BLOCK="31976920"

# 홈의 예시 증서. 비우면 로컬 시드(seed.json)로 폴백해 테스트넷에 없는 UID 를 보여준다.
export VITE_EXAMPLE_UIDS="0x919d43269abba2b82fd463761dda85cd78d44f633224a86bd3ec293e39ffc30f,0x3f845e794b96ba9df4383aaf5bd1b886730538e3aa9b5c8d5d91d8b4ec51ce0d,0x22f65981071834acd8ec6efae7ca9f4874cb845e635f2e9453d8c17634fc6f7d"

cd "${ROOT_DIR}/web"
npm run build

# 빌드 결과에 테스트넷 주소가 실제로 들어갔는지 확인한다.
# .env.local 이 이겼다면 여기서 걸린다 — 조용히 로컬 주소로 배포되는 것이 최악이다.
for needle in \
    "0xd4786313817f1bfd14fc6047fdce9db8382e879a" \
    "0xd129ba8915e7d92f61c544d557ddd9ddf6a40ae0defed80faebdb6955e4b3b34" \
    "sepolia-rpc.giwa.io" \
    "31976920" \
    "0x919d43269abba2b82fd463761dda85cd78d44f633224a86bd3ec293e39ffc30f"; do
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
