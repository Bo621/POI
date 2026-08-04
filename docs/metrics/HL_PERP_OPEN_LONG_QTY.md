# HL_PERP_OPEN_LONG_QTY

`POI_TechSpec_v3.md` §11.3이 요구하는 지표 정의 문서. 이 파일의 해시가 `definitionHash`다.

| | |
|---|---|
| metricId | `keccak256("HL_PERP_OPEN_LONG_QTY")` |
| kind | `WINDOW_END_EVALUATED` (0, §11.1) |
| 단위 | qty |
| decimals | **8** (수량 × 10^8 정수) |
| 평가 시점 | `windowEnd` 한 번만. 구간 전체의 체결을 입력으로 받아 `end`에 한 번 계산된다 |
| verifier | `poi-verifier/1.0.0` |

> 구간 **전체**를 보지만 값은 `end`에 한 번 확정된다. 이것이 `WINDOW_END_EVALUATED`이며,
> `observedAt == windowEnd`가 컨트랙트에서 강제된다.

---

## 1. 데이터 소스

| | |
|---|---|
| 거래소 | Hyperliquid |
| 마켓 | 결정 payload의 `coin`에 선언된 무기한 선물 종목 |
| 엔드포인트 | `POST https://api.hyperliquid.xyz/info` |
| 인증 | **없음.** 공개 엔드포인트이며 API 키·서명·쿠키를 쓰지 않는다 |
| 요청 본문 | `{"type":"userFillsByTime","user":"<wallet>","startTime":<windowStart_ms>,"endTime":<windowEnd_ms>,"aggregateByTime":false}` |
| 응답 제한 | 한 응답당 최대 2,000건이며 해당 지갑의 최근 10,000건만 조회할 수 있다 |

결정 payload는 다음 두 필드를 선언해야 한다.

| 필드 | 의미 |
|---|---|
| `wallet` | 조회할 20바이트 지갑 주소. `0x`로 시작하는 42자 hexadecimal 문자열 |
| `coin` | Hyperliquid 응답의 `coin`과 대소문자까지 정확히 비교할 종목 문자열 |

응답의 각 원소에서 다음 필드를 쓴다.

| 필드 | 의미 |
|---|---|
| `time` | 체결 시각, Unix 밀리초 |
| `coin` | 체결 종목 |
| `dir` | 포지션 개폐 방향. 이 지표는 정확히 `Open Long`인 값만 쓴다 |
| `sz` | 체결 수량을 나타내는 10진 문자열 |

`px`·`closedPnl`·`fee`·`side`·`startPosition`은 계산에 쓰지 않는다.

## 2. 타임존

**UTC 고정.** 응답의 `time`은 Unix 밀리초이고, `windowStart`·`windowEnd`는 온체인
`uint64` Unix 초다. 각각 1,000을 곱해 밀리초로 비교하며 타임존 변환을 하지 않는다.

`startTime`과 `endTime`은 모두 포함 경계다. 따라서 관측 구간은
`windowStart * 1000 <= time <= windowEnd * 1000`이다.

## 3. 관측 간격

**개별 체결 단위.** 봉이나 고정 간격으로 재표본화하지 않는다.

> 같은 주문이 여러 체결로 나뉘어도 각 응답 원소의 `sz`를 더한다. 요청의
> `aggregateByTime`은 `false`로 고정해 원본 체결 단위를 유지한다.

## 4. 계산식

```
입력: windowStart, windowEnd   (Unix 초, UTC)
      payload.wallet, payload.coin

start_ms = windowStart * 1000
end_ms   = windowEnd * 1000

fills = userFillsByTime(payload.wallet, start_ms, end_ms)

selected = [ f : start_ms <= f.time <= end_ms
                  and f.coin == payload.coin
                  and f.dir == "Open Long" ]

raw = sum(decimal(f.sz) for f in selected)       # 수량 합계
value = round_half_up(raw * 10^8)
return value                                      # int128, 0 이상
```

- `wallet`은 API 조회 대상을, `coin`은 응답 필터를 결정한다. 둘 다 결정 payload에
  선언되어 commitment로 고정된 값만 쓴다.
- `dir`은 **문자열이 정확히 `Open Long`인 체결만** 허용한다. `Close Short`·
  `Open Short`·`Close Long`은 더하지 않는다.
- 조건을 만족하는 체결이 없으면 빈 합의 값인 **0**을 반환한다.
- `sz`는 부호 없는 10진 수량이어야 하며 결과는 `int128` 범위를 넘지 않아야 한다.

응답이 2,000건이면 잘렸을 수 있으므로 시간 구간을 서로 겹치지 않는 밀리초 구간으로
나눠 다시 조회한다. 1밀리초 구간에서도 2,000건이 반환되거나, 필요한 체결이 API가
제공하는 최근 10,000건 범위 밖이면 완전한 합계를 보장할 수 없으므로 값을 만들지 않는다.

## 5. 결측치 처리

**보간하지 않는다. 직전 값을 이월하지 않는다.**

| 상황 | 처리 |
|---|---|
| 조건을 만족하는 체결이 **없음** | 관측값 `0` (`hasObservedValue = true`) |
| 조건을 만족하는 체결이 하나 이상 | 모든 `sz`의 합계를 쓴다 |
| payload의 `wallet`·`coin`이 없거나 형식이 잘못됨 | 값을 만들지 않고 중단한다 |
| 응답 제한 때문에 구간 전체를 조회할 수 없음 | 값을 만들지 않고 중단한다 |
| API 오류·타임아웃 | 지수 백오프 3회 재시도. 그래도 실패하면 **값을 만들지 않고 중단**한다 |

> 체결이 없다는 사실은 이 지표에서 유효한 관측 결과 0이다. API 조회 실패나 응답
> 잘림은 체결이 없다는 뜻이 아니므로 0이나 `INDETERMINATE`로 바꾸지 않는다.

## 6. 반올림

**half-up**, 절댓값 기준. `2.5 → 3`, `-2.5 → -3` (이 지표의 값은 음수가 되지 않는다).

`sz` 문자열을 정확한 10진수로 파싱해 모두 더한 뒤 한 번만 `10^8`을 곱하고 반올림한다.
예: 합계 `0.02339` qty → `2339000`.

구현은 **문자열 → bigint** 경로를 사용하며 부동소수를 거치지 않는다. 각 체결을 먼저
반올림한 뒤 더하지 않는다 — 합계를 먼저 구한 뒤 최종 결과를 한 번만 반올림한다.

## 7. 데이터셋 스냅샷 해시

verifier는 계산에 **실제로 사용한 체결 전체**를 다음 정규 형식으로 직렬화하고 그 해시를
리포트에 남긴다.

```
snapshot = JSON 배열, 원소는 [time, coin, dir, sz 문자열, hash, oid, tid]
         · 원소 순서는 time, tid, oid, hash 오름차순
         · sz는 소수점 이하 불필요한 0을 제거한 10진 문자열로
         · 구분자·공백 없음 (RFC 8785 JCS)

snapshotHash = keccak256( utf8(snapshot) )
```

조건을 만족하는 체결이 없으면 `snapshot`은 빈 배열 `[]`이다.

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

- 롱 포지션의 현재 잔고·평균 진입가·손익을 계산하지 않는다. `Open Long` 체결 수량만 더한다.
- `Close Short`를 롱 진입으로 간주하지 않는다. API의 `dir` 분류를 그대로 쓴다.
- 체결 가격·VWAP·수수료·USDC 환산액을 계산하지 않는다. 단위는 `qty`다.
- payload에 선언되지 않은 다른 지갑이나 종목의 거래를 조회하거나 합산하지 않는다.
- Hyperliquid API가 제공하는 최근 10,000건보다 오래된 체결의 완전성을 보장하지 않는다.
