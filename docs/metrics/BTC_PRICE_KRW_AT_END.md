# BTC_PRICE_KRW_AT_END

`POI_TechSpec_v3.md` §11.3이 요구하는 지표 정의 문서. 이 파일의 해시가 `definitionHash`다.

| | |
|---|---|
| metricId | `keccak256("BTC_PRICE_KRW_AT_END")` |
| kind | `WINDOW_END_EVALUATED` (§11.1) |
| 단위 | KRW |
| decimals | **0** (원 단위 정수) |
| 평가 시점 | `windowEnd` 한 번만. `observedAt == windowEnd`가 컨트랙트에서 강제된다 |
| verifier | `poi-verifier/1.0.0` |

---

## 1. 데이터 소스

| | |
|---|---|
| 거래소 | 업비트 (Upbit) |
| 마켓 | `KRW-BTC` |
| 엔드포인트 | `GET https://api.upbit.com/v1/candles/minutes/1` |
| 인증 | **없음.** 공개 엔드포인트이며 API 키를 쓰지 않는다 (`PLAN.md` §3 범위 경계) |
| 파라미터 | `market=KRW-BTC` · `to=<ISO8601 UTC>` · `count=<1..200>` |
| 페이지네이션 | 한 요청당 최대 200봉. 더 필요하면 `to`를 가장 오래된 봉 시각으로 옮겨 반복한다 |

응답의 각 원소에서 두 필드만 쓴다.

| 필드 | 의미 |
|---|---|
| `candle_date_time_utc` | **봉의 시작 시각**, UTC. 초 단위는 항상 `:00` |
| `trade_price` | 그 봉의 **종가** |

`candle_date_time_kst`·`timestamp`·`opening_price`·`high_price`·`low_price`·거래량 필드는 쓰지 않는다.

## 2. 타임존

**UTC 고정.** `candle_date_time_utc`를 그대로 쓰고 `candle_date_time_kst`는 무시한다.
`windowStart`·`windowEnd`는 온체인 `uint64` Unix 초이며 UTC다. 변환하지 않는다.

## 3. 관측 간격

**1분봉.** 일봉이 아니다.

> 일봉을 쓰면 짧은 구간(예: 10분)에 봉이 하나도 들어오지 않아 모든 짧은 구간이
> `INDETERMINATE`가 된다. 1분봉은 구간 길이와 무관하게 같은 규칙이 적용된다.

## 4. 계산식

```
입력: windowStart, windowEnd   (Unix 초, UTC)

# 구간 안에서 "완전히 닫힌" 마지막 1분봉 하나만 쓴다.
# 봉 c의 시작 시각을 t(c)라 하면, 그 봉이 닫히는 시각은 t(c) + 60 이다.
candidates = { c : windowStart <= t(c)  and  t(c) + 60 <= windowEnd }

if candidates is empty:
    return INDETERMINATE

c* = argmax_{c in candidates} t(c)          # 가장 늦게 시작한 봉
raw = trade_price(c*)                        # 종가, KRW

value = round_half_up(raw * 10^0) = round_half_up(raw)
return value                                  # int128
```

- `t(c) + 60 <= windowEnd` 조건은 **아직 닫히지 않은 봉을 쓰지 않기 위한 것**이다.
  진행 중인 봉의 `trade_price`는 시간이 지나면 바뀌므로 재현이 불가능하다.
- 결과는 항상 양수이며 `int128` 범위를 넘지 않는다.

## 5. 결측치 처리

**보간하지 않는다. 직전 값을 이월하지 않는다.**

업비트는 체결이 없는 분에는 봉을 만들지 않는다. 그래서 `windowEnd` 직전 분에 봉이 없을 수 있다.

| 상황 | 처리 |
|---|---|
| 조건을 만족하는 봉이 **하나도 없음** | `INDETERMINATE` (`hasObservedValue = false`) |
| 조건을 만족하는 봉이 하나 이상 | 그중 가장 늦은 봉의 종가를 쓴다 |
| API 오류·타임아웃 | 지수 백오프 3회 재시도. 그래도 실패하면 **값을 만들지 않고 중단**한다. `INDETERMINATE`로 처리하지 않는다 — 데이터가 없는 것과 조회에 실패한 것은 다르다 |

> 이월을 허용하면 "구간 종료 시점의 가격"이 실제로는 구간 밖의 가격일 수 있다.
> 그 경우 `observedAt == windowEnd`라는 온체인 강제가 거짓을 보증하게 된다.

## 6. 반올림

**half-up**, 절댓값 기준. `round_half_up(x)`는 `|x|`의 소수부가 0.5 이상이면 절댓값이
커지는 쪽으로 올린다. 즉 `2.5 → 3`, `-2.5 → -3`.

`decimals = 0`이므로 KRW 원 단위 정수로 떨어진다. 업비트 KRW-BTC 종가는 이미 정수이므로
실무상 반올림이 일어나지 않지만, 규칙은 명시한다.

구현은 `core/src/evaluate.ts`의 `scale(raw, decimals)`이며 **문자열 → bigint** 경로다.
부동소수를 거치지 않는다.

## 7. 데이터셋 스냅샷 해시

verifier는 계산에 **실제로 사용한 봉**을 다음 정규 형식으로 직렬화하고 그 해시를 리포트에 남긴다.

```
snapshot = JSON 배열, 원소는 [candle_date_time_utc, trade_price 문자열]
         · 원소 순서는 candle_date_time_utc 오름차순
         · trade_price는 API 응답의 숫자를 소수점 이하 불필요한 0을 제거한 문자열로
         · 구분자·공백 없음 (RFC 8785 JCS)

snapshotHash = keccak256( utf8(snapshot) )
```

이 지표는 봉 하나만 쓰므로 배열의 길이는 1이다.

## 8. definitionHash

```
definitionHash = keccak256( 이 파일의 바이트 전체 )
```

- 대상은 저장소에 커밋된 이 파일의 원문 바이트다. 줄바꿈은 LF.
- 계산된 값은 `docs/metrics/manifest.json`에 기록한다. **manifest는 해시 대상이 아니다** —
  파일이 자기 해시를 포함할 수 없기 때문이다.
- 컨트랙트는 `definitionHash == 0`인 지표의 등록을 거부한다(§11.3).
- **지표는 등록 즉시 frozen이다.** 이 문서가 바뀌면 해시가 달라지고, 그것은 다른 지표다.
  기존 지표를 수정할 수 없으므로 새 `metricId`로 등록해야 한다.

## 9. 이 지표가 하지 않는 것

- 구간 중 특정 가격에 **도달했는지**는 말하지 않는다. 경로 존재형은 MVP에서 제외됐다(§11.1).
- 거래소 간 평균·중앙값을 쓰지 않는다. 업비트 KRW-BTC 단일 소스다.
- 환율 변환을 하지 않는다. KRW 원화 가격 그대로다.
