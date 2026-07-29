# 스키마 정의

> 출처: `docs/DEPLOYMENT.md`. 값이 다르면 그쪽이 옳습니다.

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x6fe68a0d4cc7b82ec548a7d0f438b496e6a7c93086a6481d9a836abb51539f6a` | false |
| `poi.decision.v1` | `0xd129ba8915e7d92f61c544d557ddd9ddf6a40ae0defed80faebdb6955e4b3b34` | false |
| `poi.settlement.v1` | `0x017887d2b08c27d4bc084f6c9cdca331e80601e4d0622f93ee56f9791fa80379` | true |
| `poi.challenge.v1` | `0xe21648ef88b4be1e5eb7f86512d911970ea699a0dbb44a08fa9587ee30ab4cb6` | true |

결정과 노트는 철회 불가입니다. 정산과 이의는 관측 오류를 정정할 수 있도록
철회 가능합니다.
