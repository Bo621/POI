# 컨트랙트가 실제로 강제하는 것

> 설계 의도가 아니라 **온체인에서 트랜잭션을 되돌리는 규칙**만 적는다.
> 코드는 `contracts/src/`, 전체 명세는 [`../POI_TechSpec_v3.md`](../POI_TechSpec_v3.md).

## 자체 레지스트리를 만들지 않는다

POI의 "앵커 컨트랙트"는 새 레지스트리가 아니라 **EAS SchemaResolver**입니다.
EAS가 attestation 발행 직전에 호출하는 훅에 검증 로직을 넣습니다.

```
사용자 → EAS.attest() → [POI 리졸버가 불변식 검사] → 통과해야 기록됨
```

그래서 조회·철회·참조는 전부 EAS 표준을 그대로 씁니다. 새 신뢰 축을 세우지 않고
GIWA 생태계(EAS 프리디플로이 + 도장 Verified Address)에 **편입**됩니다.

## 네 개의 리졸버

| 리졸버 | 스키마 | revocable | 역할 |
|---|---|---|---|
| `POINoteResolver` | `poi.note.v1` | ✗ | 시점만 고정하는 노트 |
| `POIDecisionResolver` | `poi.decision.v1` | ✗ | 결정 + 예상 결과. **지표 레지스트리 겸함** |
| `POISettlementResolver` | `poi.settlement.v1` | ✓ | 결과 등록 |
| `POIChallengeResolver` | `poi.challenge.v1` | ✓ | 이의 |

결정과 노트가 **철회 불가**인 것이 중요합니다. 결과를 본 뒤 불리한 판단을 지울 수 없습니다.
반대로 정산과 이의는 **철회 가능**해야 합니다 — 관측이 틀렸을 때 정정할 길이 필요하고,
그 정정 이력 자체가 화면에 남습니다.

## 사후 서사를 막는 규칙

**I4 — 관측 구간을 과거로 설정할 수 없다.** 이 하나가 제품의 존재 이유입니다.

```solidity
if (d.windowStart < attestTime) revert WindowInPast();
```

**I17 — 정산 결과를 발행자가 정할 수 없다.** 관측값만 받고 컨트랙트가 다시 계산합니다.

```solidity
uint8 expect = _eval(d.outcomeOp, s.observedValue, d.outcomeThreshold) ? 0 : 1;
if (s.result != expect) revert ResultMismatch();
```

**I8 — 관측 시각은 반드시 관측 구간의 끝이다.** 유리한 시점을 골라 관측할 수 없습니다.

**I7 — 관측 구간이 끝나기 전에는 정산할 수 없다.**

**I2 — 부모 결정은 자식보다 엄격히 빨라야 한다.** Decision Graph의 선후 관계를 보장합니다.
(같은 배치에 넣으면 timestamp가 같아져 실패합니다 — [`../POI_v0.10.md`](../POI_v0.10.md) §12.2)

**I3 — 같은 지갑의 결정만 부모가 될 수 있다.** 남의 판단을 자기 계보에 붙일 수 없습니다.

컨트랙트가 강제하는 불변식은 `I1`~`I17`이고, 코드에 번호 주석으로 표시돼 있습니다.

```bash
grep -rn "// I[0-9]" contracts/src/
```

## commitment — 내용을 숨긴 채 시점만 고정

```
C = keccak256( TAG(32) ‖ chainId(32) ‖ attester(20) ‖ salt(16) ‖ utf8(JCS(payload)) )
```

| 요소 | 막는 것 |
|---|---|
| `TAG` | 결정·트리거·근거·이유를 서로 다른 공간에 둔다 |
| `chainId` | 다른 체인에서의 재사용 |
| **`attester`** | **복사 공격** — 남의 commitment를 베껴도 자기 것이 되지 않는다 (CT18) |
| `salt` | 짧은 payload의 무차별 대입 |
| JCS | 같은 내용이 항상 같은 바이트가 되도록 정규화 |

이 정의는 **세 곳(컨트랙트·프론트·검증기)이 같은 테스트 벡터를 씁니다.**
`core/vectors/commitment.v1.json` 하나를 Solidity 테스트와 TS 테스트가 함께 읽습니다 —
구현이 셋으로 갈라져 조용히 어긋나는 것을 막습니다.

## 비정규 payload 차단

EAS는 `data`를 스키마에 대해 검증하지 않습니다. 잉여 워드나 조작된 offset을 붙여도
`abi.decode`가 조용히 무시해서, **불변식은 전부 통과하는데 온체인에는 이상한 바이트가
영구히 남습니다.**

그래서 리졸버가 디코딩 결과를 **다시 인코딩해 원본과 바이트 단위로 대조**합니다.
정규 인코딩은 유일하므로 이걸로 걸러집니다.

## 지표 — 문서가 없으면 등록되지 않는다

```solidity
if (spec.definitionHash == 0) revert MetricDefinitionRequired();
```

`definitionHash`는 계산식·출처·간격·UTC·결측치 정책·스냅샷 해시를 적은
**문서 바이트의 keccak**입니다. 등록 즉시 `frozen = true`가 되어 정의를 바꿀 수 없습니다.

지표는 append-only라 나중에 추가할 수 있습니다.

컨트랙트가 보장하는 것은 **문서의 존재가 아니라 불변성**입니다 — 컨트랙트는 32바이트 해시가
실제 문서를 가리키는지 알 수 없습니다. 대신 한 번 등록된 `definitionHash` 는 **동결되어 바뀌지 않고**,
제3자가 공개된 문서를 `cast keccak` 으로 직접 해싱해 온체인 값과 **대조**할 수 있습니다.
화이트리스트에 없는 지표는 컨트랙트가 거부합니다.

## 코드 구성

```
contracts/src/     리졸버 4종 + 코덱 + 지표 레지스트리 (약 690줄)
core/              컨트랙트와 동일한 판정 로직 (TS). 프론트·검증기가 공유
verifier/          오프체인 재현 CLI — poi-verify · poi-reveal
web/               증서 톤 SPA (React + viem, 라우터 라이브러리 없음)
```

**`core`가 한 벌만 존재하는 것이 설계의 핵심입니다.** 프론트와 검증기가 각자
판정 로직을 구현하면 언젠가 어긋나고, 그때 무엇이 맞는지 알 수 없게 됩니다.
