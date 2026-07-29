# 오프체인 검증기

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install
export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0x87c7a8b3970986e51a8b24e78078540115a70c8c
export POI_METRIC_REGISTRY_ADDRESS=0x2b379095a8b296e2c61f8153e06fc4cdef56af57
# 스키마를 확인해야 다른 스키마의 attestation 을 POI 결정으로 읽지 않는다
export POI_DECISION_SCHEMA_UID=0x2038d08d688d9e4532de17c9ee9634ebbd3b5b853c654726fff94e50604d0151

# 결과가 등록된 결정 — MATCH (종료코드 0)
node --experimental-strip-types verifier/src/cli.ts \
  0x4fd150e4f2b0891c89693e05b37691be5e9700e216f73247170c4bfb1fabb3f8 --json
```

검증기는 온체인 정산을 읽고 업비트 공개 1분봉으로 관측값을 직접 다시 계산해
대조합니다.

공개된 원문은 다음처럼 commitment와 대조합니다.

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts \
  0xc2b03f0192ded81e7d3e5d5a1d75bec0250ab5735bf1cee63aba6b601ff22c5e \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  > **`--payload` 는 JSON 이다.** 결정 본문이 문자열이면 큰따옴표까지 포함해야 한다.

```bash
--payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc $POI_RPC_URL
```

검증 도구는 attester를 입력받지 않고 온체인에서 읽습니다.
