# W-B 프론트 W5·W6·W7·W8

`W-A`가 만든 스캐폴딩(`web/`) 위에 이어 붙인다. 같은 규칙:
**디자인은 하지 않는다.** 기능이 보이는 최소 마크업. UI 프레임워크 도입 금지.

## 파일

- 새로: `web/src/settlement.tsx` (W5) · `web/src/challenge.tsx` (W6) ·
  `web/src/status.tsx` (W7) · `web/src/reveal.tsx` (W8)
- 새로: `web/src/read.ts` — 리졸버·EAS 읽기 헬퍼 (`activeHead`·`lastHead`·`revokeCount`·로그 조회)
- 새로: `web/src/reveal.ts` — reveal 파일 만들기·검증 (순수 함수)
- 새로: `web/test/*.test.ts` — 아래 목록
- 새로: `reveals/README.md` — 공개 파일 형식 안내 (**저장소 루트의 `reveals/`**)
- 수정: `web/src/App.tsx` — 새 화면 연결
- **그 외 파일 수정 금지.** `core/`·`contracts/`·`verifier/` 손대지 않는다.

읽기는 전부 `W-A`의 `withRetry`를 거친다(§10 지수 백오프 3회).

---

## W5 — `web/src/settlement.tsx` (F6)

정산 발행. **결정의 attester만** 발행할 수 있다(리졸버가 강제하지만 UI에서도 막는다).

입력: `decisionUID` · 관측값(소수 문자열) · 출처 · `verifierVersion`.

- `observedAt`은 **입력받지 않는다.** 결정의 `windowEnd`를 그대로 넣는다.
  리졸버가 `ObservedAtMustBeWindowEnd`로 강제하므로 사용자가 고를 수 있게 하면 안 된다.
  화면에는 "관측 시점: 구간 종료 시각(고정)"으로 표시한다.
- 관측값은 `@poi/core`의 `scale(raw, decimals)`로 정수화한다. `decimals`는
  `POIDecisionResolver.metrics(metricId).decimals`에서 읽는다.
- `result`는 **사용자가 고르지 않는다.** `settlementResult(...)`로 계산해 보여주고 그대로 보낸다.
  온체인이 같은 산술을 강제하므로(B6) 선택하게 하면 revert만 늘어난다.
  화면 문구: "결과는 관측값으로부터 컨트랙트가 판정합니다. 직접 고를 수 없습니다."
- 관측값을 얻지 못한 경우를 위한 체크박스: "관측값 없음" → `hasObservedValue=false`,
  `observedValue=0`, `result=INDETERMINATE`.
- `revocable=true` 강제, `refUID = decisionUID`, `expirationTime=0`, `recipient=0`.
- 정정 발행: `activeHead`가 0이고 `lastHead`가 0이 아니면 `supersedes = lastHead`를
  **자동으로** 채우고 그 사실을 표시한다. `activeHead`가 살아 있으면 발행 버튼을 막고
  "먼저 기존 정산을 철회해야 합니다"를 안내한다(리졸버 `PriorStillActive`).
- 발행 실패 시 `@poi/core`의 `messageFromRevert`로 한국어 메시지(X7).
- 철회 버튼: `EAS.revoke`. 철회하면 `activeHead`가 0이 되고 `revokeCount`가 는다.

`buildSettlementPayload(form, decision, decimals)`를 순수 함수로 분리해 **테스트**:

| # | 내용 |
|---|---|
| 1 | `observedAt === decision.windowEnd` (항상) |
| 2 | 관측값 있음 + 임계 초과 → `result === OBSERVED` |
| 3 | 관측값 있음 + 미달 → `NOT_OBSERVED` |
| 4 | 관측값 없음 → `INDETERMINATE`, `observedValue === 0n` |
| 5 | `activeHead ≠ 0` → 발행 불가 판정 |
| 6 | `activeHead = 0` ∧ `lastHead ≠ 0` → `supersedes === lastHead` |
| 7 | 최초 발행 → `supersedes === 0x00..0` |
| 8 | 소수 관측값 `"6.005"` + `decimals=2` → `601n` (core half-up) |

## W6 — `web/src/challenge.tsx` (F7)

이의 발행 + 목록.

- 발행: **누구나**. `revocable=true`, `refUID = settlementUID`.
  입력은 `claimedResult` · 관측값(선택) · 출처 · `noteCommitment`(선택).
  `observedAt`은 이의자가 직접 넣는다(정산과 달리 온체인 강제가 없다).
- **표시 규칙 — 어기면 안 된다:**
  - **건수를 표시하지 않는다.** `"이의 3건"` 금지. `"이의가 제기된 정산입니다"` + 목록.
  - **정렬·랭킹 금지.** 조회된 순서 그대로 둔다.
  - 각 항목에 **검증 지갑 여부**를 병기한다(`isVerified`로 조회, 실패 시 "확인 불가").
  - 근거: 지갑 생성 비용이 사실상 0이라 건수는 언제든 부풀릴 수 있다. 코드 주석에 남길 것.
- 목록은 EAS `Attested` 로그를 `schema = challengeSchema`로 조회해
  `refUID === settlementUID`인 것만 남긴다. **`revocationTime !== 0`인 것은 제외**한다
  (철회된 이의는 활성이 아니다).
- 목록 위에 **상시** 표시: `"조회된 것이 전부라는 보장은 없습니다."` (§10 인덱서 누락)
- 자기 이의 철회 버튼. 철회하면 같은 정산에 다시 제기할 수 있다(B8).

`filterActiveChallenges(logs, settlementUID)`를 순수 함수로 분리해 **테스트**:
철회된 것 제외 · 다른 정산 것 제외 · **입력 순서가 보존되는지**(정렬하지 않는다).

## W7 — `web/src/status.tsx` (F8)

`@poi/core`의 `deriveState`를 그대로 쓴다. verifier와 같은 코드다.

읽을 것: 결정 필드 · `settlement.activeHead(decisionUID)` · `revokeCount(decisionUID)` ·
활성 정산의 `time`.

- 7상태를 한국어로 표시한다:
  `NOT_REQUIRED` 예상 결과 없음 · `PENDING` 구간 시작 전 · `OBSERVING` 관측 중 ·
  `AWAITING` 정산 대기 · `OVERDUE` **정산 기한 초과** · `SETTLED` 정산됨 ·
  `SETTLED_LATE` 정산됨(기한 후)
- `hasRevokedSettlement`이면 **별도 줄**로 「정산 철회 이력 있음」을 항상 병기한다.
  상태와 합치지 말 것 — `OVERDUE + 철회 이력`이 "처음부터 정산하지 않음"과 구별되는 지점이다.
- 등급 2축을 `@poi/core`의 `formatGrade`로 표시한다(X6).
- `now`는 `deriveState`에 **인자로** 넘긴다. 화면에서 1초마다 갱신해 OVERDUE로 넘어가는 순간이
  보이게 한다(데모에서 이것이 보여야 한다).

`describeState(state)` 한국어 매핑을 순수 함수로 두고 **7상태 전부** 테스트한다.

## W8 — `web/src/reveal.ts` + `reveal.tsx` (F5, B10)

**클라이언트에서** commitment를 재계산해 대조한다. 서버를 신뢰하지 않는다.

### `web/src/reveal.ts` — 순수 함수

```ts
export interface RevealFile {
    version: "poi.reveal.v1";
    chainId: number;
    attester: Hex;
    attestationUID: Hex;
    tag: CommitTagName;          // DECISION | TRIGGER | EVIDENCE | REASON | NOTE
    salt: Hex;
    payload: unknown;            // JCS 대상 원본 객체
}

export function buildRevealFile(args: {...}): RevealFile;

/** 온체인 commitment와 대조. @poi/core의 verifyReveal을 쓴다 */
export function checkReveal(file: RevealFile, onChainCommitment: Hex): boolean;
```

### `reveal.tsx`

- 공개할 항목(결정 본문·트리거·근거·이유 중 선택)에 대해 `salt`와 `payload`를 입력받아
  **화면에서 즉시** commitment를 재계산해 온체인 값과 대조하고 결과를 보여준다.
- 일치하면 `RevealFile` JSON을 **다운로드**한다. 파일명:
  `reveals/<attestationUID>.<tag>.json`
- 불일치하면 발행/다운로드를 막고 이유를 표시한다: salt가 다르거나, payload가 다르거나,
  **다른 사람의 commitment**일 수 있다.
- 브라우저에서 GitHub에 커밋할 수 없으므로, 다운로드한 파일을 저장소 `reveals/`에 넣어
  push하라는 안내를 표시한다. **자동 업로드를 만들지 말 것** (토큰이 필요해진다).

### 테스트 — `web/test/reveal.test.ts`

| # | 내용 |
|---|---|
| 1 | 올바른 `(salt, payload)` → `checkReveal === true` |
| 2 | payload를 한 글자 바꾸면 → `false` |
| 3 | salt를 바꾸면 → `false` |
| 4 | **CT18** — attester만 다른 복사본 → `false`. 타인의 commitment를 복사해 붙일 수 없다 |
| 5 | `buildRevealFile`이 `version`·`chainId`를 채운다 |
| 6 | 파일명 규칙 `<uid>.<tag>.json` |

### `reveals/README.md`

- 파일 형식(`poi.reveal.v1`)과 필드 설명
- 검증 방법: `verifier`의 reveal CLI(V4)는 아직 없으므로, 지금은 **웹 UI에서 대조**한다고 적는다
- `salt`를 잃으면 영구히 공개할 수 없다는 것
- 공개는 **선택**이며 정산에 영향이 없다는 것

## 하지 말 것

- 디자인·UI 프레임워크 도입 금지.
- **이의 건수 표시·정렬·랭킹 금지.**
- reveal 자동 업로드(GitHub API) 금지 — 토큰 취급이 범위 밖이다.
- `result`를 사용자가 고르게 하지 말 것.
- 판정·상태 산술을 web에서 다시 구현하지 말 것 — `@poi/core`를 쓴다.
- `core/`·`contracts/`·`verifier/` 수정 금지. 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```
cd web && npx tsc --noEmit    # 오류 0
cd web && npm test            # 기존 16 + 새 테스트
cd web && npm run build       # 통과
cd core && npm test           # 54/54 회귀 없음
```
