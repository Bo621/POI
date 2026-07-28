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

---

## 리뷰 대응 R1 — 실제로 돌려보니 12 통과 / 3 실패

`bash scripts/dev_up.sh` 후 `npm run test:e2e` 실행 결과. **하네스는 동작한다**
(EIP-1193 주입, 시드 fixture 로딩, 12건 통과 — F4 `기한초과`·F2 철회 이력·이의 건수
미표시·DAG·Passport 포함). 실패 3건을 각각 원인까지 규명해 고친다.

### 1. `[P1]` **제품 결함** — reveal이 지갑 없이는 검증할 수 없다

```
read.spec.ts › CT18 사본은 불일치하고 다운로드할 수 없다
Locator: … getByText(/일치하지 않습니다/)  — element(s) not found
```

원인: `web/src/reveal.tsx:18`

```ts
if (!address) throw new Error("먼저 지갑을 연결해 주세요.");
…
attester: address,      // 연결된 지갑 주소를 attester로 쓴다
```

**제3자가 남의 공개를 검증할 수 없다.** B10과 §12.2가 요구하는 것은
"클라이언트에서 검증 가능, 서버 신뢰 불필요"이고 그 요점은 **제3자 검증**이다.
검증하려고 지갑을 연결해야 한다면 그 성질이 사라진다. CT18(타인 commitment 복사)도
바로 이 경로로 확인하는 것이다.

**고친다** (`web/src`를 바꾸는 것이 옳은 유일한 자리다):

- `attester`를 **입력 필드로** 받는다. 라벨 `attester (검증할 발행자 주소)`.
- 지갑이 연결돼 있으면 그 주소를 **기본값으로 채워 준다**(편의). 하지만 **필수가 아니다.**
- 지갑 미연결 시 `"먼저 지갑을 연결해 주세요."`로 막지 말 것. 검증은 순수 계산이다.
- 발행(파일 다운로드)도 지갑을 요구하지 않는다 — 파일을 만드는 것뿐이다.
- 입력이 주소 형식이 아니면 그때만 오류.

`web/test/reveal.test.ts`에 **지갑 없이 타인 주소로 대조**하는 케이스를 추가한다.

### 2. `[P1]` 결정 커밋 성공 경로에서 tx 해시가 나오지 않는다

```
write.spec.ts › 결정 커밋은 백업 확인 뒤 발행되고 상태 조회가 된다
Locator: … getByText('트랜잭션', {exact:true})  — not found
```

`Receipt`는 `txHash`가 있을 때만 `<dt>트랜잭션</dt>`을 그린다. 즉 **발행이 끝까지 가지
못했거나 해시가 전달되지 않는다.**

원인을 먼저 규명할 것. 확인 순서:

1. 실패 시 화면에 남는 `role="alert"` 문구를 테스트가 함께 출력하게 한다
   (`expect.soft`로 alert 내용을 찍고 나서 단언).
2. `decision.tsx`의 발행 핸들러가 `attest()`의 반환값에서 `txHash`를 실제로 받아
   `Receipt`에 넘기는지 확인한다(W-TXLINK에서 `attest`가 `{uid, txHash}`를 돌려주게 바뀌었다).
3. 주입 provider의 `eth_sendTransaction`이 anvil로 제대로 릴레이되는지 확인한다.

**추측으로 고치지 말 것.** 원인을 찾고 그것을 고친다.

### 3. `graceSeconds` 30분이 사전 검증에 걸리지 않는다

같은 파일의 **`windowStart` 과거 테스트는 통과했다.** 즉 alert 표시 경로 자체는 동작한다
(`decision.tsx:250`이 `role="alert"`). `buildDecisionPayload`에는
`graceSeconds < 1시간` 검사가 있다(`decision.tsx:73`).

그런데 화면에서는 걸리지 않았다. 가능성:

- 입력이 `grace` 상태에 연결되지 않았다(라벨과 state 불일치)
- `fill("1800")`이 다른 컨트롤에 들어갔다
- 검사가 `hasExpectedOutcome` 분기 안에 있는데 그 분기를 타지 않았다

**원인을 규명하고, 제품 쪽이면 제품을 고친다.** 사용자가 30분을 넣고 발행 버튼까지
갔다가 온체인에서 `GraceOutOfRange`로 튕기는 것은 W-A가 막기로 한 것이다.

### 4. 기록해 둘 것 — B 계정 정산은 온체인 매핑을 타지 않는다

UI가 소유자 여부를 먼저 검사해 `"결정 작성자만 정산할 수 있습니다."`로 막는다.
**제품 동작으로는 옳다**(일찍 막는 것이 낫다). 다만 그래서 X7의 `NotDecisionOwner`
한국어 매핑이 화면에 닿는 경로를 E2E가 덮지 못한다.

테스트는 그대로 두고 **`docs/TEST_SCENARIO.md`에 한 줄 적는다**:
컨트랙트 revert 문구는 UI 사전 검증을 우회해야 볼 수 있으므로 자동 검사 대상이 아니다.

### 검증

```
bash scripts/dev_up.sh
cd web && npm run test:e2e      # 15/15
cd web && npm test              # 60 + reveal 추가분
cd web && npx tsc --noEmit && npm run build
```

---

## 리뷰 대응 R2 — `[P1]` R1의 지시가 틀렸다. attester는 입력받으면 안 된다

R1 이후 14/15. 남은 실패는 CT18인데, **테스트가 아니라 설계가 틀렸다.**

R1은 "지갑을 요구하지 말고 `attester`를 입력 필드로 받으라"고 했다. 앞부분(지갑을
요구하지 않는다)은 맞지만 뒷부분이 **CT18을 무력화한다.**

```
CT18:  B가 A의 commitment를 복사해 자기 attestation에 넣는다.
       A의 (salt, payload)로 재계산하면 attester가 B이므로 값이 달라져 불일치해야 한다.

그런데 attester를 사람이 입력하면?
       검증자가 attester 칸에 A를 적으면 B의 attestation에 대해서도 "일치"가 나온다.
       복사 공격이 통과한다.
```

즉 **attester는 검증 대상 attestation에 붙어 있는 사실이지 입력값이 아니다.**

### 고치는 방법 — 체인에서 읽는다

`web/src/reveal.tsx`:

- `attestationUID`를 넣으면 **온체인에서 그 attestation을 조회**해
  `attester`와 `data`(= commitment)를 가져온다. `web/src/read.ts`에 헬퍼를 둔다.
- **`attester` 입력 필드를 없앤다.** 조회한 값을 읽기 전용으로 표시한다.
- **`온체인 commitment` 입력 필드도 없앤다.** 같은 이유다 — 사람이 적으면 아무 값이나
  넣어 "일치"를 만들 수 있다. 조회한 값을 읽기 전용으로 표시한다.
- 사용자가 넣는 것은 **`salt`·`payload`·`tag`** 셋뿐이다. 그것이 공개하는 사람이 가진 전부다.
- 지갑은 여전히 **필요 없다.** 조회는 public client로 한다.
- UID 조회 실패 → `"해당 attestation을 찾을 수 없습니다."`
- 결정 스키마가 아닌 UID → 그 사실을 알린다.

> 이 설계가 B10의 "서버를 신뢰하지 않는다"를 지킨다. 사용자는 체인에서 온 사실
> (attester·commitment)과 자기가 가진 비밀(salt·payload)만으로 판정하고,
> **어느 쪽도 손으로 지어낼 수 없다.**

`decisionCommitment`는 결정 payload의 네 커밋 중 하나다. `tag` 선택에 따라
평면 튜플에서 해당 필드를 꺼낸다(DECISION·TRIGGER·EVIDENCE·REASON).
노트(`NOTE`)는 `contentCommitment` 하나다.

### 테스트

`web/test/reveal.test.ts`: 순수 함수는 `attester`·`commitment`를 **인자로** 받는 형태를
유지한다(이미 그렇다). 화면이 그것을 체인에서 채운다는 것이 바뀌는 부분이다.

`web/e2e/read.spec.ts`의 `fillReveal`을 고친다:

```
attestationUID · salt · payload 만 넣는다.
attester와 commitment 칸은 더 이상 없다.
```

| 테스트 | 기대 |
|---|---|
| `uid = f1` | `commitment가 일치합니다.` · 다운로드 활성 |
| **`uid = f_copy`** | **불일치** · 다운로드 비활성. 화면의 attester가 **B**로 표시된다 |

두 번째가 CT18이다. **화면에 표시된 attester가 B인지도 함께 단언**한다 —
그래야 "왜 불일치인지"가 테스트에 남는다.

### 검증

```
bash scripts/dev_up.sh
cd web && npm run test:e2e     # 15/15
cd web && npm test && npx tsc --noEmit && npm run build
```

---

## 리뷰 대응 R3 — 마지막 1건은 대소문자 비교

R2 이후 14/15. 남은 실패는 **CT18이 실제로는 동작한다는 것을 보여준다.**

```
Expected: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
Received: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
```

화면에 표시된 attester는 **B가 맞다**(EIP-55 체크섬 표기). 불일치 판정도 정상이다.
테스트가 소문자로 비교하고 있을 뿐이다.

### 고칠 것

1. `web/e2e/read.spec.ts` — attester 비교를 **대소문자 무시**로.
   `toHaveText(new RegExp(addr, "i"))` 또는 양쪽을 `toLowerCase()`로 맞춘다.
   **주소 비교는 어디서나 대소문자를 무시해야 한다** — EIP-55 체크섬은 표기일 뿐이다.
   E2E 전체에서 주소를 비교하는 다른 자리도 같은 기준으로 훑을 것.

2. `docs/fixtures/seed.json`의 `accounts`가 `null`이다.
   계획서 §4가 A·B·C 주소를 요구했다. 시드가 채우게 한다.
   E2E가 anvil 기본 주소 상수 대신 이 값을 쓰게 한다.

### 검증

```
bash scripts/dev_up.sh
cd web && npm run test:e2e     # 15/15 — 전부 통과해야 한다
```
