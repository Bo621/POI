# W-ROUTES 라우팅 전환 구현 계획

`docs/plans/SITEMAP.md`(개정 R1 포함)를 구현한다. **그 문서가 무엇을 만들지에 대한 합의이고
이 문서는 어떻게 만들지다.** 와이어프레임·문구·금지 규칙은 SITEMAP을 따른다.

## 원칙

1. **로직을 다시 쓰지 않는다.** 기존 컴포넌트를 라우트 아래로 옮겨 재배치하는 것이 대부분이다.
   순수 함수와 그 테스트(63개)는 그대로여야 한다. 줄어들면 무언가를 지운 것이다.
2. **디자인 톤은 그대로.** `W-DESIGN.md`의 괘선·인장·미색·인주. **새 색·새 컴포넌트 스타일 금지.**
3. **단계마다 E2E가 통과한 상태를 유지한다.** 한 번에 갈아엎지 않는다.
4. 라우터 라이브러리를 도입하지 않는다.
5. `core/`·`contracts/`·`verifier/`·`scripts/` 수정 금지. 명세 문서(`docs/POI_*.md`) 읽지 말 것.

---

# 단계 1 — E2E를 먼저 단단하게 (라우팅 이전)

**지금 `seed.json`이 없으면 E2E 전체가 skip되고 명령은 성공으로 끝난다.**
시드 없이 도는 E2E는 아무것도 증명하지 않는데 초록색으로 보인다. 이것부터 고친다.

## 파일

- 수정: `web/e2e/fixtures.ts` · `web/playwright.config.ts`
- 새로: `docs/E2E_BEHAVIOR.md` — 지금 16개가 무엇을 보장하는지 표
- **`web/src` 수정 금지.**

## 할 것

1. `requireSeed()`가 `seed.json`이 없으면 **테스트를 실패**시킨다(skip 아님).
   메시지: `"scripts/dev_up.sh 를 먼저 실행하세요."`
2. `playwright.config.ts`에 `forbidOnly: true`.
3. `package.json`의 `test:e2e`가 **skipped가 0이 아니면 실패**하게 한다.
   `--reporter=list,json`으로 결과를 파일에 쓰고 그것을 확인하는 작은 노드 스크립트를 붙이거나,
   더 단순하게 Playwright의 `--fail-on-flaky-tests`와 함께 리포터 JSON을 검사한다.
   **방법은 자유. 조건은 "skip이 있으면 명령이 실패한다"** 이다.
4. `docs/E2E_BEHAVIOR.md`에 현재 16개가 보장하는 **행위**를 표로 적는다.

   | # | 파일 | 보장하는 행위 |
   |---|---|---|

   이 표가 단계 7의 판정 기준이다. **행위가 하나라도 대응되지 않으면 단계 7을 하지 않는다.**

## 검증

```
cd web && npm run test:e2e            # 16/16, skipped 0
mv docs/fixtures/seed.json /tmp/ && cd web && npm run test:e2e ; echo "exit=$?"
                                      # 실패해야 한다 (exit != 0)
mv /tmp/seed.json docs/fixtures/
```

---

# 단계 2 — 라우터를 넣되 화면은 그대로

## 파일

- 새로: `web/src/router.tsx`
- 수정: `web/src/App.tsx`
- 새로: `web/test/router.test.ts`

## `router.tsx`

해시 라우팅. 라이브러리 없이.

```ts
export type Route =
    | {name: "home"}
    | {name: "record"}
    | {name: "me"}
    | {name: "decision"; uid: Hex}
    | {name: "verify"}
    | {name: "passport"; address: Address}
    | {name: "fixtures"}
    | {name: "notFound"; raw: string};

/** "#/d/0x…" → {name:"decision", uid} */
export function parseRoute(hash: string): Route;
export function routeToHash(route: Route): string;
export function useRoute(): Route;          // hashchange 구독
export function navigate(route: Route): void;
```

- `parseRoute`는 **순수 함수**다. 테스트는 이것을 본다.
- 빈 해시·`#`·`#/`는 전부 `home`.
- UID는 `0x` + 64자리 hex만 유효. 아니면 `notFound`.
- 주소는 `0x` + 40자리 hex만 유효.
- 알 수 없는 경로는 `notFound`(raw를 보존해 화면에 보여준다).

### `router.test.ts`

| # | 내용 |
|---|---|
| 1 | `""` · `"#"` · `"#/"` → home |
| 2 | `"#/record"` · `"#/me"` · `"#/verify"` · `"#/fixtures"` |
| 3 | `"#/d/0x" + 64자` → decision, uid 보존 |
| 4 | `"#/d/0x123"`(짧음) → notFound |
| 5 | `"#/d/zz…"`(hex 아님) → notFound |
| 6 | `"#/passport/0x" + 40자` → passport |
| 7 | `"#/passport/0x12"` → notFound |
| 8 | `"#/없는경로"` → notFound, raw 보존 |
| 9 | `routeToHash(parseRoute(h)) === h` (왕복, 유효한 경로에 대해) |
| 10 | 대소문자 — UID·주소는 소문자로 정규화하되 **비교는 대소문자 무시** |

## `App.tsx`

**이 단계에서는 화면을 바꾸지 않는다.** 라우터를 붙이되 모든 라우트가
지금의 단일 페이지를 그대로 렌더한다.

```tsx
const route = useRoute();
// 단계 4~5에서 route에 따라 갈라진다. 지금은 전부 <SinglePage/>
```

## 검증

```
cd web && npm test          # 63 + 10
cd web && npm run test:e2e  # 16/16 그대로, skipped 0
```

**E2E가 하나라도 깨지면 이 단계가 잘못된 것이다.**

---

# 단계 3 — 라우팅 자체를 테스트한다 (화면 이동 전)

## 파일

- 새로: `web/e2e/routing.spec.ts`

| # | 내용 |
|---|---|
| 1 | `#/`로 직접 진입 → 홈이 열린다 |
| 2 | `#/d/<f1>`로 **직접 진입**(딥링크) → 500ms 안에 앱이 뜬다 |
| 3 | 새로고침해도 같은 화면 |
| 4 | 네비게이션으로 이동 후 **뒤로가기** → 이전 화면 |
| 5 | **앞으로가기** → 다시 |
| 6 | `#/없는경로` → `"없는 화면입니다."` + 홈 링크 |
| 7 | `#/d/0x123`(짧은 UID) → 같은 처리 |

단계 2에서는 전부 같은 페이지가 나오므로 **화면 내용이 아니라 "앱이 죽지 않는다"와
"URL이 유지된다"**를 본다. 단계 4 이후 내용 단언을 추가한다.

---

# 단계 4 — 읽기 경로를 옮긴다 (지갑 불필요)

여기서부터 화면이 실제로 바뀐다. **순서: `#/d/<uid>` → `#/verify` → `#/passport`.**

## 4-A `#/d/<uid>` 결정 상세 — 가장 중요하다

새 파일 `web/src/decisionDetail.tsx`. SITEMAP §4.4 + 개정 R1-2·R1-3·R1-4·R1-6을 따른다.

**절 구성과 각각의 독립 로드**

| 절 | 데이터 | 실패 시 |
|---|---|---|
| 머리 | UID · `[UID 복사]` · `[이 화면 링크 복사]` · `← 홈` | — |
| 상태 인장 | 결정 + `activeHead`·`revokeCount` + 체인 시각 → `deriveState` | 절 전체가 오류 문구 |
| 커밋 | 결정 attestation의 attester·time·verifiedAddressUID | 위와 함께 |
| 예상 결과 | 결정 payload의 평문 필드 | 위와 함께 |
| **정산** | `activeHead` → 그 attestation. `lastHead`로 이전 정산 | **독립.** 실패해도 위는 남는다 |
| **이의** | 정산별. 로그 스캔 | **독립.** `! 이의 목록을 불러오지 못했습니다 [다시 시도]` |
| 공개 | 기존 `reveal.tsx` 재사용. UID는 라우트에서 채운다 | 독립 |
| 계보 | 기존 `graph.ts` 재사용. `<details>`로 접음 | 독립 |
| ▸ 검증 근거 | 체인·EAS·스키마·resolver·지표·definitionHash·문서 경로 | 독립 |
| 오프체인 검증 | `poi-verify …` 명령 + `[복사]` | — |

- **이의는 정산 아래에 종속**시킨다(R1-2). 각 정산마다 자기 이의 목록과 `[이의 제기]`.
- **개수를 세어 표시하지 않는다.** `이전 정산 (철회됨)`, `계보`.
- 쓰기 버튼(`[정산하기]`·`[이의 제기]`)은 지갑이 없으면 비활성 + 이유 표시.
  `[정산하기]`는 **소유자에게만** 보인다.
- 오류 상태는 R1-5 표 그대로.

## 4-B `#/verify`

기존 화면을 줄인다. UID를 넣으면 **`#/d/<uid>`로 이동**한다(독립 결과 화면이 아니다).
verifier CLI 안내와 종료코드 표를 둔다.

## 4-C `#/passport/<address>`

기존 `passport.tsx`를 라우트로. 주소를 URL에서 받는다.
`#/me`와 **같은 조회 모델**을 쓰도록 조회 부분을 `web/src/records.ts`로 뽑는다.

```ts
export interface RecordRow { uid: Hex; committedAt: bigint; state: PoiState; hasRevoked: boolean; grade: string; }
export async function loadRecords(address: Address): Promise<RecordRow[]>;   // 커밋 시각 내림차순
export function needsAction(rows: RecordRow[]): RecordRow[];                  // AWAITING·OVERDUE만
```

`needsAction`은 **순수 함수**다. 테스트한다.

## E2E 추가 (`routing.spec.ts` 확장 또는 `detail.spec.ts` 신설)

| # | 내용 |
|---|---|
| 1 | **지갑 없이** `#/d/<f1>` 직접 진입 → 인장 `정산완료`, 등급, 발행자 주소가 보인다 |
| 2 | `#/d/<f2>` → `정산완료` + 「정산 철회 이력 있음」 + `▸ 이전 정산 (철회됨)` |
| 3 | `#/d/<f4>` → **`기한초과`** |
| 4 | `#/d/<f5>` → `대기` |
| 5 | F1 상세의 이의 목록에 1건, **건수 숫자 없음** |
| 6 | 지갑 없이 `[정산하기]`·`[이의 제기]`가 비활성이고 이유가 보인다 |
| 7 | `[이 화면 링크 복사]` → 클립보드 값이 현재 URL |
| 8 | 없는 UID → `"해당 기록을 찾을 수 없습니다."` |
| 9 | 노트 UID를 넣으면 → `"결정 기록이 아닙니다."` |
| 10 | `#/verify`에서 UID 입력 → `#/d/<uid>`로 이동 |
| 11 | `#/passport/<A주소>` → 목록 + 비순위 안내 |

**기존 `read.spec.ts`의 단언을 여기로 옮긴다. 지우지 말 것.**

---

# 단계 5 — 쓰기 경로를 옮긴다

## 5-A `#/record`

SITEMAP §4.2. 3단계 진행 표시. 선택 항목은 `<details>`로 접는다.
**발행 성공 시 `#/d/<uid>`로 이동**한다.

## 5-B `#/me`

SITEMAP §4.3 + R1-1(숫자 없음). `records.ts`를 쓴다.
`지금 할 일`은 정렬이 아니라 **필터**(`needsAction`).

## E2E

기존 `write.spec.ts`를 라우트 기준으로 옮긴다. 추가:

| # | 내용 |
|---|---|
| 1 | 발행 성공 후 URL이 `#/d/<새 uid>`가 된다 |
| 2 | `#/me`에 방금 만든 결정이 나타난다 |
| 3 | 지갑 없이 `#/record` 진입 → 폼이 비활성이고 이유가 보인다 |

---

# 단계 6 — 홈 대시보드

SITEMAP §R1-8. **여기가 마지막 새 화면이다.**

- 지갑 없이: 소개 3줄 · 기록 열기 · **예시 증서** · 최근 열어본 증서 · ▸검증 환경
- 지갑 연결 시 아래에 추가: 처리할 기록 · 최근 커밋한 기록
- **집계 금지.** 총 개수·비율·적중률·평균·순위·이의 수 어디에도 없다.
- 예시 증서는 `VITE_EXAMPLE_UIDS`(쉼표 구분) → 없으면 `seed.json` → 없으면 절을 그리지 않는다.
- 최근 열어본 증서는 `localStorage`. 상세를 열 때마다 기록한다. 최대 5건.

`web/src/recent.ts`를 순수 함수로 두고 테스트한다:
`addRecent(list, uid, at)` — 중복 제거 · 최신 우선 · 5건 상한.

## E2E

| # | 내용 |
|---|---|
| 1 | 지갑 없이 홈 → 소개와 `기록 열기`가 보인다. `처리할 기록`은 **없다** |
| 2 | 예시 증서에서 F4를 눌러 `#/d/<f4>` → `기한초과` |
| 3 | 상세를 본 뒤 홈으로 → `최근 열어본 증서`에 그것이 있다 |
| 4 | 지갑 연결 후 홈 → `처리할 기록`이 나타난다 |
| 5 | 홈 어디에도 `/\d+\s*건/`이 없다 |

---

# 단계 7 — 단일 페이지 제거

`docs/E2E_BEHAVIOR.md`의 **행위 표가 새 테스트로 전부 대응된 뒤에만** 한다.
대응표를 그 문서에 추가하고, 하나라도 비면 **하지 않는다.**

## 완료 조건

```
cd web && npm test                  # 순수 함수 테스트가 줄지 않았다
cd web && npm run test:e2e          # skipped 0, 실패 0
cd web && npx tsc --noEmit && npm run build
cd contracts && forge test          # 150/150
```

그리고 `docs/E2E_BEHAVIOR.md`의 모든 행이 **새 테스트 이름과 짝지어져** 있어야 한다.

---

## 단계 3 리뷰 대응 R1 — 해시 퍼센트 인코딩

```
Expected: "#/없는경로"
Received: "#/%EC%97%86%EB%8A%94%EA%B2%BD%EB%A1%9C"
```

브라우저가 해시의 비ASCII를 퍼센트 인코딩한다. 테스트가 그것을 고려하지 않았다.

**테스트만 고치고 끝내지 말 것 — 제품에도 같은 문제가 있다.**
`notFound`의 `raw`를 화면에 그대로 보여주면 사용자는
`"%EC%97%86…는 없는 화면입니다"`를 보게 된다.

### 고칠 것

1. `parseRoute`가 `raw`를 만들 때 **`decodeURIComponent`로 복원**한다.
   복원에 실패하면(잘못된 인코딩) 원문 그대로 둔다 — 던지지 말 것.
2. `router.test.ts`에 케이스 추가: `"#/%EC%97%86%EB%8A%94%EA%B2%BD%EB%A1%9C"` → `raw === "없는경로"`.
3. `routing.spec.ts`는 URL 비교 시 `decodeURIComponent`를 쓰거나
   ASCII 경로로 확인한다. **둘 다 두는 것이 낫다** — 인코딩 왕복 자체가 검사 대상이다.

### 검증

```
cd web && npm test && npm run test:e2e     # 23/23, skipped 0
```

---

## 단계 4 리뷰 대응 R1 — `[P1]` 상세 화면이 백지가 된다

`#/d/<f1>`로 들어가면 **화면 전체가 비어 있다**(`#root`의 자식이 0).
Playwright로 `pageerror`를 잡아 확인했다.

```
PAGEERROR: activeHead가 있으면 activeHeadTime이 필요하다
The above error occurred in the <DecisionDetail> component
Consider adding an error boundary…
```

두 개의 결함이 겹쳐 있다.

### `[P1]` 1. `activeHeadTime`을 넘기지 않는다

`core`의 `deriveState`는 `activeHead ≠ 0`인데 `activeHeadTime`이 없으면 **일부러 던진다** —
SETTLED와 SETTLED_LATE를 가르는 유일한 입력이라 추측하면 안 되기 때문이다(X5의 설계).
`decisionDetail.tsx`가 그 값을 조회하지 않고 부른다.

활성 정산 attestation의 `time`을 읽어 넘긴다. `status.tsx`가 이미 그렇게 하고 있으므로
**그 조회 로직을 `web/src/records.ts`나 `read.ts`로 뽑아 둘 다 쓰게 한다.**
같은 조회가 두 벌이 되면 한쪽만 고쳐진다.

### `[P1]` 2. 에러 경계가 없어 앱 전체가 사라진다

컴포넌트 하나가 던지면 **React가 트리 전체를 언마운트**한다.
이 화면의 존재 이유가 "심사자에게 줄 URL"인데 **백지가 나온다.**
게다가 콘솔을 열지 않으면 원인도 알 수 없다.

`web/src/errorBoundary.tsx`를 만든다.

```tsx
export class ErrorBoundary extends React.Component<
    {label: string; children: React.ReactNode},
    {message?: string}
> { … }
```

- 잡으면 그 자리에 `.notice`로
  `"{label}을(를) 표시하지 못했습니다."` + 오류 메시지 + `[다시 시도]`(상태 초기화).
- **`App.tsx` 최상위에 하나**, 그리고 `decisionDetail.tsx`의 **각 절마다 하나**
  (상태·정산·이의·공개·계보·검증 근거). R1-3이 요구한 독립 실패 경계가 이것이다.
- 최상위 경계는 헤더·네비게이션을 남기고 본문만 대체한다. **백지가 되지 않게.**

### 검증

```
cd web && npm run test:e2e     # 전부 통과, skipped 0
```

그리고 **일부러 던지게 만든 상태**에서 앱이 백지가 되지 않고 해당 절만 오류로 바뀌는지
확인한다(임시로 throw를 넣어 보고 되돌린다).

`routing.spec.ts`에 단언을 추가한다: 딥링크 진입 시 `#root`가 **비어 있지 않다.**
지금 그 단언이 없어서 이 결함이 "타임아웃"으로만 보였다.

---

## 단계 5 리뷰 대응 R1 — 접힘과 이동을 테스트가 따라가지 못한다

25/28. 실패 3건 전부 **테스트 쪽**이다(제품 결함이 아니다).

### 1. `<details>`로 접힌 필드를 열지 않는다

```
waiting for … getByLabel('예상 결과 선언')
  locator resolved to <input type="checkbox" id="decision-outcome"/>
  element is not visible
```

단계 5에서 선택 항목을 `<details>`로 접었다(의도한 변경). 테스트가 열지 않고 조작한다.

**고칠 것**: 접힌 절을 먼저 연다. `<summary>`를 클릭하거나
`details[open]`을 확인하는 헬퍼를 `e2e/fixtures.ts`에 둔다.

```ts
export async function openDetails(area: Locator, summaryText: string): Promise<void>;
```

**`web/src`에서 `<details>`를 걷어내지 말 것.** 접힘은 SITEMAP §4.2가 요구한 것이고
필드 15개가 한꺼번에 펼쳐지는 것이 원래 문제였다.

### 2. 정산·이의가 상세로 옮겨간 것을 따라가지 않는다

`write.spec.ts`의 두 테스트가 아직 단일 페이지의 `정산` 절을 찾는다.
단계 4에서 정산은 `#/d/<uid>` 안으로 들어갔다.

- `B 계정의 F1 정산 시도` → `#/d/<f1>`로 이동한 뒤 그 안의 정산 절에서 확인한다
- `지갑 없이 기록하기` → `#/record`로 이동해 확인한다

**단언 자체는 바꾸지 말 것.** 어디서 찾는지만 바꾼다.

### 3. `fullpath.spec.ts`도 같은 두 가지

`<details>` 열기 + 정산·이의를 상세 경로에서 수행하도록 고친다.
**성공 경로가 실제 사용자 동선(홈 → 기록하기 → 상세 → 정산 → 이의 → 공개)과
같아지는 것이 원래 목표**였으므로, 이 수정이 오히려 의도에 맞다.

### 검증

```
cd web && npm run test:e2e     # 28/28, skipped 0
```

---

## 단계 5 리뷰 대응 R2 — 네비게이션이 없다 + 지갑 게이트가 과하다

### `[P1]` 1. 고정 상단 네비게이션과 지갑 표시가 없다

SITEMAP §3이 요구한 것인데 아직 없다. 그래서 `#/d/<uid>`에서
**연결된 계정이 무엇인지 볼 수 없고, 다른 화면으로 갈 방법도 없다.**

`web/src/nav.tsx`를 만들어 **모든 라우트 위에** 둔다(`App.tsx` 최상위).

```
POI 판단 증서 │ 홈  기록하기  내 기록  검증하기 │ 0xf39F…2266 미검증  [연결]
```

- 현재 라우트를 강조한다(`aria-current="page"`).
- 지갑이 없으면 `기록하기`·`내 기록`은 **흐리게 두되 숨기지 않는다.**
  누르면 해당 화면으로 가고 거기서 "지갑을 연결해 주세요"를 본다.
  (무엇이 있는지는 보여주고, 왜 못 쓰는지는 그 화면에서 말한다)
- 지갑 상태(주소 축약 + 검증 배지 + `[연결]`)를 **여기 한 곳**에 둔다.
  각 화면이 따로 지갑 절을 그리지 않는다.
- `W-DESIGN.md`의 괘선·색만 쓴다. 새 색 금지.

지갑 상태를 App 최상위에서 들고 nav와 각 화면에 내려준다.
**지갑 연결 로직을 두 벌로 만들지 말 것.**

### `[P2]` 2. `#/record`에서 지갑 없이 폼을 통째로 막지 않는다

계획서에 "지갑 없이 진입 → 폼이 비활성"이라고 썼는데 **과하다.**

- salt 생성·백업은 **지갑이 필요 없다.** 순수 클라이언트 계산이다.
- 필요한 것은 **발행**뿐이다.

그래서:

| | 지갑 없음 |
|---|---|
| 저널 작성·저장 | 허용 |
| 결정 폼 입력 | 허용 |
| salt 생성·백업 | **허용** |
| 노트 발행·결정 발행 | **비활성** + `"먼저 지갑을 연결해 주세요."` |

화면 상단에 `.notice--quiet`로 한 줄:
`"지갑을 연결하면 발행할 수 있습니다. 작성과 salt 백업은 지금도 가능합니다."`

E2E의 해당 단언을 이 기준으로 고친다(발행 버튼만 비활성).

### 검증

```
cd web && npm run test:e2e     # 28/28, skipped 0
```

그리고 화면에서 네비게이션이 모든 라우트에 보이고 현재 위치가 강조되는지 확인한다.

---

## 단계 5 리뷰 대응 R3 — 남은 3건

### `[P1]` 1. salt 백업 모달의 `발행`이 지갑 없이도 활성이다

```
Locator: getByRole('dialog', {name:'salt 백업'}).getByRole('button', {name:'발행'})
Expected: disabled
```

R2에서 "발행만 비활성"으로 했는데 **모달 안의 발행 버튼이 빠졌다.**
지갑 없이 누르면 어떻게 되는지 확인하고, **비활성 + 이유**를 붙인다.

`발행`이라는 이름의 버튼이 화면에 여럿 있으면 전부 같은 기준을 따라야 한다.
**`web/src`에서 발행 동작을 하는 버튼을 전수로 확인할 것.**

### `[P1]` 2. 네비게이션에 연결된 주소가 보이지 않는다

```
Locator: getByRole('navigation').getByText(/0x7099…79c8/i)
Expected: visible
```

B로 연결한 뒤 nav에 주소가 안 나온다. 원인을 규명할 것:

- nav가 주소를 받고는 있는가 (App에서 내려주는가)
- 축약 표기 형식이 테스트가 기대하는 것과 같은가
  (`0x7099…79C8` — 가운뎃점 `…`(U+2026)인지 `...`인지)
- 연결 후 상태가 nav까지 전파되는가

**추측으로 고치지 말 것.** 코드를 읽어 어디서 끊기는지 찾는다.

### `[P2]` 3. `승격 노트 UID (선택)`을 찾지 못한다

```
waiting for … getByLabel('승격 노트 UID (선택)')
```

R1에서 `<details>` 여는 헬퍼를 만들었는데 **계보 절에는 적용되지 않은 듯하다.**
`fullpath.spec.ts`가 그 필드를 쓰기 전에 해당 `<details>`를 연다.
라벨 문구가 바뀌었다면 테스트를 실제 문구에 맞춘다.

### 검증

```
cd web && npm run test:e2e     # 28/28, skipped 0
```

---

## 단계 5 리뷰 대응 R4 — 원인을 확정했다. 선택자 땜질을 멈춘다

R1~R3에서 선택자만 고치다 같은 3건이 반복됐다. Claude가 코드를 직접 읽어 원인을 확정했다.

### 1. `지갑 없이…` — 게이트는 이미 옳다. **테스트가 지갑을 물고 있다**

`saltBackup.tsx:69`는 `publishDisabled`로 막고 있고
`decision.tsx:267`·`note.tsx:117`이 `publishDisabled={!address}`를 넘긴다. **제품은 옳다.**

실패한 이유는 그 테스트의 페이지에 **주입 provider가 이미 계정을 들고 있어서**
앱이 연결된 것으로 판단하기 때문이다.

`e2e/fixtures.ts`의 주입 provider가 `eth_accounts`에 **항상 주소를 돌려준다.**
실제 지갑은 사용자가 승인하기 전에는 `eth_accounts`에 **빈 배열**을 준다.

**고칠 것**: provider에 "아직 승인되지 않음" 상태를 넣는다.

```
eth_accounts        → 승인 전이면 []           승인 후면 [주소]
eth_requestAccounts → 승인으로 바꾸고 [주소]
```

`injectWallet(page, addr, {authorized: false})` 같은 옵션을 두고,
`지갑 없이` 테스트는 `authorized: false`로 주입하거나 아예 주입하지 않는다.

**이 수정은 테스트를 실제 지갑 동작에 가깝게 만드는 것이므로 다른 테스트도 더 정확해진다.**

### 2·3. `B 계정 정산`·`fullpath` — 절이 상세로 옮겨갔다

```
waiting for … heading '정산' … getByLabel('decisionUID')
waiting for … heading '상태' … getByLabel('decisionUID')
```

단계 4에서 `상태`·`정산`은 **`#/d/<uid>` 안으로 들어갔고, 거기서는 UID가 라우트에서 온다.**
**그 입력 필드가 더 이상 존재하지 않는다.**

선택자를 고칠 문제가 아니라 **흐름을 옮길 문제**다.

| 테스트 | 고칠 방향 |
|---|---|
| `B 계정의 F1 정산 시도` | B로 연결 → **`#/d/<f1>`로 이동** → 그 안의 정산 절에서 확인. UID 입력 없음 |
| `fullpath` 7·8단계(정산·상태) | 결정 발행 후 이미 `#/d/<uid>`에 있다. **그 화면에서 그대로** 정산하고 상태를 본다. 별도 상태 조회 폼을 찾지 않는다 |

`fullpath`가 오히려 **실제 사용자 동선과 같아진다** — 원래 의도였다.

### 하지 말 것

- 제품에서 게이트를 풀거나 `<details>`를 걷어내지 말 것. 셋 다 테스트 쪽 문제다.
- 단언을 약화하지 말 것. **어디서 찾는지와 어떻게 연결하는지만** 바꾼다.

### 검증

```
cd web && npm run test:e2e     # 28/28, skipped 0
```

---

## 단계 5 리뷰 대응 R5 — `[P1]` 상세의 쓰기 버튼이 죽어 있다

Claude가 `decisionDetail.tsx`를 읽어 확인했다. **버튼은 있는데 동작이 없다.**

```
decisionDetail.tsx:173   {owner && <button className="btn-commit" type="button">정산하기</button>}
decisionDetail.tsx:70    <button className="btn-commit" type="button" disabled={!address}>이의 제기</button>
```

**둘 다 `onClick`이 없다.** 눌러도 아무 일이 없다.
그래서 `fullpath`와 `B 계정 정산` 테스트가 계속 실패한 것이고,
선택자를 아무리 고쳐도 통과할 수 없었다.

기존 `Settlement`·`Challenge` 컴포넌트는 여전히 **단일 페이지에만** 있고
자기 `decisionUID`/`settlementUID` 입력 필드를 들고 있다.

### 고칠 것

1. **`settlement.tsx`·`challenge.tsx`를 라우트에서 재사용 가능하게 만든다.**
   UID를 **prop으로 받을 수 있게** 하고, prop이 있으면 그 입력 필드를 그리지 않는다.

   ```tsx
   <Settlement decisionUID={uid} address={address} />      // 입력 필드 없음
   <Challenge settlementUID={s.uid} address={address} />   // 입력 필드 없음
   ```

   prop이 없으면 지금처럼 입력 필드를 그린다(단일 페이지가 아직 살아 있다).
   **로직을 복제하지 말 것.** 같은 컴포넌트가 두 모드를 갖는다.

2. `decisionDetail.tsx`의 죽은 버튼을 **실제 폼으로 교체**한다.
   - `정산`: 소유자에게만 `<Settlement decisionUID={uid} …/>`.
     소유자가 아니면 `"결정 작성자만 정산할 수 있습니다."`를 `.doc-note`로 표시하고 폼을 그리지 않는다.
   - `이의`: 각 정산 아래에 `<Challenge settlementUID={…} …/>`.
     지갑이 없으면 발행 버튼만 비활성(+이유). 폼 자체는 보인다.

3. 발행에 성공하면 해당 절을 다시 불러온다(상태 인장도 갱신).

### E2E

- `B 계정의 F1 정산 시도` → `#/d/<f1>`에서 B는 **폼이 없고** 소유자 안내가 보인다.
  단언의 의도("소유자가 아니면 정산할 수 없고 이유를 안다")는 그대로다.
- `fullpath` 상태 확인 → 인장은 **`<h2>상태</h2>` 아래가 아니라 문서 머리**에 있다
  (`decisionDetail.tsx:157`). 머리 영역에서 찾는다.

### 하지 말 것

- 단일 페이지를 아직 지우지 말 것(단계 7).
- 단언을 약화하지 말 것.

### 검증

```
cd web && npm run test:e2e     # 28/28, skipped 0
```

---

## 단계 5 리뷰 대응 R6 — 상세에서 이의 목록이 자동으로 뜨지 않는다

`challenge.tsx:40`

```tsx
useEffect(() => { if (fixedSettlementUID) setSettlementUID(fixedSettlementUID); }, [fixedSettlementUID]);
```

UID를 세팅만 하고 **`load()`를 부르지 않는다.** 그래서 상세 화면에서 사용자가
`목록 조회`를 눌러야 이의가 보인다.

**이의는 그 기록의 일부다.** 상세를 열었을 때 이미 보여야 한다 —
심사자가 버튼을 찾아 눌러야 한다면 "이 정산에 이의가 있다"는 사실을 놓친다.

### 고칠 것

- `fixedSettlementUID`가 주어지면 **자동으로 `load()`**를 부른다.
- 단일 페이지 모드(UID를 입력받는 경우)는 지금처럼 `목록 조회` 버튼을 유지한다.
- 자동 로드 중에는 `"불러오는 중…"`, 실패하면 기존 재시도 문구.

### 검증

```
cd web && npm run test:e2e     # 28/28, skipped 0
```

---

## 단계 6 리뷰 대응 R1 — 홈이 대시보드로 바뀐 것을 테스트가 따라가지 못한다

24/26. 실패 2건 전부 **테스트가 옛 홈(단일 페이지)을 전제**한다.

### 1. `fullpath` — 저널을 홈에서 찾는다

```
waiting for … heading '저널과 노트' … getByLabel('저널 내용')
```

저널은 이제 **`#/record`**에 있다. 홈은 대시보드다.
`fullpath`의 1단계에서 `#/record`로 이동한 뒤 저널을 쓴다.

### 2. `지갑 없이…` — 없는 절의 버튼을 본다

```
Locator: heading '정산' … getByRole('button', {name:'정산 발행'})
```

`#/record`에는 정산 절이 없다. 이 테스트가 확인해야 할 것은
**`#/record`에 실제로 있는 발행 버튼**이다.

| 확인 | 대상 |
|---|---|
| 작성·salt 백업은 지갑 없이 된다 | 저널 저장 · salt 생성 및 백업 |
| 발행만 막힌다 | `노트 발행` · salt 모달의 `발행` |

정산 발행은 상세 화면의 것이므로 **다른 테스트가 덮는다**(`B 계정의 F1 정산 시도`).

### 하지 말 것

- 제품을 되돌리지 말 것. 홈이 대시보드가 된 것은 의도한 변경이다.
- 단언을 약화하지 말 것.

### 검증

```
cd web && npm run test:e2e     # 26/26, skipped 0
```

---

## 단계 7 리뷰 대응 R1 — `목록 조회` 버튼은 이제 없다

```
waiting for … heading '이의' … getByRole('button', {name:'목록 조회'})
```

R6에서 상세의 이의 목록을 **자동 로드**로 바꿨고, 단계 7에서 단일 페이지를 지우면서
`목록 조회` 버튼이 있던 모드가 사라졌다. 테스트가 아직 그 버튼을 누른다.

**고칠 것**: `fullpath.spec.ts`에서 그 클릭을 제거하고 **목록이 저절로 나타나는 것**을
기다린다(`expect(...).toBeVisible()`). 단언 자체는 그대로다.

`web/e2e` 전체에서 `목록 조회`를 찾는 다른 자리가 있는지 함께 확인할 것.

### 검증

```
cd web && npm run test:e2e     # 26/26, skipped 0
```
