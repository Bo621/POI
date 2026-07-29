# 지표 정의의 온체인 고정

```solidity
if (spec.definitionHash == 0) revert MetricDefinitionRequired();
```

`definitionHash`는 계산식·출처·간격·UTC·결측치 정책·스냅샷 해시를 적은
문서 바이트의 keccak256입니다. 등록 즉시 `frozen = true`가 되어 정의를 바꿀 수
없습니다. 지표는 append-only로 추가할 수 있지만 문서 없는 지표는 등록되지 않습니다.

정의 문서 원본:

* [BTC_PRICE_KRW_AT_END.md](https://github.com/Bo621/POI/blob/main/docs/metrics/BTC_PRICE_KRW_AT_END.md)
* [BTC_MAX_DRAWDOWN_IN_WINDOW.md](https://github.com/Bo621/POI/blob/main/docs/metrics/BTC_MAX_DRAWDOWN_IN_WINDOW.md)

각 파일의 keccak256이 온체인 `definitionHash`와 같습니다. 이 문서들은 GitBook으로
복사하지 않습니다.
