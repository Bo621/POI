# 온체인에서 직접

준비물은 `cast`(Foundry)와 Node 22+뿐입니다. 지갑도 가스도 필요 없습니다.

```bash
export RPC=https://sepolia-rpc.giwa.io/
export EAS=0x4200000000000000000000000000000000000021
export DECISION_RESOLVER=0x2b379095a8b296e2c61f8153e06fc4cdef56af57
cast code $DECISION_RESOLVER --rpc-url $RPC | head -c 20
```

## 지표 정의 해시

```bash
cast call $DECISION_RESOLVER \
  "metrics(bytes32)(bool,uint8,uint8,bytes32,bool)" \
  "0x83b04966e07f0f83592e71060b3356d7""16b4dff9f824bd76d0f9d149c54cafcf" --rpc-url $RPC

# 파일 **원본 바이트**의 해시다. `$(cat …)` 는 끝 개행을 지워 다른 값이 나온다.
cast keccak "0x$(xxd -p -c 999999 < docs/metrics/BTC_PRICE_KRW_AT_END.md | tr -d '\n')"
```

온체인 `definitionHash`와 저장소 원본 문서의 해시가 같고 마지막 필드는 `true`,
즉 `frozen`입니다.

## 과거 구간과 모순된 정산 차단

```solidity
if (d.windowStart < attestTime) revert WindowInPast();   // I4
```

```solidity
uint8 expect = _eval(d.outcomeOp, s.observedValue, d.outcomeThreshold) ? 0 : 1;
if (s.result != expect) revert ResultMismatch();   // I17
```
