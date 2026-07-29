# 오프체인 검증기

```bash
git clone https://github.com/Bo621/POI.git && cd POI && pnpm install
export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0x2b21d233b51bc08d0e54458470c4bfef364baee6
export POI_METRIC_REGISTRY_ADDRESS=0xd4786313817f1bfd14fc6047fdce9db8382e879a

# 결과가 등록된 결정 — MATCH (종료코드 0)
node --experimental-strip-types verifier/src/cli.ts \
  0x3f845e794b96ba9df4383aaf5bd1b886730538e3aa9b5c8d5d91d8b4ec51ce0d --json
```

검증기는 온체인 정산을 읽고 업비트 공개 1분봉으로 관측값을 직접 다시 계산해
대조합니다.

공개된 원문은 다음처럼 commitment와 대조합니다.

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts \
  0x919d43269abba2b82fd463761dda85cd78d44f633224a86bd3ec293e39ffc30f \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  > **`--payload` 는 JSON 이다.** 결정 본문이 문자열이면 큰따옴표까지 포함해야 한다.

```bash
--payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc $POI_RPC_URL
```

검증 도구는 attester를 입력받지 않고 온체인에서 읽습니다.
