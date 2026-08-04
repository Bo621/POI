#!/usr/bin/env python3
"""
Hyperliquid 실행 정합성 — 실측 검증기

「③ 한 것」 칸을 온체인 DEX 로 채울 수 있는지 문서가 아니라 응답으로 확인한다.
2026-08-04 실행 결과는 docs/plans/CHAIN-AND-EXCHANGE.md 에 있다.

  python3 scripts/hyperliquid-probe.py [지갑주소]

인증 없음 — API 키도 서명도 쿠키도 보내지 않는다. 그게 요점이다.
"""
import sys
import json,urllib.request,hashlib,time
A = sys.argv[1] if len(sys.argv)>1 else "0x0f1d65079fc986b8560318e7ebb26cd8d06c3869"
def call(body):
    r=urllib.request.Request("https://api.hyperliquid.xyz/info",
        data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(r,timeout=25))

now=int(time.time()*1000); st=now-6*3600*1000
f=call({"type":"userFillsByTime","user":A,"startTime":st,"endTime":now})
print(f"구간 6시간 · 체결 {len(f)}건")
print("dir 값 분포:", {d: sum(1 for x in f if x.get('dir')==d) for d in sorted({x.get('dir') for x in f})})

# ── POI 술어 판정: 「이 구간에 BTC 롱 포지션을 열었다」
coin="BTC"
sel=[x for x in f if x["coin"]==coin]
opens=[x for x in sel if x.get("dir")=="Open Long"]
qty=sum(float(x["sz"]) for x in opens)
vwap=(sum(float(x["px"])*float(x["sz"]) for x in opens)/qty) if qty else 0
print(f"\n술어  「{coin} 롱을 열었다」")
print(f"  판정 {'맞음' if opens else '틀림'} — Open Long {len(opens)}건 · 수량 {qty:.5f} · VWAP {vwap:,.1f}")

# ── 온체인에 올릴 요약 (원장 전체가 아니라 요약의 해시)
digest={"venue":"hyperliquid","wallet":A,"coin":coin,
        "window":[st,now],"dir":"Open Long","fills":len(opens),
        "qty":round(qty,8),"vwap":round(vwap,4)}
canon=json.dumps(digest,sort_keys=True,separators=(",",":"))
print(f"\n요약 해시  0x{hashlib.sha256(canon.encode()).hexdigest()}")
print(f"  올리는 것   방향·건수·수량·VWAP·구간  ({len(canon)}바이트)")
print(f"  안 올리는 것 개별 체결 {len(sel)}건 · 잔고 · 손익")

# ── 재현성: 제3자가 같은 값을 얻는가
g=call({"type":"userFillsByTime","user":A,"startTime":st,"endTime":now})
same=[x for x in g if x["coin"]==coin and x.get("dir")=="Open Long"]
q2=sum(float(x["sz"]) for x in same)
print(f"\n재현  2차 호출 Open Long {len(same)}건 · 수량 {q2:.5f}  →  {'✅ 동일' if (len(same),round(q2,8))==(len(opens),round(qty,8)) else '❌ 불일치'}")
