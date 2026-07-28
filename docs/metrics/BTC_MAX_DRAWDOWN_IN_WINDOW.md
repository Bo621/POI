# BTC_MAX_DRAWDOWN_IN_WINDOW

`POI_TechSpec_v3.md` §11.3이 요구하는 지표 정의 문서. 이 파일의 해시가 `definitionHash`다.

| | |
|---|---|
| metricId | `keccak256("BTC_MAX_DRAWDOWN_IN_WINDOW")` |
| kind | `WINDOW_END_EVALUATED` (§11.1) |
| 단위 | percent |
| decimals | **1** (§11.2) |
| 평가 시점 | `windowEnd` 한 번만. 구간 전체를 입력으로 받아 `end`에 한 번 계산된다 |
| verifier | `poi-verifier/1.0.0` |

> 구간 **전체**를 보지만 값은 `end`에 한 번 확정된다. 이것이 `WINDOW_END_EVALUATED`이며,
> "구간 중 한 번이라도 X를 넘었는가"(경로 존재형)와는 다르다. 후자는 MVP에서 제외됐다(§11.1).

---

## 1. 데이터 소스

| | |
|---|---|
| 거래소 | 업비트 (Upbit) |
| 마켓 | `KRW-BTC` |
| 엔드포인트 | `GET https://api.upbit.com/v1/candles/minutes/1` |
| 인증 | **없음.** 공개 엔드포인트이며 API 키를 쓰지 않는다 (`PLAN.md` §3 범위 경계) |
| 파라미터 | `market=KRW-BTC` · `to=<ISO8601 UTC>` · `count=<1..200>` |
| 페이지네이션 | 한 요청당 최대 200봉. `to`를 지금까지 받은 가장 오래된 봉의 시각으로 옮겨 반복하며, `t(c) < windowStart`인 봉이 나오면 멈춘다 |

응답의 각 원소에서 두 필드만 쓴다.

| 필드 | 의미 |
|---|---|
| `candle_date_time_utc` | **봉의 시작 시각**, UTC. 초 단위는 항상 `:00` |
| `trade_price` | 그 봉의 **종가** |

`high_price`·`low_price`를 쓰지 않는다 — 이유는 §4에 적었다.

## 2. 타임존

**UTC 고정.** `candle_date_time_utc`를 그대로 쓰고 `candle_date_time_kst`는 무시한다.

## 3. 관측 간격

**1분봉.**

> 일봉을 쓰면 짧은 구간에 봉이 0~1개만 들어와 최대낙폭이 항상 0이 되거나
> `INDETERMINATE`가 된다. 1분봉은 구간 길이와 무관하게 같은 규칙이 적용된다.

## 4. 계산식

```
입력: windowStart, windowEnd   (Unix 초, UTC)

# 구간 안에서 "완전히 닫힌" 1분봉만 쓴다.
series = [ c : windowStart <= t(c)  and  t(c) + 60 <= windowEnd ]
         t(c) 오름차순 정렬

if len(series) < 2:
    return INDETERMINATE

peak = trade_price(series[0])
mdd  = 0                                  # 실수, percent

for c in series:
    p = trade_price(c)
    if p > peak: peak = p
    drop = (peak - p) / peak * 100        # peak > 0 이므로 0으로 나누지 않는다
    if drop > mdd: mdd = drop

value = round_half_up(mdd * 10^1)
return value                               # int128, 0 이상
```

- **종가 계열만 쓴다.** `high_price`/`low_price`를 섞으면 같은 봉 안에서 고점과 저점의
  선후를 알 수 없어 재현이 흔들린다. 종가 계열은 순서가 명확하고 누구나 같은 값을 얻는다.
  그래서 이 지표는 "봉 종가 기준 최대낙폭"이며, 장중 순간 낙폭보다 작게 나올 수 있다.
- 값은 **0 이상**이다. 상승만 한 구간의 최대낙폭은 0이다.
- 낙폭을 percent로 계산한 뒤 `decimals = 1`로 스케일한다. 예: 2.35% → `24` (half-up).

## 5. 결측치 처리

**보간하지 않는다. 직전 값을 이월하지 않는다.**

업비트는 체결이 없는 분에는 봉을 만들지 않는다. 그런 분은 계열에서 그냥 빠진다.

| 상황 | 처리 |
|---|---|
| 조건을 만족하는 봉이 **2개 미만** | `INDETERMINATE` (`hasObservedValue = false`) |
| 2개 이상 | 존재하는 봉만으로 계산한다. 빠진 분을 채우지 않는다 |
| API 오류·타임아웃 | 지수 백오프 3회 재시도. 그래도 실패하면 **값을 만들지 않고 중단**한다. `INDETERMINATE`로 처리하지 않는다 — 데이터가 없는 것과 조회에 실패한 것은 다르다 |

> 이월을 허용하면 거래가 끊긴 구간에서 인위적인 평탄 구간이 생겨 낙폭이 실제보다 작게 나온다.
> 빠진 분을 그냥 건너뛰는 쪽이 계산이 단순하고 누구나 같은 결과를 낸다.
>
> 봉이 1개뿐이면 낙폭이 정의상 0이지만, 그것은 "낙폭이 없었다"가 아니라
> "관측이 부족하다"에 가깝다. 그래서 0이 아니라 `INDETERMINATE`로 둔다.

## 6. 반올림

**half-up**, 절댓값 기준. `2.5 → 3`, `-2.5 → -3` (이 지표의 값은 음수가 되지 않는다).

나눗셈은 **부동소수로 하지 않는다.** 구현은 정수 산술로 한다:

```
drop_scaled = round_half_up( (peak - p) * 1000 / peak )    # 0.1% 단위 정수
```

즉 percent × 10^decimals(=10) 를 한 번에 정수로 계산한다.
중간에 `float`를 거치면 경계값에서 구현마다 다른 값이 나온다.

`core/src/evaluate.ts`의 `scale`은 **문자열 → bigint** 경로이며 부동소수를 거치지 않는다.

## 7. 데이터셋 스냅샷 해시

verifier는 계산에 **실제로 사용한 봉 전체**를 다음 정규 형식으로 직렬화하고 그 해시를 리포트에 남긴다.

```
snapshot = JSON 배열, 원소는 [candle_date_time_utc, trade_price 문자열]
         · 원소 순서는 candle_date_time_utc 오름차순
         · trade_price는 API 응답의 숫자를 소수점 이하 불필요한 0을 제거한 문자열로
         · 구분자·공백 없음 (RFC 8785 JCS)

snapshotHash = keccak256( utf8(snapshot) )
```

이 해시가 있으면 제3자가 **같은 입력에 대해** 같은 값이 나오는지 검사할 수 있다.
값이 다르면 계산이 틀린 것이고, 스냅샷이 다르면 데이터가 다른 것이다 — 둘을 구별할 수 있다.

## 8. definitionHash

```
definitionHash = keccak256( 이 파일의 바이트 전체 )
```

- 대상은 저장소에 커밋된 이 파일의 원문 바이트다. 줄바꿈은 LF.
- 계산된 값은 `docs/metrics/manifest.json`에 기록한다. **manifest는 해시 대상이 아니다** —
  파일이 자기 해시를 포함할 수 없기 때문이다.
- 컨트랙트는 `definitionHash == 0`인 지표의 등록을 거부한다(§11.3).
- **지표는 등록 즉시 frozen이다.** 이 문서가 바뀌면 해시가 달라지고, 그것은 다른 지표다.

## 9. 이 지표가 하지 않는 것

- **전략 최대낙폭이 아니다.** 개인의 실행 데이터를 쓰지 않는다(§11.4 `STRATEGY_*` 등록 금지).
  이 값은 BTC 가격 자체의 낙폭이다.
- 장중 고저 기준 낙폭이 아니다. 봉 종가 기준이다(§4).
- 거래소 간 평균을 쓰지 않는다. 업비트 KRW-BTC 단일 소스다.
