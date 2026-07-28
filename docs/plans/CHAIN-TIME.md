# CHAIN-TIME 시각 판정을 전부 체인 기준으로

## 왜

E2E 회귀 2건이 같은 원인이다.

```
write.spec.ts › 결정 커밋은 백업 확인 뒤 발행되고 상태 조회가 된다
  Locator: getByRole('dialog', {name: 'salt 백업'})  — element(s) not found
write.spec.ts › 30분 graceSeconds는 한국어 오류로 발행을 막는다
```

`decision.tsx:54`

```ts
export function buildDecisionPayload(form: DecisionForm, now = Math.floor(Date.now() / 1000))
```

**브라우저 시계로 `windowStart`가 미래인지 판정한다.** 시드가 체인 제네시스를 3시간 전으로
옮기자 체인 시각이 실제 시각보다 뒤처졌고, 체인 기준으로 미래인 `windowStart`가
브라우저 기준으로는 과거라 사전 검증에 걸려 모달이 열리지 않는다.

**로컬 환경만의 문제가 아니다.** 컨트랙트의 I4는 `a.time`(블록 시각) 기준이다.
사용자 시계가 앞서 있으면 UI가 통과시킨 값이 온체인에서 `WindowInPast`로 튕기고,
뒤처져 있으면 정상인 입력을 UI가 막는다. `status.tsx`는 이미 체인 시각으로 고쳤는데
**결정 폼은 그대로 남아 있었다.**

## 파일

- 수정: `web/src/decision.tsx` — 체인 시각을 받아 쓴다
- 수정: `web/src/settlement.tsx`·`web/src/challenge.tsx` — 시각을 쓰는 자리가 있으면 같은 기준
- 수정: `web/src/App.tsx` — 체인 시각 공급
- 수정: `web/test/decision.test.ts` — 기존 테스트 유지(순수 함수는 `now`를 인자로 받는다)
- **그 외 수정 금지.** `core/`·`contracts/`·`verifier/`·`scripts/` 손대지 않는다.

## 고치는 방법

1. `App.tsx`가 `getChainTime()`으로 체인 시각을 받아 1초마다 로컬 증가시키고
   15초마다 재동기화한다. **`status.tsx`가 이미 하는 것과 같은 로직**이므로
   `web/src/chainClock.ts`로 **한 곳에 모으고 둘 다 그것을 쓴다.**
   같은 로직이 두 벌이 되면 갈라진다.

   ```ts
   export function useChainTime(): {now: bigint | undefined; skewSeconds: number | undefined};
   ```

   체인 시각을 아직 못 받았으면 `undefined`. 그동안 발행 버튼은 비활성이고
   `.doc-note`로 `"체인 시각을 확인하는 중입니다."`

2. `decision.tsx`가 `buildDecisionPayload(form, chainNow)`로 넘긴다.
   **`Date.now()` 기본값을 지우지 말 것** — 순수 함수의 테스트가 그것을 쓴다.
   호출부에서 명시적으로 넘기는 것으로 충분하다.

3. `windowStart` 기본값도 **체인 시각 + 5분**으로 잡는다(지금은 브라우저 시각 기준).

4. 시각 어긋남 안내(`clockSkewNotice`)를 상태 절뿐 아니라 **결정 커밋 절에도** 띄운다.
   되돌릴 수 없는 발행 직전이므로 여기가 더 중요하다.

## 검증

```
cd web && npm test              # 61 그대로 (순수 함수 시그니처를 바꾸지 않았으므로)
cd web && npx tsc --noEmit && npm run build
bash scripts/dev_up.sh && cd web && npm run test:e2e     # 15/15
```

**E2E 15/15가 이 항목의 완료 조건이다.**

---

## 리뷰 대응 R1 — E2E도 체인 시각을 써야 한다

제품은 고쳐졌다(14/15). 남은 실패는 **테스트가 브라우저 시각을 쓰기 때문**이다.

```
write.spec.ts › 과거 windowStart는 한국어 오류로 발행을 막는다
await decision.getByLabel("windowStart (Unix 초)").fill(String(Math.floor(Date.now()/1000) - 60));
```

체인 제네시스가 실제 시각보다 3시간 전이므로 `Date.now() - 60`은 **체인 기준으로 먼 미래**다.
그래서 사전 검증에 걸리지 않는다. 테스트가 의도한 상황을 만들지 못하고 있다.

### 고칠 것

`web/e2e` 전체에서 **시각을 쓰는 모든 자리**를 체인 시각 기준으로 바꾼다.

- 체인 시각은 `docs/fixtures/seed.json`의 `window`/최종 시각에서 얻거나,
  `e2e/fixtures.ts`에 `chainNow(): Promise<number>` 헬퍼를 두어 RPC로 읽는다.
  **후자를 권장** — 시드 이후 테스트가 시간을 옮길 수도 있다.
- "과거 windowStart" → `chainNow - 60`
- 유효한 window를 만드는 `fillValidOutcome` → `chainNow + 1800` 기준
- `Date.now()`가 `web/e2e` 안에 남아 있으면 안 된다. **전수로 확인할 것.**

### 검증

```
bash scripts/dev_up.sh && cd web && npm run test:e2e     # 15/15
```
