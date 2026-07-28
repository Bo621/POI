# FULL-PATH 성공 경로 전체를 UI에서 끝까지

## 왜 — 이것이 배포 게이트다

`PLAN.md` §5 완료 정의: *"프론트에서 커밋 → 정산 → 이의 → reveal 전 경로 동작"*.

지금 E2E 15건이 덮는 쓰기 경로는 **결정 커밋 하나**다. 정산 발행·이의 발행·
reveal 다운로드는 **자동으로도 손으로도 완주한 적이 없다.**
심사자가 "직접 해 보라"고 하면 지금은 보여줄 수 없다.

배포해도 이건 안 고쳐진다. **배포 전에 닫는다.**

## 파일

- 새로: `web/e2e/fullpath.spec.ts`
- 수정: `web/e2e/fixtures.ts` — 필요한 헬퍼만
- 수정: `web/src/*` — **실패 원인이 제품에 있을 때만.** 테스트를 맞추려고 제품을 바꾸지 말 것
- **그 외 수정 금지.** `core/`·`contracts/`·`verifier/`·`scripts/` 손대지 않는다.

## 시나리오 — 한 테스트로 끝까지 간다

중간에 끊으면 "각 단계가 따로 된다"까지만 증명된다. **하나의 테스트가 처음부터 끝까지** 간다.

```
계정 A로 연결
 1  저널 작성 → 저장 → 목록에 나타난다 (오프체인)
 2  저널 항목을 노트로 승격 → 온체인 발행 → tx 해시가 화면에 보인다
 3  결정 커밋
      - 승격한 노트 UID를 promotedFromNote 에 넣는다
      - 예상 결과 선언: 지표 BTC_PRICE_KRW_AT_END, op GTE, threshold 는 아래 참조
      - window: chainNow+120 ~ chainNow+240  (2분 구간, grace 1시간)
      - salt 백업 확인 전 발행 버튼 비활성 → 확인 후 활성 → 발행
      - tx 해시가 보인다. decisionUID 를 잡아 둔다
 4  상태 조회 → 인장 `대기`(PENDING)
 5  시간을 windowEnd 이후로 민다  (evm_increaseTime + evm_mine, 테스트에서 RPC 직접 호출)
 6  상태 조회 → 인장 `정산대기`(AWAITING)
 7  정산 발행
      - decisionUID 입력 → "정산 확인" → 판정이 표시된다
      - 관측값은 **UI가 계산하지 않는다.** 사람이 넣는다 → 테스트가 넣는다
      - 발행 → tx 해시가 보인다
 8  상태 조회 → 인장 `정산완료`(SETTLED)
 9  계정 B로 바꿔 이의 발행 → tx 해시가 보인다
10  이의 목록 조회 → 1건 보이고 **건수 숫자가 없다**
11  다시 A로 바꿔 reveal
      - attestationUID = 3에서 만든 decisionUID
      - salt·payload = 3에서 쓴 값 (테스트가 기억한다)
      - "commitment가 일치합니다." → 다운로드 버튼 활성
12  reveal 다운로드 → 파일이 실제로 받아진다 (Playwright `waitForEvent("download")`)
      파일 내용이 `poi.reveal.v1` 이고 attestationUID 가 맞는지 확인
```

### 관측값과 임계값

7단계의 관측값은 **실제 업비트 값이 아니어도 된다** — 컨트랙트가 강제하는 것은
"값과 결과의 일치"이지 "값이 참인지"가 아니다(B6). 그래서:

```
threshold      = 90000000
관측값(입력)    = 92000000        → GTE 이므로 result = OBSERVED
```

verifier 대조는 시드 fixture(F1·F2)가 이미 담당한다. 여기서 보는 것은
**UI 경로가 끝까지 이어지는가**다.

### salt 백업

3단계에서 모달이 열리면 salt를 **화면에서 읽어 테스트가 보관**한다.
11단계에서 그 값을 그대로 쓴다. 파일 다운로드로 받아도 되지만,
화면에서 읽는 쪽이 "사용자가 실제로 보는 값"과 같다.

### 시간 이동

`e2e/fixtures.ts`에 헬퍼를 둔다.

```ts
export async function advanceChain(rpcUrl: string, seconds: number): Promise<void>;
// evm_increaseTime → evm_mine.  fetch 로 JSON-RPC 직접 호출.
```

**`evm_mine`을 트랜잭션 전송과 겹치게 부르지 말 것** — anvil 1.7.1이 패닉한다
(`SEED.md` R3). 테스트는 순차 실행이므로 겹칠 일이 없지만, 규칙으로 적어 둔다.

시간을 민 뒤 화면이 따라오려면 **최대 15초**가 걸린다(`chainClock`의 재동기화 주기).
새로고침하거나 `expect(...).toBeVisible({timeout: 20000})`으로 기다린다.

## 계정 전환

`e2e/fixtures.ts`의 주입 provider가 계정을 바꿀 수 있어야 한다.
`eth_accounts`/`eth_requestAccounts`가 돌려주는 주소를 **테스트가 지정**한다.
페이지를 새로 열고 다른 주소로 주입하는 방식이 가장 단순하다 —
`accountsChanged` 이벤트까지 흉내 낼 필요는 없다.

## 실패했을 때

**테스트를 느슨하게 고치지 말 것.** 각 단계에서 막히면:

1. 화면의 `role="alert"` 문구를 출력한다
2. 그것이 **제품 결함**이면 `web/src`를 고친다 (지금까지 E2E가 잡은 것들이 그랬다)
3. 테스트가 잘못 짚은 것이면 테스트를 고친다
4. **어느 쪽인지 판단한 근거를 보고에 적는다**

## 검증

```
bash scripts/dev_up.sh
cd web && npm run test:e2e      # 15 + 1 = 16/16
cd web && npm test              # 61 회귀 없음
cd web && npx tsc --noEmit && npm run build
```

**16/16이 이 항목의 완료 조건이다.** 새 테스트 하나가 통과하면
"프론트에서 커밋 → 정산 → 이의 → reveal 전 경로 동작"이 자동으로 증명된다.

---

## 리뷰 대응 R1 — `[P1]` 발행이 revert해도 UI가 이유를 말하지 않는다

성공 경로가 3단계(결정 커밋)에서 멈춘다. 화면에 남은 문구:

```
alert: 발행 영수증에서 UID를 찾지 못했습니다.
```

노트 발행(2단계)은 성공했다(영수증이 렌더링됐다). 결정 발행은 **트랜잭션이 나갔지만
revert했고, 영수증에 로그가 없어 UID를 못 찾은 것**이다.

문제는 그 다음이다. **사용자에게 "왜 실패했는지"가 전달되지 않는다.**
X7이 리졸버 에러 57종을 한국어로 매핑해 뒀는데 **그 경로가 닿지 않는다.**
`messageFromRevert`가 호출되지 않는 것이다.

되돌릴 수 없는 발행에서 이유 없는 실패는 제품으로서 결함이다. 게다가 가스도 이미 썼다.

### 고칠 것 1 — 보내기 전에 시뮬레이션한다

`web/src/eas.ts`의 발행 경로가 `writeContract`를 바로 부른다.
**`simulateContract`를 먼저 부른다.**

```
simulateContract → 실패하면 그 오류에서 revert data를 뽑아
                   @poi/core 의 messageFromRevert 로 한국어 메시지를 만든다
               → 트랜잭션을 보내지 않는다 (가스를 쓰지 않는다)
             성공하면 그 request 로 writeContract
```

viem 오류에서 revert data를 얻는 방법은 `viem`의 `BaseError.walk()`로
`ContractFunctionRevertedError` / `RawContractError`를 찾아 `data`를 읽는 것이다.
**정확한 타입은 설치된 viem 버전에서 확인할 것. 추측 금지.**

매핑에 없는 셀렉터면 원문 그대로 보여준다 — 숨기지 말 것.

### 고칠 것 2 — 영수증도 status를 본다

시뮬레이션을 통과했는데도 온체인에서 revert할 수 있다(상태가 그 사이 바뀐 경우).
`waitForTransactionReceipt`의 `receipt.status`가 `"reverted"`면
`"트랜잭션이 온체인에서 실패했습니다."` + tx 해시를 보여준다.
**"UID를 찾지 못했습니다"로 뭉개지 말 것.**

### 고칠 것 3 — 그래서 왜 revert했는가

1·2를 고치면 다음 실행에서 **한국어 사유가 화면에 뜬다.** 그것을 보고 고친다.

유력한 후보(추측이며, 사유를 보고 판단할 것):

| 후보 | 확인 |
|---|---|
| `WindowInPast` (I4) | `chainClock`이 최대 15초 뒤처질 수 있다. `windowStart = 체인시각 + 120`이 발행 시점엔 이미 과거일 수 있다 |
| `NoteNotEarlier` | 승격 노트의 `time`이 결정의 `time`보다 앞서야 한다 |
| `MalformedPayload` | 평면 튜플 길이 |

`WindowInPast`가 원인이면 **여유를 늘리는 것으로 때우지 말 것.**
사용자도 같은 문제를 겪는다 — `windowStart` 기본값과 검증이
**발행 직전의 체인 시각**을 쓰도록 고쳐야 한다(시뮬레이션이 그 시점 상태로 판정하므로
1번을 고치면 최소한 가스를 버리지는 않는다).

### 검증

```
bash scripts/dev_up.sh && cd web && npm run test:e2e     # 16/16
```

그리고 **일부러 실패하는 발행**(예: 과거 window를 강제로 넣은 상태)에서
화면에 한국어 사유가 뜨는 것을 확인한다.

---

## 리뷰 대응 R2 — 정산 단계 선택자 중복

R1 이후 결정 커밋이 통과한다(`NoteNotEarlier`가 원인이었고, anvil이 노트와 결정을
같은 타임스탬프로 채굴할 수 있어 테스트가 1초를 민다). 이제 7단계(정산)에서 멈춘다.

```
strict mode violation: getByLabel('관측값') resolved to 2 elements:
  1) checkbox  "관측값 없음"
  2) textbox   "관측값"
```

**테스트 선택자 문제다.** `getByLabel`은 부분 일치라 `"관측값 없음"`도 잡는다.

### 고칠 것

- `web/e2e` 전체에서 `getByLabel`을 쓰는 자리를 훑어 **모호한 것에 `{exact: true}`를 준다.**
  `관측값` 하나만 고치고 끝내지 말 것 — 같은 함정이 다른 라벨에도 있다
  (`decisionUID`·`settlementUID`·`salt`·`payload` 등 접두어가 겹치는 것들).
- 나머지 단계(8~12)는 아직 실행된 적이 없다. **거기서 또 막히면 R3로 이어간다.**

### 참고 — 제품 쪽은 그대로 둔다

`"관측값 없음"` 체크박스와 `"관측값"` 입력이 나란히 있는 것은 자연스러운 UI다.
라벨을 바꾸는 것은 테스트 편의를 위해 제품을 바꾸는 것이므로 하지 않는다.

### 검증

```
bash scripts/dev_up.sh && cd web && npm run test:e2e     # 16/16
```

---

## 리뷰 대응 R3 — 정산에서 소유자 판정에 걸린다

R2 이후 정산 단계까지 왔다. 화면 문구:

```
alert: 결정 작성자만 정산할 수 있습니다.
```

**그런데 테스트는 결정 작성자 본인(A)으로 접속해 있다.**

`settlement.tsx:105`

```ts
if (!address || record.attester.toLowerCase() !== address.toLowerCase()) {
    throw new Error("결정 작성자만 정산할 수 있습니다.");
}
```

주소 비교는 대소문자를 무시하므로 그쪽 문제가 아니다.
**`!address`(지갑 미연결)와 소유자 불일치가 같은 문구로 뭉개져 있다.**

### 고칠 것 1 — `[P2]` 두 상황을 분리한다 (제품)

```ts
if (!address) throw new Error("먼저 지갑을 연결해 주세요.");
if (record.attester.toLowerCase() !== address.toLowerCase()) {
    throw new Error("결정 작성자만 정산할 수 있습니다.");
}
```

**같은 패턴이 다른 화면에도 있는지 훑을 것**(`challenge.tsx`·`decision.tsx`·`note.tsx`).
"왜 막혔는지"를 사용자가 알 수 없는 문구는 되돌릴 수 없는 발행 앞에서 특히 나쁘다.

### 고칠 것 2 — 진짜 원인을 규명한다

1번을 고치면 다음 실행에서 **어느 쪽인지 화면에 뜬다.**

- `"먼저 지갑을 연결해 주세요."`가 뜨면 → **테스트가 정산 전에 연결을 잃었다.**
  주입 provider나 페이지 전환을 확인한다. 필요하면 정산 직전에 다시 연결한다.
- `"결정 작성자만…"`이 그대로 뜨면 → 연결된 주소가 A가 아니거나
  `record.attester`를 잘못 읽고 있다. `read.ts`의 결정 조회를 확인한다.

**추측으로 고치지 말 것.** 다음 실행의 문구를 보고 판단한다.

### 나머지 단계

8~12(정산 후 상태·이의·목록·reveal·다운로드)는 아직 한 번도 실행된 적이 없다.
거기서 막히면 R4로 이어간다. **끝까지 간 뒤에 완료다.**

### 검증

```
bash scripts/dev_up.sh && cd web && npm run test:e2e     # 16/16
```
