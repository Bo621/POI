# 오프체인 검증기

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install
export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0xbc386addcd3cabbbb62dfcb521939fe4610029d1
export POI_METRIC_REGISTRY_ADDRESS=0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66

# 결과가 등록된 결정 — MATCH (종료코드 0)
node --experimental-strip-types verifier/src/cli.ts \
  0x061ac961bb031dfb9436478f92c898e64bb600871d0f461c394a00b0aa591a69 --json
```

검증기는 온체인 정산을 읽고 업비트 공개 1분봉으로 관측값을 직접 다시 계산해
대조합니다.

공개된 원문은 다음처럼 commitment와 대조합니다.

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts \
  0x06ccb34d85d43a9bcde4c343c10b233e9d4a9a7aab2a2571f476205429545ebe \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  --payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc $POI_RPC_URL
```

검증 도구는 attester를 입력받지 않고 온체인에서 읽습니다.
