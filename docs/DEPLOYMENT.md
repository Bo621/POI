# 배포 기록 — GIWA Sepolia

> **2026-07-29 배포.** 되돌릴 수 없다. 이 문서가 온체인 상태의 유일한 기록이다.

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

## 리졸버 (O3)

| 컨트랙트 | 주소 |
|---|---|
| `POINoteResolver` | `0x83d5c7ad0a024effe6a5d92640f93a19c5be77d0` |
| `POIDecisionResolver` | `0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66` |
| `POISettlementResolver` | `0xbc386addcd3cabbbb62dfcb521939fe4610029d1` |
| `POIChallengeResolver` | `0x56809bb2aeea0f043fa40ea0ae09411c8af0e127` |

`POIDecisionResolver`가 `POIMetricRegistry`를 겸한다 — `addMetric`은 이 주소로 보낸다.

## 스키마 (O3)

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0xbeb96f68b7232b3205fa8bfb65f3d7e260b013088b4db415578d3eafa8db836c` | false |
| `poi.decision.v1` | `0x393daa0863ba418bd31c2026eae9a96305a57d513fa6a74b9a2120b4ce2469ea` | false |
| `poi.settlement.v1` | `0x84f169dc66866931bb510e14f04c7d7f62df530dbde50e40a7d7f2eb3ee97c54` | **true** |
| `poi.challenge.v1` | `0x68c45508ba2a133013581cfa70cdc736847f554224a1876ffd0feb5930ef6d43` | **true** |

> **주의.** 배포 스크립트를 다시 시뮬레이션하면 **다른 UID가 나온다.** 스키마 UID에
> 리졸버 주소가 들어가는데, 재실행은 새 리졸버를 가정하기 때문이다.
> 실제 값은 브로드캐스트 영수증의 `SchemaRegistry` 로그에서 읽은 위 값이다.

네 리졸버 모두 `schemaUID()`가 위 값과 일치함을 온체인에서 확인했다(초기화 완료).

## 지표 (O5)

`POIDecisionResolver`에 등록. **등록 즉시 `frozen = true`** — 정의는 변경 불가.

| 지표 | metricId | decimals | definitionHash |
|---|---|---|---|
| `BTC_PRICE_KRW_AT_END` | `0x83b04966…cafcf` | 0 | `0xdb9b1a42…7a75` |
| `BTC_MAX_DRAWDOWN_IN_WINDOW` | `0x5d3da88e…76d3` | 1 | `0x34a268d1…2581` |

`definitionHash`는 `docs/metrics/*.md`의 바이트 해시다. **문서를 고치면 해시가 달라지고
온체인 값과 어긋난다.** 그 문서들은 수정하지 않는다.

tx: `0x1aa6aab0…df8b` · `0x794c8136…fb49`

## OVERDUE fixture (O4)

**시간은 되감을 수 없다.** 이 값이 데모 녹화 가능 시각을 정한다.

| | 값 |
|---|---|
| decisionUID | `0x68df5b76a3c268ab6d61316f59ef415b8cb333bc9e3e4d908d393d4f7d7ab654` |
| decisionCommitment | `0x46cf8091be32da5ca484417a89ab0bdf9bb41597554c0a519c269ca234f39db9` |
| salt | `0x0f1e2d3c4b5a69788796a5b4c3d2e1f0` |
| payload | `{"fixture":"O4","intent":"overdue-demo"}` |
| windowStart | `1785251956` — 2026-07-29 00:19:16 KST |
| windowEnd | `1785252556` — 00:29:16 KST |
| graceSeconds | `3600` (1시간) |
| **T_overdue** | **`1785256156` — 2026-07-29 01:29:16 KST** |

`T_overdue` 이후 이 결정의 인장이 「기한초과」로 바뀐다. **그 전에는 녹화해도 소용없다.**

공개 검증:

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts \
  0x68df5b76a3c268ab6d61316f59ef415b8cb333bc9e3e4d908d393d4f7d7ab654 \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  --payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc https://sepolia-rpc.giwa.io/
```

`POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021`이 필요하다.

## 프론트 설정

`web/.env.local`에 넣을 값:

```
VITE_CHAIN_ID=91342
VITE_RPC_URL=https://sepolia-rpc.giwa.io/
VITE_EAS_ADDRESS=0x4200000000000000000000000000000000000021
VITE_SCHEMA_REGISTRY_ADDRESS=0x4200000000000000000000000000000000000020
VITE_NOTE_RESOLVER=0x83d5c7ad0a024effe6a5d92640f93a19c5be77d0
VITE_DECISION_RESOLVER=0x7f784bdba6fa0b5437d6809c28a00125c8ab1b66
VITE_SETTLEMENT_RESOLVER=0xbc386addcd3cabbbb62dfcb521939fe4610029d1
VITE_CHALLENGE_RESOLVER=0x56809bb2aeea0f043fa40ea0ae09411c8af0e127
VITE_NOTE_SCHEMA=0xbeb96f68b7232b3205fa8bfb65f3d7e260b013088b4db415578d3eafa8db836c
VITE_DECISION_SCHEMA=0x393daa0863ba418bd31c2026eae9a96305a57d513fa6a74b9a2120b4ce2469ea
VITE_SETTLEMENT_SCHEMA=0x84f169dc66866931bb510e14f04c7d7f62df530dbde50e40a7d7f2eb3ee97c54
VITE_CHALLENGE_SCHEMA=0x68c45508ba2a133013581cfa70cdc736847f554224a1876ffd0feb5930ef6d43
```

> 실제 키 이름은 `web/src/config.ts`와 대조해서 맞출 것.

## 아직 하지 않은 것

| | |
|---|---|
| **O6 소유권 이전** | `POIDecisionResolver`의 owner가 아직 배포 지갑이다. multisig로 옮겨야 한다. `renounce`는 하지 않는다 — Phase 1 지표 추가가 필요하다(B13) |
| **O7 fixture 세트** | SETTLED / 철회→정정 / 이의 있음 4종 |
| **O8 데모 녹화** | `T_overdue` 이후 |
| **O9 익스플로러 verify** | `forge verify-contract` |
| **O2 법률 검토** | 열려 있다. 사용자가 정식 배포 때 보기로 판단 |

## 되돌릴 수 없는 것

- 배포된 리졸버 주소와 스키마 UID
- 등록된 지표 2종 (`frozen = true`)
- O4 fixture의 커밋 시각
