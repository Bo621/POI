#!/usr/bin/env bash
# 빌드된 정적 파일만 Railway에 올린다.
#
# 저장소 전체를 올려 Railway에서 빌드하려 했더니 Nixpacks가 설치하는 corepack 0.24.1이
# pnpm 11.9.0을 실행하지 못했다(ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING).
# Node 18·22·24 어느 쪽으로 올려도 같았다 — corepack 쪽 문제라 Node 고정으로는 안 풀린다.
#
# 정적 SPA에 모노레포 전체를 원격에서 빌드시킬 이유가 없다.
# **로컬에서 빌드하고 dist만 올린다.** 주소 검증 가드(build_testnet.sh)도 그대로 탄다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${ROOT_DIR}/.railway-deploy"

echo "== 1. 테스트넷 빌드 (주소 가드 포함)"
bash "${ROOT_DIR}/scripts/build_testnet.sh"

echo "== 2. 스테이징"
rm -rf "${STAGE}"
mkdir -p "${STAGE}"
cp -R "${ROOT_DIR}/web/dist" "${STAGE}/dist"
# dev_up.sh 가 로컬 시드를 dist 에 남긴다. 테스트넷 배포에 딸려가면 홈이 그쪽으로 폴백할 수 있다.
rm -f "${STAGE}/dist/seed.json"

# 서비스에 최초 railway.json 의 빌드 명령(pnpm -C web build)이 저장돼 있고
# NIXPACKS_* 환경변수로는 덮이지 않는다. 업로드에 설정 파일을 직접 넣어야 이긴다.
cat > "${STAGE}/railway.json" <<'RJSON'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "echo static-only" },
  "deploy": {
    "startCommand": "npx --yes serve dist --listen $PORT --single",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
RJSON

# pnpm 잠금파일을 두지 않는다 — Nixpacks가 npm 경로를 타야 corepack을 건드리지 않는다.
cat > "${STAGE}/package.json" <<'JSON'
{
  "name": "poi-web-static",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "serve dist --listen ${PORT:-3000} --single"
  },
  "dependencies": {
    "serve": "^14.2.4"
  }
}
JSON

# 올라가는 것이 정말 테스트넷 빌드인지 마지막으로 확인한다.
if ! grep -rqi "0x0f25917176a405bb9022e5b417e0d57348b30f89" "${STAGE}/dist/assets/"*.js; then
    echo "스테이징에 테스트넷 리졸버 주소가 없습니다." >&2
    exit 1
fi
if grep -rq "127.0.0.1:8545" "${STAGE}/dist/assets/"*.js; then
    echo "스테이징에 로컬 RPC가 남아 있습니다." >&2
    exit 1
fi

echo "== 3. 업로드"
cd "${STAGE}"
# 서비스 이름이 틀리면 railway 는 업로드까지 성공하고 조용히 아무것도 배포하지 않는다.
# 실제로 poi-web 으로 올려 한 시간을 날렸다 — 실서비스는 poi-static 하나뿐이다.
railway up --service poi-static --detach

echo
echo "배포 시작됨. 확인:"
echo "  railway status"
echo "  curl -sI https://poi-static-production.up.railway.app/ | head -1"
