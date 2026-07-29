# POI MVP 구현 계획

**기준 문서**: 기획 `POI_v0.10.md` · 기술명세 `POI_TechSpec_v3.md`
**마감**: 2026-07-31 (GASOK 2차 제출) · **작성**: 2026-07-27 · **남은 기간: 4일**
**백로그**: `BACKLOG.md` — 이 문서는 순서와 게이트, 백로그는 개별 항목의 완료 조건

---

## 0. 이 계획을 지배하는 두 개의 제약

### 0.1 시간 — OVERDUE는 실시간으로만 만들어진다

`state = OVERDUE`는 `t ≥ windowEnd + graceSeconds`이고 `graceSeconds ≥ 1시간`이 온체인에서 강제된다(I6c).
**되감을 방법이 없다.** 데모에 OVERDUE를 담으려면 컨트랙트 배포 직후 fixture를 커밋해야 하고, 그 후 최소 1시간 10분이 지나야 녹화가 가능하다.

> **결론: 배포 시각이 녹화 가능 시각을 결정한다.** 배포는 D+1 오전까지 끝낸다.

### 0.2 순서 — 여섯 개가 앞을 막는다

```
L0 로컬 포크 (가스 0)     ─┐
C1 _decodeDecision 트릭   ─┼─► C2~C6 리졸버 ─► O3 배포 ─► O4 fixture ─► (1h10m) ─► O8 녹화
X1 commitment 테스트 벡터 ─┘        ▲              ▲
                                    │              └─ O1 가스(파우셋) — 여기서만 필요
                                    └─► W1~W7 프론트 · V1~V3 verifier
```

- **C1** — `abi.decode(bytes.concat(abi.encode(uint256(0x20)), data), (D))`. 여기서 막히면 리졸버 전체가 정지한다(명세 §6.1이 "모르면 하루가 날아간다"고 경고한 지점).
- **X1** — commitment 벡터는 컨트랙트 테스트·프론트·verifier 셋이 **같은 값**을 써야 한다(B3). 벡터를 먼저 고정하지 않으면 세 곳이 각자 구현하고 나중에 어긋난다.
- **O1** — 공개 테스트넷 배포에는 가스가 필요하다. 다만 **선행 조건은 아니다** — 로컬 포크(L0)에서 실제 EAS 바이트코드 상대로 전부 개발·테스트할 수 있다. 가스는 G4 직전까지만 있으면 된다.

### 0.3 로컬 포크가 여는 것과 열지 않는 것

`anvil --fork-url https://sepolia-rpc.giwa.io/` 는 실제 EAS(`1.4.1-beta.3`)·SchemaRegistry·DojangScroll 바이트코드를 그대로 쓴다.

| 포크에서 되는 것 | 포크에서 안 되는 것 |
|---|---|
| 리졸버 배포·스키마 등록·attestation 발행 (가스 0) | 발행한 attestation이 **공개 체인에 존재하지 않음** |
| `evm_increaseTime`으로 `graceSeconds` 점프 → OVERDUE 즉시 재현 | **데모 녹화·심사자 검증** — 실제 체인이어야 하며 거기서는 70분이 실시간 |
| R3(lib v1.4.0 ↔ 온체인 beta.3 차이) 실증 해소 | — |

> 개발은 포크에서, **증명은 공개 체인에서.** §0.1의 70분 제약은 녹화에만 남는다.

---

## 1. 아키텍처 결정

| 결정 | 선택 | 근거 |
|---|---|---|
| 컨트랙트 | Foundry, solc 0.8.30, `evm_version = cancun` | RPC 실측(TSTORE·MCOPY 동작, 헤더에 `requestsHash`). cancun을 하한으로 고정 |
| EAS 의존성 | `eas-contracts v1.4.0` 태그 | 온체인은 `1.4.1-beta.3`이나 해당 태그가 릴리스되지 않음. `getAttestation` 반환 레이아웃 일치를 실측 확인 |
| 공유 코어 | `core/` (TS) — commitment·JCS·scale·eval·state | **B3 요구.** 프론트와 verifier가 같은 구현을 쓰지 않으면 벡터 일치를 보장할 수 없다 |
| 프론트 | Vite + React + TS + viem | 4일 일정. SSR 불필요, 정적 배포로 충분 |
| verifier | TS CLI, `core/` 재사용 | E2·E4·E5를 프론트와 동일 코드로 계산 |
| Reveal 공개 저장소 | **이 GitHub 저장소의 `reveals/`** | §12.2 "공개 저장소" 요건을 별도 인프라 없이 충족. 누구나 `(salt, payload)`로 C를 재계산 가능 |
| 인덱싱 | EAS 로그 직접 조회(viem `getLogs`) | 서브그래프 구축 시간 없음. "조회된 것이 전부라는 보장은 없습니다" 문구를 상시 표시(§10) |

디렉터리:

```
contracts/   Foundry — POIResolverBase + 4개 리졸버 + 배포 스크립트
core/        TS 공유 — commitment(E1)·scale(E2)·eval(E3)·result(E5)·state(E9)·등급(E7)
web/         Vite SPA — F1~F11
verifier/    TS CLI — 오프체인 verifier v1.0
docs/        기획·명세·계획·백로그 + metric 정의 문서 6종
reveals/     공개된 (salt, payload) — F5
```

---

## 2. 일정과 게이트

각 게이트는 **통과하지 못하면 다음 단계로 넘어가지 않는다.**

| 게이트 | 시점 | 조건 | 검증 명령 |
|---|---|---|---|
| **L0** | D-0 (7/27) | **로컬 포크 환경** — 실제 EAS·Dojang 바이트코드 상대로 가스 없이 개발 | `[x]` `anvil --fork-url $GIWA_SEPOLIA_RPC_URL` → chainId 91342, `EAS.version()` = `1.4.1-beta.3`, `isVerified()` 동작, 계정 10,000 ETH, `evm_increaseTime`으로 grace 점프 확인 |
| **G0** | **G4 직전** | 배포 지갑에 가스 확보 + 법률 검토 게이트(B14) 확인 | `[~]` 가스 **확보됨** — `0x77E8DFC4…C2dfaa` 0.015 ETH (실측). **O2 법률 게이트만 남음** |
| **G1** | D-0 | `_decodeDecision` 단위 테스트 통과 | `forge test --mt test_DecodeDecision -vv` |
| **G2** | D-0 | commitment 테스트 벡터 고정 (컨트랙트·TS 양쪽 동일값) | `[x]` `forge test --mt test_CommitmentVector` (3) + `pnpm -C core test` (19) |
| **G3** | D+1 오전 | 공격 테스트 19종 전부 통과 | `forge test` |
| **G4** | D+1 오전 | 배포 + 스키마 4종 등록 + `initialize` + `addMetric × 6` | `forge script Deploy --broadcast` 후 `cast call ... ready` |
| **G5** | **G4 직후 즉시** | OVERDUE fixture 온체인 커밋 | 커밋 tx 해시 기록 → `T_overdue = t + 70분` |
| **G6** | D+2 | 프론트 E2E — 커밋 → 정산 → 이의 → reveal | 브라우저 수동 시나리오 |
| **G7** | D+3 | verifier v1.0이 온체인 정산을 독립 재계산해 일치 | `pnpm -C verifier verify <decisionUID>` |
| **G8** | D+3 | 데모 녹화 (OVERDUE·이의·철회 이력 화면 포함) | — |

### 일자별

```
D-0  7/27  L0 포크 · X1 벡터 고정 · C1 디코딩 트릭 · C2 Base   (가스 불필요)
D+1  7/28  C3~C6 리졸버 · C7 공격 테스트 19종
           O1 파우셋 · O2 법률 게이트 ─► O3 배포 · O4 fixture(★즉시) · O5 metric 등록
D+2  7/29  W1~W7 프론트 전 기능 · V1 verifier 골격
D+3  7/30  V2~V3 verifier + metric 정의 문서 6종 · G7 · O8 녹화
D+4  7/31  예비일 — 문서 반영(D1~D9) · 제출
```

> **D+4를 버퍼로 남긴다.** 4일 일정에서 버퍼 없이 계획하면 첫 지연이 곧 실패다.

---

## 3. 범위 경계 — MVP에서 하지 않는 것

명세가 이미 배제한 것을 계획 단계에서 다시 고정한다. 이 목록에 손대는 것은 범위 확대다.

| 하지 않음 | 근거 |
|---|---|
| ENS / up.id 조회 | 레지스트리 미배포 실측 확인. 주소 축약 표기 |
| 경로 존재형 지표(`*_PATH_*`) | §11.1 — 부재 증명 불가. Phase 2 |
| 오라클 검증(`ORACLE_VERIFIED`) | Phase 2. 등급은 계산만 하고 값은 나오지 않음 |
| 서브그래프·백엔드 DB | 시간. EAS 로그 직접 조회 |
| 이의 건수·랭킹 표시 | §6.5 Sybil. 목록만 |
| 업비트 Open API **키** | 기획 §0 — 사용자 자격증명 의존 없음. **공개 시세 엔드포인트는 사용한다**(키 불필요). verifier가 `api.upbit.com/v1/candles/minutes/1`을 조회한다 |
| 공개 범위 설정 UI (W12 `Π_forced`) | 설정이 없으므로 강제할 대상도 없다. 온체인 평문 필드가 곧 공개 필수 집합이고 커밋 화면에 명시한다 |

---

## 4. 리스크와 대응

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | **배포가 D+1 오전을 넘김** | OVERDUE 녹화 불가 | fixture만이라도 먼저 올린다. 리졸버 없이 커밋은 불가하므로 **배포가 곧 마감** — G4를 최우선 고정 |
| ~~R2~~ | ~~테스트넷 가스 미확보~~ **해소** | — | 파우셋 2곳: [faucet.giwa.io](https://faucet.giwa.io/) 0.005 ETH/24h · [Nodit](https://faucet.lambda256.io/giwa-sepolia) 0.01 ETH/24h. L2 가스 0.001 gwei라 0.005 ETH로 충분 |
| R3 | EAS `1.4.1-beta.3` ↔ lib `v1.4.0` 미묘한 차이 | 배포 후 revert | **포크(L0)에서 실제 바이트코드 상대로 전 경로 실행** — C8이 통과하면 사실상 해소 |
| ~~R4~~ | ~~metric 정의 문서 미작성~~ **해소** | — | `docs/metrics/` 2종 작성 완료. 해시는 `cast keccak`로 생성해 `docs/metrics/manifest.json`에 고정, core 테스트가 문서 바이트로 재계산해 대조한다 |
| R5 | salt 분실 | 공개 영구 불가 | 프론트가 백업 완료 체크 없이는 다음 단계로 못 가게 강제(W3) |
| R6 | 관측 데이터 출처 중단 | 정산 불가 | `INDETERMINATE` 경로가 이미 설계됨. 데모 fixture는 값을 사전 확보 |
| R7 | 법률 검토 미완 상태로 온체인 공개 | 되돌릴 수 없음 | G0에 게이트. 미완이면 공개 범위를 `Π_forced`로만 제한 |

---

## 5. 완료 정의 (MVP)

```
□ 리졸버 4종 배포 · 스키마 4종 등록 · metric 2종 frozen 등록
□ 공격 테스트 19종 전부 통과 (BACKLOG C7)
□ 프론트에서 커밋 → 정산 → 이의 → reveal 전 경로 동작
□ verifier가 온체인 정산을 독립적으로 재계산해 일치
□ OVERDUE · 이의 · 정산 철회 이력이 보이는 데모 녹화
□ 기획서 v0.10에 D1~D9 반영
```

### 명세 대비 의도적 축소 (2026-07-28 결정)

명세는 지표 6종과 프론트 F9~F11을 적고 있다. MVP는 아래로 줄인다.
**심사자가 물으면 이 표가 답이다.** 모호하게 두는 것이 축소 자체보다 나쁘다.

| 항목 | 명세 | MVP | 근거 |
|---|---|---|---|
| metric | 6종 (§11.2) | **2종** — `BTC_PRICE_KRW_AT_END` · `BTC_MAX_DRAWDOWN_IN_WINDOW` | 지표 하나마다 계산식·출처·간격·UTC·결측치·스냅샷 해시를 정의한 문서가 필요하고(§11.3), 그 문서 해시가 `definitionHash`다. 컨트랙트는 문서의 존재를 알 수 없으므로 `definitionHash != 0` 만 검사하고, 대신 **등록 후 동결**해 제3자가 문서 해시와 대조할 수 있게 한다. 화이트리스트 밖 지표는 거부되므로 미등록 상태가 안전하다. 지표는 append-only라 Phase 1에 추가 가능하다 |
| W12 `Π_forced` | §12.2 | **하지 않음** | 공개 필수 집합은 공개 설정 UI가 있어야 의미가 생기는데 MVP에는 공개 설정이 없다. 지금은 온체인 평문 필드가 곧 `Π_forced`이고 그것을 결정 커밋 화면에 명시한다 |
| W9 DAG · W10 Passport · W11 등급 | §12.2 | **구현함** | 축소하지 않는다 |

W1의 `verifiedAddressUID`는 **외부 의존으로 미해결**이다. DojangScroll v0.5.1이 검증
attestation UID를 조회하는 함수를 노출하지 않고, v0.5.1 기준으로 검증된 지갑을
찾을 수 없다(실측: 검증 attestation 144,056건은 전부 v0.2.0 리졸버 `0x692009FE…`에 묶여 있다).
명세는 미검증 지갑에 `0`을 허용하므로 `0`으로 기록하고 **그 사실을 화면에 표시**한다.
