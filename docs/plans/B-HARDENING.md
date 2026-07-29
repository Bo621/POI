# B — 코드를 문서에 맞춘다

> 코덱스 심사(42/80)가 컨트랙트에서 찾은 취약점 셋을 코드로 고친다.
> **재배포가 필요하고 기존 fixture 는 전부 무효화된다.**

---

## 먼저 — 셋 중 하나는 코드로 고칠 수 없다

### ❌ 「문서 없는 지표는 컨트랙트가 거부한다」

```solidity
if (spec.definitionHash == 0) revert MetricDefinitionRequired();
```

코덱스 지적이 맞다 — `!= 0` 만 본다. **그런데 컨트랙트는 문서의 존재를 알 수 없다.**
임의의 32바이트와 진짜 문서 해시를 온체인에서 구별할 방법이 없다.

**이건 코드 결함이 아니라 문서의 과장이다.** 실제로 보장되는 것은:

> 등록된 `definitionHash` 는 **바꿀 수 없다**(frozen).
> 그 해시가 실제 문서와 맞는지는 **제3자가 `cast keccak` 으로 대조**해서 확인한다.

**문서를 사실대로 고친다.** "컨트랙트가 거부한다" → "등록 후 변경 불가 + 제3자 대조 가능".

체인상 강화가 가능한 부분은 하나 있다 — **owner 단일 지갑 권한**이다.
B3 에서 다룬다.

---

## B1 — Dojang 검증이 스키마·발급자를 확인하지 않는다 · **실제 결함**

```solidity
Attestation memory v = _eas.getAttestation(verifiedUID);
if (v.uid == 0 || v.recipient != attester) revert BadVerifiedUID();
```

**어떤 스키마의 attestation 이든** recipient 만 본인이면 통과한다.
자기가 자기에게 발급한 아무 attestation 을 Verified Address 로 위장할 수 있다.
"커밋 시점에 검증 지갑이었다"는 명제가 **거짓이 된다.**

### 고칠 것

`POIDecisionResolver` 에 상태 두 개를 추가하고 `initialize` 에서 받는다.

```solidity
bytes32 public verifiedSchemaUID;   // Dojang Verified Address 스키마
address public verifiedIssuer;      // 허용 발급자
```

`_checkVerifiedAddress` 에 추가:

```solidity
if (verifiedSchemaUID == 0) revert VerifiedAddressNotConfigured();
if (v.schema != verifiedSchemaUID) revert VerifiedAddressWrongSchema();
if (v.attester != verifiedIssuer) revert VerifiedAddressWrongIssuer();
```

**핵심 결정** — 스키마 UID 를 아직 모른다(W1, Dojang 측 외부 차단).
그래서 **미설정이면 `verifiedUID != 0` 을 거부한다.**
"아무거나 받는 것"보다 "받지 않는 것"이 안전하다.
지금 모든 fixture 가 `verifiedUID = 0`(일반 지갑)이므로 동작에 영향이 없다.

## B2 — `source` · `verifierVersion` 이 빈 문자열도 통과 · **실제 결함**

관측 출처를 안 적어도 정산이 발행된다. **재현 가능성의 전제가 무너진다** —
어디서 관측했는지 모르면 제3자가 같은 절차를 밟을 수 없다.

### 고칠 것

`POISettlementResolver._checkResult` 에:

```solidity
if (s.hasObservedValue) {
    if (bytes(s.source).length == 0) revert SourceRequired();
    if (bytes(s.verifierVersion).length == 0) revert VerifierVersionRequired();
}
```

`INDETERMINATE`(관측값 없음)일 때는 요구하지 않는다 — 관측 자체를 못 한 경우다.

**상한도 둔다.** 문자열이 무제한이면 가스 비용과 인덱서 부담이 커진다.

```solidity
if (bytes(s.source).length > 64) revert SourceTooLong();
if (bytes(s.verifierVersion).length > 32) revert VerifierVersionTooLong();
```

## B3 — 지표 추가 권한이 단일 배포 지갑 · **운영 결함**

owner 가 임의 `definitionHash` 로 지표를 추가할 수 있다.
`frozen` 은 **기존** 지표만 지키지 새 지표를 막지 않는다.

### 고칠 것 — 두 단계

1. **컨트랙트**: `sealRegistry()` 를 추가한다. 한 번 호출하면 `addMetric` 이 영구 잠긴다.

```solidity
bool public registrySealed;
function sealRegistry() external onlyOwner {
    registrySealed = true;
    emit RegistrySealed();
}
// addMetric 첫 줄
if (registrySealed) revert RegistrySealed_();
```

2. **운영**: 지표 2종 등록 후 **봉인하지 않는다.** Phase 1 에 지표를 추가해야 한다.
   대신 **소유권을 multisig 로 옮긴다**(O6). 봉인 기능은 Phase 2 용으로 둔다.

> `sealRegistry` 를 지금 호출하면 지표를 영영 못 늘린다. **기능만 넣고 호출하지 않는다.**
> 문서에 "봉인 가능하지만 아직 하지 않았다 — 이유는 Phase 1 지표 추가"라고 적는다.

---

## 재배포 영향 — 되돌릴 수 없다

리졸버 코드가 바뀌면 **주소가 바뀌고 → 스키마 UID 가 바뀌고 → 기존 fixture 가 전부 무효**다.

```
O3  리졸버 4종 재배포 + 스키마 4종 재등록 + initialize
O5  addMetric ×2 (definitionHash 는 그대로)
O4  OVERDUE fixture 재생성        ← 1시간 10분 대기 다시
O7  등록완료+이의 · 철회→정정 재생성  ← 15분 대기
O9  익스플로러 verify 4종
    프론트 재빌드·재배포 (새 주소·UID)
    문서 전체의 주소·UID 갱신
```

**가스**: 배포 지갑 0.0139 ETH · 이의자 지갑 0.001 ETH — 충분하다.

**시간**: 컨트랙트 수정·테스트 2시간 + 배포·fixture 2시간. 마감까지 여유 있다.

---

## 검증

```bash
cd contracts && forge test          # 150 + 신규
FOUNDRY_PROFILE=fork forge test     # 실제 EAS 상대
cd core && npm test                 # 62
cd web && npm test && npm run test:e2e
```

신규 테스트로 **각 취약점이 실제로 막히는지** 확인한다:

| | 테스트 |
|---|---|
| B1 | 다른 스키마의 attestation 을 `verifiedUID` 로 넣으면 되돌아간다 |
| B1 | 다른 발급자의 attestation 도 되돌아간다 |
| B1 | 미설정 상태에서 `verifiedUID != 0` 이면 되돌아간다 |
| B2 | `source` 가 빈 문자열이면 되돌아간다 |
| B2 | `verifierVersion` 이 빈 문자열이면 되돌아간다 |
| B2 | 상한을 넘으면 되돌아간다 |
| B3 | `sealRegistry` 후 `addMetric` 이 되돌아간다 |

**뮤테이션으로 확인한다** — 검사를 지우면 그 테스트가 실패해야 한다.

## 하지 말 것

| | |
|---|---|
| `sealRegistry()` 를 지금 호출 | Phase 1 지표 추가가 막힌다 |
| `definitionHash` 를 화이트리스트로 | 컨트랙트가 문서 존재를 알 수 없다 — 문서를 고치는 게 맞다 |
| 오라클 없이 "참인 관측값 판정" 주장 | Phase 2 다. 문서에 그대로 둔다 |
| 기존 fixture UID 를 문서에 남겨두기 | 재배포 후 전부 무효다. 전수 갱신한다 |
