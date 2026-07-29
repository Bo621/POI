# 배포 기록 — GIWA Sepolia

> **2026-07-29 재배포.** 되돌릴 수 없다. 이 문서가 온체인 상태의 유일한 기록이다.
>
> 코덱스 심사가 찾은 검증 공백(도장 스키마·발급자 미확인, provenance 빈 문자열 허용)을
> 컨트랙트에서 닫으면서 **주소와 스키마 UID 가 전부 바뀌었다.** 이전 배포의 값은 무효다.
> 이전 fixture 도 구 스키마에 묶여 있어 새로 만들었다.

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
| `POINoteResolver` | `0xa8bd89b229dcb07e90e84df18e0fae27fa965f0c` |
| `POIDecisionResolver` | `0xd4786313817f1bfd14fc6047fdce9db8382e879a` |
| `POISettlementResolver` | `0x2b21d233b51bc08d0e54458470c4bfef364baee6` |
| `POIChallengeResolver` | `0x74e6165fa656d4ad89cad1bcc0af32598193f3e0` |

`POIDecisionResolver`가 `POIMetricRegistry`를 겸한다 — `addMetric`은 이 주소로 보낸다.

## 스키마 (O3)

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x6fe68a0d4cc7b82ec548a7d0f438b496e6a7c93086a6481d9a836abb51539f6a` | false |
| `poi.decision.v1` | `0xd129ba8915e7d92f61c544d557ddd9ddf6a40ae0defed80faebdb6955e4b3b34` | false |
| `poi.settlement.v1` | `0x017887d2b08c27d4bc084f6c9cdca331e80601e4d0622f93ee56f9791fa80379` | **true** |
| `poi.challenge.v1` | `0xe21648ef88b4be1e5eb7f86512d911970ea699a0dbb44a08fa9587ee30ab4cb6` | **true** |

> ### ⚠️ UID는 **영수증에서만** 읽는다 — 배포 중 두 번 걸렸다
>
> **`forge script`의 `console2.log` 출력과 재시뮬레이션 결과는 실제 온체인 UID가 아니다.**
>
> | 걸린 곳 | 왜 |
> |---|---|
> | 스키마 UID | 스키마 UID에 리졸버 주소가 들어간다. 재시뮬레이션은 *새* 리졸버를 가정한다 |
> | attestation UID | EAS의 UID는 블록 시각을 포함한다. 시뮬레이션 시각 ≠ 채굴된 블록 시각 |
>
> 두 번째 것은 O4에서 실제로 틀린 UID를 기록했고, 화면에 「해당 기록을 찾을 수 없습니다」가
> 떠서 발견했다. **항상 `broadcast/<script>/91342/run-latest.json`의 로그에서 읽고,
> `getAttestation`으로 되읽어 확인할 것.**
>
> `Attested` 이벤트에서 uid는 **indexed가 아니라 `data`에 있다.**
> topics는 `[sig, recipient, attester, schemaUID]`다.

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
| decisionUID | `0x919d43269abba2b82fd463761dda85cd78d44f633224a86bd3ec293e39ffc30f` |
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
  0x919d43269abba2b82fd463761dda85cd78d44f633224a86bd3ec293e39ffc30f \
  --salt 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0 \
  --payload <(printf '%s' '{"fixture":"O4","intent":"overdue-demo"}') \
  --rpc https://sepolia-rpc.giwa.io/
```

`POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021`이 필요하다.

## 공개 URL

```
https://poi-static-production.up.railway.app
```

지갑 없이 조회·검증이 됩니다. Railway 서비스 `poi-static`,
Railpack SPA 모드(`RAILPACK_SPA_OUTPUT_DIR=web/dist`)로 저장소를 그대로 빌드합니다.

## 프론트 빌드

```bash
bash scripts/build_testnet.sh
```

`web/.env.local`을 만들지 않는다 — 그 파일은 `dev_up.sh`가 로컬 anvil 주소로 덮어쓰고
Vite에서 `.env.*`보다 우선한다. 스크립트는 **셸 환경변수**로 넣고(우선순위가 더 높다),
빌드 결과에 테스트넷 주소가 실제로 들어갔는지 `grep`으로 확인한 뒤 종료한다.
**조용히 로컬 주소로 배포되는 것이 최악이라** 그 검사를 넣었다.

값의 출처는 이 문서 하나뿐이다. 스크립트에서 손으로 고치지 말 것.

## 데모 fixture (O7)

**2026-07-29 01:41 KST 완료.** O4 와 같은 관측 구간은 쓸 수 없다 — 그 창은 과거고
I4 가 소급 설정을 막는다. 데모 편의로 핵심 방어를 우회하지 않고 새 구간을 열었다.

관측 구간 `1785252583 ~ 1785253183` · 관측값 **92,602,000** (BTC/KRW, 업비트 1분봉)

| | UID |
|---|---|
| **결정 — 등록완료 + 이의** | `0x3f845e794b96ba9df4383aaf5bd1b886730538e3aa9b5c8d5d91d8b4ec51ce0d` |
| └ 정산 | `0xffb39d70a4d657cb31686b28d151f06dbf674399ececb044ebfe1b62980b4e32` |
| └ **이의 (지갑 B)** | `0x3ab287c6b3a33f75fb5eccb1102928ce0dfc64eac4ed8cecfbc0b3d9927dc37e` |
| **결정 — 철회 이력** | `0x22f65981071834acd8ec6efae7ca9f4874cb845e635f2e9453d8c17634fc6f7d` |
| └ S1 (철회됨) | `0x1b8bd05c1ef57e1014416d24f57d278938bce8e56a22f26c54fa2fbc3f9012cf` |
| └ S2 (정정) | `0x9bc914a5ac66c25abdeb3a02dc399a6efc9e3921559ae73c060cb2a666b98c24` |

이의자 지갑: `0xca89C0F26C99B89F2638649D9b597cA264c7Af5c` — **정산자와 다른 주소다.**
컨트랙트는 자기 정산에 대한 이의를 막지 않지만, 같은 주소면 제3자 이의로 읽히지 않는다.

## 아직 하지 않은 것

| | |
|---|---|
| **O6 소유권 이전** | `POIDecisionResolver`의 owner가 아직 배포 지갑이다. multisig로 옮겨야 한다. `renounce`는 하지 않는다 — Phase 1 지표 추가가 필요하다(B13) |
| **O8 데모 녹화** | `T_overdue`(01:29:16) 경과 — 지금 가능 |
| **O2 법률 검토** | 열려 있다. 사용자가 정식 배포 때 보기로 판단 |

## 되돌릴 수 없는 것

- 배포된 리졸버 주소와 스키마 UID
- 등록된 지표 2종 (`frozen = true`)
- O4 fixture의 커밋 시각
