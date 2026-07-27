# W-A 프론트 스캐폴딩 + W1·W2·W3·W4

`web/`은 지금 빈 디렉터리다. pnpm 워크스페이스에 등록돼 있다.
스택은 `PLAN.md` §1에서 이미 정해졌다: **Vite + React + TS + viem**. SSR 없음, 정적 배포.

**디자인은 하지 않는다.** 기능이 보이고 동작하는 최소 마크업까지만 한다.
색·타이포·레이아웃 취향은 사람의 판단이고, 아침에 사람이 본다.
CSS는 `web/src/styles.css` 하나에 최소한만 — 프레임워크(Tailwind 등)를 도입하지 말 것.

## 파일

- 새로: `web/package.json` · `web/tsconfig.json` · `web/vite.config.ts` · `web/index.html`
- 새로: `web/src/main.tsx` · `web/src/App.tsx` · `web/src/styles.css`
- 새로: `web/src/config.ts` — 체인·주소 설정
- 새로: `web/src/chain.ts` — viem 클라이언트 + 재시도
- 새로: `web/src/eas.ts` — 스키마 인코딩/발행 헬퍼
- 새로: `web/src/wallet.tsx` — W1
- 새로: `web/src/journal.ts` · `web/src/note.tsx` · `web/src/decision.tsx` — W2·W3·W4
- 새로: `web/src/saltBackup.tsx` — W3
- 새로: `web/test/*.test.ts` — 순수 로직 테스트
- 새로: `web/.env.example`
- **그 외 파일 수정 금지.** `core/`·`contracts/`·`verifier/`·`pnpm-workspace.yaml` 손대지 않는다.

테스트 러너는 **vitest**를 쓴다 (Vite 기본). `"test": "vitest run"`.
`@poi/core`는 `"dependencies": {"@poi/core": "workspace:*"}`.

---

## `web/src/config.ts`

컨트랙트는 **아직 배포되지 않았다**(O3은 O2 법률 게이트 뒤다). 주소는 환경변수로 받고,
없으면 앱이 **"컨트랙트 미배포" 상태를 명시적으로 표시**한다. 임의의 주소를 넣지 말 것.

```ts
export const CHAIN = {
    id: 91342,
    name: "GIWA Sepolia",
    rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://sepolia-rpc.giwa.io/",
    explorer: "https://sepolia-explorer.giwa.io",
};

export const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020";
export const DOJANG_ADDRESS = "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
export const UPBIT_KOREA_ID =
    "0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034";

/** 배포 후 채운다. 하나라도 비어 있으면 발행 UI를 막고 안내를 띄운다. */
export const SCHEMAS = {
    note: import.meta.env.VITE_NOTE_SCHEMA_UID ?? "",
    decision: import.meta.env.VITE_DECISION_SCHEMA_UID ?? "",
    settlement: import.meta.env.VITE_SETTLEMENT_SCHEMA_UID ?? "",
    challenge: import.meta.env.VITE_CHALLENGE_SCHEMA_UID ?? "",
};

export function isDeployed(): boolean;   // SCHEMAS 4개가 모두 0x로 시작하는 66자
```

`.env.example`에 같은 키를 주석과 함께 둔다.

## `web/src/chain.ts` — RPC 재시도

§10: **RPC 오류 → 지수 백오프 3회 → "확인 불가"**.

```ts
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T>;
```

대기는 `200ms · 400ms · 800ms`. 3회 모두 실패하면 마지막 오류를 던진다.
`publicClient`(읽기)와 `getWalletClient()`(발행, `window.ethereum`)를 만든다.
지갑이 없으면 명확한 한국어 안내를 던진다.

**`withRetry`는 순수하므로 테스트한다** — 2번 실패 후 성공하면 결과를 주고,
3번 실패하면 던지고, 시도 횟수가 정확히 3인지.

## `web/src/eas.ts`

`attestation.data`는 **평면 튜플**이다. `encodeAbiParameters`에 스키마 필드를 순서대로
나열한다. 구조체로 넘기지 말 것 — 앞에 offset 워드가 붙어 리졸버가 거부한다.

```ts
export function encodeNoteData(contentCommitment: Hex): Hex;
export function encodeDecisionData(d: DecisionFields): Hex;
export async function attest(args: {schema: Hex; data: Hex; revocable: boolean; refUID: Hex}): Promise<Hex>;
```

스키마 필드 순서 (오타 하나가 전부를 무너뜨린다):

```
note        bytes32 contentCommitment
decision    bytes32[] parents, bytes32 promotedFromNote, bytes32 verifiedAddressUID,
            bytes32 decisionCommitment, bytes32 triggerCommitment, bytes32 evidenceCommitment,
            bytes32 reasonCommitment, bool hasExpectedOutcome, bytes32 outcomeMetricId,
            uint8 outcomeOp, int128 outcomeThreshold, uint64 windowStart, uint64 windowEnd,
            uint32 graceSeconds
```

`encodeDecisionData`는 **테스트한다**: 인코딩 결과를 `decodeAbiParameters`로 되돌려
원본과 일치하는지, 그리고 길이가 `14*32 + 32 + 32*parents.length`인지
(리졸버의 `MalformedPayload` 검사와 같은 식).

---

## W1 — `web/src/wallet.tsx`

F1. 지갑 연결 → 주소 → `DojangScroll.isVerified(addr, UPBIT_KOREA_ID)`.

```ts
export interface VerificationSnapshot {
    verified: boolean | "unknown";      // RPC 3회 실패 시 "unknown" → "확인 불가"
    verifiedAddressUID: Hex;            // 찾지 못하면 0x00..0
}
```

**미검증 지갑도 사용을 허용한다.** 연결을 막지 말 것. 배지만 다르게 표시한다.

- `verified === true` → "검증 지갑"
- `verified === false` → "미검증 지갑 (사용 가능)"
- `verified === "unknown"` → "확인 불가"

주소는 축약 표기(`0x1234…abcd`). **ENS/up.id 조회를 하지 말 것** (미배포, 범위 밖).

### `verifiedAddressUID` — 미해결. 0으로 두고 표시한다

`DojangScroll`은 검증 attestation의 UID를 조회하는 함수를 노출하지 않는다
(`getVerification`·`verificationOf`·`attestationOf`·`getAttestationUID`·`verifiedAttestation`
모두 revert). UID는 EAS `Attested` 로그에서 찾아야 하는데 **Dojang의 검증 스키마 UID가
아직 확인되지 않았다.**

그래서 이렇게 한다:

- `VITE_DOJANG_SCHEMA_UID` 환경변수가 있으면 그 스키마의 `Attested` 로그를
  `recipient = 사용자 주소`로 조회해 가장 최근 UID를 쓴다 (viem `getLogs`).
- 없으면 `0x00..0`을 쓴다. 명세는 **미검증 지갑에 0을 허용**하고 리졸버도 0을 통과시킨다.
- UI에 한 줄 표시: `"검증 지갑 스냅샷 UID를 찾지 못했습니다 (0으로 기록됩니다)"` —
  조용히 0을 넣지 말 것. 사용자가 무엇이 기록되는지 알아야 한다.

이 미해결 항목을 `web/src/wallet.tsx` 상단 주석에 `TODO(사람)`으로 남긴다.

---

## W2 — `web/src/journal.ts` + `web/src/note.tsx`

F2·F3. 3계층: 저널(오프체인) → 노트(온체인) → 결정(온체인).

- **저널**은 `localStorage`에만 저장한다. 트랜잭션 없음.
  화면에 **상시** 표시: `"이 기록은 검증되지 않습니다"`. 조건부로 숨기지 말 것.
- **노트**는 `commitment(TAG.NOTE, ...)`로 C를 만들어 `revocable=false`·`refUID=0`으로 발행.
- 저널 항목을 노트로 "승격"하는 버튼을 둔다.

저널 CRUD는 순수 함수로 분리해 **테스트한다** (추가·조회·삭제, 스키마 검증).

## W3 — `web/src/saltBackup.tsx`

R5. **백업 확인 없이는 커밋 진행 불가.**

- salt를 만든 직후 모달을 띄운다. salt(hex)와 payload를 보여주고 복사·다운로드 버튼.
- `"저장했습니다"` 체크박스를 **켜야만** 발행 버튼이 활성화된다.
- 문구: `"salt를 잃어버리면 이 기록은 영구히 공개할 수 없습니다. 정산에는 영향이 없습니다."`
- salt를 서버로 보내지 말 것. `localStorage`에도 두지 말 것 — 다운로드/복사만.

게이트 로직은 순수 함수 `canProceed(state)`로 분리해 **테스트한다**:
백업 미확인 → false, 확인 → true.

## W4 — `web/src/decision.tsx`

F4. 결정 커밋.

- 입력: 결정 내용 · trigger · 근거(선택) · 이유(선택) · 예상 결과(선택) · 부모 UID(≤8) ·
  승격 노트(선택).
- commitment 4종을 `@poi/core`의 `commitment()`로 만든다. 각각 다른 TAG.
  근거·이유가 비면 `0x00..0`.
- **평문으로 온체인에 가는 것**: predicate(metricId·op·threshold) · window · graceSeconds ·
  parents · promotedFromNote · verifiedAddressUID. 이것을 화면에 명시한다 —
  무엇이 공개되는지 사용자가 알아야 한다.
- `refUID`는 `parents[0]` (부모 없으면 0). 리졸버가 이 일치를 강제한다.
- **`trigger`는 온체인에서 강제할 수 없다**는 문구를 상시 표시(§3.2).
- 예상 결과를 선언하지 않으면 metricId·op·threshold·window·grace를 **전부 0**으로 보낸다
  (리졸버 `OutcomeFieldsMustBeZero`).
- `windowStart`는 **발행 시점 이후**여야 한다(I4). 기본값을 "지금 + 5분"으로 두고,
  과거를 고르면 제출 전에 막고 이유를 설명한다.
- `graceSeconds` 기본 24시간, 최소 1시간·최대 30일을 UI에서 막는다.
- 발행 실패 시 `@poi/core`의 `messageFromRevert`로 **한국어 메시지**를 표시한다(X7).

폼 → 페이로드 변환을 순수 함수 `buildDecisionPayload(form)`로 분리해 **테스트한다**:

| # | 내용 |
|---|---|
| 1 | 예상 결과 없음 → outcome 필드 6개가 전부 0 |
| 2 | 부모 2개 → `refUID === parents[0]` |
| 3 | 부모 9개 → 검증 오류 (제출 전에 막는다) |
| 4 | `windowStart`가 과거 → 검증 오류 |
| 5 | `graceSeconds` 30분 / 31일 → 검증 오류 |
| 6 | 근거·이유 미입력 → 해당 commitment가 `0x00..0` |
| 7 | 결정 내용·trigger 미입력 → 검증 오류 (리졸버 `EmptyCommitment` 전에 막는다) |

## 하지 말 것

- 디자인·애니메이션·아이콘·폰트 도입 금지. 기능이 보이는 최소 마크업.
- Tailwind·MUI 등 UI 프레임워크 도입 금지.
- ENS·up.id 조회 금지 (범위 경계).
- 이의 **건수** 표시 금지 (이 단계에는 이의 UI가 없지만 규칙을 미리 적어 둔다).
- 개인키·니모닉을 다루지 말 것. 지갑은 `window.ethereum`만.
- salt를 서버·localStorage에 저장하지 말 것.
- 컨트랙트 주소를 임의로 채우지 말 것 — 미배포 상태를 표시한다.
- `core/`·`contracts/`·`verifier/` 수정 금지. 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```
pnpm install                  # 저장소 루트
cd web && npx tsc --noEmit
cd web && npm test            # vitest
cd web && npm run build       # 빌드가 통과해야 한다
```

세 개 모두 통과해야 한다. `core`·`verifier` 테스트에 회귀가 없어야 한다.

---

## 리뷰 대응 R1 — `[P1]` 3건

### 1. `web/src/bufferShim.ts`를 **삭제한다**

`@poi/core`가 Node의 `Buffer`를 쓰던 것이 원인이었고, **core를 고쳤다**
(`fix: Buffer 의존 제거`, main에 병합됨 — 이 브랜치에도 머지됨).
web에 shim을 두면 원인이 감춰지고, core를 쓰는 다른 소비자는 계속 깨진다.

- `web/src/bufferShim.ts` 삭제
- 그것을 import하던 곳(`main.tsx` 등)에서 import 제거

### 2. `npx tsc --noEmit`이 통과하지 않는다

```
../core/src/*.ts: error TS5097: An import path can only end with a '.ts' extension
                  when 'allowImportingTsExtensions' is enabled.
```

`core`는 `.ts` 확장자를 붙여 import한다(Node의 `--experimental-strip-types` 때문이다).
`web/tsconfig.json`이 그것을 받아들이게 한다:

```json
"moduleResolution": "bundler",
"allowImportingTsExtensions": true,
"noEmit": true
```

`core/tsconfig.json`을 수정하지 말 것 — 그쪽은 Node 실행 경로다.

### 3. `web/test/journal.test.ts` 타입 오류

```
test/journal.test.ts(11,51): error TS2345:
  Argument of type '"id-1"' is not assignable to parameter of type `${string}-${string}-...`
```

저널 항목 id 타입이 `crypto.randomUUID()`의 템플릿 리터럴 타입으로 좁혀져 있다.
**테스트를 캐스팅으로 때우지 말고** `web/src/journal.ts`에서 id 타입을 `string`으로 넓힌다.
UUID 형식은 런타임 관심사지 타입 관심사가 아니다 — 테스트가 고정 id를 쓸 수 있어야 한다.

## 검증 (R1 후)

```
cd web && npx tsc --noEmit     # 오류 0
cd web && npm test             # 16/16
cd web && npm run build        # 통과
cd core && npm test            # 54/54 회귀 없음
```
