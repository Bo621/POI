# POI MVP 백로그

기준: `POI_TechSpec_v3.md` §12 체크리스트 + §6 불변식. 순서와 게이트는 `PLAN.md`, 실행 루프는 `GOAL.md`.
**P0** = 없으면 데모 불가 · **P1** = 없으면 주장 약화 · **P2** = 있으면 좋음

상태: `[ ]` 미착수 · `[~]` 진행 · `[x]` 완료

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
| O3 | **P0** | 배포 스크립트 — §6.6 순서 1~6 | C2~C6 | `[ ]` 리졸버 4종 배포 → 스키마 4종 등록(settlement·challenge만 `revocable=true`) → `initialize` → 각 리졸버 `ready` |
| O4 | **P0** | **OVERDUE fixture 즉시 커밋** | O3 | `[ ]` `windowStart=now, windowEnd=now+10m, graceSeconds=1h` 커밋. tx 해시와 `T_overdue` 기록 |
| O5 | **P0** | `addMetric × 6` (등록 즉시 frozen) | O3, V3 | `[ ]` `definitionHash ≠ 0`. 문서 없는 지표는 등록 금지 |
| O6 | P1 | 소유권 multisig 이전 (`Ownable2Step`) | O5 | `[ ]` `renounce` 하지 않음 — Phase 1 지표 추가 필요(B13) |
| O7 | P1 | 데모용 fixture 세트 | O4 | `[ ]` SETTLED / 철회→정정 / 이의 있음 / OVERDUE 4종 |
| O8 | **P0** | 데모 녹화 | G6, O7 | `[ ]` OVERDUE·이의·철회 이력이 **화면에 보임** |
| O9 | P2 | 익스플로러 컨트랙트 검증 | O3 | `[~]` 엔드포인트 확인 — `https://sepolia-explorer.giwa.io/api` (chain 91342), `foundry.toml [etherscan]`에 반영. 배포 후 verify만 남음 |

---

## X. 공유 코어 (`core/`) — 컨트랙트·프론트·verifier 공통

| ID | P | 항목 | 완료 조건 |
|---|---|---|---|
| X1 | **P0** | **commitment 테스트 벡터 고정** (B3) | `[x]` `C = keccak256(TAG ‖ chainId ‖ attester ‖ salt ‖ JCS(payload))`. `core/vectors/commitment.v1.json` 6케이스. 기대값은 `cast keccak`(독립 경로)으로 생성 — `scripts/gen_commitment_vectors.py`. TS 19/19 · Solidity 3/3 통과 |
| X2 | **P0** | JCS(RFC 8785) 정규화 구현/채택 | `[x]` `core/src/jcs.ts`. 키 정렬·배열 순서 보존·한글 비이스케이프·제어문자 이스케이프. `undefined`/`NaN`/`BigInt`는 거부(값이 조용히 사라지는 것을 막는다) |
| X3 | **P0** | salt 생성 — 128bit CSPRNG | `[x]` `generateSalt()` — 16바이트 `crypto.getRandomValues`. 온체인 기록 경로 없음 |
| X4 | **P0** | E2 `scale` / E3 `eval` / E5 `result` | `[ ]` half-up 반올림. 컨트랙트 `_eval`과 동일 결과 (op 6종 × 경계값) |
| X5 | **P0** | E9 `state` 파생 | `[ ]` 7상태 + `revokeCount>0` 부가표시. 경계 `t=W`, `t=W+G` 테스트 |
| X6 | P1 | E7 등급 2축 (`evidenceTier` × `revealState`) | `[ ]` 온체인 저장 없이 조회 시 계산 |
| X7 | P1 | 에러 셀렉터 → 한국어 메시지 매핑 (§10) | `[ ]` 리졸버 커스텀 에러 전부 커버 |

---

## C. 컨트랙트 (`contracts/`)

| ID | P | 항목 | 선행 | 완료 조건 |
|---|---|---|---|---|
| C1 | **P0** | **`_decodeDecision` offset 트릭** (§6.1) | — | `[x]` `src/POICodec.sol` — decision·settlement·challenge 3종. 순진한 `abi.decode`가 revert하는 것도 테스트로 고정. 10/10 통과 |
| C2 | **P0** | `POIResolverBase` — `_guard` / `ready` / `Ownable2Step` | C1 | `[x]` `MustBePermanent`·`WrongSchema`·`NotInitialized`·`RecipientMustBeZero`. `_initializeBase`는 internal(부분 초기화 봉쇄 방지 — codex P1). `renounceOwnership` revert(B13 구조화). 15/15 통과 |
| C3 | **P0** | `POINoteResolver` | C2 | `[x]` `contentCommitment≠0` · attestation 레벨 `revocable=false`도 강제(§1.2) · 실제 `attest()` 경로(onlyEAS)로 검증 · `refUID=0`·payload 정확히 32바이트 강제(codex P2). 13/13 |
| C4 | **P0** | `POIDecisionResolver` (I1~I6, I12, I14) | C2 | `[x]` 부모 5종·노트 승격·`verifiedAddressUID`·window/grace·I6d 필드 0·payload 정규 길이(codex P2). 38/38 |
| C5 | **P0** | `POISettlementResolver` (I7~I13, I16, I17) | C4 | `[x]` `activeHead`/`lastHead`/`revokeCount` 분리 · `_eval` 온체인 판정 강제(op 6종 × 599/600/601 전수) · `observedAt==windowEnd` · payload 재인코딩 대조. 35/35 (전체 123/123) |
| C6 | **P0** | `POIChallengeResolver` (I15) | C2 | `[x]` 동일인 활성 이의 1건(`AlreadyChallenged`) · `onRevoke`에서 매핑 해제 → 재발행 가능(CT17) · 뒤늦은 중복 철회가 현재 이의를 지우지 않음 · payload 재인코딩 대조. 20/20 (전체 143/143) |
| C7 | **P0** | metric 레지스트리 — append-only·frozen (B13) | C2 | `[x]` `POIMetricRegistry`(abstract, Decision만 상속). 재등록 `MetricFrozen` · `definitionHash=0` 거부(§11.3) · `kind≠0` 거부(B7). 10/10 |
| C8 | P1 | 온체인 EAS ABI 대조 | — | `[ ]` `1.4.1-beta.3` 배포본과 lib `v1.4.0`의 `attest`·`getAttestation` 셀렉터·레이아웃 일치 확인 (R3) |
| C9 | P1 | 배포 스크립트 `script/Deploy.s.sol` | C3~C7 | `[ ]` §6.6 순서 그대로. 드라이런 통과. 참고: 루트 `POI_Deploy_Guide.md` |

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

> ★ 표시는 v3에서 새로 강제한 항목이다. **하나라도 실패하면 배포하지 않는다.**

---

## W. 프론트 (`web/`)

| ID | P | 항목 | 완료 조건 |
|---|---|---|---|
| W1 | **P0** | F1 지갑 연결 + `isVerified` + `verifiedAddressUID` 스냅샷 | `[ ]` RPC 실패 시 3회 백오프 후 "확인 불가". **미검증 지갑도 사용 허용** |
| W2 | **P0** | F2·F3 3계층 등록 (저널→노트→결정) | `[ ]` 저널에 "이 기록은 검증되지 않습니다" 상시 표시 |
| W3 | **P0** | **salt 백업 강제 유도** | `[ ]` 백업 확인 없이는 커밋 진행 불가 (R5) |
| W4 | **P0** | F4 결정 커밋 | `[ ]` commitment 4종 + 평문 predicate·window. `trigger`는 온체인 강제 불가임을 UI에 명시(§3.2) |
| W5 | **P0** | F6 정산 발행 | `[ ]` 온체인 판정 실패 시 사유를 한국어로 표시(X7) |
| W6 | **P0** | F7 Challenge 발행 + 목록 | `[ ]` **건수 미표시**, 정렬·랭킹 없음, 각 항목에 검증 지갑 여부 병기 |
| W7 | **P0** | F8 상태 표시 | `[ ]` 7상태 + OVERDUE + 「정산 철회 이력 있음」 |
| W8 | **P0** | **F5 Reveal** (B10) | `[ ]` 공개 UI + **클라이언트에서** commitment 재계산 대조 + `reveals/`에 게시 |
| W9 | P1 | F9 DAG 조회 | `[ ]` parents 그래프. "조회된 것이 전부라는 보장은 없습니다" 상시 표시 |
| W10 | P1 | F10 Strategy Passport | `[ ]` 결정·정산 요약 뷰 |
| W11 | P1 | F11 등급 표시 | `[ ]` 2축 표기 (`EVIDENCE_COMMITTED · SEALED` 형태) |
| W12 | P1 | 공개 필수 집합 `Π_forced` 불변식 | `[ ]` 어떤 공개 설정에서도 `Π_forced`가 항상 포함 |

---

## V. 오프체인 verifier (`verifier/`)

| ID | P | 항목 | 완료 조건 |
|---|---|---|---|
| V1 | **P0** | verifier v1.0 골격 — decisionUID 입력 → 판정 출력 | `[ ]` E2·E4·E5를 `core/`로 계산. `verifierVersion` 문자열 고정 |
| V2 | **P0** | 온체인 정산과 대조 | `[ ]` 불일치 시 비영(非零) 종료코드 |
| V3 | **P0** | **metric 정의 문서 6종** (§11.3) | `[ ]` 계산식·소스·간격·UTC·결측치·half-up·데이터셋 스냅샷 해시. 문서 해시 = `definitionHash` |
| V4 | P1 | reveal 검증 CLI | `[ ]` `(salt, payload)` → C 재계산. 타인 commitment 복사본은 실패(CT18) |

### V3 대상 지표 6종

`BTC_30D_REALIZED_VOL_AT_END` · `BTC_60D_REALIZED_VOL_AT_END` · `BTC_MAX_DRAWDOWN_IN_WINDOW` · `ETH_MAX_DRAWDOWN_IN_WINDOW` · `BTC_PRICE_KRW_AT_END` · `ETH_BTC_RATIO_AT_END`

---

## D. 기획서 v0.10 반영 (§13) — P1

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
| **합계** | **29** | **20** | **1** | **50** |
