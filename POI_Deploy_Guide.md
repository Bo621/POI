# POI 공개 테스트넷 배포 준비

**대상**: GIWA Sepolia (Chain ID 91342) · GASOK 제출 마감 2026-07-31
**기준 문서**: `POI_TechSpec_v3.md`
**조사일**: 2026-07-27 — 표기된 값은 전부 RPC·npm 실측

---

## 0. 결론

| 항목 | 판정 |
|---|---|
| 배포 가능한가 | ✅ **가능.** 허가·화이트리스트 불필요 |
| EAS 스키마를 등록할 수 있는가 | ✅ **가능.** 최근 27시간 동안 4건이 신규 등록됨 (§2.3) |
| 비용이 문제인가 | ❌ **전혀.** 전체 배포에 약 **42원** 상당. faucet 하루치의 1/1000 |
| 툴체인이 준비돼 있는가 | ✅ Foundry + Blockscout 검증 공식 지원 |
| **막힐 만한 지점** | ⚠️ **① EAS 데이터 디코딩 ② 공개 RPC 조회 한도 ③ OVERDUE fixture 리드타임** |

**가장 시간이 걸리는 것은 배포가 아니라 `OVERDUE` 시연 준비다** (§8). 컨트랙트를 올린 직후 fixture를 커밋해야 한다.

---

## 1. 환경 실측

```
Chain ID        91342 (0x164ce)
RPC             https://sepolia-rpc.giwa.io/
Flashblocks RPC https://sepolia-rpc-flashblocks.giwa.io/
Explorer        https://sepolia-explorer.giwa.io      (Blockscout)
Explorer API    https://sepolia-explorer.giwa.io/api
클라이언트       reth v2.3.0 (op-reth)
블록 시간        1초
블록 가스 한도    60,000,000
baseFee         251 wei
```

**실효 가스 가격 — 최근 트랜잭션 영수증 8건 기준**

```
중앙값  1,000,251 wei = 0.001 gwei
```

> 참고: Blockscout 추정기는 `slow 0.02 / average 0.03 / fast 0.11 gwei`를 표시하지만, **실제 영수증의 `effectiveGasPrice` 중앙값은 0.001 gwei**다. 추정기는 여유를 크게 잡은 값이다. 기획서의 비용 서술은 영수증 기준을 쓴다.

---

## 2. 온체인 의존 컨트랙트

### 2.1 실측 확인

| 컨트랙트 | 주소 | 버전 |
|---|---|---|
| EAS | `0x4200000000000000000000000000000000000021` | v1.4.1-beta.3 |
| SchemaRegistry | `0x4200000000000000000000000000000000000020` | v1.3.1-beta.2 |
| DojangScroll | `0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9` | v0.5.1 |
| GasPriceOracle | `0x420000000000000000000000000000000000000F` | — |

셋 다 **프록시**다. 구현 주소를 하드코딩하지 말 것.

### 2.2 EAS 인터페이스 — npm 패키지로 대조 완료

```
@ethereum-attestation-service/eas-contracts@1.9.0
권장 solc: 0.8.29
```

**`Attestation` 구조체 (Common.sol) — 명세와 일치 확인**

```solidity
struct Attestation {
    bytes32 uid;
    bytes32 schema;
    uint64  time;
    uint64  expirationTime;
    uint64  revocationTime;
    bytes32 refUID;
    address recipient;
    address attester;
    bool    revocable;
    bytes   data;
}
```

**`SchemaResolver` — 중요 사실**

```solidity
abstract contract SchemaResolver is ISchemaResolver, Semver {
    IEAS internal immutable _eas;
    constructor(IEAS eas) Semver(1, 4, 0) { ... }

    function onAttest(Attestation calldata, uint256) internal virtual returns (bool);   // 본문 없음
    function onRevoke(Attestation calldata, uint256) internal virtual returns (bool);   // 본문 없음
}
```

- **둘 다 abstract다.** 하나만 구현하면 컴파일되지 않는다
- `constructor(IEAS eas)`를 반드시 호출해야 한다. `address(0)`이면 `InvalidEAS`로 revert
- `onAttest`를 `view`로 좁히는 것은 **허용된다** (nonpayable → view는 강화)
- `isPayable()`은 기본 `false`. ETH를 받지 않으므로 그대로 둔다

**등록 시그니처**

```solidity
function register(string calldata schema, ISchemaResolver resolver, bool revocable)
    external returns (bytes32);
```

### 2.3 스키마 등록에 제한이 있는가 — 확인됨

```
최근 99,000블록(약 27시간) SchemaRegistry Registered 이벤트: 4건
같은 기간 EAS Attested 이벤트: 20,000건 초과
```

**누구나 등록할 수 있고 실제로 활발히 쓰이고 있다.** 기술 명세 부록 B.5 #4("POI가 자체 EAS 스키마를 등록할 수 있는가")는 **해소됐다** — 별도 문의 없이 진행 가능하다.

---

## 3. 테스트 ETH 확보

### 3.1 Faucet

| 출처 | URL | 지급량 | 접근성 |
|---|---|---|---|
| GIWA | `https://faucet.giwa.io/` | 24시간마다 최대 **0.005 ETH** | 브라우저 필요 (curl 403) |
| Nodit / Lambda256 | `https://faucet.lambda256.io/giwa-sepolia` | 24시간마다 **0.01 ETH** | 정상 응답 |

브릿지는 **필요 없다.** 직접 faucet으로 충분하다.

### 3.2 필요량 계산

| 작업 | 예상 gas | 비용 |
|---|---|---|
| POINoteResolver 배포 | ~800,000 | 0.0000008 ETH |
| POIDecisionResolver 배포 | ~2,500,000 | 0.0000025 ETH |
| POISettlementResolver 배포 | ~2,500,000 | 0.0000025 ETH |
| POIChallengeResolver 배포 | ~1,500,000 | 0.0000015 ETH |
| 스키마 등록 × 4 | ~800,000 | 0.0000008 ETH |
| `initialize()` × 4 | ~400,000 | 0.0000004 ETH |
| `addMetric()` × 6 | ~720,000 | 0.0000007 ETH |
| fixture·데모 트랜잭션 여유 | ~1,000,000 | 0.000001 ETH |
| **합계** | **~10,200,000** | **≈ 0.0000102 ETH ≈ 42원** |

**L1 데이터 수수료 실측**

```
 2,000 bytes → 0.000000007 ETH
 8,000 bytes → 0.000000007 ETH
16,000 bytes → 0.000000013 ETH
24,000 bytes → 0.000000018 ETH
```

> **faucet 하루치(0.015 ETH)면 위 전체를 약 1,400회 반복할 수 있다.** 잔고 걱정은 하지 않아도 된다.
> 다만 **배포 전날 미리 받아둘 것.** faucet이 일시적으로 막히는 경우를 대비한 유일한 리스크 완화책이다.

---

## 4. 툴체인

### 4.1 설치

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge init poi-contracts && cd poi-contracts
```

### 4.2 의존성

```bash
# EAS
npm install @ethereum-attestation-service/eas-contracts@1.9.0
# 또는
forge install ethereum-attestation-service/eas-contracts@v1.9.0

# OpenZeppelin (Ownable2Step)
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0
```

**`remappings.txt`**

```
@ethereum-attestation-service/=node_modules/@ethereum-attestation-service/
@openzeppelin/=lib/openzeppelin-contracts/
forge-std/=lib/forge-std/src/
```

> npm 설치를 쓰면 `node_modules` 경로를, `forge install`을 쓰면 `lib` 경로를 매핑한다. **둘을 섞지 말 것.**

### 4.3 `foundry.toml`

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib", "node_modules"]
solc_version = "0.8.30"
evm_version = "cancun"
optimizer = true
optimizer_runs = 200
via_ir = true    # 14필드 DecisionData 인코딩이 legacy 코드젠에서 stack too deep

[rpc_endpoints]
giwa_sepolia = "${GIWA_SEPOLIA_RPC_URL}"

[etherscan]
giwa_sepolia = { key = "any", url = "https://sepolia-explorer.giwa.io/api", chain = 91342 }
```

**버전 선택 근거**

| 항목 | 값 | 근거 |
|---|---|---|
| `solc_version` | **0.8.30** | 실제 빌드 값. EAS v1.4.0 + OZ v5.1.0 컴파일 확인 (contracts/foundry.toml과 일치) |
| `via_ir` | **true** | C1에서 확인 — 14필드 `DecisionData` 인코딩이 legacy 코드젠에서 stack too deep |
| `evm_version` | **cancun** | `blobBaseFee()`가 응답하므로 Ecotone 이후. 컴파일·배포 실패 시 `shanghai`로 낮출 것 |

### 4.4 `.env`

```bash
GIWA_SEPOLIA_RPC_URL=https://sepolia-rpc.giwa.io
BLOCKSCOUT_API_URL=https://sepolia-explorer.giwa.io/api
EAS=0x4200000000000000000000000000000000000021
SCHEMA_REGISTRY=0x4200000000000000000000000000000000000020
DOJANG=0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9
DOJANG_ATTESTER_ID=0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034
```

### 4.5 지갑

```bash
cast wallet import deployer --interactive
```

> **개인키를 `.env`에 넣지 말 것.** Foundry 키스토어를 쓰고 `--account deployer`로 참조한다.
> `.gitignore`에 `.env`, `broadcast/`, `cache/`, `out/` 추가.

---

## 5. 배포 순서

### 5.1 순환 참조 문제

스키마 등록에는 resolver 주소가 필요하고, resolver는 스키마 UID를 알아야 한다. **`immutable`로는 불가능하다.**

```
1. Resolver 4종 배포          (initialized = false → 모든 발행 revert)
2. SchemaRegistry.register × 4
3. resolver.initialize(스키마 UID들)   → initialized = true
4. addMetric × 6
5. Ownable2Step으로 multisig 이전  (renounce 금지 — Phase 1에 지표 추가 필요)
```

> **1~3 사이의 창**을 `ready` modifier가 막는다. 이 가드가 없으면 스키마 UID가 0인 상태에서 검증 없는 attestation이 발행된다.

### 5.2 `revocable` 플래그 — 되돌릴 수 없다

```
register(noteSchema,       noteResolver,       false)
register(decisionSchema,   decisionResolver,   false)
register(settlementSchema, settlementResolver, TRUE)    ← 정정에 필수
register(challengeSchema,  challengeResolver,  TRUE)
```

> ⚠️ **스키마 등록 시점에 영구히 굳는다.** settlement를 `false`로 등록하면 정정이 영원히 불가능해지고, 스키마를 새로 만들어야 한다. **배포 스크립트에서 이 네 줄을 두 번 확인할 것.**

### 5.3 배포 명령

```bash
source .env

forge script script/Deploy.s.sol:Deploy \
  --account deployer \
  --rpc-url $GIWA_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url $BLOCKSCOUT_API_URL \
  -vvvv
```

**검증이 실패했을 때 개별 재시도**

```bash
forge verify-contract <ADDRESS> src/POIDecisionResolver.sol:POIDecisionResolver \
  --chain-id 91342 \
  --verifier blockscout \
  --verifier-url $BLOCKSCOUT_API_URL \
  --constructor-args $(cast abi-encode "constructor(address)" $EAS)
```

> Blockscout은 Etherscan API 키가 필요 없다. `--verifier blockscout`을 반드시 명시할 것 — 빠뜨리면 Etherscan으로 시도하다 실패한다.

### 5.4 배포 후 즉시 확인

```bash
# 스키마가 실제로 등록됐는지
cast call $SCHEMA_REGISTRY "getSchema(bytes32)" $DECISION_SCHEMA --rpc-url $GIWA_SEPOLIA_RPC_URL

# resolver가 초기화됐는지
cast call $DECISION_RESOLVER "initialized()(bool)" --rpc-url $GIWA_SEPOLIA_RPC_URL

# 지표가 등록·동결됐는지
cast call $DECISION_RESOLVER "metrics(bytes32)" $(cast keccak "BTC_MAX_DRAWDOWN_IN_WINDOW") --rpc-url $GIWA_SEPOLIA_RPC_URL
```

---

## 6. 예상되는 첫 번째 장벽 — EAS 데이터 디코딩

```solidity
// ❌ revert한다
DecisionData memory d = abi.decode(a.data, (DecisionData));

// ✅ EAS data는 SchemaEncoder의 평면 튜플 인코딩이므로
//    구조체 본문 offset(0x20)을 앞에 붙여야 단일 동적 튜플로 해석된다
DecisionData memory d = abi.decode(
    bytes.concat(abi.encode(uint256(0x20)), a.data),
    (DecisionData)
);
```

**컨트랙트를 짜기 전에 이 테스트부터 통과시킬 것.**

```solidity
function test_DecodeRoundTrip() public {
    DecisionData memory src = _sampleDecision();
    // SchemaEncoder와 동일한 평면 인코딩
    bytes memory flat = abi.encode(
        src.parents, src.promotedFromNote, src.verifiedAddressUID,
        src.decisionCommitment, src.triggerCommitment,
        src.evidenceCommitment, src.reasonCommitment,
        src.hasExpectedOutcome, src.outcomeMetricId, src.outcomeOp,
        src.outcomeThreshold, src.windowStart, src.windowEnd, src.graceSeconds
    );
    DecisionData memory got = _decodeDecision(flat);
    assertEq(got.outcomeThreshold, src.outcomeThreshold);
    assertEq(got.parents.length, src.parents.length);
}
```

> 이 테스트가 통과하지 않으면 나머지는 전부 무의미하다. **가장 먼저 짤 것.**

---

## 7. 공개 RPC 조회 한도 — 인덱싱 전략

> **신규 발견.** 결정 그래프 조회(F9) 설계에 직접 영향을 준다.

공개 RPC에 다음 제한이 걸려 있다.

```
eth_getLogs 블록 범위  : 최대 100,000 블록   (1초 블록 → 약 27시간)
eth_getLogs 결과 개수  : 최대 20,000 건
```

체인 높이가 이미 **31,800,000블록(약 368일)**이므로 전체 이력을 훑으려면 **318회 페이지네이션**이 필요하다. 데모에서 쓸 수 없다.

### 대응

| 방법 | 적용 |
|---|---|
| **배포 블록 기록** | POI 스키마는 배포 시점에 생기므로, `DEPLOY_BLOCK`을 저장하고 **그 이후만 조회**한다. MVP에서는 이것으로 충분하다 |
| **스키마 UID로 필터** | `topics`에 POI 스키마 UID를 넣어 20,000건 제한을 회피 |
| **로컬 캐시** | 조회 결과를 프론트/서버에 캐시하고 증분만 갱신 |
| Phase 2 | 전용 노드 또는 노드 서비스. 공개 RPC는 rate limit이 있어 프로덕션 부적합 |

```js
// 예시
const DEPLOY_BLOCK = 31_8XX_XXX;   // 배포 후 기록할 것
const logs = await provider.getLogs({
  address: EAS,
  topics: [ATTESTED_TOPIC, null, null, DECISION_SCHEMA_UID],
  fromBlock: DEPLOY_BLOCK,
  toBlock: 'latest'
});
```

> **`DEPLOY_BLOCK`을 배포 직후 반드시 기록해 둘 것.** 나중에 찾으려면 페이지네이션을 다시 해야 한다.

---

## 8. OVERDUE 시연 준비 — 가장 시간이 걸리는 항목

`OVERDUE`는 `t ≥ windowEnd + graceSeconds`에서만 발생한다. 그리고 `windowStart ≥ 커밋 시각`(불변식 I4)이므로 **과거로 당길 수 없다.**

```
가장 빠른 OVERDUE 도달 시각 = 커밋 시각 + (windowEnd - windowStart) + graceSeconds
                            ≥ 커밋 시각 + 1초 + 3,600초
```

### 배포 직후 즉시 실행할 fixture

```
fixture A  ─ OVERDUE 시연용
  windowStart  = now
  windowEnd    = now + 600초 (10분)
  graceSeconds = 3600 (1시간, 최소값)
  → 약 1시간 10분 뒤 OVERDUE 도달

fixture B  ─ 정상 정산 시연용
  windowStart  = now
  windowEnd    = now + 300초
  graceSeconds = 3600
  → 5분 뒤 정산 가능. SETTLED로 표시

fixture C  ─ 철회 이력 시연용
  B와 동일하게 정산한 뒤 revoke → supersedes로 재발행
  → revokeCount = 1, 정정 이력 표시

fixture D  ─ 이의 시연용
  B의 정산에 다른 지갑으로 Challenge 발행
```

> **컨트랙트 배포와 fixture 커밋을 같은 스크립트에 넣어라.** 배포 후 손으로 하려다 잊으면 데모에서 가장 중요한 화면(미발행·철회·이의)이 비어 있게 된다.
>
> `graceDays`(최소 1일)를 `graceSeconds`(최소 1시간)로 바꾼 이유가 정확히 이것이다.

---

## 9. 배포 전 체크리스트

### 9.1 코드

```
□ _decodeDecision 라운드트립 테스트 통과            ← 최우선
□ onAttest·onRevoke 둘 다 구현 (하나만은 컴파일 실패)
□ SchemaResolver constructor(IEAS) 호출
□ 모든 스키마에 expirationTime == 0 강제
□ settlement attestation 레벨 revocable == true 강제
□ activeHead / lastHead 분리 — 정정 시나리오 테스트
□ 온체인 결과 판정(_eval) 대조 테스트
□ metric 등록 후 frozen 재등록 거부 테스트
□ commitment 테스트 벡터 고정 (프론트·verifier·컨트랙트 공유)
```

### 9.2 배포

```
□ faucet에서 테스트 ETH 확보 (전날 미리)
□ cast wallet import로 키스토어 생성. .env에 개인키 금지
□ .gitignore에 .env broadcast/ cache/ out/
□ revocable 플래그 4줄 재확인 (settlement·challenge만 true)
□ initialize() 호출 후 initialized == true 확인
□ addMetric 6종 + definitionHash 포함
□ Ownable2Step으로 소유권 이전 — renounce 금지
□ DEPLOY_BLOCK 기록
□ 익스플로러에서 소스 검증 완료 확인
```

### 9.3 배포 직후 (같은 세션에서)

```
□ fixture A~D 커밋
□ 1시간 10분 뒤 OVERDUE 화면 확인 후 녹화
□ 컨트랙트 주소 4개 + 스키마 UID 4개를 제출 문서에 기재
```

### 9.4 제출물

```
□ 스마트 컨트랙트 퍼블릭 링크 — 검증된 소스가 보이는 익스플로러 URL
□ MVP 데모 영상 또는 접속 가능한 웹사이트
□ 피치덱
□ 기술 문서 (POI_v0.10.md + POI_TechSpec_v3.md)
```

---

## 10. 실패 대비

| 상황 | 대응 |
|---|---|
| faucet 접근 불가 | 다른 faucet 사용. 두 곳 모두 막히면 이더리움 Sepolia에서 브릿지 (`docs.giwa.io/get-started/bridging/eth`) |
| `--verify` 실패 | 배포는 성공했을 수 있다. `forge verify-contract`로 개별 재시도. 그래도 안 되면 Blockscout UI에서 수동 업로드 |
| `evm_version` 불일치로 배포 실패 | `cancun` → `shanghai`로 낮춰 재컴파일 |
| `stack too deep` | `via_ir = true` — POI는 이미 켜져 있다(§4.3). 14필드 `DecisionData` 때문 |
| 공개 RPC rate limit | Flashblocks RPC로 전환하거나 재시도 간격 확대 |
| 스키마를 잘못 등록 | **수정 불가.** 새 스키마를 등록하고 문서의 UID를 갱신 |
| `initialize()`를 잘못 호출 | 1회 제한이면 resolver 재배포 → 스키마 재등록. **테스트넷에서 리허설할 것** |

---

## 11. 남은 외부 확인 사항

배포 자체에는 필요 없지만 Phase 2 이전에 확인해야 한다 (`buidl@giwa.io`).

```
1. 도장 Verified Balance를 제3자 dApp이 조회할 수 있는가? 발급 주기는?
2. 도장이 체결·주문 이벤트 attestation을 제공할 계획이 있는가?
3. up.id가 등록된 체인과 크로스체인 해석 계획
4. Upbit Oracle 제공 데이터·갱신 주기·주소
5. 보자기(Bojagi) 개발자 공개 일정
6. GASOK 선정 팀의 프라이빗 메인넷 접근 조건
```

> ~~POI가 EAS 스키마를 등록할 수 있는가~~ → **§2.3에서 해소됨.** 문의 불필요.

---

*POI Deployment Guide — 2026-07-27*
