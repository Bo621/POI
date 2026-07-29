# 오프체인 검증기

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install
export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0x167cf06df663c5ddde9f20a748e724b4fb6c14fa
export POI_METRIC_REGISTRY_ADDRESS=0x0f25917176a405bb9022e5b417e0d57348b30f89
# 스키마를 확인해야 다른 스키마의 attestation 을 POI 결정으로 읽지 않는다
export POI_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749

# 결과가 등록된 결정 — MATCH (종료코드 0)
node --experimental-strip-types verifier/src/cli.ts \
  0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888 --json
```

검증기는 온체인 정산을 읽고 업비트 공개 1분봉으로 관측값을 직접 다시 계산해
대조합니다.

공개된 원문은 다음처럼 commitment와 대조합니다.

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts \
  0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938 \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  > **`--payload` 는 JSON 이다.** 결정 본문이 문자열이면 큰따옴표까지 포함해야 한다.

```bash
--payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc $POI_RPC_URL
```

검증 도구는 attester를 입력받지 않고 온체인에서 읽습니다.
