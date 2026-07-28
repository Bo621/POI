# SEED 로컬 포크 시드 + 시나리오 결함 수정

`docs/plans/TEST-SCENARIO.md`의 초안에 codex가 결함 4건을 지적했다. 전부 타당했다.
이 문서가 그것을 고친 최종 설계다. **TEST-SCENARIO.md는 참고용으로 남기고 이 문서를 따른다.**

## 파일

- 새로: `contracts/script/SeedFixtures.s.sol` — 단계별 시드
- 새로: `scripts/dev_up.sh` · `scripts/dev_down.sh`
- 새로: `scripts/observe.ts` — provider로 fixture 관측값을 미리 계산 (node)
- 새로: `docs/fixtures/seed.json` — 시드 결과 (커밋)
- 새로: `docs/TEST_SCENARIO.md` — 사람이 따라가는 체크리스트
- 수정: `web/src/read.ts` — `getChainTime()` 추가
- 수정: `web/src/status.tsx` — 체인 시간 기준으로
- 수정: `web/src/config.ts` — 리졸버 주소 4종 환경변수
- 수정: `web/.env.example` · `.gitignore`(`web/.env.local`)
- 수정: `web/test/` — 시계 관련 테스트 추가
- **`docs/metrics/*.md` 수정 금지** (바이트가 `definitionHash`다).
- `core/`·`verifier/src/` 수정 금지.

---

## 1. `[P1]` `status.tsx`가 브라우저 시계를 쓴다

`web/src/status.tsx:42`가 `Date.now()`로 `deriveState`의 `now`를 만든다.

1. 시드는 체인 시간을 앞뒤로 옮긴다. 브라우저 시계는 그대로라 **OVERDUE fixture가
   화면에서 OVERDUE로 보이지 않는다.** 시나리오가 성립하지 않는다.
2. 실제 배포에서도 사용자 시계가 틀어지면 온체인과 다른 상태를 보여준다.
   상태는 온체인 사실에서 파생되는 값인데 클라이언트 시계에 의존하면 그 성질이 깨진다.

### 고치는 방법

`read.ts`에 `getChainTime(): Promise<bigint>` (`publicClient.getBlock()`의 `timestamp`,
`withRetry` 경유).

`status.tsx`:

- 조회할 때 `getChainTime()`을 받아 기준으로 삼는다
- 1초마다 로컬에서 +1n 해 나간다 (매초 RPC를 때리지 않는다)
- **15초마다 재동기화**한다. 시드가 시간을 점프시켜도 15초 안에 따라잡는다
- 브라우저 시각과 **60초 이상** 차이나면 `.notice--quiet`로
  `"기기 시각이 체인과 N초 차이납니다. 표시는 체인 시각을 기준으로 합니다."`

순수 함수로 분리해 테스트한다:

```ts
export function clockSkewNotice(chainNow: bigint, browserNow: bigint): string | undefined
```

| 테스트 | |
|---|---|
| 차이 0 / 59초 | `undefined` |
| 60초 / 3600초 | 문구, 차이 값이 들어 있다 |
| 체인이 **뒤처진** 경우(음수 차이)도 절댓값으로 판정 | 문구 |

---

## 2. `[P1]` 시간 설계 — `vm.warp`는 외부 anvil을 움직이지 않는다

`forge script --broadcast`의 `vm.warp`는 **시뮬레이션에만** 적용된다. 실제 노드 시각은
그대로다. 그래서 시드를 **단계로 쪼개고, 단계 사이에 셸에서 시각을 옮긴다.**

```bash
cast rpc evm_setNextBlockTimestamp <unix> --rpc-url http://127.0.0.1:8545
cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

### 타임라인 — 구간을 **실제 과거**에 둔다

업비트 봉은 실제 시각에만 존재한다. fixture의 관측 구간이 미래면 provider가 데이터를
가져올 수 없다. 그래서 **체인 시각을 실제 시각보다 80분 뒤로 되돌린 뒤 앞으로 감는다.**

```
T0 = 분 경계로 내림( 실제 now - 4800초 )      # 80분 전

단계 1  @ T0            배포 · addMetric ×2 · 결정 5건 발행
단계 2  @ T0 + 700      F1·F2 정산 (관측값은 provider가 실제 봉으로 계산한 값)
단계 3  @ T0 + 800      F2 정산 철회 → supersedes로 재발행 · B가 이의 · B가 복사 결정 발행
단계 4  @ 실제 now      최종. F4가 OVERDUE에 도달해 있다
```

각 결정의 window:

| fixture | windowStart | windowEnd | grace | 최종 상태 |
|---|---|---|---|---|
| F1 SETTLED | `T0+60` | `T0+660` | 1시간 | `SETTLED` |
| F2 철회→정정 | `T0+60` | `T0+660` | 1시간 | `SETTLED` + 철회 이력 |
| F4 OVERDUE | `T0+60` | `T0+660` | 1시간 | `OVERDUE` (`T0+4260`에 도달, 최종 `T0+4800` > 그것) |
| F5 진행 전 | `T0+7200` | `T0+93600` | 1시간 | `PENDING` (최종 `T0+4800` < `T0+7200`) |

**F5가 F4 점프 후에도 PENDING이다** — 초안의 자기모순을 이렇게 없앤다.

I4(`windowStart >= attestTime`)를 지키려면 결정은 전부 단계 1(`T0`)에 발행돼야 한다.
`T0+60 >= T0` 이므로 성립한다.

### `SeedFixtures.s.sol` 구조

`vm.envUint("SEED_PHASE")`로 분기한다. 단계 사이의 상태는 **파일이 아니라 환경변수**로
넘긴다(셸이 파싱해 다음 단계에 준다) — `forge script`는 상태를 들고 있지 않다.

```
PHASE=1  → 배포 + addMetric + 결정 **4건**(F1·F2·F4·F5). 주소·UID를 console2.log로 출력
           F3(이의 있음)는 별도 결정이 아니라 F1의 정산에 이의를 붙인 것이다.
           f_copy(CT18용)는 B가 단계 3에서 발행한다
PHASE=2  → 환경변수로 받은 decisionUID·관측값으로 F1·F2 정산
PHASE=3  → F2 철회 + 정정 재발행, B 이의, B 복사 결정
```

`--private-key`는 anvil 기본 계정. **anvil 로컬이므로 `--broadcast`를 쓴다.**
공개 네트워크가 아니다.

---

## 3. `[P1]` 관측값은 provider가 계산한 실제 값

초안은 `92,000,000` 같은 임의값을 썼다. 그러면 verifier가 `MATCH`를 낼 수 없다.

`scripts/observe.ts`가 단계 2 직전에 실행된다:

```
node --experimental-strip-types scripts/observe.ts <metricName> <windowStart> <windowEnd>
→ stdout에 한 줄:  <scaledValue>  (bigint 문자열)
```

`verifier`의 `defaultProviders()`와 `core`의 `scale`을 그대로 쓴다. **다시 구현하지 말 것.**
`insufficient`면 비영 종료코드로 끝내고 셸이 시드를 중단한다 —
관측값 없이 fixture를 만들면 verifier 대조가 무의미하다.

| fixture | 지표 | 임계 |
|---|---|---|
| F1 | `BTC_PRICE_KRW_AT_END` | 관측값보다 **낮은** 값으로 잡아 `OBSERVED`가 나오게. 셸이 `관측값 - 1000000`으로 계산 |
| F2 | `BTC_MAX_DRAWDOWN_IN_WINDOW` | 관측값보다 **높은** 값(`관측값 + 50`)으로 잡아 `NOT_OBSERVED`가 나오게 |
| F4 | `BTC_PRICE_KRW_AT_END` | 아무 값(정산하지 않는다) |
| F5 | `BTC_PRICE_KRW_AT_END` | 아무 값 |

F2의 **철회된 S1**은 일부러 틀린 관측값(`실제값 + 500`)을 쓴다.
정정 후 S2가 실제값이다. 그래야 "정정하면 verifier가 통과한다"를 보여줄 수 있다.

> S1도 컨트랙트의 자기정합 검사는 통과해야 한다 — `result`를 그 관측값에 맞게 계산해 넣는다.
> 컨트랙트가 강제하는 것은 "값과 결과의 일치"이지 "값이 참인지"가 아니다. **그것이
> Challenge가 존재하는 이유다**(§6.4 B6). 이 fixture가 그 구조를 그대로 보여준다.

---

## 4. `[P1]` CT18 — 진짜 복사 공격

초안의 S8은 F1↔F2 UID를 바꾸는 것이었는데 **둘 다 A가 발행**해서 복사 공격이 아니다.

단계 3에서 **B가** 결정을 하나 발행한다. 그 결정의 `decisionCommitment`는
**A의 F1 결정 것을 그대로 복사한 값**이다.

```
f_copy.decisionCommitment == f1.decisionCommitment      (바이트 동일)
f_copy.attester           == B
```

시나리오에서 A의 `(salt, payload)`로 `f_copy`를 공개 대조하면 **실패해야 한다** —
`attester`가 프리이미지에 들어가기 때문이다(B3). 이것이 CT18이다.

`seed.json`에 `f_copy.decisionUID`와 "A의 salt/payload로 대조하면 실패한다"를 적는다.

---

## 5. `scripts/dev_up.sh`

```
1  기존 anvil 종료
2  anvil --fork-url $RPC --fork-block-number 31820323 --port 8545 기동, 대기
3  T0 계산
4  observe.ts 로 F1·F2 관측값 계산      → 실패하면 중단
5  evm_setNextBlockTimestamp(T0) + evm_mine
6  PHASE=1 forge script --broadcast     → 주소·UID 파싱
7  시각을 T0+700 으로 → PHASE=2
8  시각을 T0+800 으로 → PHASE=3
9  시각을 실제 now 로  → evm_mine
10 docs/fixtures/seed.json 생성
11 web/.env.local 생성
12 사람이 읽을 요약 출력 (fixture별 UID·기대 상태·verifier 명령)
```

> **관측값 계산이 발행보다 먼저인 이유**: 결정의 `outcomeThreshold`는 발행 시점에 확정되고
> 이후 바꿀 수 없다. 임계값을 관측값 기준으로 잡으려면 관측값을 먼저 알아야 한다.
> 구간 `[T0+60, T0+660]`은 실행 시점 기준으로 이미 **과거**라 봉이 존재한다 —
> 그래서 발행 전에 계산할 수 있다. (codex 리뷰 지적)

- `set -euo pipefail`. 각 단계 실패 시 anvil을 내리고 비영 종료.
- 파싱은 `forge script`의 `console2.log` 출력을 `grep`/`sed`로. **JSON 출력이 있으면 그쪽을 쓴다.**
- 두 번 실행해도 같은 결과여야 한다(anvil을 새로 띄우므로 결정적). 단 `T0`는 실행 시각에
  따라 달라진다 — 그건 의도된 것이다(실제 봉이 필요하다).

`web/.env.local`:

```
VITE_RPC_URL=http://127.0.0.1:8545
VITE_NOTE_SCHEMA_UID=0x…
VITE_DECISION_SCHEMA_UID=0x…
VITE_SETTLEMENT_SCHEMA_UID=0x…
VITE_CHALLENGE_SCHEMA_UID=0x…
VITE_NOTE_RESOLVER=0x…
VITE_DECISION_RESOLVER=0x…
VITE_SETTLEMENT_RESOLVER=0x…
VITE_CHALLENGE_RESOLVER=0x…
```

`.gitignore`에 `web/.env.local`을 넣는다.

## 6. `web/src/config.ts`

리졸버 주소 4종을 환경변수로 받는다. `isDeployed()`는 **스키마 UID 4종 + 리졸버 4종**이
모두 채워졌을 때만 true.

## 7. `docs/TEST_SCENARIO.md` — 사람이 따라가는 체크리스트

`SUBMISSION.md` §4가 요구하는 **성공 경로 1회**를 포함한다.

| 절 | 내용 |
|---|---|
| S0 | `dev_up.sh` 실행 → 요약 출력 확인. MetaMask에 localhost:8545 / chainId 91342 추가 |
| S1 | 배포 인식 — `.env.local` 전/후 |
| S2 | 지갑 A 연결. 미검증 배지 + UID 미해결 안내 |
| S3 | **상태 인장 4종** — F1 `정산완료` · F2 `정산완료`+철회 이력 · F4 **`기한초과`** · F5 `대기` |
| S4 | `evm_increaseTime`으로 F5를 `관측중` → `정산대기` → `기한초과`로. **경계 `t=W`, `t=W+G`** |
| S5 | 이의 목록 — 건수 없음 · 정렬 없음 · 검증 지갑 병기 · "조회된 것이 전부라는 보장은 없습니다" |
| S6 | 사전 검증 5종 + salt 백업 게이트 |
| S7 | 컨트랙트 오류 3종이 **한국어로** — C로 정산(`NotDecisionOwner`) · 중복 정산(`PriorStillActive`) · B로 중복 이의(`AlreadyChallenged`) |
| S8 | **CT18** — A의 salt/payload로 `f_copy` 대조 → 실패 · F1 대조 → 성공 |
| S9 | **성공 경로 1회** — 저널 → 노트 승격 → salt 백업 → 결정 커밋 → (시간 점프) → 정산 → B로 이의 → reveal |
| S10 | **verifier** — `poi-verify <f1.decisionUID> --rpc http://127.0.0.1:8545 --json` → `MATCH`, 종료코드 0. F2의 철회된 S1이 아니라 활성 S2를 본다 |

각 항목에 **기대 화면**과 **어긋나면 무엇이 잘못된 것인지**를 적는다.

## 하지 말 것

- 공개 테스트넷에 아무것도 보내지 말 것. anvil은 로컬이다.
- 앱에 개발용 지갑 모드를 넣지 말 것.
- `docs/metrics/*.md` 수정 금지.
- 관측값을 손으로 지어내지 말 것 — provider가 계산한 값만 쓴다.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```
bash scripts/dev_up.sh                # 성공, 요약 출력
cd web && npm test                    # 40 + 시계 테스트
cd web && npx tsc --noEmit && npm run build
cd contracts && forge test            # 150/150 회귀 없음
```
