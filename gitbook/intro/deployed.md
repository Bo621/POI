# 배포된 주소와 UID

> **출처: `docs/DEPLOYMENT.md` — 값이 다르면 그쪽이 옳습니다.**
>
> `O4`·`O7`·`O8`·`O10` 은 내부 배포 작업 번호입니다. 각각 기한초과 · 등록완료와 이의 ·
> 도장 검증 · 결정 그래프를 화면에서 볼 수 있게 만든 fixture 를 가리킵니다.
>
> `fixture` 는 화면에서 상태를 확인하려고 미리 발행해 둔 **실제 온체인 기록**입니다.

## 체인

| | |
|---|---|
| 네트워크 | GIWA Sepolia |
| Chain ID | `91342` |
| RPC | `https://sepolia-rpc.giwa.io/` |
| 익스플로러 | `https://sepolia-explorer.giwa.io` |
| EAS | `0x4200000000000000000000000000000000000021` (v1.4.1-beta.3, ERC-1967 프록시) |
| SchemaRegistry | `0x4200000000000000000000000000000000000020` |
| 배포 지갑 | `0xA1Cb5CbC9D7a0B7164a1bFE4B19bfe1Bf38BF310` |

## 리졸버

| 컨트랙트 | 주소 |
|---|---|
| `POINoteResolver` | `0x7eefdd7d89d434061cbdb22244d52e78c94e6008` |
| `POIDecisionResolver` | `0x0f25917176a405bb9022e5b417e0d57348b30f89` |
| `POISettlementResolver` | `0x167cf06df663c5ddde9f20a748e724b4fb6c14fa` |
| `POIChallengeResolver` | `0xef4422c035bcce0599e4c951a24059abf707595f` |

## 스키마

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x817dd70fe2cc9f2de98259ec25b181504b94be0448c54c5a329266fc4619efac` | false |
| `poi.decision.v1` | `0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749` | false |
| `poi.settlement.v1` | `0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e` | **true** |
| `poi.challenge.v1` | `0x3557adc085b634167345fe0529a3aab5a5bb27ecddf9f9640acb17b43d90b141` | **true** |

## OVERDUE fixture

| | 값 |
|---|---|
| decisionUID | `0x3f592f21a7e5a733d3dd90caeb2f9ec35bffa335b69da7310749694283e16938` |
| decisionCommitment | `0x46cf8091be32da5ca484417a89ab0bdf9bb41597554c0a519c269ca234f39db9` |
| salt | `0x0f1e2d3c4b5a69788796a5b4c3d2e1f0` |
| payload | `{"fixture":"O4","intent":"overdue-demo"}` |
| windowStart | `1785338205` — 2026-07-30 00:16:45 KST |
| windowEnd | `1785338805` — 00:26:45 KST |
| graceSeconds | `3600` (1시간) |
| **T_overdue** | **`1785342405` — 2026-07-30 01:26:45 KST** |

## 문서용 데모 결정 — 의미 있는 임계값

피치덱과 백서가 인용하는 예시입니다. O7 fixture 는 임계값이 `1`(항상 참)이라
메커니즘 시연에는 맞지만 「특정 가격을 넘는다」는 서술의 근거가 되지 못합니다.
그래서 실제 가격 수준을 임계값으로 둔 결정을 따로 발행했습니다.

```
술어   BTC_PRICE_KRW_AT_END  >  90,000,000   (op GT · decimals 0 · frozen)
구간   1785484081 ~ 1785484681  (600초)
관측   91,179,000  ·  upbit-1m-candles  ·  observedAt = windowEnd
판정   result 0 (맞음) — 컨트랙트가 I17 로 재계산해 강제
```

| | UID |
|---|---|
| 결정 | `0x5e3418439aeb348790f474dc72501493d18bb447f6dcb919c7f1f262b1353f3d` |
| └ 정산 | `0x3cf101d1aaaddf9630b31f0802d2d416d2ae5ec7ab3dee6905e0b3542c1712ed` |

커밋 tx `0xb5cf0ff2…9d1e6b` · 정산 tx `0xc964aef7…30d062d`
검증기 재현 — `MATCH` · 종료코드 0 · 1분봉 9건 스냅샷 해시 `0x34ef2265…175e5c`

## 데모 fixture (O7)

관측 구간 `1785342794 ~ 1785343394` (600초) · 관측값 **91,688,000** (BTC/KRW, 업비트 1분봉)
온체인에서 직접 읽은 값입니다 — 결정·정산 attestation 을 `cast call` 로 확인했습니다.

| | UID |
|---|---|
| 결정 — 등록완료 + 이의 | `0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888` |
| └ 정산 | `0x9ae6d320a0866e08fee6558b322882cfe96ad962c75c14b7217e54e51f65fa52` |
| └ 이의 (별도 지갑) | `0x655fc265772f626fdcb6b5558540c8877e1d8f418a0d857cdaa976684e75d6ee` |
| 결정 — 철회 이력 | `0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21` |
| └ S1 (철회됨) | `0x705ba4ae8590b1df540dc9698dd87980144eca6e5c15ae820dbef9ef42ebeff5` |
| └ S2 (정정) | `0xebfe8ead8739b82bcb4591409a55bdb63d290c703e5f0abb9b8ca3910ac27ab3` |

이의자 지갑 `0xca89C0F26C99B89F2638649D9b597cA264c7Af5c` 는 **정산자와 다른 주소**입니다.
컨트랙트는 자기 정산에 대한 이의를 막지 않지만, 같은 주소면 제3자 이의로 읽히지 않습니다.

## Decision Graph fixture (O10)

「판단이 이어진다」를 화면에서 볼 수 있게 만든 것입니다.

| | UID |
|---|---|
| 노트 | `0x95692da63de1f89b5973c8ce67698e4d757254812dfb6f500727d76b46b911da` |
| 부모 결정 (노트 승격) | `0xe015bb0a57ef32f7fa579a0ed7951555405ea6febdbe63fb4ceece0e468786db` |
| 자식 결정 (부모 참조) | `0x5d2a066cec47c29327e955c11a46ca028fe8a8ecda62cffc8b29bf4441570606` |

부모의 `promotedFromNote` 가 노트 UID 이고, 자식의 `refUID` 와 `parents[0]` 가 둘 다
부모 UID 입니다. 둘이 갈라지면 인덱서마다 다른 그래프를 그립니다 (I12).

## 도장 검증 스냅샷 (O8)

`POIDecisionResolver` 의 `verifiedSchemaUID` 는
`0x072d75e18b2be4f89a13a7147240477481c4b526d5795802acba59046b426e08` (`bool isVerified`) 이고,
허용 발급자는 `0x09B170CA…49C6`(**UPBIT KOREA**) · `0x63CCe2b5…6121`(**TESTNET FAUCET**) 입니다.

검증 스냅샷을 붙인 결정은 위 기한초과 fixture(`0x3f592f21…e16938`) 이고
화면에 「도장 검증 — TESTNET FAUCET」 으로 표시됩니다.
**저희가 받아 본 것은 파우셋 발급분입니다** — 업비트 KYC 발급 경로는 같은 컨트랙트 검사를
타지만 직접 검증하지 못했습니다.

> **출처는 [`docs/DEPLOYMENT.md`](https://github.com/Bo621/POI/blob/main/docs/DEPLOYMENT.md)
> 하나뿐입니다.** 값이 다르면 그쪽이 옳습니다.
