# 스키마 정의

> 출처: `docs/DEPLOYMENT.md`. 값이 다르면 그쪽이 옳습니다.

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0xbeb96f68b7232b3205fa8bfb65f3d7e260b013088b4db415578d3eafa8db836c` | false |
| `poi.decision.v1` | `0x393daa0863ba418bd31c2026eae9a96305a57d513fa6a74b9a2120b4ce2469ea` | false |
| `poi.settlement.v1` | `0x84f169dc66866931bb510e14f04c7d7f62df530dbde50e40a7d7f2eb3ee97c54` | true |
| `poi.challenge.v1` | `0x68c45508ba2a133013581cfa70cdc736847f554224a1876ffd0feb5930ef6d43` | true |

결정과 노트는 철회 불가입니다. 정산과 이의는 관측 오류를 정정할 수 있도록
철회 가능합니다.
