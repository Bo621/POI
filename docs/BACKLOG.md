# POI MVP 백로그

기준: `POI_TechSpec_v3.md` §12 체크리스트 + §6 불변식. 순서와 게이트는 `PLAN.md`, 실행 루프는 `GOAL.md`.
**P0** = 없으면 데모 불가 · **P1** = 없으면 주장 약화 · **P2** = 있으면 좋음

상태: `[ ]` 미착수 · `[~]` 진행 · `[x]` 완료

> W1~W11은 main에 병합됐다. 이후 **해시 라우팅 7화면**(`SITEMAP.md`)으로 재구조화하고
> 증서 톤 디자인·홈 대시보드를 적용했으며, 수동 시나리오(S1~S12)로 확인했다.

분업: 계획 = Claude · 구현 = Codex(`--profile execute`) · 리뷰 = Claude. 구현자 ≠ 리뷰어.
리뷰 게이트: 각 항목은 Claude 리뷰 GATE PASS(=[P1] 0건) 후에만 완료 처리한다.

---

## O. 운영·배포 (선행 조건)

| ID | P | 항목 | 선행 | 완료 조건 |
|---|---|---|---|---|
| O0 | — | 저장소·툴체인 세팅 | — | `[x]` forge 1.7.1 / solc 0.8.30 / evm cancun / eas v1.4.0 / OZ v5.1.0 컴파일 통과 |
| L0 | **P0** | 로컬 포크 개발 환경 (`anvil --fork-url`) | — | `[x]` chainId 91342 · EAS `1.4.1-beta.3` · Dojang `isVerified` · 10,000 ETH · `evm_increaseTime` 확인 |
| O1 | **P0** | 배포 지갑 생성 + 파우셋 클레임 | — | `[x]` `0x77E8DFC4…C2dfaa` — **0.015 ETH** 확인 (2026-07-27 23:5x, nonce 0). 개인키는 `.env`에만, 커밋 금지 |
| O2 | **P0** | 법률 검토 게이트 (B14) | — | `[ ]` 정산 상태·이의 공개 범위가 기획 A.6과 충돌하지 않음을 확인. **되돌릴 수 없는 온체인 공개 전** |
| O3 | **P0** | 배포 스크립트 — §6.6 순서 1~6 | C2~C6 | `[x]` 리졸버 4종 + 스키마 4종 + initialize 완료. 주소·UID는 `docs/DEPLOYMENT.md` |
| O4 | **P0** | **OVERDUE fixture 즉시 커밋** | O3 | `[x]` `0x3f592f21…e16938` · **T_overdue = 1785342405 (2026-07-30 01:26:45 KST)** — 2차 재배포 값 |
| O5 | **P0** | `addMetric × 2` (등록 즉시 frozen) | O3, V3 | `[x]` 2종 등록·frozen 확인 (tx `0x1aa6aab0…` · `0x794c8136…`) |
| O6 | P1 | 소유권 multisig 이전 (`Ownable2Step`) | O5 | `[x]` 2-of-2 Safe. `renounce` 하지 않음 — Phase 1 지표 추가 필요(B13) |
| O7 | P1 | 데모용 fixture 세트 | O4 | `[x]` 등록완료+이의 · 철회→정정 · 기한초과 3종. 이의자는 별도 지갑 |
| O8 | **P0** | 데모 녹화 | G6, O7 | `[ ]` OVERDUE·이의·철회 이력이 **화면에 보임** |
| O9 | P2 | 익스플로러 컨트랙트 검증 | O3 | `[x]` 4종 모두 `Pass - Verified` (sepolia-explorer.giwa.io) |

---

## X. 공유 코어 (`core/`) — 컨트랙트·프론트·verifier 공통

| ID | P | 항목 | 완료 조건 |
|---|---|---|---|
| X1 | **P0** | **commitment 테스트 벡터 고정** (B3) | `[x]` `C = keccak256(TAG ‖ chainId ‖ attester ‖ salt ‖ JCS(payload))`. `core/vectors/commitment.v1.json` 6케이스. 기대값은 `cast keccak`(독립 경로)으로 생성 — `scripts/gen_commitment_vectors.py`. TS 19/19 · Solidity 3/3 통과 |
| X2 | **P0** | JCS(RFC 8785) 정규화 구현/채택 | `[x]` `core/src/jcs.ts`. 키 정렬·배열 순서 보존·한글 비이스케이프·제어문자 이스케이프. `undefined`/`NaN`/`BigInt`는 거부(값이 조용히 사라지는 것을 막는다) |
| X3 | **P0** | salt 생성 — 128bit CSPRNG | `[x]` `generateSalt()` — 16바이트 `crypto.getRandomValues`. 온체인 기록 경로 없음 |
| X4 | **P0** | E2 `scale` / E3 `eval` / E5 `result` | `[x]` `core/src/evaluate.ts`. 문자열→bigint 경로(부동소수 미사용) · half-up은 음수에서도 절댓값 기준 · int128 범위 밖 거부. **컨트랙트 경계표(op 6종 × 599/600/601)를 TS 테스트에 복제해 대조** |
| X5 | **P0** | E9 `state` 파생 | `[x]` `core/src/state.ts`. 7상태 + `hasRevokedSettlement` 독립 표시 · 경계 `t=S0`·`t=W`·`t=W+G` 및 SETTLED/SETTLED_LATE 경계 · `activeHeadTime` 없으면 추측하지 않고 throw |
| X6 | P1 | E7 등급 2축 (`evidenceTier` × `revealState`) | `[x]` `core/src/grade.ts`. 조회 시 계산 · 두 축 독립 · CT18(타인 commitment 복사본)이 `SEALED`로 남는 것까지 고정. `ORACLE_VERIFIED`는 범위 경계라 상수도 노출하지 않음 |
| X7 | P1 | 에러 셀렉터 → 한국어 메시지 매핑 (§10) | `[x]` `core/src/errors.ts` 57종 전부. 셀렉터는 이름에서 계산(상수 미고정). **테스트가 `contracts/src/*.sol`을 직접 읽어 커버리지를 강제** — 에러를 추가하고 매핑을 잊으면 core 테스트가 깨진다 |

---

## C. 컨트랙트 (`contracts/`)

| ID | P | 항목 | 선행 | 완료 조건 |
|---|---|---|---|---|
| C1 | **P0** | **`_decodeDecision` offset 트릭** (§6.1) | — | `[x]` `src/POICodec.sol` — decision·settlement·challenge 3종. 순진한 `abi.decode`가 revert하는 것도 테스트로 고정. 10/10 통과 |
| C2 | **P0** | `POIResolverBase` — `_guard` / `ready` / `Ownable2Step` | C1 | `[x]` `MustBePermanent`·`WrongSchema`·`NotInitialized`·`RecipientMustBeZero`. `_initializeBase`는 internal(부분 초기화 봉쇄 방지 — codex P1). `renounceOwnership` revert(B13 구조화). 15/15 통과 |
| C3 | **P0** | `POINoteResolver` | C2 | `[x]` `contentCommitment≠0` · attestation 레벨 `revocable=false`도 강제(§1.2) · 실제 `attest()` 경로(onlyEAS)로 검증 · `refUID=0`·payload 정확히 32바이트 강제(codex P2). 13/13 |
| C4 | **P0** | `POIDecisionResolver` (I1~I6, I12, I14) | C2 | `[x]` 부모 5종·노트 승격·`verifiedAddressUID`·window/grace·I6d 필드 0·payload 정규 길이(codex P2). **+ 만료·철회된 검증 UID 거부**(명세에 없음 — Dojang 검증이 30일 만료라 B4 주장이 거짓이 될 수 있어 추가, 사용자 승인). 44/44 |
| C5 | **P0** | `POISettlementResolver` (I7~I13, I16, I17) | C4 | `[x]` `activeHead`/`lastHead`/`revokeCount` 분리 · `_eval` 온체인 판정 강제(op 6종 × 599/600/601 전수) · `observedAt==windowEnd` · payload 재인코딩 대조. 35/35 (전체 123/123) |
| C6 | **P0** | `POIChallengeResolver` (I15) | C2 | `[x]` 동일인 활성 이의 1건(`AlreadyChallenged`) · `onRevoke`에서 매핑 해제 → 재발행 가능(CT17) · 뒤늦은 중복 철회가 현재 이의를 지우지 않음 · payload 재인코딩 대조. 20/20 (전체 143/143) |
| C7 | **P0** | metric 레지스트리 — append-only·frozen (B13) | C2 | `[x]` `POIMetricRegistry`(abstract, Decision만 상속). 재등록 `MetricFrozen` · `definitionHash=0` 거부(§11.3) · `kind≠0` 거부(B7). 10/10 |
| C8 | P1 | 온체인 EAS ABI 대조 | — | `[x]` 포크 왕복으로 확인 — 스키마 등록·발행·되읽기·철회·`refUID` 참조·**실제 EAS가 우리 리졸버를 호출**. 9/9 (`FOUNDRY_PROFILE=fork`). ⚠️ **EAS 프리디플로이는 ERC-1967 프록시다**(impl `0xbEc660b4…`) — 업그레이드되면 이 테스트가 먼저 깨진다 |
| C9 | P1 | 배포 스크립트 `script/Deploy.s.sol` | C3~C7 | `[x]` §6.6 1~6단계. 7(addMetric)·8(소유권 이전)은 사람 판단이라 제외. 포크 드라이런 통과 — **가스 추정 7,499,973 (≈0.0000075 ETH)**, 지갑 잔액 0.015 ETH로 충분. 포크 검증 7/7 |

### C-T. 반드시 통과해야 할 공격 테스트 (§12.3) — 19종

| ID | 시나리오 | 기대 |
|---|---|---|
| CT01 | 타인이 정산 시도 | `NotDecisionOwner` (I10) — `[x]` C5 |
| CT02 | `revocable=false` 정산 | `MustBeRevocable` (I11) — `[x]` C5 |
| CT03 | `expirationTime ≠ 0` | `MustBePermanent` (V10) ★ — `[x]` Base·Note 양쪽 |
| CT04 | 관측값과 반대되는 result 제출 | `ResultMismatch` (I17) ★ — `[x]` C5 |
| CT05 | 관측값 없이 `OBSERVED` 제출 | `MustBeIndeterminate` (I16) ★ — `[x]` C5 |
| CT06 | `observedAt ≠ windowEnd` | `ObservedAtMustBeWindowEnd` ★ — `[x]` C5 |
| CT07 | S1 revoke 후 `supersedes=S1` 정정 | **통과해야 함** (B1) ★ — `[x]` C5 |
| CT08 | S1 revoke 후 `supersedes=0` 재발행 | `MustSupersede` ★ — `[x]` C5 |
| CT09 | `activeHead` 있는데 `supersedes` 발행 | `PriorStillActive` — `[x]` C5 |
| CT10 | 무관한 revoked UID로 supersede | `SupersedesNotLastHead` — `[x]` C5 |
| CT11 | `windowStart` 과거 | `WindowInPast` (I4) — `[x]` C4 |
| CT12 | `graceSeconds` < 1시간 또는 > 30일 | `GraceOutOfRange` (I6c) — `[x]` C4 |
| CT13 | 타인 노트를 승격 원본으로 | `NoteNotSameActor` (I3b) — `[x]` C4 |
| CT14 | 화이트리스트 밖 지표 | `MetricNotAllowed` (I5) — `[x]` C4 |
| CT15 | `refUID ≠ decisionUID` | `RefUIDMismatch` (I12) — `[x]` C4 |
| CT16 | parents 9개 | `TooManyParents` (I14) — `[x]` C4 |
| CT17 | Challenge 철회 후 재발행 | **통과해야 함** (B8) ★ — `[x]` C6 |
| CT18 | 타인 commitment 복사 후 reveal 검증 | **실패해야 함** (B3) ★ |
| CT19 | 등록된 metric 재등록 | `MetricFrozen` (B13) — `[x]` `test_AddMetric_RevertsOnReregistration` |
| CT20 | 만료된 검증 UID로 커밋 | `VerifiedAddressExpired` — `[x]` C4-R2 (명세 외 추가) |

> ★ 표시는 v3에서 새로 강제한 항목이다. **하나라도 실패하면 배포하지 않는다.**

**포크 검증 완료 (2026-07-28)** — 위 `[x]`는 `MockEAS` 유닛 테스트 기준이고, 그와 별개로
`contracts/test/fork/POIFullStack.fork.t.sol`이 **실제 EAS `1.4.1-beta.3`** 상대로 §6.6 배포 순서를
그대로 재현한 뒤 CT01~CT17·CT19를 전부 통과시켰다 (happy path 2 + 공격 18 = 20/20,
C8의 9종과 합쳐 `FOUNDRY_PROFILE=fork` 29/29). CT18은 온체인 항목이 아니다(V4·W8).

실행: `anvil --fork-url https://sepolia-rpc.giwa.io/ --fork-block-number 31820323` 를 띄우고
`GIWA_SEPOLIA_RPC_URL=http://127.0.0.1:8545 FOUNDRY_PROFILE=fork forge test`.
공개 RPC에 직접 붙이면 병렬 실행이 429(레이트 리밋)에 걸린다.

---

## W. 프론트 (`web/`)

| ID | P | 항목 | 완료 조건 |
|---|---|---|---|
| W1 | **P0** | F1 지갑 연결 + `isVerified` + `verifiedAddressUID` 스냅샷 | `[x]` `feat/w-frontend`. 3회 백오프 후 "확인 불가" · 미검증 지갑 사용 허용. ⚠️ **`verifiedAddressUID` 미해결** — Dojang이 UID getter를 노출하지 않는다. 검증 스키마 UID를 알아야 EAS 로그로 찾는다. 현재 0으로 기록하고 화면에 명시 |
| W2 | **P0** | F2·F3 3계층 등록 (저널→노트→결정) | `[x]` 저널은 localStorage만 · 문구 상시 표시 · 노트 승격 |
| W3 | **P0** | **salt 백업 강제 유도** | `[x]` 백업 확인 전 발행 버튼 비활성 · salt를 서버·localStorage에 두지 않음 |
| W4 | **P0** | F4 결정 커밋 | `[x]` commitment 4종 · 평문으로 나가는 항목을 화면에 명시 · trigger 강제 불가 표시 · 제출 전 검증(부모 9개·과거 window·grace) |
| W5 | **P0** | F6 정산 발행 | `[x]` `observedAt`을 windowEnd로 고정(입력 안 받음) · `result`를 고르게 하지 않고 계산 · `supersedes` 자동 · X7 한국어 오류 |
| W6 | **P0** | F7 Challenge 발행 + 목록 | `[x]` 건수 미표시·정렬 없음·검증 지갑 병기·철회된 이의 제외. 변이 테스트로 정렬/철회포함이 잡히는 것 확인 |
| W7 | **P0** | F8 상태 표시 | `[x]` core `deriveState` 재사용 · 철회 이력을 상태와 분리해 병기 · `now` 1초 갱신으로 OVERDUE 전환이 화면에 보임 |
| W8 | **P0** | **F5 Reveal** (B10) | `[x]` 클라이언트 재계산 대조 · 불일치 시 다운로드 차단 · `reveals/README.md`. 자동 업로드는 만들지 않음(토큰 범위 밖) |
| W9 | P1 | F9 DAG 조회 | `[x]` 부모 방향 BFS · 합류 중복 제거 · 순환 방어 · 조회 실패 노드를 지우지 않고 `missing`으로 남김 · 노드 상한 도달 시 잘렸음을 표시. 그래프 라이브러리 미도입(들여쓰기 목록) |
| W10 | P1 | F10 Strategy Passport | `[x]` 시각 내림차순 단일 정렬 · **집계·순위·성과 지표 없음**(금지어가 소스에 없는지 테스트가 강제) · "순위나 성과 지표가 아닙니다" 상시 표시 |
| W11 | P1 | F11 등급 표시 | `[x]` 2축 표기 + 축의 의미 설명. `revealState`가 항상 SEALED인 이유를 숨기지 않고 화면에 적음 |
| ~~W12~~ | — | ~~공개 필수 집합 `Π_forced` 불변식~~ | **하지 않음** (2026-07-28 결정, `PLAN.md` §5). 공개 설정 UI가 없으므로 강제할 대상이 없다. 온체인 평문 필드가 곧 `Π_forced`이고 결정 커밋 화면에 명시한다 |

---

## V. 오프체인 verifier (`verifier/`)

| ID | P | 항목 | 완료 조건 |
|---|---|---|---|
| V1 | **P0** | verifier v1.0 골격 — decisionUID 입력 → 판정 출력 | `[x]` `verifier/`. E2·E4·E5·E9 전부 `@poi/core` 재사용(두 벌을 만들지 않는다). `VERIFIER_VERSION = "poi-verifier/1.0.0"` 고정. `ChainReader` 인터페이스 분리로 테스트는 네트워크 없이 14/14 |
| V2 | **P0** | 온체인 정산과 대조 | `[x]` **업비트 1분봉 provider 2종 구현 완료.** 종료코드 0=일치 · 1=불일치 · 2=조회 실패 · **3=검증 못 함**(0으로 두면 '검증됨'과 구별 안 되고 1로 묶으면 '틀림'과 뭉개진다). 온체인 `definitionHash`·`decimals`·`kind`·`allowed`를 manifest와 대조 · 스냅샷 해시를 리포트에 포함 · `now`는 체인 시간. 45/45 |
| V3 | **P0** | **metric 정의 문서** (§11.3) | `[x]` **2종** (사용자 결정 — 나머지 4종은 Phase 1). `BTC_PRICE_KRW_AT_END`(decimals 0) · `BTC_MAX_DRAWDOWN_IN_WINDOW`(decimals 1). 업비트 공개 1분봉·UTC·보간 없음·half-up·스냅샷 해시. 해시는 `cast keccak`로 생성해 `docs/metrics/manifest.json`에 고정, core 테스트가 문서 바이트로 재계산해 대조 |
| V4 | P1 | reveal 검증 CLI | `[x]` `(salt, payload)` → C 재계산. 타인 commitment 복사본은 실패(CT18) |

### V3 대상 지표 6종

MVP 등록: **`BTC_PRICE_KRW_AT_END` · `BTC_MAX_DRAWDOWN_IN_WINDOW`** (2종)

Phase 1로 미룸: `BTC_30D_REALIZED_VOL_AT_END` · `BTC_60D_REALIZED_VOL_AT_END` · `ETH_MAX_DRAWDOWN_IN_WINDOW` · `ETH_BTC_RATIO_AT_END`.
지표는 append-only라 나중에 추가할 수 있고, 등록하지 않은 지표는 컨트랙트가 거부한다.

---

## D. 기획서 v0.9 → v0.10 변경 이력 (§13) — 할 일 아님

> **이미 반영된 변경의 기록이다.** 아래 9건은 전부 `docs/POI_v0.10.md`에
> 들어 있다(2026-07-28 전수 확인). 할 일 목록으로 읽지 말 것.

| ID | 위치 | 변경 |
|---|---|---|
| D1 | §2.1 | "결정 내용이 t0에 존재했다" → 공개 전/후 **3단계 서술** |
| D2 | §2.1 | "검증 지갑 귀속" → "attester 귀속 + 커밋 시점 Verified Address 스냅샷" |
| D3 | §2.1 | "정산 결과가 관측값과 일치함을 컨트랙트가 강제한다" 행 추가 |
| D4 | §3.4 | `EVIDENCE_COMMITTED` 의미 정정 + 2축 등급 |
| D5 | §4.3 | Challenge "영구 기록" 삭제 → 철회 가능·건수 미표시 |
| D6 | §2.5 | `graceDays` → `graceSeconds`(최소 1시간) |
| D7 | §12 | "거짓 정산의 영구 기록" → "정산 산술의 온체인 강제 + 이의 기록" |
| D8 | §14 | 리스크에 Sybil 이의, metric 정의 문서 부재 추가 |
| D9 | §8.2 | TX 산식에서 배지 재검증 제거 |

---

## 집계

| 구분 | P0 | P1 | P2 | 계 |
|---|---:|---:|---:|---:|
| O 운영 | 6 | 2 | 1 | 9 |
| X 코어 | 5 | 2 | 0 | 7 |
| C 컨트랙트 | 7 | 2 | 0 | 9 (+ 공격 테스트 19) |
| W 프론트 | 8 | 4 | 0 | 12 |
| V verifier | 3 | 1 | 0 | 4 |
| D 문서 | 0 | 9 | 0 | 9 |
| **합계** | **29** | **19** | **1** | **49** |

> W12는 범위에서 뺐다(`PLAN.md` §5). 지표는 6종 → **2종**으로 줄였다(같은 절).
