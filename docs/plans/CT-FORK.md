# CT-FORK 공격 테스트 17종을 실제 EAS 상대로 (§12.3)

지금까지의 CT 테스트는 `MockEAS` 위에서 돈다. 목은 우리가 쓴 것이라 우리 가정을 반복할 뿐이다.
**실제 `1.4.1-beta.3` EAS**가 우리 리졸버를 호출하는 경로에서 같은 결과가 나오는지 고정한다.
"하나라도 실패하면 배포하지 않는다"의 근거가 되는 파일이다.

로컬 포크에서만 실행된다. 공개 네트워크로 트랜잭션을 보내지 않는다. `--broadcast` 금지.

## 파일

- 새로: `contracts/test/fork/POIFullStack.fork.t.sol`
- **그 외 파일 수정 금지.** `src/`·`foundry.toml`·기존 테스트 전부 손대지 않는다.
  `contracts/test/fork/EASForkBase.sol`은 이미 있고 그대로 쓴다.

## 하네스 — `setUp()`

`contract POIFullStackForkTest is EASForkBase`.

`_forkSetUp()` 후 §6.6 배포 순서를 **그대로** 재현한다.

```
1. 리졸버 4종 배포: POINoteResolver · POIDecisionResolver · POISettlementResolver · POIChallengeResolver
   (전부 IEAS(EAS_ADDR)를 생성자에 넘긴다)
2~5. SchemaRegistry.register × 4 — 각 리졸버를 붙인다
     poi.note.v1        "bytes32 contentCommitment"                        revocable = false
     poi.decision.v1    (아래 전체 문자열)                                  revocable = false
     poi.settlement.v1  (아래 전체 문자열)                                  revocable = true
     poi.challenge.v1   (아래 전체 문자열)                                  revocable = true
6. initialize
     note.initialize(noteUID)
     decision.initialize(decisionUID, noteUID)
     settlement.initialize(settlementUID, decisionUID)
     challenge.initialize(challengeUID, settlementUID)
7. decision.addMetric(METRIC, MetricSpec({allowed: true, decimals: 1, kind: 0,
     definitionHash: keccak256("docs/metrics/vol30.md"), frozen: false}))
```

`setUp`의 배포·등록은 이 테스트 컨트랙트가 소유자가 되도록 `prank` 없이 직접 한다
(`initialize`·`addMetric`이 `onlyOwner`다).

### 스키마 문자열 — 오타 하나가 전부를 무너뜨린다. 그대로 복사할 것.

```
poi.decision.v1
bytes32[] parents,bytes32 promotedFromNote,bytes32 verifiedAddressUID,bytes32 decisionCommitment,bytes32 triggerCommitment,bytes32 evidenceCommitment,bytes32 reasonCommitment,bool hasExpectedOutcome,bytes32 outcomeMetricId,uint8 outcomeOp,int128 outcomeThreshold,uint64 windowStart,uint64 windowEnd,uint32 graceSeconds

poi.settlement.v1
bytes32 decisionUID,uint8 result,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,string verifierVersion,bytes32 supersedes

poi.challenge.v1
bytes32 settlementUID,uint8 claimedResult,bool hasObservedValue,int128 observedValue,string source,uint64 observedAt,bytes32 noteCommitment
```

### 데이터 인코딩

`data`는 **평면 튜플**이다 — `abi.encode(field1, field2, ...)`. 구조체를 통째로 넘기지 말 것.
기존 유닛 테스트의 `_data` / `_settlementData` / `_challengeData` 헬퍼와 동일한 형태다
(`contracts/test/POIDecisionResolver.t.sol` 등 참고).

### 시간

포크는 고정 블록 `31_820_323`의 타임스탬프를 쓴다. `uint64 T0 = uint64(block.timestamp);`로
잡고 상대적으로 계산한다. 구간 종료 후로 넘어갈 때는 `vm.warp`를 쓴다.
`windowStart`는 **발행 시점 이상**이어야 한다(I4).

### 발행 헬퍼

`EASForkBase._attest(schemaUID, attester, revocable, refUID, data)`가 이미 있다.
revert를 기대할 때는 `vm.expectRevert(<Resolver>.<Error>.selector)`를 그 호출 앞에 둔다.
EAS는 리졸버 revert를 그대로 버블링한다 — C8의 `test_Fork_ResolverIsCalledOnAttest`에서 확인됐다.

철회는 `eas.revoke(RevocationRequest({schema: uid, data: RevocationRequestData({uid: attUID, value: 0})}))`,
**발행자 본인이** 해야 하므로 `vm.prank(attester)`.

## 테스트 목록 — CT 번호 그대로

`_okDecision()` / `_okSettlement(decisionUID)` 같은 "통과하는 기본값" 헬퍼를 만들고
각 테스트에서 한 필드만 비틀 것. 유닛 테스트와 같은 방식이다.

먼저 **통과 경로**를 하나 두고(다른 테스트가 그 위에 선다):

| # | 테스트 이름 | 확인 |
|---|---|---|
| 0a | `test_Fork_HappyPath_NoteToDecisionToSettlement` | 노트 발행 → 그 노트를 승격해 결정 발행 → `vm.warp(windowEnd)` → 정산 발행. 전부 성공하고 `activeHead`가 정산 uid |
| 0b | `test_Fork_HappyPath_Challenge` | 위 정산에 BOB가 이의 발행 성공 |

공격 테스트:

| CT | 테스트 이름 | 기대 |
|---|---|---|
| CT01 | `test_Fork_CT01_ForeignSettlement` | 타인(BOB)이 ALICE 결정을 정산 → `NotDecisionOwner` |
| CT02 | `test_Fork_CT02_IrrevocableSettlement` | `revocable=false`로 정산 → `MustBeRevocable` |
| CT03 | `test_Fork_CT03_ExpirationTime` | `expirationTime != 0`로 노트 발행 → `MustBePermanent`. **`EASForkBase._attest`는 `expirationTime=0` 고정이므로 이 테스트만 `eas.attest`를 직접 호출해 만료를 넣는다** |
| CT04 | `test_Fork_CT04_ResultMismatch` | 관측값 700 ≥ 임계 600인데 `result=1` → `ResultMismatch` |
| CT05 | `test_Fork_CT05_ObservedWithoutValue` | `hasObservedValue=false`인데 `result=0` → `MustBeIndeterminate` |
| CT06 | `test_Fork_CT06_ObservedAtNotWindowEnd` | `observedAt = windowEnd - 1` → `ObservedAtMustBeWindowEnd` |
| CT07 | `test_Fork_CT07_SupersedeAfterRevoke` | S1 발행 → 철회 → `supersedes=S1`로 S2 발행이 **성공**. `activeHead==S2`·`revokeCount==1` |
| CT08 | `test_Fork_CT08_ReissueWithoutSupersede` | S1 철회 후 `supersedes=0` 재발행 → `MustSupersede` |
| CT09 | `test_Fork_CT09_PriorStillActive` | S1 살아 있는데 `supersedes=S1` → `PriorStillActive` |
| CT10 | `test_Fork_CT10_UnrelatedSupersedes` | S1 철회 후 무관한 uid로 supersede → `SupersedesNotLastHead` |
| CT11 | `test_Fork_CT11_WindowInPast` | `windowStart = T0 - 1` → `WindowInPast` |
| CT12 | `test_Fork_CT12_GraceOutOfRange` | `graceSeconds = 30 minutes` → `GraceOutOfRange`. 31일도 같은 에러인지 함께 확인 |
| CT13 | `test_Fork_CT13_ForeignNotePromotion` | BOB의 노트를 ALICE가 승격 → `NoteNotSameActor` |
| CT14 | `test_Fork_CT14_UnknownMetric` | 등록 안 된 metricId → `MetricNotAllowed` |
| CT15 | `test_Fork_CT15_RefUIDMismatch` | 정산의 `refUID`를 다른 실재 attestation으로 → `RefUIDMismatch`. **`refUID`는 EAS가 실재를 검사하므로 반드시 실재하는 uid를 쓸 것** |
| CT16 | `test_Fork_CT16_NineParents` | 부모 9개 → `TooManyParents`. 부모 9개를 실제로 발행해 둘 것 |
| CT17 | `test_Fork_CT17_ChallengeReissueAfterRevoke` | 이의 발행 → 철회 → 재발행이 **성공** |
| CT19 | `test_Fork_CT19_MetricFrozen` | 같은 metricId 재등록 → `MetricFrozen` |

CT18(타인 commitment 복사 후 reveal 검증 실패)은 **온체인 항목이 아니다.** 여기서 다루지 않는다.

## 하지 말 것

- `--broadcast` 금지. 개인키·`.env` 사용 금지. `vm.prank`로 충분하다.
- `src/` 수정 금지. 테스트가 실패하면 **테스트를 고치지 말고 보고할 것** —
  실제 EAS에서 리졸버가 다르게 동작한다면 그게 발견이다.
- 기존 유닛 테스트 파일 수정 금지.
- 명세 문서(`docs/POI_*.md`) 읽지 말 것. 이 계획서에 필요한 것이 전부 있다.

## 검증

```
cd contracts
forge test                                                                          # 144/144 (포크 제외)
GIWA_SEPOLIA_RPC_URL=https://sepolia-rpc.giwa.io/ FOUNDRY_PROFILE=fork forge test    # 9 + 19 = 28/28
```

**Codex 샌드박스는 네트워크가 없어 포크 테스트가 skip된다. 통과로 보고하지 말 것.**
컴파일 성공과 `forge test` 144/144까지만 보고한다. 포크 실행은 Claude가 확인한다.
