# TEST-SCENARIO 로컬 포크에서 손으로 돌려보는 시나리오

## 목적

지금 프론트는 컨트랙트가 없어서 **읽기도 쓰기도 못 한다.** 화면만 보이고 아무것도 확인되지 않는다.
로컬 anvil 포크에 배포하고 fixture를 심어서, 사람이 실제로 클릭하며 확인할 수 있게 만든다.

**공개 테스트넷에 아무것도 보내지 않는다.** anvil은 로컬이고, 배포도 fixture도 전부 로컬이다.
O3(실제 배포)와는 별개다.

## 왜 이게 forge 테스트로 대체되지 않는가

`forge test`는 컨트랙트가 옳게 거절하는지를 본다. 이 시나리오가 보는 것은 다르다.

- X7 한국어 메시지가 **실제로 화면에 뜨는지** (매핑은 있어도 UI가 안 부르면 안 뜬다)
- 상태 인장이 시간이 지남에 따라 **실제로 바뀌는지**
- 「정산 철회 이력 있음」이 OVERDUE와 **함께** 보이는지
- 이의 목록에 **건수가 없는지**, 정렬이 없는지
- reveal 대조가 클라이언트에서 도는지

---

## 0. 먼저 고칠 것 — `[P1]` 상태 계산이 브라우저 시계를 쓴다

`web/src/status.tsx:42`

```ts
const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
```

`deriveState`에 넘기는 `now`가 **브라우저 시계**다. 두 가지 문제가 있다.

1. 이 시나리오는 `evm_increaseTime`으로 체인 시간을 점프시킨다. 브라우저 시계는 그대로이므로
   OVERDUE fixture가 화면에서 OVERDUE로 보이지 않는다. **시나리오가 성립하지 않는다.**
2. 실제 배포에서도 사용자 시계가 틀어져 있으면 온체인과 다른 상태를 보여준다.
   상태는 온체인 사실에서 파생되는 값인데 클라이언트 시계에 의존하면 그 성질이 깨진다.

**고치는 방법**: 체인의 최신 블록 타임스탬프를 기준으로 쓴다.

- `web/src/read.ts`에 `getChainTime(): Promise<bigint>` 추가 — `publicClient.getBlock()`의
  `timestamp`. `withRetry`를 통과시킨다.
- `status.tsx`는 조회 시점에 `getChainTime()`을 한 번 받고, 그 값을 기준으로 1초마다
  로컬에서 더해 나간다(매초 RPC를 때리지 않는다). 15초마다 한 번씩 다시 동기화한다.
- 체인 시간과 브라우저 시간이 **60초 이상 차이**나면 화면에 `.notice--quiet`로
  `"기기 시각이 체인과 {N}초 차이납니다. 표시는 체인 시각을 기준으로 합니다."`

이건 시나리오 준비물이 아니라 실제 결함이다. 시나리오와 무관하게 고친다.

---

## 1. 환경

| | |
|---|---|
| 체인 | `anvil --fork-url https://sepolia-rpc.giwa.io/ --fork-block-number 31820323` |
| chainId | 91342 (포크라 그대로) |
| RPC | `http://127.0.0.1:8545` |
| EAS | `0x4200…0021` (포크된 실제 배포본 `1.4.1-beta.3`) |

### 계정 (anvil 기본 니모닉)

| 이름 | 주소 | 역할 |
|---|---|---|
| **A** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 판단 발행자. 결정·정산의 주인 |
| **B** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 이의 제기자 |
| **C** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 타인. 권한 오류 재현용 |

MetaMask에 `http://127.0.0.1:8545` / chainId 91342로 네트워크를 추가하고
위 세 계정을 개인키로 불러온다. **anvil 기본 계정이라 공개된 키다 — 실제 자산을 넣지 말 것.**

---

## 2. 만들 것

### `contracts/script/SeedFixtures.s.sol`

`Deploy.s.sol`을 재사용해 배포한 뒤 fixture를 심는다.

1. `Deploy` 실행 → 리졸버 4종 + 스키마 4종 + initialize
2. `addMetric × 2` — **`docs/metrics/manifest.json`의 실제 값**을 쓴다

   | metricId | decimals | definitionHash |
   |---|---|---|
   | `0x83b04966e07f0f83592e71060b3356d716b4dff9f824bd76d0f9d149c54cafcf` | 0 | `0xdb9b1a42f8c680812394e611605ef7d4406b2b83746014f1f7c5a9e60fe47a75` |
   | `0x5d3da88eb99efa2feecd925b5d459912f5ef402d66358620376805c0bad076d3` | 1 | `0x34a268d1b42b47674cbc1fd6a3dbabc9cc5de97381a9ea72c5fce7172a522581` |

   `kind`는 둘 다 0. **값을 손으로 다시 적지 말고 이 표에서 그대로 복사할 것.**
3. 아래 fixture 5종을 발행한다.

commitment는 `core`의 정의와 같아야 한다 —
`C = keccak256(TAG ‖ chainId ‖ attester ‖ salt ‖ utf8(JCS(payload)))`.
스크립트에서 직접 계산하지 말고 **고정 salt와 고정 payload를 쓰고, 그 결과 해시를 상수로 박는다.**
그 상수는 `core`로 생성해 `docs/fixtures/seed.json`에 함께 커밋한다(아래 §4).

### fixture 5종

`T0 = block.timestamp` (시드 시점). 모든 결정은 `windowStart = T0 + 60`, `graceSeconds = 1 hours`.

| # | 이름 | 구성 | 시간 조작 |
|---|---|---|---|
| **F1** | SETTLED | A의 결정(지표=BTC_PRICE_KRW_AT_END, op=GTE, θ=90,000,000, window 10분) → 구간 종료 후 A가 정산(관측값 92,000,000 → OBSERVED) | `warp(windowEnd)` |
| **F2** | 철회→정정 | F1과 같은 결정 하나 더 → 정산 S1(관측값 92,000,000) → **S1 철회** → `supersedes=S1`로 S2 발행(관측값 88,000,000 → NOT_OBSERVED) | 동일 |
| **F3** | 이의 있음 | F1의 정산에 **B가** 이의 발행(claimedResult=NOT_OBSERVED, 관측값 87,000,000, 출처 `"other-exchange"`) | — |
| **F4** | OVERDUE | A의 결정(window 10분, grace 1시간). **정산하지 않는다** | `warp(windowEnd + 1 hours + 60)` |
| **F5** | 구간 진행 중 | A의 결정(windowStart = 현재+1시간, windowEnd = +25시간). 정산 없음 | 시간 점프 없음 |

F5는 PENDING을 보여주고, 나중에 `cast rpc evm_increaseTime`으로 OBSERVING → AWAITING →
OVERDUE로 손수 넘겨볼 수 있게 남겨둔다.

**주의**: F4의 시간 점프가 F5의 상태에도 영향을 준다(체인 시간은 하나다).
그래서 F5의 window를 F4의 점프보다 뒤로 잡는다 — 위 값이 그렇게 돼 있다.

### `scripts/dev_up.sh`

한 번 실행하면 전부 준비되게 한다.

```
1. 기존 anvil이 떠 있으면 죽인다
2. anvil --fork-url … --fork-block-number 31820323 백그라운드 기동, 준비될 때까지 대기
3. forge script SeedFixtures --rpc-url http://127.0.0.1:8545 --broadcast \
     --private-key <anvil A 키>
   → anvil 로컬이므로 --broadcast를 쓴다. 공개 네트워크가 아니다
4. 출력에서 주소·스키마 UID·fixture UID를 파싱해
   - web/.env.local 생성 (VITE_RPC_URL, VITE_*_SCHEMA_UID, VITE_*_RESOLVER)
   - docs/fixtures/seed.json 갱신
5. 사람이 볼 요약을 출력한다 (fixture별 UID와 기대 상태)
```

`scripts/dev_down.sh`로 anvil을 내린다.

**`web/.env.local`은 `.gitignore`에 넣는다** (로컬 전용). `docs/fixtures/seed.json`은 커밋한다.

### `web/src/config.ts` 보강

리졸버 주소도 환경변수로 받아야 한다(지금은 스키마 UID만 있다).
`VITE_SETTLEMENT_RESOLVER`·`VITE_DECISION_RESOLVER`·`VITE_CHALLENGE_RESOLVER`·`VITE_NOTE_RESOLVER`.
`activeHead`·`revokeCount`·`metrics` 조회에 필요하다.

---

## 3. 시나리오 — 사람이 따라가는 체크리스트

`docs/TEST_SCENARIO.md`로 쓴다. 각 항목은 **조작 / 기대 화면 / 어긋나면 무엇이 잘못된 것인지**.

### S1. 배포 상태 인식

| 조작 | 기대 |
|---|---|
| `.env.local` 없이 접속 | 맨 위 인주색 `"컨트랙트가 아직 배포되지 않았습니다"`, 발행 버튼 전부 비활성 |
| `dev_up.sh` 후 새로고침 | 그 문구가 **사라진다**. 발행 버튼 활성 |

### S2. 지갑

| 조작 | 기대 |
|---|---|
| A로 연결 | 주소 축약 표기, `미검증 지갑 (사용 가능)`, 「검증 지갑 스냅샷 UID를 찾지 못했습니다」 안내 |
| 연결 거부 | 오류로 죽지 않고 안내만 |

> Dojang v0.5.1 기준으로 검증된 지갑이 없다는 것은 이미 확인됐다. 여기서 "검증 지갑" 배지는
> 나오지 않는 것이 **정상**이다.

### S3. 상태 인장 — 이 시나리오의 핵심

| fixture | decisionUID | 기대 인장 | 색 | 부가 표시 |
|---|---|---|---|---|
| F1 | seed.json의 `f1.decisionUID` | `정산완료` | 쪽빛 | 없음 |
| F2 | `f2.decisionUID` | `정산완료` | 쪽빛 | **「정산 철회 이력 있음」** (인주) |
| F4 | `f4.decisionUID` | **`기한초과`** | **인주** | 없음 |
| F5 | `f5.decisionUID` | `대기` | 먹 | 없음 |

**어긋나면**: F4가 `기한초과`가 아니면 §0의 시계 문제가 안 고쳐진 것이다.
F2에 철회 이력 줄이 없으면 `revokeCount` 조회가 안 되는 것이다.

### S4. 시간이 지나는 것을 본다

```
cast rpc evm_increaseTime 3600 --rpc-url http://127.0.0.1:8545
cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

F5를 조회한 채로 위를 실행하고 새로고침한다.

| 누적 점프 | 기대 인장 |
|---|---|
| 0 | `대기` (PENDING) |
| +1시간 10분 | `관측중` (OBSERVING) |
| +25시간 | `정산대기` (AWAITING) |
| +26시간 | `기한초과` (OVERDUE) |

경계에서 한 칸씩 넘어가야 한다. `t = W` 정각에 `정산대기`, `t = W+G` 정각에 `기한초과`다.

### S5. 이의 목록 — 표시 규칙

F3의 settlementUID로 목록을 조회한다.

| 확인 | 기대 |
|---|---|
| 건수 | **어디에도 "1건" 같은 숫자가 없다** |
| 정렬 | 조회된 순서 그대로. 정렬 컨트롤이 없다 |
| 각 항목 | B의 주소 + `미검증 지갑` 병기 |
| 목록 위 | `"조회된 것이 전부라는 보장은 없습니다."` |

**어긋나면**: 건수가 보이면 Sybil 정책 위반이다(§6.5). 즉시 고친다.

### S6. 결정 커밋 — 사전 검증과 salt 게이트

| 조작 | 기대 오류 (화면 문구) | 어디서 막히나 |
|---|---|---|
| 결정 내용 비우고 제출 | 필수 입력 안내 | UI |
| `windowStart`를 어제로 | `"관측 구간의 시작이 현재보다 과거입니다…"` | UI 사전 검증 |
| `graceSeconds` 30분 | `"유예 기간은 1시간 이상 30일 이하여야 합니다."` | UI 사전 검증 |
| 부모 UID 9개 | 최대 8개 안내 | UI |
| salt 백업 확인 전 발행 시도 | **발행 버튼이 비활성** | UI (R5) |
| 백업 체크 후 | 활성화되고 발행 가능 | |

발행에 성공하면 **인장이 한 번 찍힌다**(0.42s). `prefers-reduced-motion`이면 애니메이션 없음.

### S7. 컨트랙트 오류가 한국어로 뜨는지 — X7

| 조작 | 기대 문구 | 리졸버 에러 |
|---|---|---|
| **C로 지갑을 바꾸고** F1 결정을 정산 | `"자신의 결정만 정산할 수 있습니다"` 계열 | `NotDecisionOwner` |
| F1에 정산을 한 번 더 발행 | `"이미 유효한 정산이 있습니다…"` 계열 | `PriorStillActive` |
| **B로** F3 정산에 이의를 한 번 더 | `"이 정산에 이미 이의를 제기하셨습니다…"` | `AlreadyChallenged` |

**어긋나면**: 셀렉터가 그대로 노출되면 `messageFromRevert`를 안 부르는 것이다.

### S8. Reveal — 클라이언트 대조 (CT18)

`docs/fixtures/seed.json`에 F1 결정의 `salt`와 `payload`가 있다.

| 조작 | 기대 |
|---|---|
| 올바른 salt + payload | 일치 표시, 파일 다운로드 가능 |
| payload에서 한 글자 수정 | **불일치**, 다운로드 차단 |
| salt를 한 자 바꿈 | 불일치 |
| **attestationUID를 F2의 것으로 바꿈** (= 남의 커밋에 내 공개를 붙임) | 불일치. **여기가 CT18이다** |

---

## 4. `docs/fixtures/seed.json`

시드 스크립트가 갱신하고 커밋한다. 사람이 UID를 손으로 옮겨 적지 않게 한다.

```json
{
  "chainId": 91342,
  "forkBlock": 31820323,
  "deployedAt": "<시드 시점 체인 timestamp>",
  "addresses": { "note": "0x…", "decision": "0x…", "settlement": "0x…", "challenge": "0x…" },
  "schemas":   { "note": "0x…", "decision": "0x…", "settlement": "0x…", "challenge": "0x…" },
  "accounts":  { "A": "0xf39F…", "B": "0x7099…", "C": "0x3C44…" },
  "fixtures": {
    "f1": { "label": "SETTLED", "decisionUID": "0x…", "settlementUID": "0x…",
            "salt": "0x…", "payload": { }, "expectState": "SETTLED" },
    "f2": { "label": "철회→정정", "decisionUID": "0x…", "revokedSettlementUID": "0x…",
            "activeSettlementUID": "0x…", "expectState": "SETTLED", "expectRevoked": true },
    "f3": { "label": "이의 있음", "settlementUID": "0x…", "challengeUID": "0x…", "challenger": "0x7099…" },
    "f4": { "label": "OVERDUE", "decisionUID": "0x…", "expectState": "OVERDUE" },
    "f5": { "label": "진행 중", "decisionUID": "0x…", "expectState": "PENDING" }
  }
}
```

---

## 5. 범위 경계 — 하지 않는 것

- **자동화된 E2E(Playwright 등)를 만들지 않는다.** 지갑 서명이 필요한 흐름이라
  브라우저 자동화로 덮으려면 지갑 목을 앱에 넣어야 하고, 그건 제품 코드에 테스트용
  경로를 뚫는 것이다. 시나리오는 사람이 클릭한다.
- **앱에 개발용 지갑 모드를 넣지 않는다.** 같은 이유다.
- 공개 테스트넷에 아무것도 보내지 않는다.
- 지표 provider(실제 업비트 조회)를 붙이지 않는다 — V3 문서는 끝났지만 구현은 별개 항목이다.
  fixture의 관측값은 스크립트가 넣는 고정값이다.
- `docs/metrics/*.md`를 수정하지 않는다 (해시가 `definitionHash`다).

## 6. 검증

```
bash scripts/dev_up.sh                  # 성공하고 요약을 출력한다
cd web && npm run dev                   # .env.local을 읽어 배포 안내가 사라진다
cd contracts && forge test              # 150/150 회귀 없음
cd web && npm test                      # 40/40 + 시계 관련 테스트 추가분
cd web && npx tsc --noEmit
```

`dev_up.sh`를 두 번 실행해도 같은 결과가 나와야 한다(anvil을 새로 띄우므로 결정적).
