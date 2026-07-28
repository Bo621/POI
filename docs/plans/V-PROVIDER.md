# V-PROVIDER 업비트 지표 provider 2종 + verifier 신뢰성 보강

## 왜

`PLAN.md` §5 완료 정의: *"verifier가 온체인 정산을 독립적으로 재계산해 일치"*.

지금 `verifier/src/cli.ts`는 `MetricRegistry`를 **아예 넘기지 않는다**(`cli.ts:33-42`).
그래서 항상 `NO_OBSERVATION`으로 떨어지고 그게 **종료코드 0**이다.
현재 verifier가 증명하는 것은 "온체인 값이 자기정합적이다"뿐인데, 그건 컨트랙트가 이미
강제한 것이라 **새로운 정보가 없다.** 심사자가 "이게 데이터를 가져오는 거냐, 제출된
관측값을 되풀이하는 거냐"고 물으면 지금은 후자다.

## 파일

- 새로: `verifier/src/upbit.ts` — 업비트 1분봉 조회 (주입 가능한 fetch)
- 새로: `verifier/src/providers.ts` — 지표 2종 provider
- 새로: `verifier/src/snapshot.ts` — 데이터셋 스냅샷 직렬화·해시
- 새로: `verifier/test/upbit.test.ts` · `verifier/test/providers.test.ts` · `verifier/test/snapshot.test.ts`
- 수정: `verifier/src/metric.ts` — `observe()` 반환 타입 (아래 §1)
- 수정: `verifier/src/verify.ts` — 지표 등록 대조 · 스냅샷 · 판정 반영
- 수정: `verifier/src/reader.ts` — `getChainTime()` · `getMetric()` 추가
- 수정: `verifier/src/cli.ts` — provider 등록 · 종료코드 · 체인 시간
- 수정: `verifier/test/verify.test.ts` — 기존 14개 유지 + 추가
- **그 외 수정 금지.** 특히 `docs/metrics/*.md`는 절대 건드리지 말 것 — 바이트가 `definitionHash`다.
- **테스트에서 네트워크를 쓰지 말 것.** 봉 데이터는 주입한다.

`core/`는 읽기만 한다(`scale`·`settlementResult`·`METRICS`).

---

## 1. `metric.ts` — "없음"과 "실패"를 구별한다

지금 `observe()`가 `Observation | undefined`를 돌려줘 **데이터 부족과 조회 실패가 뭉개진다.**
`docs/metrics/*.md` §5가 둘을 다르게 다루라고 요구한다:
데이터 부족은 `INDETERMINATE`, 조회 실패는 **값을 만들지 않고 중단**.

```ts
export type ObserveResult =
    | {kind: "ok"; raw: string; source: string; observedAt: bigint; snapshot: CandleRow[]}
    | {kind: "insufficient"; reason: string; snapshot: CandleRow[]}
    | {kind: "error"; reason: string};

export interface MetricProvider {
    readonly metricId: Hex;
    observe(windowStart: bigint, windowEnd: bigint): Promise<ObserveResult>;
}
```

`CandleRow = readonly [string, string]` — `[candle_date_time_utc, trade_price 문자열]`.

## 2. `upbit.ts` — 봉 조회

```ts
export interface RawCandle { candle_date_time_utc: string; trade_price: number | string; }
export type CandleFetcher = (params: {market: string; to?: string; count: number}) => Promise<RawCandle[]>;

/** 기본 구현. 테스트는 이것을 쓰지 않는다 */
export function httpCandleFetcher(): CandleFetcher;

/**
 * [windowStart, windowEnd) 안에서 완전히 닫힌 1분봉만 오름차순으로 돌려준다.
 * 조건: windowStart <= t(c) 이고 t(c) + 60 <= windowEnd
 */
export async function fetchClosedMinuteCandles(args: {
    fetcher: CandleFetcher; market: string; windowStart: bigint; windowEnd: bigint;
}): Promise<CandleRow[]>;
```

문서(`docs/metrics/*.md` §1·§3·§4)가 정한 규칙 그대로:

- 엔드포인트 `https://api.upbit.com/v1/candles/minutes/1`, `market=KRW-BTC`, `count<=200`
- `to`를 지금까지 받은 **가장 오래된 봉 시각**으로 옮기며 반복.
  `t(c) < windowStart`인 봉이 나오면 멈춘다
- `candle_date_time_utc`는 **봉 시작 시각**, UTC, 초는 `:00`. `Z`가 없으므로
  `Date.parse(s + "Z")`로 파싱한다 — **로컬 타임존으로 해석되면 9시간이 어긋난다**
- `trade_price`를 **문자열로 정규화**한다: 소수점 이하 불필요한 0 제거
  (`92999000.00000000` → `"92999000"`). 부동소수 재변환을 거치지 않도록 원문 문자열을
  우선 쓰고, 숫자로 왔으면 지수표기 없이 문자열화한다
- **중복 제거**: 페이지 경계에서 같은 봉이 두 번 올 수 있다. `candle_date_time_utc` 기준 dedupe
- 지수 백오프 3회(`200/400/800ms`). 3회 실패하면 던진다
- 무한 루프 방지: 요청 횟수 상한(예: 512)을 두고 넘으면 던진다

## 3. `providers.ts`

```ts
export function btcPriceKrwAtEnd(fetcher: CandleFetcher): MetricProvider;
export function btcMaxDrawdownInWindow(fetcher: CandleFetcher): MetricProvider;
export function defaultProviders(fetcher?: CandleFetcher): MetricRegistry;
```

`metricId`는 **`@poi/core`의 `METRICS`에서 가져온다.** 상수를 다시 적지 말 것.

### `BTC_PRICE_KRW_AT_END`

- 봉이 하나도 없으면 `{kind: "insufficient"}`
- 있으면 **가장 늦은 봉**의 종가를 `raw`로. `source = "upbit:KRW-BTC:1m"`,
  `observedAt = windowEnd`

### `BTC_MAX_DRAWDOWN_IN_WINDOW`

- 봉이 **2개 미만이면 `{kind: "insufficient"}`** (0이 아니다 — 문서 §5의 판단)
- 종가 계열로 러닝 피크 대비 최대 낙폭. **정수 산술**로 한다:

```
peak, drop 전부 bigint. 가격은 문자열 → scale(price, 8)로 정수화해 비교한다
(원 단위 정수라도 소수 입력에 대비. 8은 내부 계산용 정밀도다)

dropScaled = (peak - p) * 10n^(decimals+2) / peak     // percent × 10^decimals
```

`raw`는 **percent 소수 문자열**로 돌려준다(예: `"2.35"`). 그래야 `core`의 `scale(raw, 1)`이
문서대로 half-up을 적용한다. 나눗셈을 부동소수로 하지 말 것.

> **주의**: `raw`를 소수 문자열로 만들 때도 부동소수를 거치면 안 된다.
> `dropScaled`(정수)를 문자열 조작으로 소수점 찍어 만든다.

## 4. `snapshot.ts`

`docs/metrics/*.md` §7이 정한 형식 그대로.

```ts
/** JSON 배열, [candle_date_time_utc, trade_price], 시각 오름차순, 공백 없음 */
export function serializeSnapshot(rows: CandleRow[]): string;
export function snapshotHash(rows: CandleRow[]): Hex;   // keccak256(utf8(직렬화))
```

`JSON.stringify`가 공백 없이 내므로 그대로 쓰되, **키 순서·배열 순서가 결정적**이어야 한다.

## 5. `reader.ts` 추가

```ts
getChainTime(): Promise<bigint>;                   // publicClient.getBlock() 의 timestamp
getMetric(metricId: Hex): Promise<OnChainMetric>;  // POIMetricRegistry.metrics(metricId)

export interface OnChainMetric {
    allowed: boolean; decimals: number; kind: number; definitionHash: Hex; frozen: boolean;
}
```

기존 `getMetricDecimals`는 `getMetric`으로 대체하고 호출부를 고친다.

## 6. `verify.ts` — 판정 강화

### 지표 등록 대조 (신설)

`hasExpectedOutcome`인 결정에 대해 온체인 지표를 읽어 `@poi/core`의 `METRICS`와 대조한다.

| 어긋남 | 처리 |
|---|---|
| `allowed !== true` | `problems` + `MISMATCH` |
| `kind !== 0` | `problems` + `MISMATCH` |
| `frozen !== true` | `problems` (경고) |
| `decimals`가 manifest와 다름 | `problems` + `MISMATCH` |
| **`definitionHash`가 manifest와 다름** | `problems` + `MISMATCH` |
| manifest에 없는 `metricId` | `problems` + `NO_OBSERVATION` (우리가 모르는 지표다) |

`definitionHash` 불일치는 특히 중요하다 — "이 체인에 등록된 지표는 우리 문서가 정의한
지표가 아니다"라는 뜻이고, 그러면 재현 자체가 성립하지 않는다.

### provider 결과 반영

| `observe()` | 판정 |
|---|---|
| `ok` + 값·결과 일치 | `MATCH` |
| `ok` + 값 또는 결과 불일치 | `MISMATCH` (문장에 온체인 값과 독립 값을 **둘 다** 적는다) |
| `insufficient` | 온체인이 `INDETERMINATE`면 `MATCH`, 아니면 `MISMATCH` |
| `error` | **`VerifyError`를 던진다** (CLI가 종료코드 2로 받는다) |
| provider 없음 | `NO_OBSERVATION` |

`insufficient` 처리가 중요하다 — 온체인이 `INDETERMINATE`라고 말했고 독립 관측도
데이터가 부족했다면 **그것은 일치**다.

### 리포트에 스냅샷

```ts
independent?: {
    scaledValue: bigint; expectedResult: number; raw: string; source: string;
    snapshot: CandleRow[]; snapshotHash: Hex;
}
```

`--json`에 그대로 나가야 한다. 심사자가 같은 입력으로 재현할 수 있어야 한다.

## 7. `cli.ts`

- `defaultProviders()`를 만들어 `verifyDecision`에 넘긴다
- `now`를 `reader.getChainTime()`으로 (지금 `Date.now()`다 — 프론트와 같은 결함)
- `--no-fetch` 플래그: provider 없이 자기정합 검사만 (오프라인 확인용)
- 종료코드

| 판정 | 코드 |
|---|---|
| `MATCH` · `NOT_REQUIRED` | 0 |
| `MISMATCH` | 1 |
| 사용법 오류 · 조회 실패 · `error` | 2 |
| **`NO_OBSERVATION` · `NO_SETTLEMENT`** | **3** |

`NO_OBSERVATION`을 0으로 두면 "검증됨"과 구별되지 않고, 1로 묶으면 "틀렸다"와
"확인 못 했다"가 뭉개진다. 그래서 3을 따로 둔다. `--json`에 `verdict`가 그대로 나오므로
기계 판독에도 문제가 없다.

## 8. 테스트 — 네트워크 없이

봉 데이터는 **테스트 안에 고정 배열**로 둔다. `CandleFetcher`를 주입한다.

### `upbit.test.ts`

| # | 내용 |
|---|---|
| 1 | 구간 밖 봉(시작 전·닫히지 않은 봉)이 제외된다 |
| 2 | `t(c) + 60 == windowEnd` 봉은 **포함**된다 (경계) |
| 3 | `t(c) + 60 > windowEnd` 봉은 제외된다 |
| 4 | 페이지네이션 — 200개씩 두 번 받아 이어붙인다 |
| 5 | 페이지 경계 중복 봉이 제거된다 |
| 6 | **UTC 파싱** — `"2026-07-28T00:25:00"`이 로컬이 아니라 UTC로 해석된다 (`TZ=Asia/Seoul`에서도 같은 값) |
| 7 | `trade_price` 정규화 — `92999000.00000000` → `"92999000"`, `0.00012300` → `"0.000123"` |
| 8 | fetcher가 3회 던지면 던진다. 2회 던지고 성공하면 결과를 준다 |
| 9 | 요청 상한 초과 시 던진다 |

### `providers.test.ts`

| # | 내용 |
|---|---|
| 1 | 가격: 가장 늦은 봉의 종가를 준다 |
| 2 | 가격: 봉 0개 → `insufficient` |
| 3 | 낙폭: 상승만 한 계열 → `"0"` |
| 4 | 낙폭: 100 → 95 → 98 → `"5"` (피크 100 대비 5%) |
| 5 | 낙폭: 피크 갱신 후 낙폭 — 100→90→120→108 → `"10"` (120 대비 10%) |
| 6 | 낙폭: 봉 1개 → `insufficient` (0이 아니다) |
| 7 | 낙폭: 소수 결과 `"2.35"`가 `core`의 `scale(raw, 1)`로 `24n` (half-up) |
| 8 | **부동소수 함정**: 부동소수로 짜면 틀리는 값 하나를 고정한다 |
| 9 | `metricId`가 `core`의 `METRICS`와 일치 |
| 10 | fetcher 실패 → `{kind: "error"}` (`insufficient`가 아니다) |

### `snapshot.test.ts`

| # | 내용 |
|---|---|
| 1 | 직렬화에 공백이 없다 |
| 2 | 입력 순서가 뒤섞여도 시각 오름차순으로 정규화된다 |
| 3 | 같은 입력 → 같은 해시 (결정적) |
| 4 | 값 하나만 달라도 해시가 달라진다 |

### `verify.test.ts` 추가

| # | 내용 |
|---|---|
| 15 | `definitionHash`가 manifest와 다르면 `MISMATCH` + `problems`에 두 해시 |
| 16 | `allowed=false` → `MISMATCH` |
| 17 | `decimals` 불일치 → `MISMATCH` |
| 18 | provider `insufficient` + 온체인 `INDETERMINATE` → **`MATCH`** |
| 19 | provider `insufficient` + 온체인 `OBSERVED` → `MISMATCH` |
| 20 | provider `error` → `VerifyError` 던짐 |
| 21 | 리포트에 `snapshotHash`가 들어 있다 |
| 22 | manifest에 없는 metricId → `NO_OBSERVATION` |

기존 14개는 그대로 통과해야 한다(가짜 리더에 `getMetric` 추가 필요).

## 하지 말 것

- `docs/metrics/*.md` 수정 금지. 오타를 봐도 고치지 말고 보고할 것.
- 테스트에서 실제 업비트 API를 호출하지 말 것.
- 판정 산술(`scale`·`settlementResult`)을 verifier에서 다시 구현하지 말 것.
- 지표를 더 추가하지 말 것 — 2종이다.
- 부동소수 나눗셈 금지. 전부 `bigint`.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것.

## 검증

```
cd verifier && npm test          # 14 + 새 테스트
cd verifier && npx tsc --noEmit
cd core && npm test              # 62/62 회귀 없음
TZ=Asia/Seoul npm test --prefix verifier   # UTC 파싱이 타임존에 안 흔들리는지
```
