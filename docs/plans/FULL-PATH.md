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
