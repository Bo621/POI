# Proof of Insight — MVP 기술 명세 v3.0

**대상**: GASOK 2차 제출용 MVP (마감 2026-07-31)
**기획서**: `POI_v0.10.md` — 본 명세가 요구하는 기획서 변경은 §13
**v2.1 폐기 사유**: 정산 정정 경로가 실행 불가능한 데드락이었다. §0 참조

---

## 0. v2.1 → v3.0 변경

| # | v2.1 결함 | 판정 | v3 조치 |
|---|---|---|---|
| **B1** | **정산 정정 데드락** — revoke가 `head=0`으로 만드는데 정정은 `head==supersedes`를 요구 | **치명적** | `activeHead` / `lastHead` 분리 (§6.4) |
| **B2** | commitment만으로 "내용이 t0에 존재했다"를 주장 | 과잉 | **증명 3단계 분리** (§3.3), 등급을 2축으로 (§8 E7) |
| **B3** | commitment 공식이 §4.1과 §4.3에서 불일치. attester 미결속 | 치명적 | **단일 공식 + attester·chainId 결속** (§4.3) |
| **B4** | "검증 지갑 귀속"이 미검증 지갑 허용과 충돌 | 과잉 | 조건부 주장 + **Verified UID 스냅샷** (§2 F4) |
| **B5** | 자기 attestation의 `expirationTime` 미검사. Note·Challenge resolver 미완성 | 치명적 | 공통 가드 도입 (§6.2) |
| **B6** | 정산 결과와 관측값의 정합성을 온체인에서 미검사 | **개선 기회** | **E4 판정을 온체인에서 강제** (§6.4) |
| **B7** | "구간 내 관측되지 않음"을 단일 시점 값으로 증명 불가 | 치명적 | **구간 종료 시점 평가 지표만 허용** (§11) |
| **B8** | Challenge "영구 기록" 주장 ↔ `revocable=true`. 재발행 불가. Sybil | 불일치 | 수명주기 정의 + **집계 미노출** (§6.5) |
| B9 | 문서 기준이 v0.8 | 절차 | v0.10으로 갱신 |
| B10 | F5 Reveal이 체크리스트에 없음 | 절차 | 추가 (§12) |
| B11 | `graceDays` 최소 1일 → 데모에 24시간 리드타임 필요 | **운영 위험** | **`graceSeconds`로 전환, 최소 1시간** (§6.3) |
| B12 | KPI에 Challenge 누락, 근거 없는 "배지 재검증 +4" | 절차 | 산식 수정 (§8 E11) |
| B13 | `renounce` 허용 ↔ Phase 1 metric 확장 | 절차 | **metric 등록은 append-only·동결**, 소유권 유지 (§6.2) |
| B14 | 되돌릴 수 없는 온체인 공개 전 법률 검토 게이트 부재 | 절차 | §12 게이트 추가 |

### 0.1 제안과 다르게 반영한 것 세 가지

| 항목 | 받은 제안 | v3의 선택 | 이유 |
|---|---|---|---|
| B2 등급 | `REVEALED_VERIFIED` 상태 추가 | **2축 분리** — `evidenceTier` × `revealState` | 근거 첨부와 공개 여부는 **직교**다. 근거를 커밋하고 공개하지 않을 수도, 근거 없이 본문만 공개할 수도 있다. 하나의 사다리로 만들면 표현 불가능한 조합이 생긴다 |
| B7 metric | `MetricSpec`에 aggregation·간격·결측치 정책 추가 | **구간 종료 시점 평가 지표만 MVP 허용** | 경로 존재형 지표(`가격대 도달`)를 빼면 **"부재를 증명해야 하는 문제 자체가 사라진다."** 단일 (값, 시각)이 결과를 완전히 결정한다 |
| B8 Sybil | Challenge 수명주기·집계 기준 명시 | **집계 수치를 아예 노출하지 않음** | 이의 건수를 표시하는 순간 지갑을 늘리면 부풀릴 수 있다. 기획서 §6.3이 이미 "개수 기반 비교 금지"를 정책으로 두고 있으므로 **동일 원칙을 이의에도 적용**하는 것이 일관적이다 |

---

## 1. 설계 전제

### 1.1 온체인 환경 — RPC 실측 (2026-07-27)

| 항목 | 주소 | 결과 |
|---|---|---|
| Chain ID | — | **91342** (`0x164ce`) ✅ |
| **EAS** | `0x4200…0021` | **v1.4.1-beta.3** · 프록시 → `0xbec660b4…` ✅ |
| **SchemaRegistry** | `0x4200…0020` | **v1.3.1-beta.2** · 프록시 → `0x70de55bc…` ✅ |
| 상호 연결 | — | `EAS.getSchemaRegistry()` → `0x42…0020` ✅ |
| **DojangScroll** | `0xd5077b…7B9` | **v0.5.1** · `isVerified(address,bytes32)` 동작 ✅ |
| Attester ID | — | `keccak256("dojang.dojangattesterids.upbitkorea")` 일치 ✅ |
| **ENS Registry** | `0x0000…2e1e` | **미배포** ❌ |
| L2 가스 가격 | — | 0.001 gwei — 결정 커밋 약 0.53원 |

> 세 컨트랙트 전부 **프록시**다. 구현 주소를 하드코딩하지 않는다.

### 1.2 EAS의 2단계 revocable

```
스키마 레벨       SchemaRegistry.register(..., revocable)
attestation 레벨  AttestationRequestData.revocable
                  revoke 시: if (!attestation.revocable) revert Irrevocable()
```

**두 단계를 모두 강제한다.** 스키마만 `true`로 두면 `revocable:false` attestation으로 영구 잠금이 가능하다.

### 1.3 정산 권한 모델

| 계층 | 발행 권한 | 공식 결과 |
|---|---|---|
| **Settlement** | **decision의 attester만** | 변경 |
| **Challenge** | 누구나 | 변경하지 않음 |

정산을 개방하면 그리핑이 성립한다(선점 → 소유자 발행 불가 → 공격자가 철회 → 상태 복귀 → 반복). 소유권과 이의를 분리해 이를 제거한다.

> **재현 가능성의 본질은 "누구나 계산할 수 있다"이지 "누구나 제출할 수 있다"가 아니다.**
> v3에서는 여기서 한 걸음 더 나아가, **계산 결과 자체를 온체인이 강제한다** (§6.4 B6).

---

## 2. MVP 기능 명세

### F1. 지갑 연결

| | |
|---|---|
| 처리 | `DojangScroll.isVerified(addr, UPBIT_KOREA_ID)` |
| 출력 | `{ verified: bool, verifiedUID: bytes32 \| null }` |
| 실패 | RPC 오류 → 3회 재시도 후 "확인 불가". **미검증 지갑도 사용 허용** |

> **ENS 미배포 확인됨.** MVP는 up.id 조회를 하지 않는다. UI는 주소를 축약 표기한다.

### F2. JOURNAL_ENTRY (오프체인)

온체인 트랜잭션 없음. "이 기록은 검증되지 않습니다" 상시 표시.

### F3. TIMESTAMPED_NOTE 발행

`C = H(TAG_NOTE ‖ chainId ‖ attester ‖ salt ‖ JCS(payload))` → `EAS.attest(NOTE_SCHEMA, revocable=false, expirationTime=0)`

### F4. VERIFIABLE_DECISION 커밋

| | |
|---|---|
| 입력 | 결정 내용, trigger, expected_outcome(선택), window(조건부), 근거(선택), 부모 UID(≤8), 승격 노트(선택) |
| 처리 | commitment 생성 → **커밋 시점의 Verified Address attestation UID를 함께 기록** → `EAS.attest(...)` |
| 실패 | Resolver revert |

> **`verifiedAddressUID` 필드 신설 (B4).**
> `isVerified()`는 조회 시점의 값이라 나중에 철회될 수 있다. 커밋 시점의 검증 상태를 주장하려면 **그 시점의 attestation UID를 스냅샷으로 남겨야 한다.** 미검증 지갑은 `0`을 넣는다.

### F5. Reveal (공개)

| | |
|---|---|
| 처리 | commitment 재계산 대조. **클라이언트에서 검증 가능** (서버 신뢰 불필요) |
| 성질 | **선택적.** 공개하지 않아도 정산에는 영향이 없다 |
| 효과 | 공개 성공 시 `revealState`가 `REVEALED`로 바뀐다 (§8 E7) |

### F6. Settlement 발행

| | |
|---|---|
| 권한 | **decision의 attester만** |
| 입력 | `decisionUID`, 관측값, 출처, `observedAt` |
| 처리 | **온체인이 E4 판정을 검증한다.** 관측값과 결과가 불일치하면 revert (§6.4) |
| 불변 | attestation 레벨 `revocable = true` 강제 |

### F7. Challenge 발행

| | |
|---|---|
| 권한 | 누구나 |
| 효과 | 공식 결과를 변경하지 않는다 |
| **표시** | **건수를 표시하지 않는다.** 목록으로만 표시하고 각 항목에 검증 지갑 여부를 병기 |

### F8~F11

정산 상태 표시 / 결정 그래프 조회 / Strategy Passport / 등급 표시(파생).

---

## 3. 데이터 분리와 증명 범위

### 3.1 필드별 배치

| 필드 | 배치 |
|---|---|
| `parents[]` (≤8), `promotedFromNote`, `verifiedAddressUID` | 평문 |
| `hasExpectedOutcome`, `outcomeMetricId`, `outcomeOp`, `outcomeThreshold` | **평문** |
| `windowStart`, `windowEnd`, `graceSeconds` | 평문 |
| `decisionCommitment`, `triggerCommitment`, `evidenceCommitment`, `reasonCommitment` | commitment |

### 3.2 온체인 강제의 비대칭

| 항목 | 온체인 강제 |
|---|---|
| `expected_outcome_predicate` — 평문 | ✅ 지표 화이트리스트 + **결과 판정까지** |
| `trigger_predicate` — commitment 뒤 | ❌ **불가.** 클라이언트 안내만 |

**이 비대칭을 UI와 문서에 명시한다.**

### 3.3 commitment가 증명하는 것 — 3단계 (B2)

> v2.1은 "결정 내용이 t0에 존재했다"를 무조건 **강**으로 분류했다. 정확하지 않다.

| 단계 | 증명되는 것 | 강도 |
|---|---|---|
| **커밋 직후** | 특정 32바이트 commitment가 t0에 기록됐고, **발행자가 t0에 어떤 내용을 확정했으며 이후 바꿀 수 없다** | 강 |
| **공개(Reveal) 성공 후** | **공개된 그 내용**이 t0에 확정된 것과 동일하다 | 강 |
| **공개하지 않음** | 내용이 무엇인지는 **제3자가 알 수 없다.** 존재 자체는 입증되지 않음 | — |

**따라서 `EVIDENCE_COMMITTED`의 의미를 정정한다.**

```
✗ "근거 자료가 t0에 존재했다"
✓ "근거 commitment가 t0에 기록됐다"
✓ (공개 후) "공개된 근거 자료가 t0에 확정된 것과 동일하다"
```

---

## 4. Commit-Reveal

### 4.1 흐름

```
t0   COMMIT     salt ← CSPRNG(128)
                C = H(TAG ‖ chainId ‖ attester ‖ salt ‖ JCS(payload))
                온체인: C + outcome predicate(평문) + window + verifiedAddressUID

t1   SETTLE     소유자 발행. 온체인이 결과 판정을 검증

t1+  CHALLENGE  관측값·출처에 대한 이의 (누구나)

t1+  REVEAL     (salt, payload) 공개 → 누구나 C 재계산 (선택)
```

### 4.2 성질

| | |
|---|---|
| t0 이후 내용 변경 | ❌ 불가 |
| payload 몰라도 정산 계산 | ✅ 가능 |
| reveal이 정산의 전제인가 | ❌ 아니다 |
| **타인의 commitment 복사** | **❌ 불가 (§4.3)** |

### 4.3 Commitment 공식 — 단일 정의 (B3)

> v2.1은 §4.1에 `decisionNonce`가 있고 §4.3·E1에는 없었다. **다음 하나로 고정한다.**

```
C = keccak256( TAG ‖ CHAIN_ID ‖ ATTESTER ‖ salt ‖ JCS(payload) )

TAG      : 32바이트 도메인 태그 (아래)
CHAIN_ID : uint256 big-endian (91342)
ATTESTER : 20바이트 발행 지갑 주소
salt     : 16바이트 (128비트) CSPRNG
JCS      : RFC 8785 정규화 JSON, UTF-8
```

```
TAG_DECISION = keccak256("poi.commit.decision.v1")
TAG_TRIGGER  = keccak256("poi.commit.trigger.v1")
TAG_EVIDENCE = keccak256("poi.commit.evidence.v1")
TAG_REASON   = keccak256("poi.commit.reason.v1")
TAG_NOTE     = keccak256("poi.commit.note.v1")
```

**attester를 넣는 이유 (복사 공격 차단)**

```
공격 (v2.1에서 가능했음)
1. Alice가 C_A를 t0에 커밋
2. Bob이 C_A를 그대로 복사해 t1에 자기 결정으로 커밋
3. Alice가 (salt, payload)를 공개
4. Bob의 commitment도 같은 payload로 검증됨
   → Bob이 "나도 같은 판단을 했다"고 주장 가능

v3에서는 C가 attester에 결속되므로 Bob의 복사본은 검증되지 않는다.
```

`CHAIN_ID`는 체인 간 재사용을 막는다.

**테스트 벡터를 고정한다.** 프론트·오프체인 verifier·컨트랙트 테스트가 동일 벡터를 공유해야 한다 (§12).

### 4.4 salt

128비트 CSPRNG · payload별 고유 · 온체인 기록 금지 · 분실 시 공개 영구 불가(UI가 백업 강제 유도).

---

## 5. EAS 스키마

### 5.1 `poi.note.v1`

```
"bytes32 contentCommitment"
resolver: POINoteResolver · revocable: false
```

### 5.2 `poi.decision.v1`

```
"bytes32[] parents,
 bytes32 promotedFromNote,
 bytes32 verifiedAddressUID,      ← B4 신설
 bytes32 decisionCommitment,
 bytes32 triggerCommitment,
 bytes32 evidenceCommitment,
 bytes32 reasonCommitment,
 bool    hasExpectedOutcome,
 bytes32 outcomeMetricId,
 uint8   outcomeOp,
 int128  outcomeThreshold,
 uint64  windowStart,
 uint64  windowEnd,
 uint32  graceSeconds"            ← B11 (graceDays에서 전환)

resolver: POIDecisionResolver · revocable: false · refUID: parents[0]
```

`outcomeOp`: `0=GT, 1=GTE, 2=LT, 3=LTE, 4=EQ, 5=NEQ`

### 5.3 `poi.settlement.v1`

```
"bytes32 decisionUID,
 uint8   result,
 bool    hasObservedValue,
 int128  observedValue,
 string  source,
 uint64  observedAt,
 string  verifierVersion,
 bytes32 supersedes"

resolver: POISettlementResolver · revocable: true · refUID: decisionUID
```

`result`: `0=OBSERVED, 1=NOT_OBSERVED, 2=INDETERMINATE`

### 5.4 `poi.challenge.v1`

```
"bytes32 settlementUID,
 uint8   claimedResult,
 bool    hasObservedValue,
 int128  observedValue,
 string  source,
 uint64  observedAt,
 bytes32 noteCommitment"

resolver: POIChallengeResolver · revocable: true · refUID: settlementUID
```

---

## 6. 컨트랙트 설계

### 6.1 EAS 데이터 디코딩

EAS의 `attestation.data`는 `SchemaEncoder`가 만든 **평면 튜플 인코딩**이다. `abi.decode(data, (D))`는 단일 동적 구조체를 기대하므로 첫 워드를 offset으로 오독해 revert한다.

```solidity
function _decodeDecision(bytes calldata data)
    internal pure returns (DecisionData memory)
{
    // 평면 튜플 앞에 "구조체 본문 offset(0x20)"을 붙여
    // 단일 동적 튜플 인코딩으로 만든다
    return abi.decode(bytes.concat(abi.encode(uint256(0x20)), data), (DecisionData));
}
```

> 이 주석을 반드시 남길 것. 모르면 디버깅에 하루가 날아간다.

### 6.2 공통 가드 (B5)

> v2.1은 **부모의** `expirationTime`만 검사하고 자기 자신은 검사하지 않았다. Note·Challenge resolver도 미완성이었다.

```solidity
abstract contract POIResolverBase is SchemaResolver, Ownable2Step {
    bool public initialized;

    error NotInitialized();
    error MustBePermanent();
    error WrongSchema();
    error EmptyCommitment();

    modifier ready() { if (!initialized) revert NotInitialized(); _; }

    /// 모든 POI attestation에 공통 적용
    function _guard(Attestation calldata a, bytes32 expectedSchema) internal pure {
        if (a.schema != expectedSchema)  revert WrongSchema();
        if (a.expirationTime != 0)       revert MustBePermanent();   // ★ B5
    }
}
```

| 규칙 | 근거 |
|---|---|
| `expirationTime == 0` **모든 스키마** | "영구 기록"을 주장하려면 만료를 금지해야 한다 |
| `schema` 일치 확인 | resolver가 다른 스키마에 재사용되는 것을 차단 |
| commitment `!= 0` | 빈 커밋 방지 |
| `recipient` | **`address(0)`으로 고정.** POI attestation은 수취인 개념이 없다 |

**metric 레지스트리 — append-only·동결 (B13)**

```solidity
struct MetricSpec {
    bool    allowed;
    uint8   decimals;
    uint8   kind;            // 0 = WINDOW_END_EVALUATED (MVP는 이것만)
    bytes32 definitionHash;  // 계산식·출처·간격·결측치 정책 문서의 해시
    bool    frozen;          // 등록 즉시 true. 변경 불가
}

function addMetric(bytes32 id, MetricSpec calldata spec) external onlyOwner {
    if (metrics[id].frozen) revert MetricFrozen();   // 수정·삭제 불가
    metrics[id] = spec;
    metrics[id].frozen = true;
}
```

> **왜 동결해야 하는가**: 이미 등록된 지표의 `decimals`나 `definitionHash`를 바꾸면 **과거 결정의 해석이 소급 변경된다.** 추가는 허용하되 변경·삭제는 금지한다.
> 따라서 **소유권을 `renounce`하지 않는다.** Phase 1에 지표를 추가해야 하기 때문이다. 대신 소유자를 multisig로 두고 `Ownable2Step`을 쓴다.

### 6.3 POIDecisionResolver

```solidity
uint256 constant MAX_PARENTS     = 8;
uint64  constant MAX_START_DELAY = 30 days;
uint64  constant MAX_WINDOW      = 730 days;
uint32  constant MIN_GRACE       = 1 hours;      // ★ B11
uint32  constant MAX_GRACE       = 30 days;
uint8   constant MAX_OP          = 5;

function onAttest(Attestation calldata a, uint256)
    internal view override ready returns (bool)
{
    _guard(a, DECISION_SCHEMA);
    DecisionData memory d = _decodeDecision(a.data);

    if (d.decisionCommitment == 0 || d.triggerCommitment == 0)
        revert EmptyCommitment();                                    // I1
    if (d.parents.length > MAX_PARENTS) revert TooManyParents();     // I14

    // I12 refUID ↔ parents[0]
    bytes32 want = d.parents.length > 0 ? d.parents[0] : bytes32(0);
    if (a.refUID != want) revert RefUIDMismatch();

    for (uint i; i < d.parents.length; ++i) {
        Attestation memory p = _eas.getAttestation(d.parents[i]);
        if (p.uid == 0)                  revert ParentNotFound();
        if (p.schema != DECISION_SCHEMA) revert ParentWrongSchema();
        if (p.attester != a.attester)    revert ParentNotSameActor(); // I3
        if (p.time >= a.time)            revert ParentNotEarlier();   // I2
        if (p.revocationTime != 0)       revert ParentRevoked();
    }

    if (d.promotedFromNote != 0) {
        Attestation memory n = _eas.getAttestation(d.promotedFromNote);
        if (n.uid == 0)               revert NoteNotFound();
        if (n.schema != NOTE_SCHEMA)  revert NoteWrongSchema();
        if (n.attester != a.attester) revert NoteNotSameActor();      // I3b
        if (n.time >= a.time)         revert NoteNotEarlier();
    }

    // B4 — Verified Address 스냅샷의 실재성만 확인 (필수 아님)
    if (d.verifiedAddressUID != 0) {
        Attestation memory v = _eas.getAttestation(d.verifiedAddressUID);
        if (v.uid == 0 || v.recipient != a.attester) revert BadVerifiedUID();
    }

    if (d.hasExpectedOutcome) {
        MetricSpec memory m = metrics[d.outcomeMetricId];
        if (!m.allowed)                 revert MetricNotAllowed();    // I5
        if (d.outcomeOp > MAX_OP)       revert OpOutOfRange();
        if (d.windowStart < a.time)     revert WindowInPast();        // I4 ★
        if (d.windowStart > a.time + MAX_START_DELAY)
                                        revert WindowStartTooFar();   // I6a
        if (d.windowEnd <= d.windowStart) revert WindowInvalid();
        if (d.windowEnd - d.windowStart > MAX_WINDOW)
                                        revert WindowTooLong();       // I6b
        if (d.graceSeconds < MIN_GRACE || d.graceSeconds > MAX_GRACE)
                                        revert GraceOutOfRange();     // I6c
    } else {
        if (d.outcomeMetricId != 0 || d.outcomeOp != 0 ||
            d.outcomeThreshold != 0 || d.windowStart != 0 ||
            d.windowEnd != 0 || d.graceSeconds != 0)
            revert OutcomeFieldsMustBeZero();                         // I6d
    }
    return true;
}

function onRevoke(Attestation calldata, uint256)
    internal pure override returns (bool) { return true; }   // 스키마가 비철회
```

### 6.4 POISettlementResolver — 정정 상태 머신 재설계 (B1) + 온체인 판정 (B6)

**v2.1의 데드락**

```
S1 발행 (supersedes=0)   → head = S1
S1 revoke                → head = 0
S2 발행 (supersedes=S1)  → head(0) != S1 → SupersedesNotHead  ✗ 실행 불가
S2 발행 (supersedes=0)   → 통과하지만 정정 이력이 끊김         ✗ 무결성 손실
```

**v3의 해법 — 두 포인터 분리**

```solidity
mapping(bytes32 => bytes32) public activeHead;   // 현재 유효한 정산 (0 = 없음)
mapping(bytes32 => bytes32) public lastHead;     // 마지막 head. revoke돼도 보존
mapping(bytes32 => uint32)  public revokeCount;

function _eval(uint8 op, int128 v, int128 t) internal pure returns (bool) {
    if (op == 0) return v >  t;
    if (op == 1) return v >= t;
    if (op == 2) return v <  t;
    if (op == 3) return v <= t;
    if (op == 4) return v == t;
    return v != t;
}

function onAttest(Attestation calldata a, uint256)
    internal override ready returns (bool)
{
    _guard(a, SETTLEMENT_SCHEMA);
    SettlementData memory s = _decodeSettlement(a.data);

    if (!a.revocable)              revert MustBeRevocable();     // I11
    if (a.refUID != s.decisionUID) revert RefUIDMismatch();      // I12
    if (s.result > 2)              revert ResultOutOfRange();

    Attestation memory dA = _eas.getAttestation(s.decisionUID);
    if (dA.uid == 0 || dA.schema != DECISION_SCHEMA) revert DecisionNotFound();
    if (dA.attester != a.attester)  revert NotDecisionOwner();   // I10 ★
    if (dA.revocationTime != 0)     revert DecisionRevoked();

    DecisionData memory d = _decodeDecision(dA.data);
    if (!d.hasExpectedOutcome) revert DecisionHasNoOutcome();
    if (a.time < d.windowEnd)  revert WindowNotEnded();          // I7

    // ★ B7 — MVP 지표는 전부 구간 종료 시점 평가
    if (s.observedAt != d.windowEnd) revert ObservedAtMustBeWindowEnd();  // I8

    // ★ B6 — 결과 판정을 온체인이 강제
    if (!s.hasObservedValue) {
        if (s.result != 2) revert MustBeIndeterminate();          // I16
    } else {
        if (s.result == 2) revert IndeterminateHasValue();
        uint8 expect = _eval(d.outcomeOp, s.observedValue, d.outcomeThreshold) ? 0 : 1;
        if (s.result != expect) revert ResultMismatch();          // I17 ★
    }

    // I9 / I13 — 최초 발행 vs 정정
    if (s.supersedes == 0) {
        if (lastHead[s.decisionUID] != 0) revert MustSupersede();
    } else {
        if (activeHead[s.decisionUID] != 0)          revert PriorStillActive();
        if (lastHead[s.decisionUID] != s.supersedes) revert SupersedesNotLastHead();
        Attestation memory prev = _eas.getAttestation(s.supersedes);
        if (prev.schema != SETTLEMENT_SCHEMA) revert SupersedesWrongSchema();
        if (prev.revocationTime == 0)         revert SupersedesNotRevoked();
    }

    activeHead[s.decisionUID] = a.uid;
    lastHead[s.decisionUID]   = a.uid;
    return true;
}

function onRevoke(Attestation calldata a, uint256)
    internal override returns (bool)
{
    SettlementData memory s = _decodeSettlement(a.data);
    if (activeHead[s.decisionUID] == a.uid) {
        activeHead[s.decisionUID] = 0;      // lastHead는 보존
        revokeCount[s.decisionUID] += 1;
    }
    return true;
}
```

**정정 시나리오 검증**

| 단계 | activeHead | lastHead | 결과 |
|---|---|---|---|
| S1 발행 (`supersedes=0`) | 0 → S1 | 0 → S1 | ✅ `lastHead==0`이므로 통과 |
| S1 revoke | S1 → 0 | S1 유지 | revokeCount = 1 |
| S2 발행 (`supersedes=S1`) | 0 → S2 | S1 → S2 | ✅ 세 조건 모두 만족 |
| S3 발행 (`supersedes=0`) 시도 | — | — | ❌ `MustSupersede` — 체인 강제 |
| 타인이 head 탈취 시도 | — | — | ❌ I10에서 이미 차단 |

**B6이 바꾸는 신뢰 모델**

```
v2.1  소유자의 "관측값"과 "결과 판정" 둘 다 신뢰해야 함
v3    관측값만 신뢰하면 됨. 판정 산술은 컨트랙트가 강제

→ Challenge의 역할이 명확해진다:
  "계산이 틀렸다"가 아니라 "관측값 또는 데이터 출처가 틀렸다"
```

### 6.5 POIChallengeResolver (B8)

```solidity
mapping(bytes32 => mapping(address => bytes32)) public activeChallenge;

function onAttest(Attestation calldata a, uint256)
    internal override ready returns (bool)
{
    _guard(a, CHALLENGE_SCHEMA);
    ChallengeData memory c = _decodeChallenge(a.data);

    if (!a.revocable)                  revert MustBeRevocable();
    if (a.refUID != c.settlementUID)   revert RefUIDMismatch();
    if (c.claimedResult > 2)           revert ResultOutOfRange();

    Attestation memory s = _eas.getAttestation(c.settlementUID);
    if (s.uid == 0 || s.schema != SETTLEMENT_SCHEMA) revert SettlementNotFound();
    if (s.revocationTime != 0)         revert SettlementRevoked();

    // I15 — 동일인의 활성 이의는 1건. 철회 후 재발행은 허용
    if (activeChallenge[c.settlementUID][a.attester] != 0)
        revert AlreadyChallenged();
    activeChallenge[c.settlementUID][a.attester] = a.uid;
    return true;
}

function onRevoke(Attestation calldata a, uint256)
    internal override returns (bool)
{
    ChallengeData memory c = _decodeChallenge(a.data);
    if (activeChallenge[c.settlementUID][a.attester] == a.uid)
        activeChallenge[c.settlementUID][a.attester] = 0;   // ★ 재발행 가능
    return true;
}
```

**수명주기와 표시 규칙**

| 항목 | 규칙 |
|---|---|
| 철회 | 가능 (`revocable = true`). **따라서 "영구 기록"이라고 쓰지 않는다** |
| 재발행 | 철회 후 가능 (v2.1은 매핑이 남아 불가능했다) |
| **집계 표시** | **이의 건수를 표시하지 않는다** |
| 표시 방식 | 목록으로만. 각 항목에 **검증 지갑 여부**와 주장 결과·출처 병기 |
| 정렬·랭킹 | 금지 |

> **왜 건수를 표시하지 않는가 (Sybil)**
> 지갑 생성 비용이 사실상 0이므로 건수는 언제든 부풀릴 수 있다. 기획서 §6.3이 이미 "개수 기반 비교·정렬 금지"를 배지 정책으로 두고 있으므로, **동일 원칙을 이의에도 적용**하는 것이 일관적이다.
> UI 문구는 "이의 3건"이 아니라 **"이의가 제기된 정산입니다"** + 목록이다.

### 6.6 배포 순서

```
1. 네 개 Resolver 배포 (initialized = false → 모든 발행 revert)
2~5. SchemaRegistry.register × 4  (settlement·challenge만 revocable = true)
6. 각 resolver.initialize(스키마 UID들)
7. addMetric × N  (등록 즉시 frozen)
8. Ownable2Step으로 multisig에 소유권 이전 — renounce 하지 않음 (B13)
```

> **1~6 사이의 창**을 `ready` modifier가 막는다. 이 가드가 없으면 스키마 UID가 0인 상태로 검증 없는 attestation이 발행된다.
> `immutable`은 원리적으로 불가능하다 — 스키마 등록에 resolver 주소가 필요하고 resolver는 스키마 UID를 알아야 하는 순환이다.

---

## 7. 검증 매트릭스

| # | 항목 | 클라이언트 | Resolver | 오프체인 | 제3자 |
|---|---|:---:|:---:|:---:|:---:|
| V1 | Verified Address 조회 | ○ | — | ○ | ○ |
| V2 | commitment 비어있지 않음 | ○ | **●** | — | ○ |
| V3~V6 | 부모·노트 존재·스키마·동일지갑·시간선행 | ○ | **●** | — | ○ |
| V7 | **관측 구간이 미래 (I4)** | ○ | **●** | — | ○ |
| V8 | 지표 화이트리스트 | ○ | **●** | — | ○ |
| V9 | window·grace 범위 | ○ | **●** | — | ○ |
| V10 | **만료 불가 (expirationTime=0)** | ○ | **●** | — | ○ |
| V11 | 정산 권한 = 소유자 | ○ | **●** | — | ○ |
| V12 | 구간 종료 후 정산 | ○ | **●** | — | ○ |
| V13 | `observedAt == windowEnd` | ○ | **●** | — | ○ |
| **V14** | **관측값 ↔ 결과 판정 정합 (B6)** | ○ | **●** | — | ○ |
| V15 | 정산 최대 1건·정정 체인 | — | **●** | — | ○ |
| V16 | revocable 강제 | ○ | **●** | — | ○ |
| V17 | refUID 정합 | ○ | **●** | — | ○ |
| V18 | **관측값 자체의 정확성** | ✗ | ✗ | ○ | **○ (Challenge)** |
| V19 | commitment ↔ payload | ○ | ✗ | ○ | ○ (공개 후) |
| V20 | 데이터 출처의 진위 | ✗ | ✗ | ✗ | ✗ |
| V21 | 결정의 완전성 | ✗ | ✗ | ✗ | ✗ |
| V22 | 실행 정합성 | ✗ | ✗ | ✗ | ✗ |
| V23 | 이유의 진실성 | ✗ | ✗ | ✗ | ✗ |

**범례**: ● 트랜잭션 실패로 강제 · ○ 계산·확인 가능(강제력 없음) · ✗ 불가

> **v3에서 V14가 온체인으로 올라왔다.** 이제 신뢰해야 하는 것은 **관측값과 그 출처(V18·V20)뿐**이며, 산술 판정은 강제된다.

---

## 8. 수식

### E1. Commitment

```
C = keccak256( TAG ‖ CHAIN_ID ‖ ATTESTER ‖ salt ‖ JCS(payload) )
```

§4.3의 정의와 동일하다. **문서 내 유일한 정의다.**

### E2. 정수 스케일링

```
scale(x, metricId) = round_half_up( x × 10^decimals(metricId) )
```

`decimals`는 metric 레지스트리에서 조회하며 등록 후 동결된다.

### E3~E4. Predicate와 판정

```
P = (metricId, op, θ)          op ∈ {GT,GTE,LT,LTE,EQ,NEQ}
eval(P, v) = v' ⋈_op θ         v' = scale(v, metricId)
```

**이 판정은 컨트랙트가 `_eval()`로 강제한다** (§6.4).

### E5. 정산 결과

```
result(D, v) =
    INDETERMINATE   if hasObservedValue = false
    OBSERVED        if eval(expected(D), v)
    NOT_OBSERVED    otherwise
```

### E6. DAG 유효성

```
validDAG(D) ≡ ∀p ∈ parents(D):
    exists(p) ∧ schema(p)=DECISION ∧ attester(p)=attester(D)
  ∧ time(p) < time(D) ∧ revocationTime(p)=0 ∧ expirationTime(p)=0
```

### E7. 등급 — 2축 분리 (B2)

> 근거 첨부와 공개 여부는 **직교**한다. 하나의 사다리로 합치면 표현 불가능한 조합이 생긴다.

```
evidenceTier(D) =
    ORACLE_VERIFIED      if oracleAttestation(D) ≠ ⊥        (Phase 2)
    EVIDENCE_COMMITTED   if evidenceCommitment(D) ≠ 0
    SELF_DECLARED        otherwise

revealState(D) =
    REVEALED     if 공개된 (salt, payload)가 commitment와 일치
    SEALED       otherwise
```

**표시 예**

```
EVIDENCE_COMMITTED · SEALED     근거를 커밋했으나 내용은 비공개
EVIDENCE_COMMITTED · REVEALED   근거 내용까지 공개·검증됨
SELF_DECLARED · REVEALED        근거는 없으나 결정 본문은 공개·검증됨
```

둘 다 온체인에 저장하지 않고 조회 시 계산한다.

### E8. 정산 유효성

```
validSettlement(S, D) ≡
    attester(S) = attester(D)                       ← I10
  ∧ hasExpectedOutcome(D) ∧ revocable(S)            ← I11
  ∧ refUID(S) = uid(D)                              ← I12
  ∧ time(S) ≥ windowEnd(D)                          ← I7
  ∧ observedAt(S) = windowEnd(D)                    ← I8
  ∧ result(S) = E5(D, observedValue(S))             ← I17 ★ 온체인 강제
  ∧ ( supersedes(S)=0 ∧ lastHead(D)=0
    ∨ supersedes(S)=lastHead(D) ∧ activeHead(D)=0 ∧ revoked(supersedes(S)) )
```

### E9. 상태 파생

`W = windowEnd`, `G = graceSeconds`, `S₀ = windowStart`
(I6c에 의해 `G ≥ 1시간 > 0`이므로 `W < W+G`)

```
state(D,t) =
    NOT_REQUIRED   if ¬hasExpectedOutcome(D)
    SETTLED        if activeHead ≠ 0 ∧ time(activeHead) <  W+G
    SETTLED_LATE   if activeHead ≠ 0 ∧ time(activeHead) ≥ W+G
    PENDING        if activeHead = 0 ∧ t <  S₀
    OBSERVING      if activeHead = 0 ∧ S₀ ≤ t <  W
    AWAITING       if activeHead = 0 ∧ W  ≤ t <  W+G
    OVERDUE        if activeHead = 0 ∧ t ≥ W+G
```

**부가 표시**: `revokeCount(D) > 0` → 「정산 철회 이력 있음」

> `revokeCount`가 없으면 철회 후 `OVERDUE`가 **처음부터 정산하지 않은 것과 구별되지 않는다.**

### E10. 공개 필수 집합

```
Π_forced = { uid, attester, committedAt, verifiedAddressUID,
             hasExpectedOutcome, outcomeMetricId/Op/Threshold,
             windowStart/End/graceSeconds, state(D,t), revokeCount,
             hasChallenge (불리언 — 건수 아님) }

Π_optional = { decision, trigger, reason, evidence payload }

불변식:  Π_forced ⊆ π      모든 공개 범위 설정 π에 대해
```

### E11. 트랜잭션 추정 (B12)

> v2.1은 Challenge를 누락하고, MVP 사양이 없는 "배지 재검증 +4"를 넣었다. 둘 다 정정한다.

```
TX_year = 12n                    노트 발행
        + 12c                    결정 커밋
        + 12·c·r·s               정산 발행
        + 2·12·c·r·s·f           정산 정정 (철회 + 재발행)

n: 월 노트 수   c: 월 결정 수   r: 선언 비율   s: 정산 발행률   f: 정정률
```

| 시나리오 | n | c | r | s | f | 연간 |
|---|---|---|---|---|---|---|
| 보수 | 0 | 1 | 0.30 | 0.70 | 0.05 | **15** |
| 기준 | 1 | 3 | 0.50 | 0.70 | 0.05 | **62** |
| 적극 | 2 | 8 | 0.60 | 0.80 | 0.10 | **175** |

> Challenge는 **제3자 발생분**이라 사용자 1인당 산식에 넣지 않는다. 네트워크 총량에는 더해진다.
> 배지 재검증은 MVP 사양이 없으므로 제거했다. Phase 2에서 사양 확정 후 재산정한다.

---

## 9. 상태 전이

```
JOURNAL_ENTRY (오프체인)
   │ 승격 — t0 = 승격 시점
   ▼
TIMESTAMPED_NOTE
   │ 승격 — 노트 t0 보존, 동일 지갑만
   ▼
VERIFIABLE_DECISION ── hasExpectedOutcome=false ─► NOT_REQUIRED
   │ true
   ▼
PENDING ─ t≥S₀ ─► OBSERVING ─ t≥W ─► AWAITING ─ t≥W+G ─► OVERDUE
                                        │                   │
                              Settlement │         Settlement│
                                        ▼                   ▼
                                     SETTLED          SETTLED_LATE
                                        │
                          ┌─────────────┴─────────────┐
                          │ revoke                     │ Challenge
                          ▼                            ▼
                 AWAITING / OVERDUE            SETTLED + 이의 있음
                 revokeCount += 1              (activeHead 불변)
                          │
                          │ 정정 발행 (supersedes = lastHead)
                          ▼
                       SETTLED
```

---

## 10. 실패 모드

| 상황 | 처리 |
|---|---|
| Resolver revert | 불변식별 한국어 메시지 매핑 |
| RPC rate limit | 지수 백오프 3회 |
| salt 분실 | 공개 영구 불가 — "공개 불가" 영구 표시 |
| 데이터 출처 중단 | `INDETERMINATE` (관측값 없음) |
| 제3자가 다른 관측값 계산 | **Challenge** — 공식 결과 불변 |
| 정산 오류 발견 | revoke → `supersedes = lastHead`로 재발행 |
| 인덱서 누락 | **"조회된 것이 전부라는 보장은 없습니다" 상시 표시** |

---

## 11. metric 레지스트리 (B7)

### 11.1 MVP는 구간 종료 시점 평가 지표만 허용한다

> **v2.1의 문제**: 스키마에는 관측값 1개와 시각 1개뿐인데 "구간 내 관측되지 않음"은 구간 전체를 조사해야 성립한다. 단일 시점 값으로는 **부재를 증명할 수 없다.**
>
> **v3의 해법**: 경로 존재형 지표를 MVP에서 제외한다. 그러면 `observedAt == windowEnd`가 강제되고 **단일 (값, 시각)이 결과를 완전히 결정한다.** 증명해야 할 부재가 사라진다.

| kind | 정의 | MVP |
|---|---|---|
| `WINDOW_END_EVALUATED` | 구간 `[start, end]` 전체를 입력으로 받아 **`end` 시점에 한 번 계산**되는 값 | ✅ |
| ~~`PATH_EXISTENCE`~~ | "구간 중 한 번이라도 X를 넘었는가" | ❌ Phase 2 |

### 11.2 초기 등록 지표

| metricId | 단위 | decimals | 계산 |
|---|---|---|---|
| `BTC_30D_REALIZED_VOL_AT_END` | percent | 1 | end 기준 직전 30일 실현변동성 |
| `BTC_60D_REALIZED_VOL_AT_END` | percent | 1 | end 기준 직전 60일 |
| `BTC_MAX_DRAWDOWN_IN_WINDOW` | percent | 1 | 구간 전체 최대낙폭, end에 확정 |
| `ETH_MAX_DRAWDOWN_IN_WINDOW` | percent | 1 | 동일 |
| `BTC_PRICE_KRW_AT_END` | krw | 0 | end 시점 종가 |
| `ETH_BTC_RATIO_AT_END` | ratio | 4 | end 시점 비율 |

> `BTC_PRICE_KRW`(경로 존재형)를 `..._AT_END`로 바꿨다. "구간 중 도달했는가"는 MVP에서 표현할 수 없다.

### 11.3 `definitionHash`가 가리키는 문서에 반드시 포함할 것

```
- 정확한 계산식 (의사코드)
- 데이터 소스와 엔드포인트
- 관측 간격 (예: 1시간 종가)
- 타임존 (UTC 고정)
- 결측치 처리 정책 (직전 값 이월 / INDETERMINATE 처리 기준)
- 반올림 규칙 (half-up)
- verifier 버전과 데이터셋 스냅샷 해시
```

이 문서 없이는 "누구나 같은 절차로 재현"이 성립하지 않는다. **`definitionHash`가 0인 지표는 등록하지 않는다.**

### 11.4 등록 금지

```
STRATEGY_*    전략 최대낙폭·수익률·Sharpe   → 실행 데이터 필요
PORTFOLIO_*   개인 포트폴리오 지표          → 실행 데이터 + 규제
USER_PNL_*    개인 손익                     → 규제
*_PATH_*      경로 존재형                   → Phase 2
```

---

## 12. 구현 체크리스트

### 12.0 즉시 착수 — 시간 제약 (B11)

> ⚠️ **`OVERDUE`를 데모에 담으려면 최소 리드타임이 필요하다.**
> `t ≥ windowEnd + graceSeconds`이고 `windowStart ≥ 커밋 시각`이므로, **가장 빠른 `OVERDUE`도 커밋 후 `graceSeconds` 경과가 필요**하다.
>
> `graceDays`(최소 1일) → **`graceSeconds`(최소 1시간)**으로 바꾼 이유가 이것이다. 그래도 **fixture를 먼저 온체인에 올려두고 최소 1시간 뒤에 녹화**해야 한다.

```
□ [D-0 최우선] 컨트랙트 배포 직후 OVERDUE fixture 커밋
             windowStart = now, windowEnd = now + 10분, graceSeconds = 1시간
             → 약 1시간 10분 뒤 OVERDUE 도달, 녹화 가능
□ [D-0] 법률 검토 게이트 — 되돌릴 수 없는 온체인 공개 전 확인 (B14)
        정산 상태·이의 공개 범위가 A.6 "규제 검토 필요" 항목과 충돌하지 않는지
```

### 12.1 컨트랙트

```
□ Foundry 초기화, EAS 인터페이스 임포트
□ _decodeDecision offset 트릭 단위 테스트          ← 여기서 막히면 전부 정지
□ POIResolverBase (_guard, ready, Ownable2Step)
□ POINoteResolver
□ POIDecisionResolver         + I1~I6, I12, I14
□ POISettlementResolver       + I7~I13, I16, I17
□ POIChallengeResolver        + I15
□ 스키마 4종 등록 (revocable 플래그 확인)
□ initialize() 후 multisig 이전 — renounce 금지
□ addMetric × 6 (definitionHash 포함, 등록 즉시 frozen)
```

### 12.2 오프체인·프론트

```
□ commitment 테스트 벡터 고정 (프론트·verifier·컨트랙트 테스트 공유)   ← B3
□ 프론트: 지갑 연결 + isVerified + verifiedAddressUID 스냅샷
□ 프론트: 3계층 등록 + salt 백업 강제 유도
□ 프론트: 정산 발행 (온체인 판정 실패 시 사유 표시)
□ 프론트: Challenge 발행 + 목록 표시 (건수 미표시, 검증 지갑 여부 병기)
□ 프론트: 상태 표시 (OVERDUE·철회 이력 포함)
□ 프론트: DAG 조회 + Strategy Passport
□ **F5 Reveal: 공개 UI + commitment 재검증 + 공개 저장소**   ← B10
□ 오프체인 verifier v1.0 (E2·E4·E5) + metric 정의 문서 6종
□ 데모 녹화 — OVERDUE·이의·철회 이력이 보이는 화면 필수
```

### 12.3 반드시 통과해야 할 공격 테스트

```
□ 타인이 정산 시도                       → NotDecisionOwner (I10)
□ revocable=false 정산                   → MustBeRevocable (I11)
□ expirationTime ≠ 0                     → MustBePermanent (V10) ★
□ 관측값과 반대되는 result 제출          → ResultMismatch (I17) ★
□ 관측값 없이 OBSERVED 제출              → MustBeIndeterminate (I16) ★
□ observedAt ≠ windowEnd                 → ObservedAtMustBeWindowEnd ★
□ S1 revoke 후 supersedes=S1 정정        → **통과해야 함** (B1) ★
□ S1 revoke 후 supersedes=0 재발행       → MustSupersede ★
□ activeHead 있는데 supersedes 발행      → PriorStillActive
□ 무관한 revoked UID로 supersede         → SupersedesNotLastHead
□ windowStart 과거                       → WindowInPast (I4)
□ graceSeconds < 1시간 또는 > 30일       → GraceOutOfRange (I6c)
□ 타인 노트를 승격 원본으로              → NoteNotSameActor (I3b)
□ 화이트리스트 밖 지표                   → MetricNotAllowed (I5)
□ refUID ≠ decisionUID                   → RefUIDMismatch (I12)
□ parents 9개                            → TooManyParents (I14)
□ Challenge 철회 후 재발행               → **통과해야 함** (B8) ★
□ 타인 commitment 복사 후 reveal 검증     → **실패해야 함** (B3) ★
□ 등록된 metric 재등록 시도              → MetricFrozen (B13)
```

---

## 13. 기획서(v0.10)에 요구되는 변경

| # | 위치 | 변경 |
|---|---|---|
| D1 | §2.1 | "결정 내용이 t0에 존재했다" → **공개 전/후를 구분한 3단계 서술** (§3.3) |
| D2 | §2.1 | "특정 검증 지갑에 귀속" → **"attester 주소에 귀속. 커밋 시점 Verified Address는 스냅샷으로 기록"** |
| D3 | §2.1 | **"정산 결과가 관측값과 일치함을 컨트랙트가 강제한다"** 행 추가 (B6) |
| D4 | §3.4 | `EVIDENCE_COMMITTED` 의미 정정 + **2축 등급** 도입 |
| D5 | §4.3 | Challenge **"영구 기록" 표현 삭제.** 철회 가능·건수 미표시로 수정 |
| D6 | §2.5 | `graceDays` → **`graceSeconds`(최소 1시간)** |
| D7 | §12 경쟁표 | "거짓 정산의 영구 기록" → **"정산 산술의 온체인 강제 + 이의 기록"** |
| D8 | §14 | 리스크에 **Sybil 이의**, **metric 정의 문서 부재** 추가 |
| D9 | §8.2 | TX 산식에서 배지 재검증 제거 |

---

*POI Technical Specification v3.0 — 2026-07-27*
