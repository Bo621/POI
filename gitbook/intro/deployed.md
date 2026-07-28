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
| `POINoteResolver` | `0x83d5c7ad0a024effe6a5d92640f93a19c5be77d0` |
| `POIDecisionResolver` | `0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66` |
| `POISettlementResolver` | `0xbc386addcd3cabbbb62dfcb521939fe4610029d1` |
| `POIChallengeResolver` | `0x56809bb2aeea0f043fa40ea0ae09411c8af0e127` |

## 스키마

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0xbeb96f68b7232b3205fa8bfb65f3d7e260b013088b4db415578d3eafa8db836c` | false |
| `poi.decision.v1` | `0x393daa0863ba418bd31c2026eae9a96305a57d513fa6a74b9a2120b4ce2469ea` | false |
| `poi.settlement.v1` | `0x84f169dc66866931bb510e14f04c7d7f62df530dbde50e40a7d7f2eb3ee97c54` | **true** |
| `poi.challenge.v1` | `0x68c45508ba2a133013581cfa70cdc736847f554224a1876ffd0feb5930ef6d43` | **true** |

## OVERDUE fixture

| | 값 |
|---|---|
| decisionUID | `0x06ccb34d85d43a9bcde4c343c10b233e9d4a9a7aab2a2571f476205429545ebe` |
| decisionCommitment | `0x46cf8091be32da5ca484417a89ab0bdf9bb41597554c0a519c269ca234f39db9` |
| salt | `0x0f1e2d3c4b5a69788796a5b4c3d2e1f0` |
| payload | `{"fixture":"O4","intent":"overdue-demo"}` |
| windowStart | `1785251956` — 2026-07-29 00:19:16 KST |
| windowEnd | `1785252556` — 00:29:16 KST |
| graceSeconds | `3600` (1시간) |
| **T_overdue** | **`1785256156` — 2026-07-29 01:29:16 KST** |
