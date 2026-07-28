# E2E 브라우저 회귀 — Playwright + EIP-1193 주입

## 왜

지금 `web` 테스트 60개는 **순수 함수와 인코더만** 본다.
React → 지갑 provider → RPC → 영수증 → 화면 갱신 배선은 **아무도 검증하지 않는다.**
손으로 확인한 것은 다음에 깨져도 모른다.

MetaMask 확장 자동화는 하지 않는다. 대신 `page.addInitScript`로 **EIP-1193 provider를
주입**한다. 제품 코드에 테스트용 경로를 뚫지 않는 것이 핵심이다.

## 파일

- 새로: `web/playwright.config.ts`
- 새로: `web/e2e/fixtures.ts` — 시드 JSON 로딩 + provider 주입 헬퍼
- 새로: `web/e2e/read.spec.ts` — 읽기 경로 (지갑 불필요)
- 새로: `web/e2e/write.spec.ts` — 쓰기 경로 (주입 provider)
- 수정: `web/package.json` — `"test:e2e": "playwright test"`, devDependency `@playwright/test`
- 수정: `.gitignore` — `web/test-results/`, `web/playwright-report/`
- **그 외 수정 금지.** `web/src`는 **한 줄도 바꾸지 않는다.** 바꿔야 한다면 그것이 결함이다.

## 전제

`bash scripts/dev_up.sh`가 먼저 돌아 있어야 한다:
- anvil이 `http://127.0.0.1:8545`에 떠 있고
- `web/.env.local`과 `docs/fixtures/seed.json`이 만들어져 있다

`playwright.config.ts`의 `webServer`로 `npm run dev`를 띄운다(`reuseExistingServer: true`).
**anvil은 Playwright가 띄우지 않는다** — 시드가 먼저 돌아야 하므로 사람/CI가 `dev_up.sh`를 부른다.
`seed.json`이 없으면 명확한 메시지로 **스킵**한다(실패가 아니라 스킵 — 시드 없이는 의미가 없다).

## EIP-1193 주입 — `e2e/fixtures.ts`

```ts
export async function injectWallet(page: Page, privateKey: Hex, rpcUrl: string) {
    await page.addInitScript(({pk, rpc}) => {
        // 페이지 컨텍스트: window.ethereum 을 만든다
        // eth_requestAccounts / eth_accounts → [주소]
        // eth_chainId → 0x164ce (91342)
        // eth_sendTransaction → 서명해서 eth_sendRawTransaction 으로 릴레이
        // 그 외 → rpc 로 그대로 포워딩
    }, {pk: privateKey, rpc: rpcUrl});
}
```

서명은 페이지 안에서 해야 한다. `viem`은 이미 web 의존성이므로
`addInitScript` 안에서 쓸 수 없다(번들 밖). **두 가지 중 하나를 고른다:**

1. **권장** — `eth_sendTransaction`을 받으면 그 파라미터를 Playwright 쪽으로
   `page.exposeFunction`으로 넘겨 **Node에서 viem으로 서명·전송**하고 해시를 돌려준다.
   페이지 안에 개인키가 들어가지 않는다. 서명 로직도 검증된 라이브러리를 쓴다.
2. anvil의 언락 계정을 그대로 쓴다 — `eth_sendTransaction`을 **anvil에 그대로 포워딩**한다.
   anvil은 기본 계정을 언락 상태로 들고 있으므로 서명 없이 처리한다. 가장 단순하다.

**2번을 택한다.** 로컬 anvil 전용이고, 개인키를 브라우저에도 테스트 코드에도 두지 않는다.
`from`을 anvil 계정 주소로 채워 보내면 anvil이 서명한다.

주소는 `seed.json`의 `accounts`에서 읽는다(없으면 anvil 기본 A/B 주소 상수).

## `read.spec.ts` — 지갑 없이

| # | 확인 |
|---|---|
| 1 | 배포 안내 문구가 **없다** (`.env.local`이 채워져 있으므로) |
| 2 | F1 상태 조회 → 인장 텍스트 `정산완료` |
| 3 | **F4 → 인장 `기한초과`** |
| 4 | F2 → `정산완료` **그리고** 「정산 철회 이력 있음」이 보인다 |
| 5 | F5 → `대기` |
| 6 | 이의 목록 조회 → 항목이 1건 보이고, **화면 어디에도 건수 숫자가 없다** |
| 7 | 이의 목록에 `"조회된 것이 전부라는 보장은 없습니다."` |
| 8 | Reveal: `seed.json`의 `f1Reveal`(salt·payload)로 F1 commitment 대조 → **일치** |
| 9 | Reveal: **CT18** — 같은 salt·payload에 `f_copy`의 commitment → **불일치**, 다운로드 버튼 비활성 |
| 10 | DAG 조회 → 노드가 나오고 인덱서 문구가 있다 |
| 11 | Passport 조회 → 목록이 나오고 `"순위나 성과 지표가 아닙니다"`가 있다 |

6번은 **정규식으로 검사**한다: 이의 절 안에 `/\d+\s*건/`이 없어야 한다.

## `write.spec.ts` — 주입 provider로

| # | 확인 |
|---|---|
| 1 | 지갑 연결 → 주소 축약 표기가 보인다 |
| 2 | 저널 저장 → 목록에 나타난다 (온체인 아님) |
| 3 | **결정 커밋 성공 경로**: salt 생성 → 백업 확인 전 발행 버튼 **비활성** → 확인 후 활성 → 발행 → **tx 해시가 화면에 보인다** |
| 4 | 발행한 결정의 UID로 상태 조회 → 인장 `대기` 또는 `관측중` |
| 5 | 사전 검증: `windowStart`를 과거로 → 한국어 오류, 발행 안 됨 |
| 6 | 사전 검증: `graceSeconds` 30분 → 한국어 오류 |
| 7 | **컨트랙트 오류가 한국어로**: B 계정으로 F1 결정을 정산 시도 → `NotDecisionOwner`에 대응하는 한국어 문구 |

7번이 X7 매핑이 실제로 화면에 닿는지 보는 유일한 자동 검사다.

## 안정성 규칙

- `page.waitForSelector`/`expect(...).toBeVisible()`을 쓰고 **고정 sleep을 쓰지 말 것.**
- 텍스트 선택자는 **화면에 실제로 보이는 한국어**를 쓴다. `data-testid`를 제품 코드에
  추가하지 말 것(그것이 테스트용 경로를 뚫는 것이다). 기존 `label`·`heading`·`role`로 찾는다.
- 각 테스트는 독립. `beforeEach`에서 페이지를 새로 연다.
- 타임아웃은 기본 15초, 트랜잭션이 걸린 것만 30초.

## 하지 말 것

- `web/src`를 수정하지 말 것. 선택자가 안 잡히면 **그것을 리포트**한다
  (접근성 문제일 수 있다 — `label` 연결이 빠졌다든가).
- `data-testid` 추가 금지.
- MetaMask 확장 자동화 금지.
- 공개 테스트넷 사용 금지. anvil만.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```
bash scripts/dev_up.sh
cd web && npx playwright install chromium
cd web && npm run test:e2e
```

기존 `npm test`(60개)와 `npm run build`에 회귀가 없어야 한다.
