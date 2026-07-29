# Railway 배포 — 지원서 문항 8

프론트는 **백엔드가 없는 정적 SPA**다. `web/dist`를 서빙하기만 하면 된다.

해시 라우팅(`#/d/<uid>`)이라 서버는 항상 `/` 하나만 내려주면 되고,
**SPA fallback 설정이 사실상 필요 없다** — 그래도 `--single`을 켜 두면 안전하다.

## 1. Railway 프로젝트 연결

Railway 대시보드에서 이 GitHub 저장소를 연결한다. `railway.json`이 루트에 있으므로
빌드·실행 명령은 자동으로 잡힌다.

```json
build   pnpm install --frozen-lockfile && pnpm -C web build
start   pnpm dlx serve web/dist --listen $PORT --single
```

## 2. 환경변수 — **이 단계를 빠뜨리면 로컬 주소로 배포된다**

Railway 서비스의 Variables에 아래를 넣는다.
Vite는 빌드 시점에 셸의 `VITE_*`를 읽으므로 이것만으로 충분하다.

```
VITE_RPC_URL=https://sepolia-rpc.giwa.io/
VITE_EXPLORER_URL=https://sepolia-explorer.giwa.io
VITE_EAS_ADDRESS=0x4200000000000000000000000000000000000021
VITE_SCHEMA_REGISTRY_ADDRESS=0x4200000000000000000000000000000000000020
VITE_DOJANG_ADDRESS=0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9
VITE_NOTE_RESOLVER=0x7eefdd7d89d434061cbdb22244d52e78c94e6008
VITE_DECISION_RESOLVER=0x0f25917176a405bb9022e5b417e0d57348b30f89
VITE_SETTLEMENT_RESOLVER=0x167cf06df663c5ddde9f20a748e724b4fb6c14fa
VITE_CHALLENGE_RESOLVER=0xef4422c035bcce0599e4c951a24059abf707595f
VITE_NOTE_SCHEMA_UID=0x817dd70fe2cc9f2de98259ec25b181504b94be0448c54c5a329266fc4619efac
VITE_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749
VITE_SETTLEMENT_SCHEMA_UID=0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e
VITE_CHALLENGE_SCHEMA_UID=0x3557adc085b634167345fe0529a3aab5a5bb27ecddf9f9640acb17b43d90b141
```

> 값의 출처는 [`../DEPLOYMENT.md`](../DEPLOYMENT.md) 하나뿐이다. 여기서 손으로 고치지 말 것.

`.env`(개인키)는 **절대 Railway에 넣지 않는다.** 프론트는 서명하지 않는다 —
사용자 지갑이 한다. 배포 개인키가 프론트 빌드에 필요한 경우는 없다.

## 3. 배포 후 반드시 확인할 것

`.env.local`이 우선해서 **로컬 anvil 주소로 조용히 배포되는 것이 최악이다.**
`scripts/build_testnet.sh`에는 그 검사가 들어 있지만 Railway 빌드는 그 스크립트를 타지 않는다.
그래서 눈으로 확인한다.

```
1. nav 오른쪽에 chainId 91342 가 보이는가
2. 아래 주소를 열어 「기한초과」 인장이 나오는가
   <배포URL>/#/d/0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938
3. 「등록완료」 + 이의가 나오는가
   <배포URL>/#/d/0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888
4. 브라우저 개발자도구 Network에 127.0.0.1 요청이 하나도 없는가
```

4번이 이 확인의 핵심이다. 화면이 정상으로 보여도 로컬을 보고 있으면 심사자 화면에서는
아무것도 안 나온다.

## 4. 제출용 링크

```
문항 8 프로젝트 링크   <배포URL>
                       또는 <배포URL>/#/d/0x5941a398…1a69  (바로 결정 상세로)
```

**심사자가 지갑 없이도 볼 수 있다** — 조회와 검증은 지갑 연결을 요구하지 않는다.
이 점을 지원서에 한 줄 적어두면 심사자가 바로 눌러본다.

## 대안

Railway가 막히면 `web/dist`는 어떤 정적 호스팅에도 그대로 올라간다
(Netlify drop · Vercel · GitHub Pages). 빌드 산출물이 400KB대라 제약이 없다.
