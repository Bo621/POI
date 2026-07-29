# 스키마 정의

> 출처: `docs/DEPLOYMENT.md`. 값이 다르면 그쪽이 옳습니다.

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x12817297a9c8381a81d2b22ff35ca98ce0ee4e21618e3e39fb638e161a475d11` | false |
| `poi.decision.v1` | `0x2038d08d688d9e4532de17c9ee9634ebbd3b5b853c654726fff94e50604d0151` | false |
| `poi.settlement.v1` | `0xb9d802583bb9fecf0846389b40d584510cada0f685d6a25774a1a54f0fb857c4` | true |
| `poi.challenge.v1` | `0x34405f11f0450d75d061fccb958fe5133a51c9a0851c7c4708dbe52925e0efff` | true |

결정과 노트는 철회 불가입니다. 정산과 이의는 관측 오류를 정정할 수 있도록
철회 가능합니다.
