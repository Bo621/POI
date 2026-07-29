# 무인 실행 로그

`/goal` 무인 모드가 남기는 기록. 아침에 이 파일만 읽으면 밤새 진행을 복구할 수 있다.
규칙은 `.claude/commands/goal.md`의 "무인 실행 모드".

| 시각 | 항목 | 결과 | codex | 비고 |
|---|---|---|---|---|
| 07-27 23:50 | C4 POIDecisionResolver | ✅ 병합 | 1R · P1 0 / P2 1 | P2: 잉여 워드 payload 무시 → 정규 길이 강제. CT11~CT16 동시 충족 |
| 07-27 23:52 | — | ⏸ 중단 | — | 사용자 요청으로 무인 루프 정지. 다음 세션에서 `/goal`로 재개 |
| 07-28 17:1x | **성공 경로 전체 완주** | ✅ 병합 | 3R | 저널→노트→결정→정산→이의→reveal 다운로드까지 한 테스트로. **배포 게이트 닫힘** |
| 07-28 16:3x | 체인 시각 통일 | ✅ 병합 | 1R | decision도 브라우저 시계를 쓰고 있었다. chainClock 한 곳으로 |
| 07-28 16:0x | verifier MATCH 증명 | ✅ 병합 | — | anvil --timestamp로 관측 구간과 fixture 구간 통합. 독립 실행으로 확인 |
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

## 2026-07-29 새벽 — GIWA 정렬 디자인 (`feat/giwa-design`, main 미병합)

| 항목 | 결과 | 파일 | 비고 |
|---|---|---|---|
| N1 색 토큰 | ✅ | `web/src/styles.css` `:root`·dark 블록 | 다크 `--seal` = `#FF2200` (GIWA와 동일 값). `--gold`·`--giwa-red` 신설 |
| N2 Pretendard | ✅ | `web/index.html`, `styles.css:4` | Google Fonts에서 IBM Plex Sans KR만 제거. Gowun Batang·Plex Mono 유지 |
| N3 `//` 조항 표시 | ✅ (수정 후) | `styles.css` `.doc-section > h2::before` | **처음 넣었을 때 E2E 11/26 실패.** Chrome이 생성 콘텐츠를 접근성 이름에 포함한다 — `content: "// " / ""`로 대체 텍스트를 비워 해결 |
| N4 기와 구분선 | ✅ | `styles.css` `.doc-section::after` | 4.5rem·0.55. `::before`는 이미 증서 이중선에 쓰이고 있었다 |
| N5 금색 | ✅ | `styles.css` `.wallet-badge--verified`, `.verification-result` | 계보 연결선은 **건너뜀** — 스타일링할 요소가 없고 DOM을 만들지 않기로 했다 |
| N6 Passport 진입점 | ✅ | `passport.tsx`(`AttesterLink`), `decisionDetail.tsx`×3, `challenge.tsx`, `wallet.tsx` | 화면은 이미 있었고 **링크만 없었다.** E2E 1개 추가 → 27 |

**최종**: `web 80/80` · `e2e 27/27 (skipped 0)` · tsc 클린 · 빌드 통과

### 이 밤에 드러난 것

1. **`::before` 접근성 가정이 틀렸다.** `TOKENS.md`에 잘못 적어둔 것을 그대로 구현했고
   E2E가 잡았다. 문서에 정정을 남겼다. 시각 효과와 접근성 이름은 별개다.
2. **주소 대소문자 재발 (네 번째).** 체인이 돌려주는 attester는 체크섬 표기다.
   `shortAddressRe` 같은 헬퍼가 있는데도 새 코드에서 또 났다 — 구조적 방지책이 필요하다.
3. **시드는 매번 새로 만들어야 한다.** E2E를 반복 실행하면 체인 시간이 밀려
   F5 시간 경계 테스트가 실패한다. 코드 결함이 아니다.
4. **codex 샌드박스가 git 커밋을 막는다.** N1만 파일 수정 후 커밋에서 멈췄다.
   이후는 직접 했다. 다음 위임부터는 커밋을 사람/Claude가 맡는 전제로 지시할 것.

## 2026-07-29 — 제출물 리뷰 루프 (GATE PASS 도달)

| 산출물 | 회차 | 결과 |
|---|---|---|
| `PITCH.md` | 5차 | **GATE PASS** |
| `pitch/index.html` | 3차 | **GATE PASS** |
| `gitbook/` | 3차 | **GATE PASS** |

### 리뷰가 잡은 것 중 실제 결함이었던 것

**제가 과장한 것 (2건)** — 심사자가 코드를 열면 바로 걸렸을 대목이다.

- **CT18 차단 강도.** "컨트랙트·검증기 강제"라고 썼는데 컨트랙트는 `decisionCommitment != 0`
  만 검사한다(I1). 프리이미지를 재계산하지 않으므로 **복사 커밋 자체는 온체인에서 성공한다.**
  차단은 검증 단계에서만 일어난다.
- **도장(Dojang) 연결.** 아키텍처 도표에 `리졸버 → DojangScroll.isVerified` 를 그렸는데,
  리졸버는 도장을 호출하지 않고 EAS attestation 을 조회해 recipient·철회·만료만 본다.

**제가 부정확했던 것**

- "이 바이트가 그 시점 이전에 존재했다" — 온체인에 있는 것은 commitment 뿐이고
  원문 동일성은 Reveal 이후에만 확인된다. 슬라이드·백서·PITCH 세 곳을 고쳤다.
- 지원서 글자 수를 눈대중으로 적었다. 실제로 세니 **세 문항 전부 초과** (문항12는 121자).
- 경쟁표에서 "EAS 직접 구축"을 전부 ✗ 로 표시했다. custom resolver 로 전부 구현 가능하다.
- "384개 테스트" 를 서로 다른 시점의 숫자를 합쳐 썼다 → 한 자리 연속 실행 기록으로 대체.

**제가 놓친 것**

- O7 fixture 를 완료하고 `DEPLOYMENT.md` 를 갱신하지 않아 백서와 배포 기록이 모순됐다.
- 슬라이드 URL 이 `<pre>` 문자열이라 심사자가 복사·입력해야 했다.
- 5분 발표 경로에서 "다음 장" 이 실제로는 건너뛴 장을 가리켰다 — 발표 중 사고 자리.
- 모바일에서 viewBox SVG 를 축소하면 18px 글자가 7px 가 된다. 폰트 확대로는 못 푼다.
- `::before` 생성 콘텐츠가 접근성 이름에 포함돼 E2E 11개가 깨졌다(스크린리더도 슬래시를 읽었다).

### 배운 것

**테스트가 아니라 실행과 리뷰가 잡았다.** 조건 기호 6개 오류는 단위 테스트 80개가
통과하는 동안 배포된 화면을 눈으로 보고서야 나왔고, 위 과장 2건은 코덱스가 컨트랙트를
직접 열어 대조해서 나왔다. **문서에 쓴 주장은 코드로 다시 확인해야 한다.**
