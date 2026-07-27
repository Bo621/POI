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

## 분업 — 누가 무엇을 하는가

| | 담당 | 이유 |
|---|---|---|
| 계획 (무엇을·어떤 불변식·어떤 테스트) | **Claude** | 명세 해석과 설계 판단. 애매한 것을 다루는 쪽 |
| 구현 (계획을 코드로) | **Codex** (`--profile execute`) | 기계적 실행. 여기가 토큰이 가장 많이 드는 구간이다 |
| 리뷰 (계획·명세 대조, 게이트) | **Claude** | **구현자 ≠ 리뷰어**. 자기 코드를 자기가 통과시키지 않는다 |

Claude가 구현까지 하면 (a) 토큰이 가장 비싼 쪽에 몰리고 (b) 구현자가 리뷰어가 된다.
둘 다 피한다. `~/.codex/AGENTS.md`의 "Task Routing"과 같은 규칙이다.

---

## 루프 — 항목 하나당 한 사이클

```
1  읽기      (C) BACKLOG.md의 해당 행 + 명세의 해당 절만 (§ 인덱스는 아래)
2  브랜치    (C) git checkout -b feat/<id>-<slug>
3  계획      (C) docs/plans/<ID>.md 작성 — 아래 계획 파일 형식
4  구현      (X) codex exec --profile execute — 아래 명령 그대로
5  검증      (C) forge test / pnpm -C core test   ← 출력은 tail만
6  리뷰      (C) 계획 대조 · 명세 대조 · 테스트가 불변식을 실제로 잡는지.
              결함은 [P1]/[P2]로 적고, 수정은 다시 4로 위임한다
7  재검증    (C) [P1] 0건이 될 때까지 4~6 반복
8  기록      (C) BACKLOG.md 상태를 [x]로. 완료 조건 칸에 근거를 남긴다
9  병합      (C) main에 --no-ff 병합, push
```

**게이트: Claude 리뷰에서 `[P1]`이 남아 있으면 `[x]`로 표시하지 않고 병합하지 않는다.**

### 계획 파일 형식 — `docs/plans/<ID>.md`

Codex가 이것만 읽고 구현할 수 있어야 한다. 명세를 다시 읽게 하지 않는다.

```markdown
# <ID> <제목>

## 파일
- 새로: contracts/src/X.sol · contracts/test/X.t.sol
- 수정 금지: 그 외 전부

## 강제할 불변식        ← 번호 · 조건 · revert할 커스텀 에러 이름
| # | 조건 | 에러 |

## 참고할 기존 코드      ← 스타일·패턴을 맞출 대상 파일 경로

## 테스트 목록          ← 불변식 하나 = 테스트 하나. 이름까지 적는다

## 검증
forge test  → N/N
```

### 구현 위임 명령

```bash
# codex 0.145는 --profile을 거부한다(legacy profile 충돌). 설정은 인라인으로 준다.
codex exec -s workspace-write -c model_reasoning_effort="low" -c service_tier="flex" \
  "IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, \
or agents/. Stay focused on repository code only.

Implement docs/plans/<ID>.md exactly. Read that file first — it is self-contained. \
Do not read the spec documents. Do not touch files outside the plan's file list. \
Do not add features the plan does not list. Run 'forge test' and make it pass. \
Report what you changed and the final test count." < /dev/null
```

### 리뷰에서 Claude가 실제로 볼 것

코드를 훑는 것으로는 부족하다. 이 순서로 본다.

1. 계획의 불변식 표 각 행 ↔ 구현의 revert 지점 (빠진 행이 있는가)
2. 계획의 테스트 목록 각 행 ↔ 실제 테스트 함수 (이름만 같고 다른 것을 보는가)
3. **테스트가 진짜 잡는가** — 해당 검사를 지우면 그 테스트가 실패하는가
4. 명세 원문과 대조 (계획을 잘못 썼을 수 있다 — 계획도 리뷰 대상이다)
5. 계획에 없는 것이 들어왔는가 (범위 확대)

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
