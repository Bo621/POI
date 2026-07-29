# 제출본 — 얼린 버전만 여기에 둔다

> **이 폴더는 출력물이다.** 원본은 `docs/submission/*.md` 다.
> 여기 있는 파일은 **고치지 않는다** — 고쳐야 하면 원본을 고치고 새 버전을 만든다.

## 최신 = `latest`

```
submit/
  latest → v1.0_2026-07-29        ← 심볼릭 링크. 항상 최신을 가리킨다
  v1.0_2026-07-29/                ← 실제 파일
```

**업로드할 때는 `latest/` 안의 것만 쓴다.** 폴더 이름과 파일 이름에 버전·날짜가
박혀 있어서, 드라이브에 올린 뒤에도 어느 버전인지 파일명만 보면 안다.

## 버전 목록

| 버전 | 날짜 | 무엇이 바뀌었나 |
|---|---|---|
| `v1.0_2026-07-29` | 2026-07-29 | 최초. 하드닝 재배포(I18·I19) 후 · 비용 실측 교체 · 컨트랙트 4종 재검증 |

## 새 버전 만드는 법

```bash
V=v1.1_$(date +%F)
mkdir -p submit/$V
# 1. 원본을 고친다 (docs/submission/*.md)
# 2. PDF 를 다시 만든다 — 아래 「PDF 재생성」 참고
# 3. 복사하고 체크섬
cp docs/submission/pitch/POI_pitch.pdf  submit/$V/POI_pitchdeck_${V}.pdf
cp docs/submission/POI_team.pdf         submit/$V/POI_team_${V}.pdf
(cd submit/$V && shasum -a 256 * > SHA256SUMS.txt)
ln -sfn $V submit/latest
```

## 무결성 확인

```bash
cd submit/latest && shasum -a 256 -c SHA256SUMS.txt
```

드라이브에 올린 파일이 이 폴더의 것과 같은지 의심되면 내려받아 같은 명령으로 대조한다.

## PDF 재생성 — 브라우저 인쇄를 쓰지 말 것

피치덱은 슬라이드가 `position:absolute` 로 **한 번에 하나씩** 표시되는 구조다.
그대로 인쇄하면 폭이 좁아져 **우측 열 글자가 한 자씩 세로로 쌓이고**,
넘친 내용이 다음 쪽에 잔여물로 남는다. 실제로 그렇게 나왔다.

14 장을 1600×900 으로 캡처해 조립하는 방식을 쓴다 —
절차는 [../docs/submission/CHECKLIST.md](../docs/submission/CHECKLIST.md) 에 있다.
