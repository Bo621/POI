# 배포 기록 — GIWA Sepolia

> **2026-07-30 재배포 (2차).** 되돌릴 수 없다. 이 문서가 온체인 상태의 유일한 기록이다.
>
> 코덱스 심사가 찾은 검증 공백(도장 스키마·발급자 미확인, provenance 빈 문자열 허용)을
> 컨트랙트에서 닫으면서 **주소와 스키마 UID 가 전부 바뀌었다.** 이전 배포의 값은 무효다.
> 이전 fixture 도 구 스키마에 묶여 있어 새로 만들었다.
>
> **2차 재배포 이유**: 결정 payload 가 길이만 검사해 **길이를 유지한 offset 변조**가
> 통과했다(codex 3라운드). 정산과 같은 재인코딩 대조로 고치면서 바이트코드가 바뀌었다.

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
| `POINoteResolver` | `0x03822d12dddb59d28cf1197853c5ae85beb1d165` |
| `POIDecisionResolver` | `0x2b379095a8b296e2c61f8153e06fc4cdef56af57` |
| `POISettlementResolver` | `0x87c7a8b3970986e51a8b24e78078540115a70c8c` |
| `POIChallengeResolver` | `0xa7203c170dedb490e32c492cdbe9e968c57168aa` |

`POIDecisionResolver`가 `POIMetricRegistry`를 겸한다 — `addMetric`은 이 주소로 보낸다.

## 스키마 (O3)

| 스키마 | UID | revocable |
|---|---|---|
| `poi.note.v1` | `0x12817297a9c8381a81d2b22ff35ca98ce0ee4e21618e3e39fb638e161a475d11` | false |
| `poi.decision.v1` | `0x2038d08d688d9e4532de17c9ee9634ebbd3b5b853c654726fff94e50604d0151` | false |
| `poi.settlement.v1` | `0xb9d802583bb9fecf0846389b40d584510cada0f685d6a25774a1a54f0fb857c4` | **true** |
| `poi.challenge.v1` | `0x34405f11f0450d75d061fccb958fe5133a51c9a0851c7c4708dbe52925e0efff` | **true** |

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

## 익스플로러 검증 (O9)

네 컨트랙트 모두 `sepolia-explorer.giwa.io` 에서 **독립 검증**됐다 (2026-07-29).

> `forge verify-contract` 는 바이트코드가 같은 구 컨트랙트를 「verified twin」 으로
> 찾아 "이미 검증됨"이라며 건너뛴다. **그 상태는 `is_verified: false` 다** —
> 남의 소스를 빌려 보여줄 뿐이다. `--force` 로도 안 되고,
> etherscan 호환 엔드포인트(`?module=contract&action=verifysourcecode`)에
> standard-json 을 직접 POST 해야 twin 참조가 사라진다.

```bash
forge verify-contract <addr> <path:Name> --chain-id 91342 --verifier blockscout \
  --verifier-url https://sepolia-explorer.giwa.io/api --show-standard-json-input > input.json
curl -X POST "https://sepolia-explorer.giwa.io/api?module=contract&action=verifysourcecode" \
  --data-urlencode "codeformat=solidity-standard-json-input" \
  --data-urlencode "contractaddress=<addr>" \
  --data-urlencode "contractname=<path:Name>" \
  --data-urlencode "compilerversion=v0.8.30+commit.73712a01" \
  --data-urlencode "constructorArguements=0000000000000000000000004200000000000000000000000000000000000021" \
  --data-urlencode "sourceCode@input.json"
```

확인: `GET /api/v2/smart-contracts/<addr>` 의 `is_verified` 가 `true` 이고
`verified_twin_address_hash` 가 `null` 이어야 한다.

## 소유권 (O6) — 2-of-2 multisig

| | |
|---|---|
| Safe | `0x215253B830D51df7f8364fF6dA32140006E4DCE1` (Safe L2 v1.4.1) |
| 소유자 | `0xA1Cb5CbC…F310` (배포) · `0x77E8DFC4…dfaa` |
| 임계값 | **2 / 2** |
| 대상 | `POIDecisionResolver` `0x2b379095…af57` — 실권한이 있는 유일한 컨트랙트 |

`initialize` 가 일회성이라 note·settlement·challenge 리졸버의 owner 는 아무 권한이 없다.
그래서 결정 리졸버 하나만 옮겼다.

절차 (Safe UI 가 GIWA 를 지원하지 않아 전부 cast 로 했다):

```
1. createProxyWithNonce  팩토리 0x4e1DCf7A… · 싱글턴 0x29fcB43b… (SafeL2)
2. transferOwnership(Safe)          배포 지갑
3. getTransactionHash(...)          safeTxHash 계산
4. approveHash(safeTxHash) x2       각 소유자가 자기 지갑에서 (서명 대신 온체인 승인)
5. execTransaction(... acceptOwnership())
```

> **서명은 소유자 주소 오름차순**이어야 한다. 순서가 틀리면 `GS026` 으로 되돌아간다.
> 승인된 해시 방식의 서명 한 건은 `r=소유자주소(32B) ‖ s=0(32B) ‖ v=01` 이다.

확인:

```
owner        0x215253B830D51df7f8364fF6dA32140006E4DCE1
pendingOwner 0x0000000000000000000000000000000000000000
배포 지갑 단독 addMetric → OwnableUnauthorizedAccount 로 revert
```

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
| decisionUID | `0xc2b03f0192ded81e7d3e5d5a1d75bec0250ab5735bf1cee63aba6b601ff22c5e` |
| decisionCommitment | `0x46cf8091be32da5ca484417a89ab0bdf9bb41597554c0a519c269ca234f39db9` |
| salt | `0x0f1e2d3c4b5a69788796a5b4c3d2e1f0` |
| payload | `{"fixture":"O4","intent":"overdue-demo"}` |
| windowStart | `1785338205` — 2026-07-29 00:19:16 KST |
| windowEnd | `1785338805` — 00:29:16 KST |
| graceSeconds | `3600` (1시간) |
| **T_overdue** | **`1785342405` — 2026-07-29 01:29:16 KST** |

`T_overdue` 이후 이 결정의 인장이 「기한초과」로 바뀐다. **그 전에는 녹화해도 소용없다.**

공개 검증:

```bash
node --experimental-strip-types verifier/src/reveal-cli.ts \
  0xc2b03f0192ded81e7d3e5d5a1d75bec0250ab5735bf1cee63aba6b601ff22c5e \
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

관측 구간 `1785338307 ~ 1785338907` · 관측값 **91,998,000** (BTC/KRW, 업비트 1분봉)

| | UID |
|---|---|
| **결정 — 등록완료 + 이의** | `0x4fd150e4f2b0891c89693e05b37691be5e9700e216f73247170c4bfb1fabb3f8` |
| └ 정산 | `0x7bd0d1ab80dfdfdafe666a60d4dca6ced77e8d0134780445dbeecd5641b82548` |
| └ **이의 (지갑 B)** | `0x583bd2fe63d99c27e8b3d4030a007c617fdb9f4fc16d93b5b0ec094ac78c1bd1` |
| **결정 — 철회 이력** | `0xaced96705a1806810bc469938071f692f6c7c249ce6ecacfc27e34a11149c49b` |
| └ S1 (철회됨) | `0x36b1e6685077f38b2f77a6a7bb0cb49c6456ce861160f246bd12ccef4d6691df` |
| └ S2 (정정) | `0x9883b7ce2a66d935523f927109671e2a9215e57f6ed7dfb9a59e1c91e774b033` |

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
