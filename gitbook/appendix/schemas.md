# 스키마 정의

> 출처: [`docs/DEPLOYMENT.md`](https://github.com/Bo621/POI/blob/main/docs/DEPLOYMENT.md).
> 값이 다르면 그쪽이 옳습니다.
>
> `UID` 는 스키마 하나를 가리키는 고유 번호이고, `revocable` 은 그 스키마로 발행한
> 기록을 나중에 철회할 수 있는지를 뜻합니다.

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x817dd70fe2cc9f2de98259ec25b181504b94be0448c54c5a329266fc4619efac` | false |
| `poi.decision.v1` | `0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749` | false |
| `poi.settlement.v1` | `0x54c112d4e35161c8b2547a52e450d3f69d4e2199021fbc0035e8e4aa7f23dd6e` | true |
| `poi.challenge.v1` | `0x3557adc085b634167345fe0529a3aab5a5bb27ecddf9f9640acb17b43d90b141` | true |

결정과 노트는 철회 불가입니다. 정산과 이의는 관측 오류를 정정할 수 있도록
철회 가능합니다.
