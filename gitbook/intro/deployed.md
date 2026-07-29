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
| `POINoteResolver` | `0x03822d12dddb59d28cf1197853c5ae85beb1d165` |
| `POIDecisionResolver` | `0x2b379095a8b296e2c61f8153e06fc4cdef56af57` |
| `POISettlementResolver` | `0x87c7a8b3970986e51a8b24e78078540115a70c8c` |
| `POIChallengeResolver` | `0xa7203c170dedb490e32c492cdbe9e968c57168aa` |

## 스키마

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x12817297a9c8381a81d2b22ff35ca98ce0ee4e21618e3e39fb638e161a475d11` | false |
| `poi.decision.v1` | `0x2038d08d688d9e4532de17c9ee9634ebbd3b5b853c654726fff94e50604d0151` | false |
| `poi.settlement.v1` | `0xb9d802583bb9fecf0846389b40d584510cada0f685d6a25774a1a54f0fb857c4` | **true** |
| `poi.challenge.v1` | `0x34405f11f0450d75d061fccb958fe5133a51c9a0851c7c4708dbe52925e0efff` | **true** |

## OVERDUE fixture

| | 값 |
|---|---|
| decisionUID | `0xc2b03f0192ded81e7d3e5d5a1d75bec0250ab5735bf1cee63aba6b601ff22c5e` |
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
| 결정 — 등록완료 + 이의 | `0x4fd150e4f2b0891c89693e05b37691be5e9700e216f73247170c4bfb1fabb3f8` |
| └ 정산 | `0x7bd0d1ab80dfdfdafe666a60d4dca6ced77e8d0134780445dbeecd5641b82548` |
| └ 이의 (별도 지갑) | `0x583bd2fe63d99c27e8b3d4030a007c617fdb9f4fc16d93b5b0ec094ac78c1bd1` |
| 결정 — 철회 이력 | `0xaced96705a1806810bc469938071f692f6c7c249ce6ecacfc27e34a11149c49b` |
| └ S1 (철회됨) | `0x36b1e6685077f38b2f77a6a7bb0cb49c6456ce861160f246bd12ccef4d6691df` |
| └ S2 (정정) | `0x9883b7ce2a66d935523f927109671e2a9215e57f6ed7dfb9a59e1c91e774b033` |

이의자 지갑 `0xca89C0F26C99B89F2638649D9b597cA264c7Af5c` 는 **정산자와 다른 주소**입니다.
컨트랙트는 자기 정산에 대한 이의를 막지 않지만, 같은 주소면 제3자 이의로 읽히지 않습니다.

> **출처는 [`docs/DEPLOYMENT.md`](https://github.com/Bo621/POI/blob/main/docs/DEPLOYMENT.md)
> 하나뿐입니다.** 값이 다르면 그쪽이 옳습니다.
