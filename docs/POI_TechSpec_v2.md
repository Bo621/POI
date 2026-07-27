# Proof of Investing — MVP 기술 명세 v2.1

**대상**: GASOK 2차 제출용 MVP (마감 2026-07-31)
**기획서**: `POI_v0.8.md` — 본 명세가 요구하는 기획서 변경은 §13
**v1.0 폐기**: v1의 정산 계층은 그리핑 공격에 취약했다. §1.4 참조

---

## 0. v1 → v2 변경

EAS 원본 스펙 대조 결과 **심각 결함 14건**이 발견됐다. 그중 하나는 아키텍처 결함이다.

| # | v1 결함 | v2 조치 |
|---|---|---|
| **A1** | **permissionless 정산 + EAS revoke 소유권 → 무한 그리핑** | **Settlement는 소유자 전용 + Challenge 스키마 신설** (§1.4, §6.4) |
| A2 | `abi.decode(a.data, (D))`가 EAS 인코딩과 불일치 → 전량 revert | offset 프리펜딩 (§6.1) |
| A3 | `revocable`을 스키마 레벨로만 다룸 | **attestation 레벨도 강제** (§6.4 I11) |
| A4 | `supersedes` 검증 부족 → head 탈취 | 3중 검증 추가 (I13) |
| A5 | `graceDays = 0`이면 `SETTLED` 도달 불가 | 하한 강제 (I6c) |
| A6 | `graceDays`·`window` 상한 없음 → OVERDUE 영구 회피 | 상한 강제 (I6a~c) |
| A7 | `promotedFromNote`의 attester 미검증 | 동일 actor 강제 (I3b) |
| A8 | `decimals`가 metric에 바인딩 안 됨 → 정산자마다 다른 결론 | **온체인 바인딩** (§6.2) |
| A9 | `boundaryInclusive`가 op와 중복 인코딩 | **필드 삭제**, op 6종으로 정규화 |
| A10 | `sourceVersion < windowEnd` → 구간 종료 시점 데이터 사용 불가 | `<=`로 변경 (I8) |
| A11 | F5 "reveal 없으면 정산 불가" ↔ §4 "payload 몰라도 정산 가능" | F5 정정 |
| A12 | F6 "결과 병기" ↔ I9 "나머지 revert" | Challenge로 해소 |
| A13 | `refUID`와 데이터 필드 불일치 미검증 | 일치 강제 (I12) |
| A14 | `parents` 길이 상한 없음 → 가스 DoS | 상한 8 |

사소 결함 21건도 반영했다 (§14).

---

## 1. 설계 전제

### 1.1 온체인 환경 — RPC 실측 확인 (2026-07-27)

> 문서 인용이 아니라 **GIWA Sepolia RPC에 직접 호출해 확인한 값**이다.

| 항목 | 주소 | 실측 결과 |
|---|---|---|
| Chain ID | — | `0x164ce` = **91342** ✅ |
| **EAS** | `0x4200…0021` | **v1.4.1-beta.3** · 프록시 → `0xbec660b4…` ✅ |
| **SchemaRegistry** | `0x4200…0020` | **v1.3.1-beta.2** · 프록시 → `0x70de55bc…` ✅ |
| 상호 연결 | — | `EAS.getSchemaRegistry()` → `0x42…0020` ✅ |
| `getSchema(bytes32)` | — | 정상 응답 ✅ |
| **DojangScroll** | `0xd5077b…7B9` | **v0.5.1** · 프록시 → `0x33aee288…` ✅ |
| `isVerified(address,bytes32)` | — | 정상 동작 (미검증 주소 → `false`) ✅ |
| Attester ID | — | `keccak256("dojang.dojangattesterids.upbitkorea")` **문서값 일치** ✅ |
| **ENS Registry** | `0x0000…2e1e` | **미배포 (0 bytes)** ❌ |
| L2 가스 가격 | — | **0.001 gwei** |

**함의**

1. `EAS`·`SchemaRegistry`가 모두 **프록시**다. 구현 주소가 업그레이드될 수 있으므로 **인터페이스만 의존하고 구현 주소를 하드코딩하지 않는다.**
2. `isVerified(address, bytes32)` 시그니처가 **실제로 확인됐다.** `(address, uint8)` 변형은 revert한다.
3. **ENS 미배포** → up.id를 GIWA 컨트랙트에서 해석할 수 없다. §2 F1 참조.

**실측 비용** (ETH $3,000 / 1,400원 가정, gas는 추정치)

```
L2 가스 가격 0.001 gwei · L1 데이터 수수료 400B 기준 약 0.03원

노트 발행     ~ 80,000 gas  →  약 0.34원
결정 커밋     ~120,000 gas  →  약 0.53원
정산 발행     ~150,000 gas  →  약 0.63원
```

> 테스트넷 기준. 메인넷 L1 데이터 수수료는 이더리움 blob 가격에 따라 변동한다.

### 1.2 EAS 활용

| EAS 기능 | POI 활용 |
|---|---|
| `SchemaRegistry.register(schema, resolver, revocable)` | 스키마 4종 등록 |
| `EAS.attest(...)` → `uid` | 발행. UID = 노드 ID |
| `refUID` | DAG 부모 링크 / 참조 |
| `EAS.revoke(...)` | Settlement 정정 |
| `SchemaResolver.onAttest()` | **POI 불변식 강제 지점** |

> "POI 앵커 컨트랙트"의 정체는 **EAS SchemaResolver**다. 레지스트리를 새로 만드는 게 아니라, EAS가 발행 직전에 호출하는 훅에 검증 로직을 넣는다.

### 1.3 EAS의 2단계 revocable — v1이 놓친 것

```
스키마 레벨   SchemaRegistry.register(..., revocable)
              false면 그 스키마의 attestation은 전부 비철회

attestation 레벨   AttestationRequestData.revocable
                   스키마가 true여도 개별 발행 시 false 지정 가능
                   revoke 시: if (!attestation.revocable) revert Irrevocable()
```

**두 단계를 모두 강제해야 한다.** 스키마만 `true`로 두면 공격자가 `revocable: false` attestation을 발행해 영구 잠금을 만들 수 있다.

### 1.4 정산 계층 재설계 — v1의 아키텍처 결함

**v1의 문제**

v1은 "누구나 정산 가능"을 신뢰 가정 개선으로 제시했다. 그러나 EAS `revoke`는 **원 발행자만** 호출할 수 있다.

```
공격 시나리오 (반복 가능, 비용 = 가스비)

1. windowEnd 도달 즉시 공격자가 임의 결과로 선점 → head 점유
2. 정직한 발행자는 AlreadySettled로 revert
3. 공격자가 자기 settlement를 revoke → head = 0
4. 상태가 OVERDUE로 복귀 (숨길 수 없는 상태)
5. 1로 돌아감 → 무한 그리핑
```

온체인에 결과 검증이 없고 발행자 자격 제한도 없으므로 막을 수단이 없었다.

**v2의 해법 — 소유권 + Challenge 분리**

| 계층 | 발행 권한 | 역할 |
|---|---|---|
| **Settlement** | **decision의 attester만** | 공식 정산. `head` 1건 |
| **Challenge** | **누구나** | 이의 제기. head를 덮지 않고 나란히 기록 |

이 분리가 유지하는 것과 포기하는 것.

| | v1 (permissionless 발행) | v2 (소유 + challenge) |
|---|---|---|
| 그리핑 | ❌ 가능 | ✅ 불가 |
| 누구나 **계산**할 수 있는가 | ✅ | ✅ (변함없음) |
| 누구나 **제출**할 수 있는가 | ✅ | ❌ 이의로만 |
| 거짓 정산이 드러나는가 | △ | ✅ Challenge가 영구 기록 |
| 미정산이 드러나는가 | ✅ | ✅ |

> **핵심**: 재현 가능성의 본질은 "누구나 **계산**할 수 있다"이지 "누구나 **제출**할 수 있다"가 아니다.
> `expectedOutcomePredicate`가 평문이므로 계산 가능성은 그대로 유지되고, 불일치는 Challenge로 온체인에 남는다.

---

## 2. MVP 기능 명세

### F1. 지갑 연결 및 신원 확인

| | |
|---|---|
| 입력 | 지갑 주소 |
| 처리 | `DojangScroll.isVerified(addr, UPBIT_KOREA_ID)` |
| 출력 | `{ verified: bool, upid: string \| null }` |
| 실패 | RPC 오류 → 3회 재시도 후 "확인 불가". **미검증 지갑도 사용 허용** (배지만 미발급) |

> ⚠️ **확인 완료 — ENS 미배포**: GIWA Sepolia에 ENS 레지스트리가 **배포되어 있지 않다** (실측, §1.1).
> 따라서 **MVP는 up.id 조회를 수행하지 않는다.** 온체인 로직은 지갑 주소로만 동작하고, UI는 주소를 축약 표기(`0x8f2c…a91b`)한다.
> up.id 해석은 별도 체인 RPC 조회 또는 크로스체인 해석(CCIP-Read)이 필요하며 Phase 1로 미룬다. (부록 B.5 #5)

### F2. JOURNAL_ENTRY (오프체인)

| | |
|---|---|
| 처리 | 로컬/서버 저장. **온체인 트랜잭션 없음** |
| UI 필수 | "이 기록은 검증되지 않습니다" 상시 표시 |

### F3. TIMESTAMPED_NOTE 발행

| | |
|---|---|
| 처리 | salt 생성 → `C = H(TAG_NOTE ‖ salt ‖ JCS(payload))` → `EAS.attest(NOTE_SCHEMA, revocable=false)` |
| 출력 | `noteUID` |
| 실패 | 트랜잭션 실패 시 salt 폐기 후 재생성 (재사용 금지) |

### F4. VERIFIABLE_DECISION 커밋

| | |
|---|---|
| 입력 | 결정 내용, trigger, expected_outcome(선택), window(조건부), 근거(선택), 부모 UID(≤8), 승격 노트(선택) |
| 처리 | §3 분리 → commitment 생성 → `EAS.attest(DECISION_SCHEMA, refUID=parents[0], revocable=false)` |
| 실패 | Resolver revert (§7 표에 한국어 메시지 매핑) |
| 불변 | 커밋 후 수정 불가. 정정은 새 Decision을 parent로 연결 |

### F5. Reveal (공개)

> **A11 정정**: v1은 "공개하지 않으면 정산 불가"라고 썼으나 **틀렸다.**
> `expectedOutcomePredicate`가 평문이므로 **reveal 없이도 정산은 가능하다.**

| | |
|---|---|
| 입력 | `decisionUID`, 공개 항목, `(salt, payload)` |
| 처리 | commitment 재계산 대조. **클라이언트에서도 동일 검증 가능** (서버 신뢰 불필요) |
| 출력 | 공개 URL |
| 성질 | **선택적.** 공개하지 않으면 **결정 내용이 미검증 상태로 남을 뿐, 정산에는 영향이 없다** |
| 실패 | commitment 불일치 → 거부 |

### F6. Settlement 발행

| | |
|---|---|
| **권한** | **decision의 attester만** (A1) |
| 입력 | `decisionUID`, 관측값, 출처, 관측 시각 |
| 처리 | E8 검사 → E4/E5 판정 → `EAS.attest(SETTLEMENT_SCHEMA, refUID=decisionUID, revocable=true)` |
| 불변 | **attestation 레벨 `revocable = true` 강제** (I11) |

### F7. Challenge 발행 (신규)

| | |
|---|---|
| **권한** | **누구나** |
| 입력 | `settlementUID`, 본인이 계산한 결과·관측값·출처 |
| 처리 | `EAS.attest(CHALLENGE_SCHEMA, refUID=settlementUID, revocable=true)` |
| 출력 | `challengeUID` |
| 효과 | **head를 변경하지 않는다.** UI가 Settlement 옆에 이의 건수와 내용을 표시 |
| 남용 방지 | 동일 attester가 동일 settlement에 중복 이의 불가 (I15) |

### F8. 정산 상태 표시

| | |
|---|---|
| 처리 | E9 |
| 출력 | `NOT_REQUIRED` / `PENDING` / `OBSERVING` / `AWAITING` / `OVERDUE` / `SETTLED` / `SETTLED_LATE` |
| UI 필수 | **`OVERDUE`는 공개 범위 설정으로 숨길 수 없다.** 이의 건수도 항상 표시 |

### F9. 결정 그래프 조회 / F10. Strategy Passport / F11. 검증 등급 표시

| | |
|---|---|
| F9 | EAS 인덱서 수집 → parents로 DAG 구성. **"조회된 것이 전부라는 보장은 없다" 상시 표시** |
| F10 | 서브그래프 + 오프체인 저널 별도 영역 |
| F11 | **E7로 파생.** 사용자 입력 아님 |

---

## 3. 데이터 분리

### 3.1 필드별 배치

| 필드 | 배치 | 근거 |
|---|---|---|
| `parents[]` (≤8) | 평문 | Resolver 검증 |
| `promotedFromNote` | 평문 | 링크 검증 |
| `hasExpectedOutcome` | 평문 | 정산 허용 판단 |
| `outcomeMetric` / `outcomeOp` / `outcomeThreshold` | **평문** | **누구나 계산 가능해야 함** |
| `windowStart` / `windowEnd` / `graceDays` | 평문 | 기한 검증, 상태 파생 |
| `decisionCommitment` | commitment | 전략 자산 |
| `triggerCommitment` | commitment | **트리거는 전략의 핵심** |
| `evidenceCommitment` | commitment | 근거 자료 |
| `reasonCommitment` | commitment | 개인정보 위험 |

> `outcomeDecimals`는 **스키마 필드가 아니다.** metric에 온체인 바인딩된다 (A8, §6.2).

### 3.2 공개 범위 통제의 예외

```
숨길 수 있음  :  decision / trigger / reason / evidence payload

항상 공개     :  decisionUID, attester, committedAt,
                hasExpectedOutcome,
                outcomeMetric / Op / Threshold,   (선언 시)
                windowStart / windowEnd / graceDays,  (선언 시)
                state(D, t),                      ← 특히 OVERDUE
                challengeCount
```

`expected_outcome`을 선언하는 행위는 **정산 상태 공개에 동의하는 것**이다. UI가 커밋 전에 고지한다.

---

## 4. Commit-Reveal 프로토콜

### 4.1 흐름

```
t0   COMMIT
     salt ← CSPRNG(128)
     C = keccak256( TAG ‖ decisionNonce ‖ salt ‖ JCS(payload) )
     온체인: C + outcome predicate(평문) + window
     로컬:   (salt, payload)

t1   SETTLE          decision attester가 발행
     제3자도 동일 데이터로 계산 가능 (predicate 평문)

t1+  CHALLENGE       불일치 시 누구나 발행

t1+  REVEAL (선택)   (salt, payload) 공개 → 누구나 C 재계산
```

### 4.2 성질

| 성질 | v2 |
|---|---|
| t0 이후 payload 변경 | ❌ 불가 |
| payload 몰라도 정산 계산 | ✅ 가능 |
| **reveal이 정산의 전제인가** | **❌ 아니다** (A11) |
| reveal 거부 가능 | ✅ — 단 결정 내용은 미검증으로 표시 |
| 거짓 정산 탐지 | ✅ Challenge |

### 4.3 도메인 분리 (m13)

네 종류 commitment가 같은 함수를 쓰면 reveal 시 교차 혼동이 가능하다.

```
TAG_DECISION = keccak256("poi.commit.decision.v1")
TAG_TRIGGER  = keccak256("poi.commit.trigger.v1")
TAG_EVIDENCE = keccak256("poi.commit.evidence.v1")
TAG_REASON   = keccak256("poi.commit.reason.v1")
TAG_NOTE     = keccak256("poi.commit.note.v1")

C = keccak256( TAG ‖ salt ‖ JCS(payload) )
```

### 4.4 salt 관리

| 항목 | 규칙 |
|---|---|
| 길이 | 128비트, 클라이언트 CSPRNG |
| 재사용 | 금지 (payload별 고유) |
| 온체인 | 절대 기록 금지 |
| 분실 시 | reveal 영구 불가 → "공개 불가" 영구 표시. **UI가 백업 강제 유도** |

---

## 5. EAS 스키마

### 5.1 `poi.note.v1`

```
schema    : "bytes32 contentCommitment"
resolver  : POINoteResolver          ← v1은 0x0이었으나 attester 검증 위해 필요
revocable : false
```

### 5.2 `poi.decision.v1`

```
schema:
  "bytes32[] parents,
   bytes32 promotedFromNote,
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
   uint32  graceDays"

resolver  : POIDecisionResolver
revocable : false
refUID    : parents[0]  (parents 비어있으면 0)
```

**v1 대비 변경**

- `outcomeDecimals` 삭제 → metric에 바인딩 (A8)
- `outcomeBoundaryInclusive` 삭제 → op 6종으로 정규화 (A9)
- `outcomeMetric`을 `string` → `bytes32 outcomeMetricId` (가스 절감, 비교 단순화)

`outcomeOp` 열거: `0=GT, 1=GTE, 2=LT, 3=LTE, 4=EQ, 5=NEQ`

### 5.3 `poi.settlement.v1`

```
schema:
  "bytes32 decisionUID,
   uint8   result,
   bool    hasObservedValue,
   int128  observedValue,
   string  source,
   uint64  observedAt,
   string  verifierVersion,
   bytes32 supersedes"

resolver  : POISettlementResolver
revocable : true          ← 스키마 레벨
refUID    : decisionUID
```

**v1 대비 변경**

- `hasObservedValue` 추가 — `INDETERMINATE`일 때 0과 실제 관측값 0을 구분 (m12)
- `sourceVersion` → `observedAt`으로 개명 — 의미가 "관측 시각"임을 명확히 (S10)

`result`: `0=OBSERVED, 1=NOT_OBSERVED, 2=INDETERMINATE`

### 5.4 `poi.challenge.v1` (신규)

```
schema:
  "bytes32 settlementUID,
   uint8   claimedResult,
   bool    hasObservedValue,
   int128  observedValue,
   string  source,
   uint64  observedAt,
   bytes32 noteCommitment"

resolver  : POIChallengeResolver
revocable : true
refUID    : settlementUID
```

---

## 6. 컨트랙트 설계

### 6.1 EAS 데이터 디코딩 (A2)

**v1의 치명적 오류**: EAS의 `attestation.data`는 `SchemaEncoder`가 만든 **평면 튜플 인코딩**이다. `abi.decode(data, (D))`는 단일 동적 구조체를 기대하므로 첫 워드를 offset으로 오독해 revert한다.

**해법**

```solidity
function _decodeDecision(bytes calldata data)
    internal pure returns (DecisionData memory d)
{
    // 평면 튜플 앞에 "구조체 본문으로의 offset(0x20)"을 붙여
    // 단일 동적 튜플 인코딩으로 만든다
    return abi.decode(
        bytes.concat(abi.encode(uint256(0x20)), data),
        (DecisionData)
    );
}
```

> 이 트릭이 필요한 이유를 주석으로 남길 것. 모르면 디버깅에 하루가 날아간다.
> `DecisionData`를 memory 구조체로 받으므로 stack-too-deep은 발생하지 않는다.

### 6.2 metric 레지스트리 (A8)

```solidity
struct MetricSpec {
    bool  allowed;
    uint8 decimals;      // metric에 고정. 사용자가 바꿀 수 없다
}
mapping(bytes32 => MetricSpec) public metrics;
```

**decimals를 온체인에 바인딩하는 이유**: 사용자가 임의로 지정하면 같은 `outcomeThreshold` 값이 발행자마다 다른 실수로 해석되고, **정산자마다 다른 결론에 도달한다.** "누구나 같은 데이터로 같은 결과"라는 전제가 깨진다.

### 6.3 POIDecisionResolver

```solidity
struct DecisionData {
    bytes32[] parents;
    bytes32 promotedFromNote;
    bytes32 decisionCommitment;
    bytes32 triggerCommitment;
    bytes32 evidenceCommitment;
    bytes32 reasonCommitment;
    bool    hasExpectedOutcome;
    bytes32 outcomeMetricId;
    uint8   outcomeOp;
    int128  outcomeThreshold;
    uint64  windowStart;
    uint64  windowEnd;
    uint32  graceDays;
}

contract POIDecisionResolver is SchemaResolver, Ownable {

    uint256 constant MAX_PARENTS      = 8;
    uint64  constant MAX_START_DELAY  = 30 days;
    uint64  constant MAX_WINDOW       = 730 days;
    uint32  constant MIN_GRACE_DAYS   = 1;
    uint32  constant MAX_GRACE_DAYS   = 30;
    uint8   constant MAX_OP           = 5;

    bytes32 public DECISION_SCHEMA;
    bytes32 public NOTE_SCHEMA;
    bool    public initialized;

    mapping(bytes32 => MetricSpec) public metrics;

    constructor(IEAS eas) SchemaResolver(eas) Ownable(msg.sender) {}

    function initialize(bytes32 decisionSchema, bytes32 noteSchema)
        external onlyOwner
    {
        require(!initialized, "already");
        DECISION_SCHEMA = decisionSchema;
        NOTE_SCHEMA     = noteSchema;
        initialized     = true;
    }

    function onAttest(Attestation calldata a, uint256)
        internal view override returns (bool)
    {
        require(initialized, "not initialized");            // m14
        DecisionData memory d = _decodeDecision(a.data);

        // I1  trigger 필수
        if (d.triggerCommitment == bytes32(0)) revert TriggerRequired();

        // I14 parents 상한
        if (d.parents.length > MAX_PARENTS) revert TooManyParents();

        // I12 refUID ↔ parents[0] 일치
        if (d.parents.length > 0) {
            if (a.refUID != d.parents[0]) revert RefUIDMismatch();
        } else {
            if (a.refUID != bytes32(0))   revert RefUIDMismatch();
        }

        // I2/I3 부모 검증
        for (uint i; i < d.parents.length; ++i) {
            Attestation memory p = _eas.getAttestation(d.parents[i]);
            if (p.uid == bytes32(0))         revert ParentNotFound();
            if (p.schema != DECISION_SCHEMA) revert ParentWrongSchema();
            if (p.attester != a.attester)    revert ParentNotSameActor();
            if (p.time >= a.time)            revert ParentNotEarlier();
            if (p.expirationTime != 0)       revert ParentExpirable();   // m16
            if (p.revocationTime != 0)       revert ParentRevoked();
        }

        // I3b 승격 노트 — attester 일치 필수 (A7)
        if (d.promotedFromNote != bytes32(0)) {
            Attestation memory n = _eas.getAttestation(d.promotedFromNote);
            if (n.uid == bytes32(0))      revert NoteNotFound();
            if (n.schema != NOTE_SCHEMA)  revert NoteWrongSchema();
            if (n.attester != a.attester) revert NoteNotSameActor();
            if (n.time >= a.time)         revert NoteNotEarlier();
        }

        // I4/I5/I6 outcome 검증
        if (d.hasExpectedOutcome) {
            MetricSpec memory m = metrics[d.outcomeMetricId];
            if (!m.allowed)                 revert MetricNotAllowed();   // I5
            if (d.outcomeOp > MAX_OP)       revert OpOutOfRange();       // A8
            if (d.windowStart < a.time)     revert WindowInPast();       // I4 ★
            if (d.windowStart > a.time + MAX_START_DELAY)
                                            revert WindowStartTooFar();  // I6a
            if (d.windowEnd <= d.windowStart) revert WindowInvalid();
            if (d.windowEnd - d.windowStart > MAX_WINDOW)
                                            revert WindowTooLong();      // I6b
            if (d.graceDays < MIN_GRACE_DAYS || d.graceDays > MAX_GRACE_DAYS)
                                            revert GraceOutOfRange();    // I6c ★
        } else {
            // I6d 미선언 시 관련 필드 전부 0 (m9)
            if (d.outcomeMetricId  != bytes32(0) ||
                d.outcomeOp        != 0          ||
                d.outcomeThreshold != 0          ||
                d.windowStart      != 0          ||
                d.windowEnd        != 0          ||
                d.graceDays        != 0) revert OutcomeFieldsMustBeZero();
        }
        return true;
    }

    function onRevoke(Attestation calldata, uint256)
        internal pure override returns (bool) { return true; }
        // decision 스키마가 revocable=false이므로 EAS가 먼저 막는다. 도달 불가 (m4)
}
```

**핵심 불변식**

| # | 불변식 | 의미 |
|---|---|---|
| I1 | `triggerCommitment ≠ 0` | 모든 검증 대상 결정은 트리거를 가진다 |
| I2 | `parent.time < self.time` | **같은 블록 내 부모 지정 금지** — 사후 소급 차단은 I4의 역할 (m6) |
| I3 | `parent.attester == self.attester` | 타인 그래프 접붙이기 차단 |
| I3b | `note.attester == self.attester` | **타인 노트 승격 차단** (A7) |
| **I4** | **`windowStart ≥ block.timestamp`** | **과거 구간 선언 금지 — 사후 서사 차단의 실제 메커니즘** |
| I5 | metric 화이트리스트 | 판정 불가능한 predicate 차단 |
| I6a~d | window·grace 상하한, 미선언 시 0 | **OVERDUE 회피 차단** (A5, A6) |
| I12 | `refUID == parents[0]` | 인덱서 그래프와 온체인 상태 일치 (A13) |
| I14 | `parents.length ≤ 8` | 가스 DoS 방지 (A14) |

> **I4가 이 프로젝트에서 가장 중요한 불변식이다.** 관측 구간을 과거로 잡을 수 있으면 사후 서사 재구성이 그대로 가능하다.
> **I6a~c가 없으면 I4가 무의미해진다.** `graceDays`를 최대값으로 잡으면 `OVERDUE`에 영원히 도달하지 않기 때문이다.

### 6.4 POISettlementResolver

```solidity
struct SettlementData {
    bytes32 decisionUID;
    uint8   result;
    bool    hasObservedValue;
    int128  observedValue;
    string  source;
    uint64  observedAt;
    string  verifierVersion;
    bytes32 supersedes;
}

contract POISettlementResolver is SchemaResolver, Ownable {

    mapping(bytes32 => bytes32) public head;   // decisionUID → 유효 settlementUID

    function onAttest(Attestation calldata a, uint256)
        internal override returns (bool)
    {
        require(initialized, "not initialized");
        SettlementData memory s = _decodeSettlement(a.data);

        // I11 attestation 레벨 revocable 강제 (A3)
        if (!a.revocable) revert MustBeRevocable();

        // I12 refUID 일치 (A13)
        if (a.refUID != s.decisionUID) revert RefUIDMismatch();

        if (s.result > 2) revert ResultOutOfRange();
        if (s.result == 2 && s.hasObservedValue) revert IndeterminateHasValue();

        Attestation memory dAtt = _eas.getAttestation(s.decisionUID);
        if (dAtt.uid == bytes32(0) || dAtt.schema != DECISION_SCHEMA)
            revert DecisionNotFound();

        // ★ A1 — 소유자만 정산 가능
        if (dAtt.attester != a.attester) revert NotDecisionOwner();

        DecisionData memory d = _decodeDecision(dAtt.data);
        if (!d.hasExpectedOutcome) revert DecisionHasNoOutcome();

        // I7 구간 종료 후에만
        if (a.time < d.windowEnd) revert WindowNotEnded();

        // I8 관측 시각이 구간 내 — 상한 inclusive (A10)
        if (s.observedAt < d.windowStart || s.observedAt > d.windowEnd)
            revert ObservedAtOutOfWindow();

        // I9/I13 중복·정정
        if (s.supersedes == bytes32(0)) {
            if (head[s.decisionUID] != bytes32(0)) revert AlreadySettled();
        } else {
            // A4 — 3중 검증
            if (head[s.decisionUID] != s.supersedes) revert SupersedesNotHead();
            Attestation memory prev = _eas.getAttestation(s.supersedes);
            if (prev.schema != SETTLEMENT_SCHEMA)   revert SupersedesWrongSchema();
            if (prev.revocationTime == 0)           revert SupersedesNotRevoked();
        }

        head[s.decisionUID] = a.uid;
        return true;
    }

    function onRevoke(Attestation calldata a, uint256)
        internal override returns (bool)
    {
        SettlementData memory s = _decodeSettlement(a.data);
        if (head[s.decisionUID] == a.uid) {
            head[s.decisionUID] = bytes32(0);
            revokedOnce[s.decisionUID] = true;      // m17 — 이력 보존
        }
        return true;
    }

    mapping(bytes32 => bool) public revokedOnce;
}
```

**핵심 불변식**

| # | 불변식 | 의미 |
|---|---|---|
| **I10** | **`decision.attester == settlement.attester`** | **소유자만 정산 (A1 — 그리핑 차단)** |
| I7 | `settle.time ≥ window.end` | 구간 종료 전 정산 금지 |
| I8 | `window.start ≤ observedAt ≤ window.end` | **상한 inclusive** (A10) |
| I9 | decision당 유효 settlement 최대 1건 | 0건 = 미발행 (정상) |
| **I11** | **`attestation.revocable == true`** | **영구 잠금 차단 (A3)** |
| I12 | `refUID == decisionUID` | 인덱서 정합 |
| I13 | `supersedes == head` ∧ 스키마 일치 ∧ revoke됨 | **head 탈취 차단 (A4)** |

> `revokedOnce`는 정산이 철회된 이력이 있음을 보존한다. 이것이 없으면 revoke 후 상태가 `OVERDUE`로 되돌아가면서 **처음부터 정산하지 않은 것과 구별되지 않는다** (m17).

### 6.5 POIChallengeResolver

```solidity
contract POIChallengeResolver is SchemaResolver, Ownable {

    // (settlementUID, challenger) → 발행 여부
    mapping(bytes32 => mapping(address => bool)) public challenged;

    function onAttest(Attestation calldata a, uint256)
        internal override returns (bool)
    {
        ChallengeData memory c = _decodeChallenge(a.data);

        if (!a.revocable)                    revert MustBeRevocable();
        if (a.refUID != c.settlementUID)     revert RefUIDMismatch();
        if (c.claimedResult > 2)             revert ResultOutOfRange();

        Attestation memory s = _eas.getAttestation(c.settlementUID);
        if (s.uid == bytes32(0) || s.schema != SETTLEMENT_SCHEMA)
            revert SettlementNotFound();
        if (s.revocationTime != 0)           revert SettlementRevoked();

        // I15 동일인 중복 이의 금지
        if (challenged[c.settlementUID][a.attester]) revert AlreadyChallenged();
        challenged[c.settlementUID][a.attester] = true;

        return true;
    }
}
```

> Challenge는 **head를 변경하지 않는다.** 온체인 상태에 대한 권한이 없으므로 그리핑이 성립하지 않는다.
> UI는 Settlement 옆에 이의 건수·주장 결과·출처를 나열한다.

### 6.6 배포 순서 (m14)

```
1. POINoteResolver / POIDecisionResolver / POISettlementResolver / POIChallengeResolver 배포
   → 이 시점 initialized = false → 모든 onAttest가 revert
2. SchemaRegistry.register(note,       noteResolver,       false) → NOTE_SCHEMA
3. SchemaRegistry.register(decision,   decisionResolver,   false) → DECISION_SCHEMA
4. SchemaRegistry.register(settlement, settlementResolver, TRUE)  → SETTLEMENT_SCHEMA
5. SchemaRegistry.register(challenge,  challengeResolver,  TRUE)  → CHALLENGE_SCHEMA
6. 각 resolver.initialize(...) 호출 → initialized = true
7. metrics 등록 (§11)
8. Ownable 소유권 이전 또는 renounce
```

> **1~6 사이의 창**: 스키마는 라이브인데 resolver가 미초기화 상태다. `require(initialized)`가 이 창에서 모든 발행을 막는다. 이 가드가 없으면 스키마 UID가 0인 상태로 검증 없는 attestation이 발행된다.
> `immutable`은 원리적으로 불가능하다 — 스키마 등록에 resolver 주소가 필요하고, resolver는 스키마 UID를 알아야 하는 순환이기 때문이다.

---

## 7. 검증 매트릭스

| # | 검증 항목 | 클라이언트 | Resolver<br>(온체인) | 오프체인<br>verifier | 제3자 |
|---|---|:---:|:---:|:---:|:---:|
| V1 | Verified Address 여부 | ○ | — | ○ | ○ |
| V2 | trigger commitment 존재 (I1) | ○ | **●** | — | ○ |
| V3 | 부모 존재·스키마 (I2) | ○ | **●** | — | ○ |
| V4 | 부모 시간 선행 (I2) | ○ | **●** | — | ○ |
| V5 | 부모 동일 actor (I3) | ○ | **●** | — | ○ |
| V6 | 승격 노트 동일 actor (I3b) | ○ | **●** | — | ○ |
| V7 | **관측 구간이 미래 (I4)** | ○ | **●** | — | ○ |
| V8 | metric 화이트리스트 (I5) | ○ | **●** | — | ○ |
| V9 | window·grace 범위 (I6) | ○ | **●** | — | ○ |
| V10 | 구간 종료 후 정산 (I7) | ○ | **●** | — | ○ |
| V11 | 관측 시각 구간 내 (I8) | ○ | **●** | — | ○ |
| V12 | 중복 정산 방지 (I9) | — | **●** | — | ○ |
| V13 | **정산 권한 = 소유자 (I10)** | ○ | **●** | — | ○ |
| V14 | revocable 강제 (I11) | ○ | **●** | — | ○ |
| V15 | refUID 정합 (I12) | ○ | **●** | — | ○ |
| V16 | supersedes 정합 (I13) | — | **●** | — | ○ |
| V17 | predicate 판정값 정확성 | ○ | ✗ | ○ | **○ (Challenge)** |
| V18 | commitment ↔ payload | ○ | ✗ | ○ | ○ (reveal 후) |
| V19 | 데이터 출처의 진위 | ✗ | ✗ | ✗ | ✗ |
| V20 | **결정의 완전성** | ✗ | ✗ | ✗ | ✗ |
| V21 | **실행 정합성** | ✗ | ✗ | ✗ | ✗ |
| V22 | **이유의 진실성** | ✗ | ✗ | ✗ | ✗ |

**범례**: ● 트랜잭션 실패로 강제 · ○ 계산·확인 가능 (강제력 없음) · ✗ 불가 · — 해당 없음

### 7.1 이 표가 말하는 것

- **온체인이 강제하는 것은 15개** (V2~V16). 전부 **구조적 불변식**이지 내용의 진위가 아니다
- **V17은 온체인 강제가 불가능하지만, Challenge로 불일치가 영구 기록된다**
- **V19(출처 진위)는 MVP에서 아무도 검증하지 못한다.** Phase 2 오라클의 역할
- **V20·V21·V22는 원리적·현 단계적으로 불가**

> 심사에서 이 표를 그대로 보여주는 것이 가장 강한 방어다.

---

## 8. 수식

### E1. Commitment

```
C = keccak256( TAG ‖ salt ‖ JCS(payload) )
verify(C, TAG, salt, payload) ≡ ( C == keccak256(TAG ‖ salt ‖ JCS(payload)) )
```

### E2. 정수 스케일링

```
scale(x, metric) = round_half_up( x × 10^decimals(metric) )
```

`decimals`는 **metric 레지스트리에서 조회**한다 (§6.2). 사용자 입력이 아니다.

### E3. Predicate

```
P = ( metricId, op, θ )      op ∈ {GT, GTE, LT, LTE, EQ, NEQ}
θ = scale(threshold, metricId)
```

> `boundaryInclusive` 필드는 **삭제됐다** (A9). `GT`/`GTE`가 이미 경계를 표현하므로 중복 인코딩이었고, `(GTE, exclusive)` 같은 미정의 조합을 만들었다.

### E4. 판정

```
v' = scale(v, metricId)

eval(P, v) =
    v' >  θ   if op = GT
    v' >= θ   if op = GTE
    v' <  θ   if op = LT
    v' <= θ   if op = LTE
    v' == θ   if op = EQ
    v' != θ   if op = NEQ
```

### E5. 정산 결과

```
result(D, v) =
    INDETERMINATE   if hasObservedValue = false
    OBSERVED        if eval(expected(D), v)
    NOT_OBSERVED    otherwise
```

### E6. DAG 유효성

```
validDAG(D) ≡ ∀ p ∈ parents(D) :
      exists(p) ∧ schema(p) = DECISION
    ∧ attester(p) = attester(D)
    ∧ time(p) < time(D)
    ∧ revocationTime(p) = 0 ∧ expirationTime(p) = 0
```

> **비순환은 시간 조건이 아니라 "부모가 이미 존재하는 불변 UID"라는 점에서 나온다** (m8). 시간 조건은 같은 블록 내 순환만 추가로 막는다.

### E7. 검증 등급 (파생)

```
tier(D) =
    ORACLE_VERIFIED      if oracleAttestation(D) ≠ ⊥      (Phase 2)
    EVIDENCE_COMMITTED   if evidenceCommitment(D) ≠ 0
    SELF_DECLARED        otherwise
```

온체인에 저장하지 않는다. 조회 시 계산한다.

### E8. 정산 유효성

```
validSettlement(S, D) ≡
    exists(D) ∧ schema(D) = DECISION
  ∧ attester(S) = attester(D)                          ← I10
  ∧ hasExpectedOutcome(D)
  ∧ revocable(S) = true                                ← I11
  ∧ refUID(S) = uid(D)                                 ← I12
  ∧ time(S) >= windowEnd(D)                            ← I7
  ∧ windowStart(D) <= observedAt(S) <= windowEnd(D)    ← I8
  ∧ ( supersedes(S) = 0 ∧ head(D) = 0
    ∨ supersedes(S) = head(D) ∧ revoked(head(D)) )     ← I9, I13
```

### E9. 상태 파생

`t` = 현재, `S₀ = windowStart`, `W = windowEnd`, `G = graceDays × 86400`
(I6c에 의해 `G ≥ 1일 > 0`이므로 `W < W+G`가 항상 성립 — A5 해소)

```
state(D, t) =
    NOT_REQUIRED     if ¬hasExpectedOutcome(D)

    SETTLED          if head ≠ 0 ∧ time(head) <  W + G
    SETTLED_LATE     if head ≠ 0 ∧ time(head) >= W + G

    PENDING          if head = 0 ∧ t <  S₀
    OBSERVING        if head = 0 ∧ S₀ <= t <  W
    AWAITING         if head = 0 ∧ W  <= t <  W + G
    OVERDUE          if head = 0 ∧ t >= W + G
```

**표시 부가 정보**

```
wasRevoked(D) = revokedOnce(D)         ← 정산 철회 이력 (m17)
challengeCount(S) = |challenges(S)|
```

> v1은 `PENDING` 하나로 관측 시작 전과 관측 중을 뭉갰다. `OBSERVING`을 분리했다.
> `wasRevoked`가 없으면 철회 후 `OVERDUE`가 **처음부터 정산 안 한 것과 구별되지 않는다.**

### E10. 공개 필수 집합

```
Π_forced(D) = { uid, attester, committedAt, hasExpectedOutcome,
                outcomeMetricId, outcomeOp, outcomeThreshold,   (선언 시)
                windowStart, windowEnd, graceDays,              (선언 시)
                state(D,t), wasRevoked(D), challengeCount }

불변식:  Π_forced(D) ⊆ π(D)      모든 공개 범위 설정 π에 대해
```

### E11. 트랜잭션 추정

```
TX_year(n, c, r, s, f) = 12n + 12c + 12·c·r·s + 2·12·c·r·s·f + 4

n : 월 TIMESTAMPED_NOTE 발행 수
c : 월 VERIFIABLE_DECISION 커밋 수
r : expected_outcome 선언 비율
s : 정산 발행률
f : 정산 정정률 (revoke + 재발행 = 2 tx)
4 : 배지 재검증 (분기 1회)
```

| 시나리오 | n | c | r | s | f | TX |
|---|---|---|---|---|---|---|
| 보수 | 0 | 1 | 0.30 | 0.70 | 0.05 | **19** |
| 기준 | 1 | 3 | 0.50 | 0.70 | 0.05 | **66** |
| 적극 | 2 | 8 | 0.60 | 0.80 | 0.10 | **179** |

> v1은 노트 발행과 정정 트랜잭션을 누락했다 (m15).

---

## 9. 상태 전이

```
JOURNAL_ENTRY (오프체인)
      │ 승격 — t0 = 승격 시점
      ▼
TIMESTAMPED_NOTE
      │ 승격 — 노트 t0 보존, 링크 (동일 actor만)
      ▼
VERIFIABLE_DECISION ──── hasExpectedOutcome = false ──► NOT_REQUIRED
      │
      │ true
      ▼
   PENDING ── t ≥ S₀ ──► OBSERVING ── t ≥ W ──► AWAITING ── t ≥ W+G ──► OVERDUE
                                                    │                      │
                                          Settlement│            Settlement│
                                                    ▼                      ▼
                                                 SETTLED            SETTLED_LATE
                                                    │
                                     ┌──────────────┴──────────────┐
                                     │ revoke                      │ Challenge
                                     ▼                             ▼
                          AWAITING/OVERDUE                  SETTLED + 이의 n건
                          (wasRevoked = true)               (head 불변)
```

**되돌릴 수 없는 것**

- Decision 커밋 → 취소 불가
- `wasRevoked` → 한 번 true면 영구
- `SETTLED_LATE` → 영구 표시
- salt 분실 → reveal 영구 불가

---

## 10. 실패 모드

| 상황 | 처리 | 사용자 표시 |
|---|---|---|
| Resolver revert | 트랜잭션 실패 | 불변식별 한국어 메시지 (§7 매핑) |
| RPC rate limit | 지수 백오프 3회 | "네트워크 혼잡, 재시도 중" |
| salt 분실 | 복구 불가 | "이 결정은 공개할 수 없습니다" 영구 |
| 데이터 출처 중단 | `INDETERMINATE` | 사유 병기 |
| 제3자가 다른 결과 계산 | **Challenge 발행** | Settlement 옆에 이의 n건 |
| 정산 오류 발견 | revoke + supersede | 정정 이력 + `wasRevoked` 공개 |
| 인덱서 누락 | 그래프 일부 미표시 | **"조회된 것이 전부라는 보장은 없습니다" 상시** |
| ENS 미배포 | up.id 생략 | 주소 축약 표기 |

---

## 11. metric 레지스트리 (초기)

**공개 시장 데이터만으로 판정 가능해야 한다.**

| metricId (문자열) | 단위 | decimals |
|---|---|---|
| `BTC_30D_REALIZED_VOL` | percent | 1 |
| `BTC_60D_REALIZED_VOL` | percent | 1 |
| `BTC_60D_MAX_DRAWDOWN` | percent | 1 |
| `BTC_90D_MAX_DRAWDOWN` | percent | 1 |
| `BTC_PRICE_KRW` | krw | 0 |
| `ETH_BTC_RATIO` | ratio | 4 |
| `ETH_60D_MAX_DRAWDOWN` | percent | 1 |

`metricId = keccak256(문자열)`. **decimals는 온체인 고정.**

**등록 금지**

```
STRATEGY_*    전략 최대낙폭·수익률·Sharpe   → 실행 데이터 필요 (관측 불가)
PORTFOLIO_*   개인 포트폴리오 지표          → 실행 데이터 + 규제
USER_PNL_*    개인 손익                     → 규제
```

> `trigger_predicate`는 commitment 뒤이므로 **온체인 화이트리스트가 적용되지 않는다.** 클라이언트가 동일 목록으로 안내하되 강제는 아니다. **이 비대칭을 UI와 문서에 명시한다.**

---

## 12. 구현 체크리스트

### Phase 0 — 7/31

```
☑ GIWA Sepolia EAS·SchemaRegistry 배포 확인 — 완료 (§1.1)
☑ ENS 레지스트리 확인 — **미배포**. up.id는 MVP에서 제외 (§2 F1)
□ Foundry 초기화, EAS 인터페이스 임포트
□ _decodeDecision offset 트릭 단위 테스트                          ← 여기서 막히면 전부 정지
□ POIDecisionResolver + I1~I6, I12, I14 테스트
□ POISettlementResolver + I7~I13 테스트
□ POIChallengeResolver + I15 테스트
□ 스키마 4종 등록 (revocable 플래그 확인)
□ initialize() 호출 후 소유권 정리
□ metrics 초기 7종 등록
□ 프론트: 지갑 연결 + isVerified
□ 프론트: 3계층 등록 + salt 백업 유도
□ 프론트: 정산 발행 + Challenge + 상태 표시 (OVERDUE 필수)
□ 프론트: DAG 조회 + Strategy Passport
□ 오프체인 verifier v1.0 (E2·E4·E5)
□ 데모 녹화 — 미발행 상태와 Challenge가 보이는 화면 필수
```

### 반드시 통과해야 할 공격 테스트

```
□ 타인이 정산 시도                    → NotDecisionOwner (I10)  ★
□ revocable=false 정산 발행 시도      → MustBeRevocable (I11)   ★
□ 무관한 revoke된 UID로 supersede     → SupersedesNotHead (I13)  ★
□ graceDays = 0 또는 최대값           → GraceOutOfRange (I6c)    ★
□ windowStart를 과거로                → WindowInPast (I4)        ★
□ windowStart를 2200년으로            → WindowStartTooFar (I6a)
□ 타인 노트를 승격 원본으로           → NoteNotSameActor (I3b)
□ 화이트리스트 밖 metric              → MetricNotAllowed (I5)
□ outcomeOp = 99                      → OpOutOfRange
□ refUID ≠ decisionUID                → RefUIDMismatch (I12)
□ parents 9개                         → TooManyParents (I14)
□ 구간 종료 전 정산                   → WindowNotEnded (I7)
□ observedAt = windowEnd              → 통과해야 함 (I8 상한 inclusive)
□ 동일인 중복 Challenge               → AlreadyChallenged (I15)
□ 정산 revoke 후 상태                 → OVERDUE + wasRevoked = true
```

---

## 13. v0.8 기획서에 요구되는 변경

| # | 위치 | 변경 |
|---|---|---|
| C1 | 부록 B.6 | **`verification_tier`를 입력 필드에서 제거.** 파생값 (E7) |
| C2 | §2.2, §4 | **Commit-Reveal 절차 추가** — 현재 reveal 단계가 없다 |
| C3 | §2.2, §12 | **"누구나 계산 가능, 이의 제기 가능"으로 서술.** ~~permissionless 발행~~ 은 그리핑 취약 (§1.4) |
| C4 | §10.1 | "POI 앵커 컨트랙트" → **EAS SchemaResolver** |
| C5 | §4.1 | 상태 열거에 **`OBSERVING`, `SETTLED_LATE`** 추가 |
| C6 | 신규 | **불변식 I4(관측 구간 미래 강제)를 명시.** 사후 서사 차단의 실제 메커니즘 |
| C7 | §4.2 | trigger는 commitment 뒤라 **온체인 화이트리스트 미적용**임을 명시 |
| C8 | §14 | 리스크에 **salt 분실**, **ENS 미배포** 추가 |
| C9 | §12 경쟁표 | **Challenge 행 추가** — "거짓 정산이 영구 기록되는가" |
| C10 | §11.1 Must | **Challenge 발행·표시**를 Must에 추가 |

> C3와 C9가 중요하다. Challenge는 v0.8에 없던 개념이고, **"POI를 믿어야 하는가"에 대한 답을 바꾼다.**

---

## 14. 반영된 사소 수정

`m1` 중괄호 문법 · `m2` 구조체 타입 정의 · `m3` 생성자·initialize·owner 추가 · `m4` onRevoke 도달 불가 주석 · `m6` I2의 실효 범위 정정 · `m8` 비순환 근거 정정 · `m9` I6d 필드 0 검사 · `m10` 매트릭스 개수 · `m11` 범례 재정의 · `m12` `hasObservedValue` 추가 · `m13` 도메인 분리자 · `m14` initialized 가드 · `m15` TX 산식에 노트·정정 반영 · `m16` expirationTime 검사 · `m17` `wasRevoked` · `m18` graceDays 배치표 반영 · `m19` reveal 클라이언트 검증 명시 · `m20` SchemaRegistry 주소 · `m21` ENS 전제 플래그

---

*POI Technical Specification v2.1 — 2026-07-27 (RPC 실측 반영)*
