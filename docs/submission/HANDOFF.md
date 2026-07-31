# 인수인계 — 다른 세션에서 이어받을 때

> **2026-07-30 기준. 마감 7/31.**
> 이 문서만 읽고 이어받을 수 있게 적는다. 세션이 끊겨도 여기부터 보면 된다.

---

## 지금 상태 한 줄

**제출 준비가 끝났다. 폼에 붙여넣는 것만 남았다.**

---

## 1. 지금 당장 해야 할 것

**없다.** 문항 1~12 값이 확정됐고 Drive 업로드본도 로컬 PDF 와 해시가 일치한다
(팀 소개 `86cbc8ad…` 2쪽). **피치덱은 20쪽으로 교체해야 한다** — 해시는 `submit/latest/SHA256SUMS.txt` 참조.

```
붙여넣을 원문   submit/latest/FORM_TEXT.txt
```

**┌ 와 └ 사이만 붙여넣는다.** 그 밖의 줄은 메모다.
**연락처·생년월일 칸은 폼에 없다.** 2026-07-31 에 실제 폼 정의를 읽어 확인했다.
폼 수집 항목은 「이메일 주소, 팀 정보 및 프로젝트 정보, 신청 프로그램 정보」뿐이다.

폼에는 **개인정보 수집 동의**와 **코드 리뷰 정책 동의**가 따로 있다. 후자는
Production Phase 선발 시 코드베이스 접근 권한을 요청하며, 데모와 실제 코드가
다르거나 저장소 공유를 거부하면 자동 탈락이라는 내용이다. POI 는 저장소가 이미
공개고 컨트랙트도 Verified 라 걸릴 것이 없다.

> **PDF 를 다시 빌드하지 말 것.** `build_submit_pdfs.sh` 는 두 PDF 를 항상 같이 만드는데,
> 내용이 안 바뀌어도 생성시각 때문에 해시가 달라진다. 그러면 이미 올라간 Drive 링크의
> 해시 대조가 깨진다. 내용을 실제로 고칠 때만 돌리고, 그때도 바뀌지 않은 쪽 PDF 는
> 이전 버전 바이트를 그대로 승계할 것.


---

## 2. 제출 값 — 전부 확정됨

**붙여넣을 원문은 `submit/latest/FORM_TEXT.txt` 하나다.** 12문항이 전부 들어 있다.

| 문항 | 값 |
|---|---|
| 1 팀 이름 | VESTAT |
| 2 팀 이메일 | `bo@vestat.io` — **폼 문항은 대표자가 아니라 팀 이메일이다.** 제출 전 확인 |
| 3 팀 소개 | Drive 링크 (2쪽) — 해시 대조 완료 |
| 4 지원 동기 | 432자 |
| 5 트랙 | Track 03 GIWA-NATIVE IDEAS |
| 6 한 줄 요약 | 35자 |
| 7 피치덱 | Drive 링크 (20쪽) — **교체 대기** |
| 8 프로젝트 | `https://poi-static-production.up.railway.app` |
| 9 컨트랙트 | 리졸버 4종 익스플로러 링크 |
| 10 기술 문서 | `https://vestat.gitbook.io/poi` |
| 11 추가 요청 | 487자 |
| 12 GIWA 팀에 | 473자 |

글자수는 전부 500자(문항 6은 50자) 한도 이내이고, 문서에 적힌 값과 실측이 일치한다.

---

## 3. 제출 직전 점검 — 이 명령들로 확인한다

```bash
cd /Users/bo/GIWA

# 제출본 무결성
(cd submit/latest && shasum -a 256 -c SHA256SUMS.txt)

# 온체인 (Safe 소유권 · 지표 동결)
export PATH=$PATH:$HOME/.foundry/bin
cast call 0x0f25917176a405bb9022e5b417e0d57348b30f89 'owner()(address)' \
  --rpc-url https://sepolia-rpc.giwa.io/          # → 0x215253B8…DCE1

# 공개 링크 (전부 인증 없이 200 이어야 한다)
curl -sIL https://poi-static-production.up.railway.app | head -1
curl -sIL https://vestat.gitbook.io/poi | head -1

# 심사자 시나리오 — 문서에 적힌 명령 그대로
export POI_RPC_URL=https://sepolia-rpc.giwa.io/
export POI_EAS_ADDRESS=0x4200000000000000000000000000000000000021
export POI_SETTLEMENT_RESOLVER_ADDRESS=0x167cf06df663c5ddde9f20a748e724b4fb6c14fa
export POI_METRIC_REGISTRY_ADDRESS=0x0f25917176a405bb9022e5b417e0d57348b30f89
export POI_DECISION_SCHEMA_UID=0x88990bf8da2b83b2f68c5783dc1a4375f9f956185c6bafcbd97f7de6d5aa3749
node --experimental-strip-types verifier/src/cli.ts \
  0x5941a398a8338b99d053309cbf5e611486f30e649c9569cfa3a63d5060443888 --json   # → MATCH, exit 0
```

### Drive 링크는 **반드시 인증 없이** 검사할 것

인증된 도구(브라우저 로그인·Drive MCP)로 열면 **본인에게만 보이는 파일도 열린다.**
「링크가 있는 모든 사용자」 검증이 되지 않는다. 판정 기준은 하나다 —
**쿠키 없이 바이트를 받았는가.**

```bash
curl -sL -A "Mozilla/5.0" "https://drive.google.com/uc?export=download&id=<FILE_ID>" \
  -o /tmp/x.pdf -w '%{size_download}\n'
shasum -a 256 /tmp/x.pdf        # 로컬 submit/latest/ 의 것과 대조
```

> 공개 파일 페이지에도 구글이 로그인 링크를 심어 둔다. HTML 에서 `ServiceLogin`
> 문자열을 찾는 방식은 **오탐이 난다.** 실제로 한 번 틀렸다.

---

## 4. 작업 규칙 — 이 저장소에서 지켜 온 것

1. **주장은 실행해서 확인한다.** 「~일 것이다」로 적지 않는다.
   온체인은 `cast`, 명령은 직접 실행, PDF 는 렌더해서 눈으로 본다.
2. **문서가 부정하는 것을 다른 문서가 주장하면 안 된다.**
   이번 감사에서 걷어낸 것이 대부분 이 유형이다 (「Proof of Investing」,
   「KYC 결속 온체인 신원」 등).
3. **제출본(`submit/`)은 출력물이다.** 원본은 `docs/submission/*.md`.
   `submit/` 안의 파일을 직접 고치지 않는다. 원본을 고치고 새 버전을 만든다.
4. **검증 스크립트가 빈 값을 성공으로 처리하지 않게 한다.**
   이번에 두 번 당했다 (urllib 403, GitBook CDN 파일명). 「없음」과 「확인 실패」는 다르다.
5. **커밋 메시지에 무엇을 어떻게 확인했는지 적는다.** 나중 세션이 재검증할 근거가 된다.

---

## 5. 이번 세션에서 한 일 (요약)

교차 감사 4라운드 + 문체·명료성 정비. 지적 60여 건 반영.

| | |
|---|---|
| 심사자가 실행하면 실패하던 것 | `reveal-cli` 명령이 쪼개져 있던 것(3곳), 5분 검증 페이지의 첫 명령이 필수 env 누락으로 실패하던 것, 재현 블록의 `cd` 연쇄 |
| 과장 | 「Proof of **Investing**」→ Insight, 「KYC 결속 온체인 신원」, 「commitment 하나」→ 넷, 「정산을 발행자가 주장하지 못하게」, 경력 10년 7개월 → 10년+ |
| 사실 오류 | 「유료 리딩방이 불법」 → 「양방향 유료 리딩방은 등록 자문업자만」, 비용 19원 → 44원, OVERDUE epoch↔KST 하루 오차 |
| 문서 간 모순 | 소유권 표기 3곳, GitBook 상태표가 실재하는 fixture 를 「없음」 표기, 테스트 수 392/407 vs 423 |
| 피치덱 | 14 → 20장. 시장 근거·사용자 이야기·실제 화면 캡처 2장·로드맵 2장 추가. 한글 조판(`word-break:keep-all`) 수정 |
| 백서 | 29 → 31개 문서. `problem/market.md`·`problem/who.md` 신설, 로드맵 373 → 2,695자, 스크린샷 6건, 용어집 신설 |
| 문체 | 볼드 8.2 → 4.8/1천자 (백서). 선언조 문장을 사실 서술로 |

감사 기록: [`AUDIT_2026-07-30.md`](AUDIT_2026-07-30.md)

---

## 6. 미해결로 남긴 것 — 의도적이다

| | 왜 |
|---|---|
| **GitBook URL 슬러그가 `undefined-N`** (`/poi/undefined-2/security`) | SUMMARY 의 한글 `##` 섹션 제목을 GitBook 이 슬러그로 못 바꾼 탓. ASCII 인 `## GIWA` 만 정상이다. **27개 페이지 전부 본문이 뜨고 내부 링크도 정상**이라 동작 문제는 없다. GitBook UI 에서 섹션별로 고쳐야 한다 |
| **`gitbook/giwa/cost.md` 의 「기한초과 결정」 gas 에 tx 미인용** | 나머지 3건은 영수증 tx 를 찾아 인용했다. 이 하나는 특정하지 못해 「tx 미인용」이라고 문서에 명시했다. 없는 해시를 지어내지 않았다 |
| **`seed.json` 에 `f5.window` 없음** | `dev_up.sh` 가 이제 기록하지만 시드를 다시 돌려야 생긴다. `TEST_SCENARIO.md` 에 「S0 을 먼저 다시 실행한다」로 적어 두었다 |
| **백서 문서마다 EAS·리졸버를 재정의하지 않음** | 코덱스가 제안했으나 받지 않았다. 10개 문서에 같은 설명을 반복하면 더 기계적으로 읽힌다. [용어집](../../gitbook/appendix/glossary.md)이 그 자리다 |
| **덱 20장 중 눈으로 본 것은 일부** | 잘림은 계측으로 전수 확인했다(1600×900 캡처 기준 `scrollHeight ≤ clientHeight`). 톤 일관성은 미확인 |

---

## 7. 시간이 남으면 — 다음 후보

1. ~~덱 20장 눈으로 확인~~ — **완료(v2.5).** p10·p11 의 표가 잘려 있던 것을 찾아 고쳤다.
   계측만으로는 못 잡았다 — `.tblwrap{overflow-x:auto}` 가 스크롤 컨테이너를 만들어
   표가 그 안에서 잘리는데 슬라이드 `scrollHeight` 는 안 늘어난다.
   **검사에 내부 스크롤 컨테이너와 마지막 표행 위치를 더했다.**
2. **GitBook 섹션 슬러그 정리** — UI 작업. URL 이 흉한 것 외에 실해는 없다.
3. **`docs/submission/` 의 나머지 문서 문체 정비** — 볼드 8.8/1천자로 백서(4.8)보다 높다.
   다만 이 문서들은 심사자에게 직접 노출되지 않는다 (`TEAM.md` 제외, 이미 정비함).

---

## 8. 핵심 경로 지도

```
submit/latest/              제출본. FORM_TEXT.txt 하나만 폼에 붙여넣으면 된다
docs/submission/            원본 문서. 여기를 고치고 submit/ 을 새로 얼린다
  AUDIT_2026-07-30.md       4라운드 감사 기록
  HANDOFF.md                이 문서
  pitch/index.html          피치덱 실제 소스 (PITCH.md 는 마크다운 쌍둥이)
  pitch/shots/              덱에 쓴 화면 캡처
gitbook/                    백서 31개. 푸시하면 vestat.gitbook.io/poi 에 반영된다
  appendix/glossary.md      용어집
  assets/                   백서 스크린샷
docs/DEPLOYMENT.md          온체인 주소·UID 의 유일한 원장. 값이 다르면 이쪽이 옳다
scripts/build_submit_pdfs.sh  PDF 2종 생성 (브라우저 인쇄 쓰지 말 것 — 깨진다)
```

**PDF 재생성은 `bash scripts/build_submit_pdfs.sh` 로만 한다.** 피치덱은 슬라이드가
한 번에 하나씩 보이는 구조라 브라우저 인쇄로 만들면 우측 열 글자가 세로로 쌓인다.
이 스크립트는 20장을 1600×900 으로 캡처해 조립한다.
