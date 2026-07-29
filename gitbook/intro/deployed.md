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
| `POINoteResolver` | `0xa8bd89b229dcb07e90e84df18e0fae27fa965f0c` |
| `POIDecisionResolver` | `0xd4786313817f1bfd14fc6047fdce9db8382e879a` |
| `POISettlementResolver` | `0x2b21d233b51bc08d0e54458470c4bfef364baee6` |
| `POIChallengeResolver` | `0x74e6165fa656d4ad89cad1bcc0af32598193f3e0` |

## 스키마

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x6fe68a0d4cc7b82ec548a7d0f438b496e6a7c93086a6481d9a836abb51539f6a` | false |
| `poi.decision.v1` | `0xd129ba8915e7d92f61c544d557ddd9ddf6a40ae0defed80faebdb6955e4b3b34` | false |
| `poi.settlement.v1` | `0x017887d2b08c27d4bc084f6c9cdca331e80601e4d0622f93ee56f9791fa80379` | **true** |
| `poi.challenge.v1` | `0xe21648ef88b4be1e5eb7f86512d911970ea699a0dbb44a08fa9587ee30ab4cb6` | **true** |

## OVERDUE fixture

| | 값 |
|---|---|
| decisionUID | `0x919d43269abba2b82fd463761dda85cd78d44f633224a86bd3ec293e39ffc30f` |
| decisionCommitment | `0x46cf8091be32da5ca484417a89ab0bdf9bb41597554c0a519c269ca234f39db9` |
| salt | `0x0f1e2d3c4b5a69788796a5b4c3d2e1f0` |
| payload | `{"fixture":"O4","intent":"overdue-demo"}` |
| windowStart | `1785251956` — 2026-07-29 00:19:16 KST |
| windowEnd | `1785252556` — 00:29:16 KST |
| graceSeconds | `3600` (1시간) |
| **T_overdue** | **`1785256156` — 2026-07-29 01:29:16 KST** |

## 데모 fixture (O7)

관측 구간 `1785252583 ~ 1785253183` · 관측값 **92,602,000** (BTC/KRW, 업비트 1분봉)

| | UID |
|---|---|
| 결정 — 등록완료 + 이의 | `0x3f845e794b96ba9df4383aaf5bd1b886730538e3aa9b5c8d5d91d8b4ec51ce0d` |
| └ 정산 | `0x4924bd9a386dfc9ab0b29c810207595f05fdf9554a7925510cc4d0856143534f` |
| └ 이의 (별도 지갑) | `0x9cb1f76884e7c4ab61659efd85a46a19afbf4dd4657a1f66dd7934b836455c3d` |
| 결정 — 철회 이력 | `0x22f65981071834acd8ec6efae7ca9f4874cb845e635f2e9453d8c17634fc6f7d` |
| └ S1 (철회됨) | `0x03fbfece60c64cd41d1b70d9cb3bc55d311093d7cce5c8bf3ab37bdc7d0b9095` |
| └ S2 (정정) | `0xfdee0986581f52addcb6026570f3964e5d9fd58b0e9331207f478b1133cff69e` |

이의자 지갑 `0xca89C0F26C99B89F2638649D9b597cA264c7Af5c` 는 **정산자와 다른 주소**입니다.
컨트랙트는 자기 정산에 대한 이의를 막지 않지만, 같은 주소면 제3자 이의로 읽히지 않습니다.

> **출처는 [`docs/DEPLOYMENT.md`](https://github.com/Bo621/POI/blob/main/docs/DEPLOYMENT.md)
> 하나뿐입니다.** 값이 다르면 그쪽이 옳습니다.
