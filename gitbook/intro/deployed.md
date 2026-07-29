# 배포된 주소와 UID

> **출처: `docs/DEPLOYMENT.md` — 값이 다르면 그쪽이 옳다.**

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
| windowStart | `1785338205` — 2026-07-29 00:19:16 KST |
| windowEnd | `1785338805` — 00:29:16 KST |
| graceSeconds | `3600` (1시간) |
| **T_overdue** | **`1785342405` — 2026-07-29 01:29:16 KST** |

## 데모 fixture (O7)

관측 구간 `1785338307 ~ 1785338907` · 관측값 **91,998,000** (BTC/KRW, 업비트 1분봉)

| | UID |
|---|---|
| 결정 — 등록완료 + 이의 | `0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888` |
| └ 정산 | `0x7bd0d1ab80dfdfdafe666a60d4dca6ced77e8d0134780445dbeecd5641b82548` |
| └ 이의 (별도 지갑) | `0x583bd2fe63d99c27e8b3d4030a007c617fdb9f4fc16d93b5b0ec094ac78c1bd1` |
| 결정 — 철회 이력 | `0xb1e4628344ade15e9779b4f0398f3d6ddf820b92094c4c84fe8304a68a683b21` |
| └ S1 (철회됨) | `0x36b1e6685077f38b2f77a6a7bb0cb49c6456ce861160f246bd12ccef4d6691df` |
| └ S2 (정정) | `0x9883b7ce2a66d935523f927109671e2a9215e57f6ed7dfb9a59e1c91e774b033` |

이의자 지갑 `0xca89C0F26C99B89F2638649D9b597cA264c7Af5c` 는 **정산자와 다른 주소**입니다.
컨트랙트는 자기 정산에 대한 이의를 막지 않지만, 같은 주소면 제3자 이의로 읽히지 않습니다.

> **출처는 [`docs/DEPLOYMENT.md`](https://github.com/Bo621/POI/blob/main/docs/DEPLOYMENT.md)
> 하나뿐입니다.** 값이 다르면 그쪽이 옳습니다.
