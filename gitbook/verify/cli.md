# 오프체인 검증기

```bash
git clone <repo> && cd poi && pnpm install
export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0xbc386addcd3cabbbb62dfcb521939fe4610029d1
export POI_METRIC_REGISTRY_ADDRESS=0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66

node --experimental-strip-types verifier/src/cli.ts <decisionUID> --json
```

검증기는 온체인 정산을 읽고 업비트 공개 1분봉으로 관측값을 직접 다시 계산해
대조합니다.

공개된 원문은 다음처럼 commitment와 대조합니다.

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts <decisionUID> \
  --salt <salt> \
  --payload <(printf '%s' '<원문 JSON>') \
  --rpc $POI_RPC_URL
```

검증 도구는 attester를 입력받지 않고 온체인에서 읽습니다.
