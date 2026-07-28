# 무인 실행 로그

`/goal` 무인 모드가 남기는 기록. 아침에 이 파일만 읽으면 밤새 진행을 복구할 수 있다.
규칙은 `.claude/commands/goal.md`의 "무인 실행 모드".

| 시각 | 항목 | 결과 | codex | 비고 |
|---|---|---|---|---|
| 07-27 23:50 | C4 POIDecisionResolver | ✅ 병합 | 1R · P1 0 / P2 1 | P2: 잉여 워드 payload 무시 → 정규 길이 강제. CT11~CT16 동시 충족 |
| 07-27 23:52 | — | ⏸ 중단 | — | 사용자 요청으로 무인 루프 정지. 다음 세션에서 `/goal`로 재개 |
| 07-28 14:2x | 6번 E2E Playwright | ✅ 병합 | 3R | EIP-1193 주입(제품 코드 무수정). **제품 결함 2건**: reveal이 지갑을 요구 · attester/commitment를 입력받아 CT18 무력화 |
| 07-28 13:4x | 5번 W9·W10·W11 | ✅ 병합 | 1R | DAG·Passport·등급 2축. Passport 집계 금지를 소스 검사로 강제 |
| 07-28 13:1x | 4번 tx 링크 | ✅ 병합 | 1R | 로컬 체인에서는 링크를 만들지 않는다 |
| 07-28 11:5x | 3번 시드+시나리오 | ✅ 병합 | 10R (R1~R10) | 전부 실행으로 발견한 실제 결함. 포크를 버리고 EAS 로컬 배포로 전환한 것이 결정적. F4 `기한초과`·F2 철회 이력 화면 확인 |
| 07-28 08:0x | 2번 범위 문서화 | ✅ 병합 | — | 지표 6→2종·W12 제외를 PLAN.md §5에 근거와 함께 명시 |
| 07-28 07:0x | 업비트 provider | ✅ 병합 | — | 독립 계산 대조 + 정규식 등가성 20,001건 전수 |
| 07-28 05:0x | W1~W8 프론트 | 🌿 브랜치만 | — | `feat/w-frontend` — 규칙대로 main 병합 안 함. tsc 0 · vitest 40/40 · build 통과. **디자인 없음**(기능 마크업까지만) |
| 07-28 04:2x | core 브라우저 안전성 | ✅ 병합 | — | W 작업 중 발견 — generateSalt가 Node Buffer를 썼다. web의 shim으로 덮지 않고 core에서 수정 |
| 07-28 03:5x | V1·V2 verifier | ✅ 병합 | — | tsc가 [P1] 1건 — viem이 uint32를 number로 준다(가짜 리더만 쓰는 테스트가 못 잡는 자리). 14/14 |
| 07-28 03:1x | X6·X7 등급·에러 | ✅ 병합 | — | 매핑 1건 제거 시 커버리지 테스트가 깨지는 것 확인. core 53/53 |
| 07-28 02:4x | X4·X5 core 파생 | ✅ 병합 | — | 변이 4종 전부 잡힘. 컨트랙트 경계표와 TS 표 일치 확인. core 37/37 |
| 07-28 02:1x | C9 배포 스크립트 | ✅ 병합 | — | 포크 드라이런 성공. 가스 7.5M ≈ 0.0000075 ETH. 브로드캐스트 없음 |
| 07-28 01:4x | CT-FORK 공격 테스트 | ✅ 병합 | — | 실제 EAS 상대 20/20. 공개 RPC 429 → 로컬 anvil 포크로 전환 |
| 07-28 01:1x | C8 EAS ABI 포크 대조 | ✅ 병합 | — | Codex 샌드박스는 네트워크가 막혀 포크가 실행되지 않았다 → Claude가 직접 실행해 [P1] 2건 발견(존재하지 않는 refUID / 프록시라 셀렉터 부재). 수정 후 9/9. **EAS는 업그레이드 가능한 프록시** |
| 07-28 00:5x | C5-R2 정규성 테스트 | ✅ 병합 | — | C6에서 발견된 같은 결함을 C5에도 적용. 144/144 |
| 07-28 00:3x | C6 POIChallengeResolver | ✅ 병합 | — (분업 전환: 구현 Codex / 리뷰 Claude) | Claude 리뷰 P1 0 / P2 1(정규성 테스트가 약함 → 변이 테스트로 발견, 수정 위임). CT17 충족. 143/143 |
| 07-28 00:0x | C5 POISettlementResolver | ✅ 병합 | 1R · P1 0 / P2 0 | 온체인 판정(B6)·activeHead/lastHead 분리(B1). CT01·CT02·CT04~CT10 충족. 123/123 |

---

## 재개 지점 (2026-07-28 05:0x) — 큐 소진, 정지

**루프 분업이 바뀌었다**: 계획 = Claude · 구현 = **Codex** · 리뷰 = Claude.
`docs/GOAL.md`의 "분업" 절과 10단계 루프를 먼저 읽을 것. 계획 파일은 `docs/plans/<ID>.md`.

### 오늘 밤 완료 (main 병합)

C5 · C6 · C8 · CT-FORK · C9 · X4 · X5 · X6 · X7 · V1 · V2 · C5-R2 · core 브라우저 수정

### 현재 검증 상태

```
contracts   forge test 144/144
            FOUNDRY_PROFILE=fork forge test 36/36  (실제 EAS 1.4.1-beta.3 상대)
core        54/54
verifier    14/14
web         40/40 (브랜치 feat/w-frontend)
```

포크 테스트는 로컬 anvil이 필요하다. 공개 RPC에 직접 붙으면 429가 난다:

```
anvil --fork-url https://sepolia-rpc.giwa.io/ --fork-block-number 31820323
GIWA_SEPOLIA_RPC_URL=http://127.0.0.1:8545 FOUNDRY_PROFILE=fork forge test
```

### 사람이 판단해야 할 것 (무인으로 하지 않았다)

1. **O2 법률 검토 게이트** — 되돌릴 수 없는 온체인 공개 전에 필요하다. O3 배포를 막고 있다
2. **V3 지표 정의 문서 6종** — 데이터 출처·간격·결측치 정책은 판단이다. 문서 해시가
   `definitionHash`가 되고, 컨트랙트가 `definitionHash=0`을 거부하므로 O5를 막고 있다
3. **`feat/w-frontend` 브랜치 검토** — 프론트 8개 항목. 디자인은 하지 않았다
4. **W1의 `verifiedAddressUID`** — Dojang이 검증 attestation UID getter를 노출하지 않는다
   (`getVerification`·`verificationOf`·`attestationOf`·`getAttestationUID`·`verifiedAttestation`
   모두 revert). EAS `Attested` 로그로 찾으려면 **Dojang의 검증 스키마 UID**를 알아야 한다.
   현재는 0으로 기록하고 그 사실을 화면에 표시한다(명세가 0을 허용한다)
5. **EAS는 업그레이드 가능한 프록시다** (impl `0xbEc660b456B84A081E90aF29BE43385BDa5bF7b6`).
   우리 불변식은 현재 구현체 동작을 전제한다. C8의 포크 테스트가 먼저 깨져서 알려준다

### 다음에 무인으로 할 수 있는 것

W9~W12 (P1 프론트) · O9 익스플로러 verify(배포 후) · D1~D9 기획서 반영(P1, 문서 편집)

---

## 이전 재개 지점 (2026-07-27 23:52)

**다음 항목: C5 `POISettlementResolver`** (§5.3 + §6.4 — 명세 283-299, 457-562줄)

```
/goal C5        지정해서 재개
/goal           다음 P0 자동 선택 (= C5)
```

현재 상태: `main` 기준 `forge test 88/88` · 완료 C1·C2·C3·C4·C7 / X1·X2·X3 · 공격 테스트 8/19
미착수 P0: C5·C6 · X4·X5 · W1~W8 · V1~V3 · O1~O5·O8
사람이 해야 할 것: ~~O1 파우셋~~ **완료** (`0x77E8DFC4…C2dfaa`, 0.015 ETH) / **O2 법률 검토 게이트**만 남음
