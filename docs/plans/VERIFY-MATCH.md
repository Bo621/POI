# VERIFY-MATCH verifier가 실제 정산과 일치하는 것을 보인다

## 왜

`PLAN.md` §5 완료 정의: *"verifier가 온체인 정산을 독립적으로 재계산해 일치"*.

provider는 만들었지만(45/45) **끝까지 이어본 적이 없다.** 심사자가
"verifier를 직접 돌려보게 해달라"고 하면 지금은 `NO_OBSERVATION`(종료코드 3)만 나온다.

원인은 `SEED.md` R8에서 포크를 버리며 생겼다. anvil이 **실제 현재 시각**에서 시작하니
fixture의 관측 구간이 미래가 되고, 미래 구간에는 업비트 봉이 없다. 그래서 관측 구간과
fixture 구간을 다르게 두고 "로컬은 UI 확인용"이라고 적어 두었다. **이제 닫는다.**

## 해법 — anvil 제네시스를 과거로 둔다

```bash
anvil --port 8545 --chain-id 91342 --timestamp $(( real_now - 10800 ))
```

`--timestamp`는 **제네시스 블록 시각**을 정한다. 그러면:

```
T0          = real_now - 10800     (3시간 전, 체인 시각 = 실제 과거)
windowStart = T0 + 1800            I4 만족 (발행 시각 T0보다 미래)
windowEnd   = T0 + 2400            실제 시각으로도 과거 → 업비트 봉이 존재한다
```

**관측 구간과 fixture 구간이 같아진다.** 두 구간을 나눌 이유가 사라진다.

## 파일

- 수정: `scripts/dev_up.sh` — `--timestamp`, 구간 통합, 마지막에 **verifier 실행**
- 수정: `contracts/script/SeedFixtures.s.sol` — 필요한 만큼만
- 수정: `docs/fixtures/seed.json` — `observationWindow`/`fixtureWindow`를 `window` 하나로
- 수정: `docs/TEST_SCENARIO.md` — S10을 실제 `MATCH` 기준으로
- 수정: `web/e2e/*` — `seed.json` 구조 변경에 맞춰서만
- **그 외 수정 금지.** `verifier/src`·`core/`·`docs/metrics/` 손대지 않는다.

## 1. 구간 통합

```json
"window": {"start": "…", "end": "…", "graceSeconds": 3600}
```

R8이 넣은 "로컬 시드이며 verifier 대조용이 아님" 문구를 **지운다** — 더 이상 사실이 아니다.
대신 남길 것: *"로컬 EAS는 lib v1.4.0이다. 실제 배포본 상대 검증은
`FOUNDRY_PROFILE=fork forge test`가 담당한다."*

## 2. F1·F2가 verifier `MATCH` 대상이 되게

- F1 지표 `BTC_PRICE_KRW_AT_END`. 관측값은 `observe.ts`가 **정확히 `[windowStart, windowEnd]`**
  구간으로 계산한 값. 임계는 `관측값 - 1000000` (→ `OBSERVED`).
- F2 지표 `BTC_MAX_DRAWDOWN_IN_WINDOW`. **철회된 S1은 일부러 틀린 값**, 정정된 S2가 provider 값.
  그래서 F2도 `MATCH`여야 한다 — "정정하면 검증이 통과한다"를 보여주는 자리다.
- 정산의 `observedAt`은 `windowEnd`(컨트랙트가 강제).

## 3. `dev_up.sh` 마지막에 verifier를 돌린다 — 이 항목의 핵심

```bash
<필요한 환경변수> node --experimental-strip-types verifier/src/cli.ts \
    "<f1.decisionUID>" --rpc http://127.0.0.1:8545 --json
```

- **종료코드 0(`MATCH`)이 아니면 시드를 실패시킨다.** F2도 같은 방식으로.
- 출력 JSON의 `verdict`·`snapshotHash`를 요약에 찍는다 — 심사자가 재현할 값이다.
- 환경변수를 `.env.verifier`(gitignore)에 쓰고, 요약에 **복사해 바로 쓸 수 있는 한 줄 명령**을 출력한다.

**환경변수 이름은 `verifier/src/cli.ts`의 `requiredAddress(...)` 호출에서 확인할 것. 추측 금지.**

## 4. 시간 진행

제네시스가 과거이므로 단계별 이동은 지금과 같다(`evm_increaseTime`, 앞으로만).

```
단계 1  @ T0                        배포·addMetric·결정 4건
단계 2  @ windowEnd + 100           F1·F2 정산
단계 3  @ windowEnd + 200           F2 철회→정정, B 이의, f_copy
최종    @ windowEnd + grace + 300   F4가 OVERDUE
```

최종은 `T0 + 6300`이므로 `real_now`(= `T0 + 10800`)를 넘지 않는다.
F5는 `windowStart = 최종 + 7200`으로 두어 PENDING을 유지한다.

## 5. 자체 검증에 추가

기존 4종(F1·F2·F4·F5 상태)에 더해:

```
verifier(F1) → 종료코드 0, verdict == "MATCH"
verifier(F2) → 종료코드 0, verdict == "MATCH"
```

## 하지 말 것

- `verifier/src`를 수정하지 말 것. 시드가 verifier에 맞춰야지 그 반대가 아니다.
  verifier가 틀렸다면 별도 결함이므로 **보고**한다.
- `docs/metrics/*.md` 수정 금지. 관측값을 손으로 지어내지 말 것.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```bash
bash scripts/dev_up.sh
```

**요약에 `verifier: MATCH`가 찍혀야 한다.** 안 나오면 완료가 아니다.
사람이 그 한 줄 명령을 복사해 직접 돌렸을 때도 `MATCH`가 나와야 한다.

```
cd web && npm run test:e2e     # 15/15 회귀 없음
```
