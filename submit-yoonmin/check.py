#!/usr/bin/env python3
"""
제출 준비 검사 — 눈으로 보지 않고 기계로 확인한다.

  python3 submit-yoonmin/check.py

공고 요건과 파일 정합성을 함께 본다. 하나라도 걸리면 종료코드 1.
"""
import hashlib
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUB = os.path.join(ROOT, "submit-yoonmin")
LATEST = os.path.realpath(os.path.join(SUB, "latest"))
PRIVATE = os.path.join(SUB, "PRIVATE_폼입력값.txt")

# 지원서 구성 — 절별 문항 수
SECTIONS = [(1, 3), (2, 6), (3, 5), (4, 3), (5, 5), (6, 2)]
# 붙여넣기가 아니라 선택·첨부로 답하는 문항
CHOICE = {"1-3", "3-3", "5-1"}
ATTACH = {"6-1", "6-2"}

fails = []


def chk(cond, msg, detail=""):
    print(f"  {'✅' if cond else '❌'} {msg}" + (f"  — {detail}" if detail else ""))
    if not cond:
        fails.append(msg)


def main():
    print(f"제출본  {os.path.basename(LATEST)}\n")

    pdfs = [f for f in os.listdir(LATEST) if f.endswith(".pdf")]
    chk(len(pdfs) == 1, "사업계획서 PDF 1개", pdfs[0] if pdfs else "없음")
    if not pdfs:
        return 1
    pdf = os.path.join(LATEST, pdfs[0])
    ft_path = os.path.join(LATEST, "FORM_TEXT.txt")
    chk(os.path.exists(ft_path), "FORM_TEXT.txt")
    chk(os.path.exists(PRIVATE), "PRIVATE_폼입력값.txt (개인정보 · 커밋 안 됨)")

    # 공고 요건 — 25장 내외 · PDF · 50MB
    raw = open(pdf, "rb").read()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", raw))
    mb = len(raw) / 1048576
    chk(raw[:5] == b"%PDF-", "PDF 헤더 유효")
    chk(20 <= pages <= 30, f"쪽수 {pages}", "공고 「25장 내외」")
    chk(mb < 50, f"용량 {mb:.1f}MB", "상한 50MB")

    ft = open(ft_path, encoding="utf-8").read()
    pv = open(PRIVATE, encoding="utf-8").read() if os.path.exists(PRIVATE) else ""

    # FORM_TEXT 안의 용량 표기가 실제와 맞는가 — 갱신을 잊기 쉬운 자리다
    m = re.search(r"\((\d+)쪽 · ([\d.]+)MB\)", ft)
    chk(bool(m) and int(m.group(1)) == pages and abs(float(m.group(2)) - mb) < 0.1,
        "6-1 첨부 표기가 실제 파일과 일치",
        f"표기 {m.group(0) if m else '없음'} · 실제 {pages}쪽 {mb:.1f}MB")

    # 체크섬
    for line in open(os.path.join(LATEST, "SHA256SUMS.txt")).read().strip().split("\n"):
        h, name = line.split("  ", 1)
        if name.strip() == "SHA256SUMS.txt":
            continue  # 자기 자신은 해싱할 수 없다
        real = hashlib.sha256(open(os.path.join(LATEST, name.strip()), "rb").read()).hexdigest()
        chk(real == h, f"체크섬 {name.strip()[:38]}")

    # 문항 구성
    ids = re.findall(r"^\[(\d-\d)\]", ft, re.M)
    expected = [f"{s}-{i}" for s, c in SECTIONS for i in range(1, c + 1)]
    chk(set(ids) == set(expected), f"문항 {len(ids)}개 · 번호 누락 없음",
        f"빠짐 {sorted(set(expected) - set(ids))}" if set(expected) - set(ids) else "")

    # 필수 문항이 실제로 답을 갖는가
    blank = []
    for q in re.findall(r"^\[(\d-\d)\][^\n]*\*필수\*", ft, re.M):
        i = ft.index(f"[{q}]")
        nxt = ft.find("\n[", i + 1)
        blk = ft[i: nxt if nxt > 0 else len(ft)]
        if q in CHOICE:
            filled = "[v]" in blk
        elif q in ATTACH:
            filled = "첨부:" in blk and ".pdf" in blk
        else:
            filled = "여기부터 붙여넣기" in blk or f"[{q}]" in pv
        if not filled:
            blank.append(q)
    chk(not blank, "필수 문항 전부 답 있음", f"빠짐 {blank}" if blank else "")

    # 남은 미확인 표시가 없는가
    left = re.findall(r"⚠️ 확인[^\n]*", ft) + re.findall(r"⚠️ 확인[^\n]*", pv)
    chk(not left, "미확인(⚠️ 확인) 항목 없음", f"{len(left)}건" if left else "")

    # 공고가 요구한 사업계획서 필수 포함 항목
    deck = re.sub(r"<[^>]+>", " ", open(os.path.join(SUB, "source/deck.html"), encoding="utf-8").read())
    for label, needles in [("문제 및 솔루션", ["문제", "해법"]), ("비즈니스모델", ["비즈니스 모델"]),
                           ("강점", ["차별점"]), ("경쟁업체", ["경쟁 지형"])]:
        chk(all(n in deck for n in needles), f"공고 필수항목 「{label}」")

    # 개인정보가 공개 파일·git 에 새어 나가지 않았는가
    secrets = [w for w in ["9042", "850621", "116,899,876"] if w in ft]
    chk(not secrets, "FORM_TEXT 에 개인정보 없음", f"발견 {secrets}" if secrets else "")
    tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout
    chk("PRIVATE" not in tracked, "PRIVATE 파일이 git 에 추적되지 않음")

    print(f"\n{'✅ 제출 가능' if not fails else '❌ ' + str(len(fails)) + '건 막힘'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
