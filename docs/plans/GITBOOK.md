# GitBook 백서 — 구현 계획

> **역할 분담:** 계획 **Claude** → 구현 **Codex** → 리뷰 **Claude**
> 이 문서가 계획이다. 코덱스는 이 문서만 보고 작업하며, **판단할 것이 남아 있지 않아야 한다.**

## 산출물

`gitbook/` 디렉터리. **GitBook에 그대로 연결하면 바로 뜨는 형태.**

```
gitbook/
  README.md              표지 — GitBook의 첫 페이지
  SUMMARY.md             목차 (GitBook이 이 파일로 사이드바를 만든다)
  .gitbook.yaml          루트·구조 선언
  intro/
    what.md              무엇을 하는 제품인가
    verify-in-5-min.md   5분 만에 직접 확인하기
    deployed.md          배포된 주소와 UID
  problem/
    no-record.md         판단은 남지 않는다
    what-is-proven.md    무엇이 증명되고 무엇이 안 되나
    trust-boundary.md    신뢰 경계
  design/
    invariants.md        컨트랙트 불변식
    commitment.md        commitment 설계와 복사 공격
    metrics.md           지표 정의의 온체인 고정
    encoding.md          비정규 payload 차단
  giwa/
    cost.md              실측 비용
    why-not-elsewhere.md 고비용 체인에서 무너지는 지점
    ecosystem.md         생태계 편입 — EAS · 도장
    wallet.md            월렛 탑재 가능성          ★ 신규 집필
  usage/
    screens.md           화면 구조
    flow.md              커밋 → 결과 등록 → 이의 → 공개
  verify/
    onchain.md           온체인에서 직접
    cli.md               오프체인 검증기
    exit-codes.md        종료코드의 의미
  limits/
    not-yet.md           하지 못한 것
    roadmap.md           Phase 1~3
  appendix/
    schemas.md           스키마 정의
    invariant-list.md    불변식 전체 목록
    tests.md             테스트 구성
```

## 절대 조건 — 이걸 어기면 온체인 검증이 깨진다

### 1. `docs/metrics/*.md` 를 **복사하지 마라**

**그 파일들의 바이트 해시가 온체인 `definitionHash`다.** 한 글자, 개행 하나만 달라져도
`cast keccak` 결과가 온체인 값과 어긋나고, 백서가 주장하는 검증이 실패한다.

`giwa/` 나 `design/metrics.md` 에서는 **GitHub 원본을 링크**한다.

```markdown
정의 문서 원본:
https://github.com/<org>/<repo>/blob/main/docs/metrics/BTC_PRICE_KRW_AT_END.md

이 파일의 keccak256 이 온체인 definitionHash 와 같다.
```

### 2. 주소·UID·수치를 **손으로 옮겨 적지 마라**

이 저장소에서 UID가 **두 번** 어긋났다. 출처는 하나뿐이다.

| 값 | 유일한 출처 |
|---|---|
| 컨트랙트 주소 · 스키마 UID · fixture UID | `docs/DEPLOYMENT.md` |
| 테스트 개수 | `docs/submission/TEST_RECORD.md` |
| 비용 수치 | `docs/POI_v0.10.md` §12.1 |

`intro/deployed.md` 는 **`docs/DEPLOYMENT.md` 의 표를 그대로 옮기되**,
문서 머리에 「출처: docs/DEPLOYMENT.md — 값이 다르면 그쪽이 옳다」를 적는다.

### 3. 없는 것을 있다고 쓰지 마라

ZK · Upbit Oracle · Verified Balance 배지 · 실행 정합성 · **실사용자**.
전부 Phase 2 이후이거나 외부 미공개다. `limits/not-yet.md` 의 서술을 따른다.

### 4. 「0.53원」은 **추정치**다

가스 가격은 실측이지만 gas 사용량과 환율은 가정이다. 「실측 비용」이라고 쓰지 마라.

## 각 문서의 출처 — 재배열이지 재집필이 아니다

| 파일 | 출처 |
|---|---|
| `README.md` | `docs/submission/README.md` |
| `intro/what.md` | `docs/submission/README.md` + `POI_v0.10.md` §0 |
| `intro/verify-in-5-min.md` | **`docs/submission/VERIFY.md` 거의 그대로** ★ |
| `intro/deployed.md` | `docs/DEPLOYMENT.md` |
| `problem/no-record.md` | `POI_v0.10.md` §1 |
| `problem/what-is-proven.md` | `POI_v0.10.md` §2.1 명제표 |
| `problem/trust-boundary.md` | `PITCH.md` 4장 + `POI_v0.10.md` §2.2 |
| `design/invariants.md` | `docs/submission/ARCHITECTURE.md` |
| `design/commitment.md` | `ARCHITECTURE.md` + `POI_TechSpec_v3.md` §4.3 |
| `design/metrics.md` | `ARCHITECTURE.md` — **metrics 원본은 링크만** |
| `design/encoding.md` | `ARCHITECTURE.md` 「비정규 payload 차단」 |
| `giwa/cost.md` | `POI_v0.10.md` §12.1 |
| `giwa/why-not-elsewhere.md` | **`POI_v0.10.md` §12.2** ★ |
| `giwa/ecosystem.md` | `POI_v0.10.md` §10 + `ARCHITECTURE.md` |
| `giwa/wallet.md` | **없다 — 신규 집필** ★ (아래 참조) |
| `usage/screens.md` | `docs/TEST_SCENARIO.md` S1~S12 |
| `usage/flow.md` | `TEST_SCENARIO.md` + `PITCH.md` 3장 |
| `verify/onchain.md` | `VERIFY.md` 1~4 |
| `verify/cli.md` | `VERIFY.md` 5~7 |
| `verify/exit-codes.md` | `VERIFY.md` 5 + `verifier/src/reveal.ts` 주석 |
| `limits/not-yet.md` | **`docs/submission/LIMITS.md` 거의 그대로** ★ |
| `limits/roadmap.md` | `POI_v0.10.md` §11 Phase 표 |
| `appendix/schemas.md` | `DEPLOYMENT.md` 스키마 절 |
| `appendix/invariant-list.md` | `contracts/src/*.sol` 의 `// I<n>` 주석을 전수로 |
| `appendix/tests.md` | `docs/submission/TEST_RECORD.md` |

## 신규 집필 — `giwa/wallet.md` 하나뿐

심사 기준 06 「GIWA 월렛 내 탑재 가능성」인데 어느 문서에도 없다.

**과장하지 말 것.** 검증된 적이 없다. 「구조적으로 이미 담긴다」·「그대로 들어간다」는
쓰지 말고 **「탑재 후보 구조」** 수준으로 쓴다.

담을 것:

```
1. 왜 구조적으로 유리한가 (사실만)
   - 백엔드 없음 — 정적 파일 + RPC 직접 호출
   - 해시 라우팅 — 라우터 라이브러리 없음, #/d/<uid>
   - EIP-1193 하나만 요구
   - 조회·검증은 지갑 연결 없이 동작
   - 트랜잭션 건당 0.53원 수준, 서명 1회

2. 월렛 안에서의 흐름 (가정)
   내 판단 기록 → 결정 커밋 → 결과 등록

3. 확인이 필요한 것 (질문 형태)
   임베드 방식 · 라우팅 제약 · 서명 UX · 딥링크 규격

4. 아직 검증되지 않았음을 명시
```

## GitBook 설정 파일

`.gitbook.yaml` 을 `gitbook/` 안이 아니라 **저장소 루트**에 둔다.

```yaml
root: ./gitbook/

structure:
  readme: README.md
  summary: SUMMARY.md
```

`SUMMARY.md` 는 GitBook 목차 규격을 따른다.

```markdown
# Table of contents

* [POI — Proof of Insight](README.md)

## 시작하기
* [무엇을 하는 제품인가](intro/what.md)
* [5분 만에 직접 확인하기](intro/verify-in-5-min.md)
* [배포된 주소와 UID](intro/deployed.md)
...
```

## 문체

기존 문서의 문체를 유지한다. **번역하지 말고 옮긴다.**

- 한국어. 영문 식별자(`decisionUID`, `poi.settlement.v1`, `MATCH`)는 그대로 두고 옆에 설명
- 단정적으로 쓰되 **없는 것을 있다고 하지 않는다**
- 코드 인용은 실제 파일에서 그대로. 요약해서 바꾸지 말 것

## 검증 — 코덱스가 끝내고 스스로 확인할 것

```bash
# 1. SUMMARY.md 의 모든 링크가 실제 파일을 가리키는가
grep -oE '\]\([^)]+\.md\)' gitbook/SUMMARY.md | tr -d '](' | sed 's/)//' \
  | while read f; do [ -f "gitbook/$f" ] || echo "없는 파일: $f"; done

# 2. metrics 문서를 복사하지 않았는가 (본문이 통째로 들어가면 안 된다)
grep -rl "관측 구간의 마지막 1분봉" gitbook/ && echo "metrics 본문이 복사됨 — 링크로 바꿀 것"

# 3. 주소가 DEPLOYMENT.md 와 일치하는가
grep -roh "0x[0-9a-fA-F]\{40\}" gitbook/ | sort -u > /tmp/gb.txt
grep -oh "0x[0-9a-fA-F]\{40\}" docs/DEPLOYMENT.md | sort -u > /tmp/dp.txt
comm -23 /tmp/gb.txt /tmp/dp.txt   # 출력이 있으면 DEPLOYMENT.md 에 없는 주소다

# 4. '실측 0.53' 같은 표현이 없는가
grep -rn "실측 0.53\|실측 비용" gitbook/ && echo "추정치를 실측으로 쓴 곳이 있다"
```

네 검사가 전부 조용해야 한다.

## 하지 말 것

| 금지 | 이유 |
|---|---|
| `docs/metrics/*.md` 복사 | **바이트 해시가 온체인에 있다** |
| `docs/POI_TechSpec_v3.md` · `POI_v0.10.md` 수정 | 원본 문서다. 읽기만 |
| 주소·UID·테스트 수치를 손으로 만들어 쓰기 | 두 번 어긋난 전례가 있다 |
| 없는 기능 서술 (ZK·오라클·배지·실사용자) | 검증 가능성을 파는 제품이 자기 한계에 부정확하면 반증이다 |
| 「구조적으로 이미 담긴다」 류의 미검증 단정 | 월렛 탑재는 검증된 적이 없다 |
| 새 주장 만들어내기 | **재배열이지 재집필이 아니다** |
