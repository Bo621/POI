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

---

## 리뷰 대응 R1 — 실제로 돌려보니 시드가 완주하지 못한다

Claude가 `RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh`로 실행해 확인한 것.

### 증상 1 — 온디맨드 채굴에서 `forge script --broadcast`가 멈춘다

anvil 기본은 **트랜잭션이 올 때만 블록을 만든다.** `forge script --broadcast`는 브로드캐스트
후 확인(confirmation) 블록을 기다리는데, 더 이상 트랜잭션이 없으니 새 블록이 나오지 않아
`eth_blockNumber`를 무한 폴링한다. 15분 넘게 진행되지 않았다(트랜잭션 18건, 블록 6개).

### 증상 2 — `--block-time`을 주면 anvil이 **크래시**한다

`--block-time 1`로 자동 채굴을 켜면 phase 1은 통과하지만 이후 anvil이 죽는다.

```
anvil::eth::backend::mem::Backend<N>::do_mine_block::{{closure}}
core::result::unwrap_failed  →  panic  →  Abort trap: 6
```

자동 채굴기와 `evm_setNextBlockTimestamp`가 같이 쓰이면 anvil이 패닉한다.
**`--block-time`은 해법이 아니다.**

### 고치는 방법

세 가지를 함께 바꾼다.

1. **`--block-time`을 쓰지 않는다.** 온디맨드 채굴을 유지한다.
2. **`evm_setNextBlockTimestamp`를 쓰지 않는다.** 대신 현재 체인 시각을 읽어 상대 증가로 옮긴다:

   ```bash
   now_ts=$(cast block latest --rpc-url "$LOCAL_RPC" --json | ...timestamp...)
   delta=$(( target - now_ts ))
   [ "$delta" -gt 0 ] && cast rpc evm_increaseTime "$delta" --rpc-url "$LOCAL_RPC"
   cast rpc evm_mine --rpc-url "$LOCAL_RPC"
   ```

   `evm_increaseTime`은 상대 증가라 자동 채굴기와 충돌하지 않는다.
   `delta <= 0`이면 시각을 되돌리려는 것이므로 **오류로 중단**한다(타임라인 설계가 틀린 것이다).

3. **`forge script`에 `--slow`를 준다.** 트랜잭션을 하나씩 보내고 각 영수증을 기다리므로
   온디맨드 채굴에서 매 트랜잭션이 블록을 만들어 확인이 진행된다.

각 phase 뒤에 `cast rpc evm_mine`을 한 번 더 호출해 다음 단계의 기준 시각을 확정한다.

### 검증

```bash
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh
```

**끝까지 완주해서 요약을 출력해야 한다.** phase 1만 통과하고 멈추면 고쳐진 것이 아니다.
완주 후:

- `docs/fixtures/seed.json`에 F1·F2·F4·F5·f_copy의 실제 UID가 들어 있다
- `web/.env.local`이 생성돼 있다
- `cast call <settlement resolver> "activeHead(bytes32)(bytes32)" <f1.decisionUID>` 가 0이 아니다
- `cast call <settlement resolver> "revokeCount(bytes32)(uint32)" <f2.decisionUID>` 가 1이다

---

## 리뷰 대응 R2 — 확인 블록 문제의 진짜 해법 + 실패 원인이 안 보인다

### 1. `--slow`로도 멈춘다. 블록 티커가 답이다 (검증됨)

R1의 `--slow`는 **효과가 없었다.** 블록이 60초간 정지한 것을 확인했다
(`31820341`에서 멈춤, 트랜잭션 17건).

살아 있는 프로세스에 대고 `cast rpc evm_mine`을 한 번 호출하자 **forge가 즉시 완료**했다.
원인이 확정됐다: **forge는 마지막 트랜잭션의 확인(confirmation) 블록을 기다리고,
온디맨드 anvil은 트랜잭션이 없으면 블록을 만들지 않는다.**

`--block-time`은 anvil을 패닉시키므로(R1) 쓸 수 없다. 그래서 **블록 티커**를 쓴다.

```bash
# forge script를 돌리는 동안 백그라운드에서 블록을 찍어준다
start_ticker() {
    ( while :; do cast rpc evm_mine --rpc-url "${LOCAL_RPC}" >/dev/null 2>&1; sleep 1; done ) &
    TICKER_PID=$!
}
stop_ticker() { [ -n "${TICKER_PID:-}" ] && kill "${TICKER_PID}" 2>/dev/null || true; TICKER_PID=""; }
```

- 각 `forge script` 호출 **직전에 start, 직후에 stop**한다.
- `trap`에서도 반드시 죽인다 — 남으면 체인 시각이 계속 흘러 다음 단계의 타임라인이 깨진다.
- 티커가 도는 동안 블록마다 시각이 1초씩 오르므로, **각 phase의 트랜잭션 수만큼 시각이
  앞당겨진다.** 타임라인을 잡을 때 이 여유를 고려한다(아래 2번과 함께).

### 2. `[P1]` 결정 발행 하나가 revert하는데 이유가 화면에 안 나온다

실행 결과: `Error: Transaction Failure: 0xa64274…` — **어떤 불변식에 걸렸는지 알 수 없다.**

브로드캐스트 기록을 디코딩해 보면 그 트랜잭션은 `poi.decision.v1` 발행이고
`windowStart = T0+60`, `windowEnd = T0+660`, `graceSeconds = 3600`,
`outcomeThreshold = 1`이다.

**가장 유력한 원인은 `WindowInPast`(I4)다.** 티커/채굴로 체인 시각이 흘러
발행 시점이 `windowStart`를 넘어섰을 수 있다. `windowStart = T0 + 60`은
phase 1의 트랜잭션 수(리졸버 4종 배포 + 스키마 4종 등록 + initialize 4회 + addMetric 2회 +
결정 4건 ≈ 18건)를 고려하면 **여유가 너무 적다.**

두 가지를 함께 고친다.

**(a) 여유를 늘린다.** 모든 결정의 `windowStart`를 `T0 + 60` → **`T0 + 1800`**(30분)으로
바꾸고, 그에 맞춰 뒤 단계도 민다.

```
T0        = 분 경계로 내림( 실제 now - 10800 )      # 3시간 전으로 넉넉히
windowStart = T0 + 1800
windowEnd   = T0 + 2400          # 10분 구간
phase 2   @ T0 + 2500
phase 3   @ T0 + 2600
F4 OVERDUE 도달 = windowEnd + 3600 = T0 + 6000
F5 windowStart  = T0 + 14400,  windowEnd = T0 + 100800
최종      @ 실제 now (= T0 + 10800)  →  F4 OVERDUE ✓,  F5 PENDING ✓
```

관측 구간 `[T0+1800, T0+2400]`은 실행 시점 기준 **약 2시간 20분 전**이므로 업비트 봉이 존재한다.

**(b) 실패하면 원인을 출력한다.** `forge script` 실패 시 스크립트가 그냥 죽지 말고,
브로드캐스트 JSON에서 실패한 트랜잭션 해시를 찾아 `cast run <hash> --rpc-url ...`을
실행해 **revert 사유를 그대로 출력**한다. 그래야 다음에 추측하지 않는다.

anvil을 죽이기 **전에** 실행해야 한다 — 지금 트랩은 먼저 죽여서 조사가 불가능하다.
`KEEP_ANVIL_ON_FAILURE=1` 환경변수를 두어, 설정되면 실패해도 anvil을 남긴다.

### 검증

```bash
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh
```

**끝까지 완주해 요약을 출력해야 한다.** 실패하면 revert 사유가 화면에 나와야 한다.

---

## 리뷰 대응 R3 — `forge script --broadcast`를 버리고 `cast send`로 간다

### 확정된 사실

anvil **1.7.1**은 명시적 `evm_mine`(`EthApi::mine_one`)이 트랜잭션 채굴과 겹치면
`Backend::do_mine_block`에서 `unwrap_failed` → **패닉(Abort trap: 6)** 한다.

```
anvil::eth::backend::mem::Backend<N>::do_mine_block::{{closure}}
anvil::eth::api::EthApi::mine_one::{{closure}}
core::result::unwrap_failed
```

그래서 R1의 `--block-time`도, R2의 블록 티커도 **같은 버그를 친다.** 둘 다 쓸 수 없다.

한편 `forge script --broadcast`는 마지막 트랜잭션의 **확인 블록**을 기다리는데
온디맨드 anvil은 그 블록을 만들지 않는다. `forge script`에는 `--confirmations` 옵션이 **없다.**
`--slow`로도 해결되지 않는 것을 확인했다.

`cast send`에는 `--confirmations`와 `--async`가 있다. **전송을 `cast send`로 옮긴다.**

### 설계

`SeedFixtures.s.sol`은 **상태를 바꾸지 않는 계산 전용**으로 바꾼다.
브로드캐스트를 하지 않으므로 forge의 확인 대기가 아예 없다.

```
SeedFixtures.s.sol  (view/pure, --broadcast 없이 실행)
    입력: T0, 관측값, 스키마 UID 등 (환경변수)
    출력: console2.log 로 각 트랜잭션의 to·calldata·from(A/B) 을 한 줄씩
          형식:  TX <A|B> <to> <calldata>
```

`dev_up.sh`가 그 줄들을 읽어 순서대로 보낸다.

```bash
cast send "$to" "$calldata" --private-key "$key" \
    --rpc-url "$LOCAL_RPC" --confirmations 1
```

- `cast send`는 **영수증만 기다린다.** 온디맨드 anvil이 트랜잭션마다 블록을 만드니 즉시 돌아온다.
- 별도의 채굴 호출이 없으므로 anvil 버그를 건드리지 않는다.
- 실패하면 `cast send`가 비영으로 끝나고 stderr에 revert 사유가 그대로 나온다.
  **R2가 원했던 진단이 공짜로 얻어진다.**

배포(리졸버 4종)만은 calldata가 아니라 바이트코드다. `cast send --create <bytecode>`를 쓰고
반환된 주소를 영수증에서 읽는다. 컨트랙트 바이트코드는
`forge inspect <컨트랙트> bytecode`로 얻는다.

스키마 UID·attestation UID처럼 **반환값이 필요한 호출**은 `cast call`로 먼저 결과를 얻고
(같은 블록 상태에서) `cast send`로 실제 전송한 뒤, 영수증 로그에서 UID를 확인한다.
EAS는 `Attested(address,address,bytes32,bytes32)` 이벤트의 `data`가 UID이고,
SchemaRegistry는 `Registered`의 첫 토픽 뒤 인덱스가 UID다.

### 시각 이동

`evm_increaseTime` + `evm_mine`은 **트랜잭션 전송과 겹치지 않는 시점**에만 호출한다
(phase 사이). 그러면 동시 채굴이 아니므로 패닉하지 않는다. 지금까지 phase 사이의
시각 이동 자체는 문제를 일으키지 않았다.

### 하지 말 것

- `--block-time` 금지 (anvil 패닉).
- `forge script --broadcast` 금지 (확인 블록 대기로 멈춘다).
- 백그라운드 블록 티커 금지 (anvil 패닉).
- anvil을 업그레이드하지 말 것 — 도구 버전을 바꾸는 것은 별개 결정이다.

### 검증

```bash
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh
```

**끝까지 완주해 요약을 출력해야 한다.** 완주 후:

- `docs/fixtures/seed.json`에 F1·F2·F4·F5·f_copy의 실제 UID
- `web/.env.local` 생성
- `cast call <settlement resolver> "activeHead(bytes32)(bytes32)" <f1.decisionUID>` ≠ 0
- `cast call <settlement resolver> "revokeCount(bytes32)(uint32)" <f2.decisionUID>` == 1

---

## 리뷰 대응 R4 — `cast send --create` 인자 순서

실행 결과:

```
error: unexpected argument '--private-key' found
Usage: cast send --create <CODE> [SIG] [ARGS]...
POINoteResolver 배포 주소 값을 찾지 못했습니다.
```

`--create <CODE>` 뒤는 생성자 시그니처와 인자를 받는 위치 인자라, 그 뒤에 오는
`--private-key`가 위치 인자로 해석된다. **옵션을 `--create` 앞에 두어야 한다.**

```bash
cast send --rpc-url "$LOCAL_RPC" --private-key "$key" --confirmations 1 \
    --create "$bytecode"
```

`scripts/dev_up.sh`의 **모든 `cast send`/`cast call` 호출을 같은 기준으로 훑을 것** —
옵션을 먼저, 위치 인자를 나중에. 하나가 통과했다고 나머지가 맞는 것은 아니다.

부수 확인: `observe.ts`는 정상 동작했다(관측값 계산 통과). 다만
`MODULE_TYPELESS_PACKAGE_JSON` 경고가 나온다 — 루트 `package.json`에 `"type": "module"`을
넣지 말 것(다른 패키지에 영향이 간다). 경고는 무시하거나 `scripts/`에 별도
`package.json`(`{"type":"module"}`)을 두어 없앤다.

### 검증

```bash
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh
```
끝까지 완주해 요약을 출력해야 한다.

---

## 리뷰 대응 R5 — macOS 기본 bash는 3.2다

실행 결과:

```
scripts/dev_up.sh: line 114: ${SCHEMA_REGISTRY,,}: bad substitution
scripts/dev_up.sh: line 115: ${emitted,,}: bad substitution
```

`${var,,}`(소문자 변환)는 **bash 4 이상** 기능이다. macOS의 `/bin/bash`는
`3.2.57`이고 `#!/usr/bin/env bash`도 그것을 잡는다.

### 고치는 방법

`scripts/*.sh` 전체를 **bash 3.2 호환으로** 훑는다. 확인된 것:

| 줄 | 표현 |
|---|---|
| 112 | `${SCHEMA_REGISTRY,,}` |
| 115 | `${emitted,,}` · `${predicted,,}` |
| 155 | `${ATTESTED_TOPIC,,}` |

소문자 변환은 아래로 바꾼다.

```bash
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
# 사용: "$(lower "$SCHEMA_REGISTRY")"
```

같은 기준으로 **다른 bash 4 문법도 전부 제거**할 것:
`${var^^}` · `mapfile` / `readarray` · `declare -A`(연관 배열) · `coproc` ·
`&>>` · `**` 글롭(globstar).

배열은 bash 3.2에서도 쓸 수 있지만 `${arr[@]}`가 비었을 때 `set -u`와 함께
오류가 나므로 `${arr[@]+"${arr[@]}"}` 관용구를 쓴다.

`jq`가 필요하면 존재 여부를 스크립트 시작에서 확인하고 없으면 명확한 안내로 중단한다.

### 검증

```bash
bash --version          # 3.2.x 확인
bash -n scripts/dev_up.sh
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh    # 완주해야 한다
```

---

## 리뷰 대응 R6 — `cast send`의 확인 대기도 없앤다

실행 결과: `Error: transaction was not confirmed within the timeout`.

anvil은 살아 있었고 **패닉도 없었다**(0건). 트랜잭션 16건이 전부 전송돼 블록도 17개 생겼다.
그런데 `cast send`가 `eth_getTransactionReceipt` **515회**, `eth_blockNumber` **476회**를
호출하며 기다렸다. 영수증은 이미 있는데 **확인 블록을 하나 더** 기다린 것이다.
`forge script`와 같은 문제가 `cast send`에서 반복됐다.

### 고치는 방법 — `--async` + 직접 영수증 조회

```bash
send_tx() {            # $1=key  $2=to  $3=calldata   → stdout: tx hash
    local hash
    hash="$(cast send --rpc-url "${LOCAL_RPC}" --private-key "$1" --async "$2" "$3")"
    printf '%s' "${hash}"
}

wait_receipt() {       # $1=tx hash → stdout: 영수증 JSON. 실패면 비영 종료
    local i=0 json
    while [ "$i" -lt 60 ]; do
        json="$(cast receipt "$1" --rpc-url "${LOCAL_RPC}" --json 2>/dev/null || true)"
        if [ -n "${json}" ] && [ "${json}" != "null" ]; then
            printf '%s' "${json}"; return 0
        fi
        sleep 0.5; i=$((i+1))
    done
    echo "영수증을 받지 못했습니다: $1" >&2; return 1
}
```

- `--async`는 **해시만 돌려주고 기다리지 않는다.** 확인 블록 대기가 원천적으로 없다.
- anvil은 온디맨드 채굴이라 `sendRawTransaction` 시점에 이미 블록을 만든다.
  그래서 영수증은 곧바로 존재한다. 폴링은 안전장치일 뿐이다.
- **`evm_mine`을 호출하지 않는다.** 동시 채굴이 없어야 anvil이 패닉하지 않는다(R3).

### 실패 판정

`--async`는 revert를 알려주지 않는다. **영수증의 `status`를 반드시 검사한다.**

```bash
status="$(printf '%s' "${json}" | jq -r '.status')"
if [ "${status}" != "0x1" ] && [ "${status}" != "1" ]; then
    echo "트랜잭션 실패: ${hash}" >&2
    cast run "${hash}" --rpc-url "${LOCAL_RPC}" >&2 || true    # revert 사유 출력
    return 1
fi
```

`cast run`이 revert 사유를 보여준다 — R2가 요구한 진단이 여기서 충족된다.

배포(`--create`)도 같은 방식으로 하고, 영수증의 `contractAddress`에서 주소를 읽는다.

### 검증

```bash
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh
```

**완주해서 요약을 출력해야 한다.** 실패하면 `cast run`의 revert 사유가 화면에 나와야 한다.

---

## 리뷰 대응 R7 — 가스 추정을 건너뛴다

실행 결과:

```
Error: Failed to estimate gas: error sending request for url (http://127.0.0.1:8545/)
scripts/dev_up.sh: line 188: ... Abort trap: 6   anvil ...
```

이번에는 **`evm_mine`을 한 번도 부르지 않았는데도** anvil이 죽었다.
RPC 집계: `eth_sendRawTransaction` **16건**이 성공했고, **17번째의 `eth_estimateGas`에서**
anvil이 죽었다.

16건 = 리졸버 4종 배포 + 스키마 4종 등록 + `initialize` 4회 + `addMetric` 2회 + 발행 2건.
**17번째는 결정 발행**이고, R2에서 revert했던 그 트랜잭션과 같은 자리다.

즉 **anvil 1.7.1은 리졸버 안에서 revert하는 트랜잭션의 가스를 추정할 때 죽는다.**
(R3에서 본 `do_mine_block` 패닉과 별개 경로다.)

### 고치는 방법 — `--gas-limit`을 명시해 추정을 생략한다

`cast send`에 `--gas-limit`을 주면 `eth_estimateGas`를 호출하지 않는다.

```bash
cast send --rpc-url "${LOCAL_RPC}" --private-key "$1" --async \
    --gas-limit 8000000 "$2" "$3"
```

배포도 같다: `--gas-limit 8000000 --create "$bytecode"`.

- anvil 기본 블록 가스 한도는 30,000,000이므로 8,000,000은 안전하다.
  가장 큰 트랜잭션(결정 리졸버 배포)이 포크 드라이런에서 약 2.5M이었다.
- 추정을 건너뛰면 **revert하는 트랜잭션도 채굴된다.** 영수증 `status`가 `0x0`으로 오고,
  R6이 넣은 `cast run`이 revert 사유를 출력한다. **이것이 목표다** —
  지금까지 사유를 못 봐서 추측만 했다.

### 그 다음에 할 일

17번째 트랜잭션의 revert 사유가 나오면 그것을 고친다. 유력한 후보:

| 후보 | 확인 방법 |
|---|---|
| `WindowInPast` (I4) | `windowStart`가 발행 시각보다 과거. R2에서 여유를 30분으로 늘렸으나 실제 체인 시각을 확인해야 한다 |
| `MetricNotAllowed` (I5) | `addMetric`이 먼저 실행됐는지, `metricId`가 manifest와 같은지 |
| `RefUIDMismatch` (I12) | 부모가 없으면 `refUID`가 0이어야 한다 |
| `MalformedPayload` | 평면 튜플 인코딩 길이 |

**사유를 보고 고친다. 추측으로 고치지 말 것.**

### 검증

```bash
RPC=https://sepolia-rpc.giwa.io/ bash scripts/dev_up.sh
```

이 단계의 성공 기준은 "완주"가 아니라 **"anvil이 죽지 않고, 실패하면 revert 사유가
화면에 나오는 것"**이다.

---

## 리뷰 대응 R8 — 포크를 버린다. EAS를 로컬에 직접 배포한다

### 왜 지금까지 계속 막혔나

R1~R7에서 나온 실패가 전부 **같은 뿌리**를 가진다: anvil이 레이트 리밋되는 공개 RPC
(`https://sepolia-rpc.giwa.io/`)에서 상태를 **지연 조회**한다.

- 트랜잭션마다 EAS·SchemaRegistry의 스토리지를 상류에서 새로 받아온다
- 공개 RPC는 429를 던진다(CT-FORK 테스트에서도 같은 일이 있었다)
- 그래서 트랜잭션이 기어가고, 타임아웃이 나고, anvil이 죽는다
- 마지막 실행에서는 `cast block-number`조차 180초 안에 응답하지 않았다

`forge test --fork-url`이 잘 돌았던 이유는 **foundry가 자체 RPC 캐시**(`~/.foundry/cache/rpc`)를
쓰기 때문이다. anvil은 그 캐시를 쓰지 않는다.

### 해법 — 포크하지 않는다

시드에 필요한 것은 EAS와 SchemaRegistry **동작**이지 GIWA의 상태가 아니다.
`contracts/lib/eas-contracts/`에 소스가 있으므로 **로컬 anvil에 직접 배포**한다.

```
anvil --port 8545 --chain-id 91342          # --fork-url 없음
  1. SchemaRegistry 배포
  2. EAS 배포 (생성자에 SchemaRegistry 주소)
  3. 그 다음은 지금과 동일 — 리졸버 4종, 스키마 4종, addMetric, fixture
```

- 상류 RPC 호출이 **0건**이 된다. 레이트 리밋도, 지연 조회도, 타임아웃도 없다
- 결정적이고 빠르다
- `--chain-id 91342`를 유지해 commitment의 chainId 결합이 실제와 같다

### 이 선택이 무엇을 잃는가 — 정직하게

**실제 배포본 `1.4.1-beta.3`이 아니라 lib `v1.4.0`의 EAS가 돈다.**
그 차이는 이미 **C8과 CT-FORK가 포크에서 실제 바이트코드 상대로 검증**했다
(`FOUNDRY_PROFILE=fork forge test` 37/37). 시드는 UI를 손으로 확인하기 위한
**개발 환경**이지 그 검증을 대신하는 것이 아니다.

`docs/TEST_SCENARIO.md`와 `docs/fixtures/seed.json`에 이 사실을 한 줄로 적는다:

> 이 시드는 로컬에 배포한 EAS(lib v1.4.0)를 쓴다. 실제 배포본(1.4.1-beta.3) 상대 검증은
> `FOUNDRY_PROFILE=fork forge test`가 담당한다.

### 구현

- `scripts/dev_up.sh`: `--fork-url`·`--fork-block-number` 제거.
  `RPC` 환경변수는 **선택**이 된다(업비트 조회에는 필요 없다).
- EAS·SchemaRegistry 배포를 `cast send --create`로 추가하고 주소를 이후 단계에 넘긴다.
  바이트코드는 `forge inspect SchemaRegistry bytecode` / `forge inspect EAS bytecode`.
  **EAS 생성자는 SchemaRegistry 주소를 받는다** — `cast abi-encode`로 인자를 붙인다.
- `web/.env.local`에 `VITE_EAS_ADDRESS`를 추가하고 `web/src/config.ts`가 그것을 읽게 한다
  (지금은 `0x42...21`로 고정돼 있다. 환경변수가 없으면 기존 상수를 기본값으로).
- `T0` 기준은 그대로 둔다(업비트 봉이 실제 과거에 있어야 하므로).
  포크가 아니므로 anvil의 시작 시각은 실제 현재다 — `evm_increaseTime`으로 **뒤로 갈 수 없다.**
  그래서 `T0`를 과거로 두지 말고 **anvil 시작 직후의 체인 시각을 `T0`로 삼고**,
  관측 구간만 과거로 지정한다. `windowStart`는 발행 시각보다 미래여야 하므로(I4)
  **관측 구간과 발행 시각을 분리**한다:

  ```
  T0        = anvil 시작 시각 (≈ 실제 현재)
  windowStart = T0 + 1800          # 발행 시점보다 미래 (I4 만족)
  windowEnd   = T0 + 2400
  → 관측 구간이 미래이므로 업비트 봉이 없다
  ```

  **그래서 시각을 앞으로 감는다.** `evm_increaseTime`으로 `windowEnd`를 지나면 그 구간은
  "체인 시각 기준 과거"가 되지만 **실제 시각으로는 여전히 미래**라 업비트 봉이 없다.

  해결: **관측값을 업비트의 최근 과거 구간에서 가져오되, 그 값을 fixture의 관측값으로 쓴다.**
  `observe.ts`는 `[실제now-3600, 실제now-3000]` 구간을 조회해 값을 얻고,
  fixture의 `windowStart/windowEnd`는 체인 시각 기준으로 잡는다.
  **두 구간이 다르다는 것을 `seed.json`에 명시한다** —
  로컬 시드는 verifier 대조가 아니라 **UI 확인**이 목적이기 때문이다.

  verifier의 실제 `MATCH` 증명은 **O3 실제 배포 뒤**에 한다(`SUBMISSION.md` §1).

### 검증

```bash
bash scripts/dev_up.sh                       # RPC 환경변수 없이도 돌아야 한다
```

완주해서 요약을 출력해야 한다. 상류 RPC 호출이 없으므로 **1분 안에 끝나야 한다.**
완주 후:

- `docs/fixtures/seed.json`에 F1·F2·F4·F5·f_copy의 UID
- `web/.env.local` 생성 (`VITE_EAS_ADDRESS` 포함)
- `cast call <settlement resolver> "activeHead(bytes32)(bytes32)" <f1.decisionUID>` ≠ 0
- `cast call <settlement resolver> "revokeCount(bytes32)(uint32)" <f2.decisionUID>` == 1
