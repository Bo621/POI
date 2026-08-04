#!/usr/bin/env python3
"""
HL_PERP_OPEN_LONG_QTY — 관측값 산출기

지표 정의 문서: docs/metrics/HL_PERP_OPEN_LONG_QTY.md
그 문서가 규범이고 이 코드는 거기에 맞춘다. 어긋나면 코드가 틀린 것이다.

  python3 scripts/hl-observe.py <wallet> <coin> <windowStart> <windowEnd>

  windowStart/End 는 초 단위 UNIX 시각 (온체인 결정과 같은 단위).

인증하지 않는다 — API 키도 서명도 쿠키도 보내지 않는다. 그래서 제3자가 같은
명령으로 같은 값을 다시 구할 수 있다.

값을 만들지 못하는 경우에는 0 을 내지 않고 **중단한다.** 조회 실패와
「체결이 없음」은 다른 사실이다 (문서 §5).
"""
import json
import sys
import urllib.request
from decimal import Decimal, ROUND_HALF_UP

API = "https://api.hyperliquid.xyz/info"
DECIMALS = 8
OPEN_LONG = "Open Long"
PAGE_CAP = 2000          # 문서 §1 — 한 응답당 최대 건수. 도달하면 잘렸을 수 있다
SCALE = Decimal(10) ** DECIMALS


def call(body):
    req = urllib.request.Request(
        API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch(wallet, start_ms, end_ms):
    fills = call({
        "type": "userFillsByTime",
        "user": wallet,
        "startTime": start_ms,
        "endTime": end_ms,
        "aggregateByTime": False,      # 문서 §3 — 원본 체결 단위를 유지한다
    })
    if not isinstance(fills, list):
        raise SystemExit(f"중단: 예상과 다른 응답 — {str(fills)[:200]}")
    if len(fills) >= PAGE_CAP:
        # 문서 §4 — 잘렸을 수 있으면 합계의 완전성을 보장할 수 없다.
        raise SystemExit(
            f"중단: 응답이 {len(fills)}건으로 상한에 닿았습니다. "
            "구간을 더 잘게 나눠 조회해야 합니다 (문서 §4)."
        )
    return fills


def observe(wallet, coin, start_s, end_s):
    start_ms, end_ms = start_s * 1000, end_s * 1000
    fills = fetch(wallet, start_ms, end_ms)

    # 문서 §2 — 양 끝을 포함하는 닫힌 구간
    sel = [
        f for f in fills
        if start_ms <= f["time"] <= end_ms
        and f.get("coin") == coin
        and f.get("dir") == OPEN_LONG
    ]

    # 문서 §6 — 각 체결을 반올림하지 않는다. 정확한 10진 합계를 먼저 구하고
    # 마지막에 한 번만 스케일링·반올림한다. 부동소수를 거치지 않는다.
    raw = sum((Decimal(f["sz"]) for f in sel), Decimal(0))
    value = int((raw * SCALE).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    return value, raw, sel, len(fills)


def snapshot_hash(sel):
    """문서 §7 — 계산에 실제로 쓴 체결의 정규 직렬화와 그 해시."""
    rows = sorted(
        ([f["time"], f["coin"], f["dir"], str(Decimal(f["sz"]).normalize()),
          f.get("hash", ""), f.get("oid", 0), f.get("tid", 0)] for f in sel),
        key=lambda r: (r[0], r[6], r[5], r[4]),
    )
    canon = json.dumps(rows, separators=(",", ":"), ensure_ascii=False)
    try:
        from eth_hash.auto import keccak
        return "0x" + keccak(canon.encode()).hex(), canon
    except ImportError:
        import hashlib
        return "sha256:" + hashlib.sha256(canon.encode()).hexdigest(), canon


def main():
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    wallet, coin = sys.argv[1], sys.argv[2]
    start_s, end_s = int(sys.argv[3]), int(sys.argv[4])

    value, raw, sel, seen = observe(wallet, coin, start_s, end_s)
    print(f"지갑      {wallet}")
    print(f"종목      {coin}")
    print(f"구간      {start_s} ~ {end_s}  (초 · 양 끝 포함)")
    print(f"조회      체결 {seen}건 · 그중 롱 진입 {len(sel)}건")
    for f in sel:
        print(f"           {f['time']}  sz={f['sz']}")

    h, canon = snapshot_hash(sel)
    print(f"근거 해시  {h}")
    print(f"           직렬화 {len(canon)}바이트")

    again, _, _, _ = observe(wallet, coin, start_s, end_s)
    print(f"재현      2차 호출 {'일치' if again == value else '불일치 ❌'}")

    print(f"\n합계      {raw} qty")
    print(f"관측값(decimals {DECIMALS})")
    print(value)


if __name__ == "__main__":
    main()
