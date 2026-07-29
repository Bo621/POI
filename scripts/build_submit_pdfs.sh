#!/usr/bin/env bash
# 제출용 PDF 2종을 만든다.
#
# **브라우저 인쇄를 쓰지 않는 이유**: 피치덱 슬라이드는 position:absolute 로
# 한 번에 하나씩 표시된다. 인쇄 CSS 로 전부 펼치면 폭이 좁아져 우측 열 글자가
# 한 자씩 세로로 쌓이고, 넘친 내용이 다음 쪽에 잔여물로 남는다.
# 그래서 14 장을 1600x900 으로 캡처해 조립한다 — 화면과 동일하다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHOT=/tmp/poi-slides
rm -rf "$SHOT" && mkdir -p "$SHOT"

cd "${ROOT}/web"
cat > ._pdf.mjs <<'EOF'
import {chromium} from '@playwright/test';
const b = await chromium.launch();

// 1) 피치덱 — 슬라이드마다 캡처
const p = await b.newPage({viewport:{width:1600,height:900}, deviceScaleFactor:2});
await p.goto('file://'+process.env.ROOT+'/docs/submission/pitch/index.html',{waitUntil:'networkidle'});
const n = await p.locator('.slide').count();
const shots = [];
for (let i=0;i<n;i++){
  await p.evaluate((idx)=>{
    const s=[...document.querySelectorAll('.slide')];
    s.forEach(el=>el.removeAttribute('data-on'));
    s[idx].setAttribute('data-on','');
    document.querySelectorAll('.bar,.nav,.prog').forEach(el=>el.style.display='none');
  }, i);
  await p.waitForTimeout(700);
  const f = `/tmp/poi-slides/${String(i+1).padStart(2,'0')}.png`;
  await p.screenshot({path:f}); shots.push(f);
}
console.log('슬라이드', n);
await b.close();
EOF
ROOT="$ROOT" node ._pdf.mjs
rm -f ._pdf.mjs

python3 - "$ROOT" <<'PY'
import base64,glob,sys
root=sys.argv[1]
imgs=sorted(glob.glob('/tmp/poi-slides/*.png'))
pages=''.join(f'<div class=p><img src="data:image/png;base64,{base64.b64encode(open(f,"rb").read()).decode()}"></div>' for f in imgs)
open('/tmp/poi-deck.html','w').write('''<!doctype html><meta charset=utf-8><style>
@page{size:1600px 900px;margin:0}html,body{margin:0;background:#0d0d0c}
.p{width:1600px;height:900px;overflow:hidden;break-after:page;page-break-after:always}
.p:last-child{break-after:auto;page-break-after:auto}
img{width:1600px;height:900px;display:block}</style>'''+pages)
PY

cat > ._mk.mjs <<'EOF'
import {chromium} from '@playwright/test';
const b=await chromium.launch(); const p=await b.newPage();
await p.goto('file:///tmp/poi-deck.html',{waitUntil:'networkidle'});
await p.pdf({path:process.env.ROOT+'/docs/submission/pitch/POI_pitch.pdf',printBackground:true,preferCSSPageSize:true});
await b.close(); console.log('피치덱 PDF 완료');
EOF
ROOT="$ROOT" node ._mk.mjs
rm -f ._mk.mjs

# 2) 팀 소개 — 마크다운을 그대로 변환
python3 "${ROOT}/scripts/md_to_html.py" "${ROOT}/docs/submission/TEAM.md" /tmp/poi-team.html
cat > ._t.mjs <<'EOF'
import {chromium} from '@playwright/test';
const b=await chromium.launch(); const p=await b.newPage();
await p.goto('file:///tmp/poi-team.html',{waitUntil:'networkidle'});
await p.pdf({path:process.env.ROOT+'/docs/submission/POI_team.pdf',printBackground:true,preferCSSPageSize:true});
await b.close(); console.log('팀 소개 PDF 완료');
EOF
ROOT="$ROOT" node ._t.mjs
rm -f ._t.mjs
echo "완료 — docs/submission/pitch/POI_pitch.pdf · docs/submission/POI_team.pdf"
