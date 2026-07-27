# POI 구현 실행 프롬프트

세션마다 이 파일 하나만 읽고 시작한다. 상태는 `BACKLOG.md`가, 순서는 `PLAN.md`가 들고 있다.

---

## 실행 명령

```
/goal C4          항목 하나만 하고 멈춘다
/goal C5,C6       지정한 항목들
/goal all         큐 순서대로 계속 간다 (막히면 건너뛰고 다음)
/goal             다음 P0 하나를 자동 선택
/loop /goal all   세션이 열려 있는 한 스스로 이어감 (무인)
```

`/goal`은 `.claude/commands/goal.md`에 정의돼 있고 저장소에 커밋돼 있다 — 세션이 바뀌어도 쓸 수 있다.
슬래시 명령을 못 쓰는 환경이면 `docs/GOAL.md 규칙으로 C4 진행해줘`라고 쓰면 동일하다.

---

## 루프 — 항목 하나당 한 사이클

```
1  읽기      BACKLOG.md의 해당 행 + 명세의 해당 절만 (§ 인덱스는 아래)
2  브랜치    git checkout -b feat/<id>-<slug>
3  구현      테스트 먼저. 불변식 하나 = 테스트 하나
4  검증      forge test  /  pnpm -C core test   ← 출력은 tail만
5  커밋      브랜치에 커밋 (아래 커밋 형식)
6  리뷰      codex review  ← 아래 명령 그대로
7  대응      [P1] 전건 수정 + 회귀 테스트. [P2]는 판단해서 반영하거나 근거를 남기고 보류
8  재리뷰    [P1]이 있었으면 다시 6으로. GATE PASS(=[P1] 0건)까지
9  기록      BACKLOG.md 상태를 [x]로. 완료 조건 칸에 근거(테스트 수·핵심 결정)를 남긴다
10 병합      main에 --no-ff 병합, push
```

**게이트: `[P1]`이 남아 있으면 `[x]`로 표시하지 않고 병합하지 않는다.**

### 리뷰 명령

```bash
codex review "IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, \
.claude/skills/, or agents/. Stay focused on repository code only.

Review the changes on this branch against the base branch main. Run 'git diff main...HEAD'. \
This implements <ID> against docs/POI_TechSpec_v3.md <절 번호>. Verify the invariants match \
the spec. Mark critical findings [P1] and advisory [P2]." \
  -c 'model_reasoning_effort="high"' --enable web_search_cached < /dev/null
```

의도적으로 명세와 다르게 간 것이 있으면 프롬프트에 한 줄로 적고 판단을 요청한다.
(예: "one deliberate deviation: X. judge whether that is sound.")

---

## 토큰 규칙

| 하지 말 것 | 대신 |
|---|---|
| 명세 전체 읽기 (40k자) | 아래 § 인덱스로 해당 절만 `sed -n 'A,Bp'` |
| 기획서(v0.10) 읽기 | 명세가 상위다. 기획서는 D1~D9 반영할 때만 |
| `forge test -vvv` | 기본 출력 + `tail -6`. 실패했을 때만 `-vv` |
| 파일 편집 후 재확인 Read | Edit이 실패하면 에러가 난다. 통과했으면 반영된 것 |
| 커밋 전 전체 `git diff` | `git diff --stat`, 필요한 파일만 |
| 여러 항목을 한 브랜치에 | 항목 하나(또는 밀접한 쌍) = 브랜치 하나 = 리뷰 하나 |

컨텍스트가 날아가도 `BACKLOG.md`만 읽으면 복구된다. **그래서 상태를 대화가 아니라 파일에 쓴다.**

---

## 명세 § 인덱스 — `sed -n 'A,Bp' docs/POI_TechSpec_v3.md`

| 항목 | 절 | 줄 |
|---|---|---|
| C4 Decision 리졸버 | §5.2 + §6.3 | 260-282, 385-456 |
| C5 Settlement 리졸버 | §5.3 + §6.4 | 283-299, 457-562 |
| C6 Challenge 리졸버 | §5.4 + §6.5 | 300-315, 563-612 |
| C9 배포 스크립트 | §6.6 | 613-627 |
| X4 scale·eval·result | E2~E5 | 669-694 |
| X5 state 파생 | E9 | 742-761 |
| X6 등급 2축 | E7 | 703-727 |
| W 프론트 기능 | §2 F1~F11 | 79-140 |
| W12 공개 필수 집합 | E10 | 762-774 |
| V3 metric 정의 문서 | §11 | 844-894 |
| 실패 모드·에러 문구 | §10 | 830-843 |

전체 목차: `grep -nE '^#{2,3} ' docs/POI_TechSpec_v3.md`

---

## 이미 고정된 것 — 다시 정하지 않는다

| | |
|---|---|
| commitment | `C = keccak256(TAG ‖ chainId ‖ attester ‖ salt ‖ utf8(JCS(payload)))` · 벡터는 `core/vectors/commitment.v1.json` |
| 디코딩 | `POICodec` — 평면 튜플 앞에 offset 워드(0x20) |
| 공통 가드 | `POIResolverBase._guard` — 스키마 일치 · `expirationTime==0` · `recipient==0` |
| 초기화 | `_initializeBase`는 internal + onlyOwner. 각 리졸버는 **필요한 UID를 전부 받는 external initialize 하나**만 노출 |
| 지표 | `POIMetricRegistry` — Decision 리졸버만 상속. 등록 즉시 frozen |
| 툴체인 | solc 0.8.30 · evm cancun · `via_ir = true` · EAS v1.4.0 · OZ v5.1.0 |
| 테스트 | 리졸버는 **실제 `attest()` 진입점**(onlyEAS, `vm.prank(EAS)`)으로 검증한다 |
| 개발 체인 | 로컬 포크 `anvil --fork-url $GIWA_SEPOLIA_RPC_URL` (가스 0, `evm_increaseTime`으로 grace 점프) |

---

## 커밋 형식

```
feat(scope): <ID> 한 줄 요약

무엇을 왜 그렇게 했는지 2~5줄. 명세 절 번호와 불변식 번호(I7, B13 …)를 적는다.
codex 리뷰 반영분은 어떤 결함이었는지 한 줄로 남긴다.

검증: forge test N/N
```

---

## 하지 않기로 한 것 (범위 경계)

ENS 조회 · 경로 존재형 지표 · 오라클 등급 · 서브그래프/백엔드 · 이의 건수 표시 · 업비트 API 키.
`PLAN.md` §3. 이 목록에 손대는 것은 범위 확대다.

---

## 남은 순서 (2026-07-27 기준)

```
X4·X5   ─┬─► V1·V2 verifier
         └─► W1~W8 프론트          ← 12개, 가장 큰 리스크. P1 항목(W9~W12)은 잘라낼 수 있다
C4 ─► C5 ─► C6 ─► 공격 테스트 17종 ─► C9 배포 스크립트
V3 metric 문서 6종 ─► O5 addMetric   ← definitionHash=0을 컨트랙트가 거부하므로 문서가 배포를 막는다
O1 파우셋 · O2 법률 게이트 ─► O3 배포 ─► O4 fixture ─► (70분) ─► O8 녹화
```

O1·O2는 사람이 해야 한다.
