#!/usr/bin/env python3
"""마크다운을 인쇄용 HTML 로 바꾼다. 제출용 PDF 에 필요한 만큼만 지원한다 —
표·코드펜스·헤딩·인용·목록·굵게·인라인코드·링크. 범용 파서가 아니다."""
import re, sys

def convert(src: str) -> str:
    i = src.find('\n---\n')
    if src.startswith('# 팀 소개') and i > 0:
        src = src[i + 5:]          # 작업 지시용 머리말은 제출본에서 뺀다
    lines = src.split('\n'); out = []; i = 0; intable = False

    def close_table():
        nonlocal intable
        if intable:
            out.append('</table>'); intable = False

    while i < len(lines):
        l = lines[i].rstrip()
        if l.startswith('```'):
            close_table(); i += 1; buf = []
            while i < len(lines) and not lines[i].startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            out.append('<pre>' + '\n'.join(buf).replace('&', '&amp;').replace('<', '&lt;') + '</pre>')
            continue
        if l.startswith('|') and l.count('-') and set(l.replace('|', '').replace(' ', '').replace(':', '')) <= {'-'}:
            i += 1; continue                      # 표 구분선
        if l.startswith('|'):
            cells = [c.strip() for c in l.strip('|').split('|')]
            if not any(cells):
                i += 1; continue
            if not intable:
                out.append('<table>'); intable = True
            out.append('<tr>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>'); i += 1; continue
        close_table()
        if l.startswith('### '):   out.append(f'<h3>{l[4:]}</h3>')
        elif l.startswith('## '):  out.append(f'<h2>{l[3:]}</h2>')
        elif l.startswith('# '):   out.append(f'<h1>{l[2:]}</h1>')
        elif l.startswith('> '):   out.append(f'<blockquote>{l[2:]}</blockquote>')
        elif l.startswith('- '):   out.append(f'<li>{l[2:]}</li>')
        elif l.strip() == '---':   out.append('<hr>')
        elif not l.strip():        pass
        else:
            buf = [l]; i += 1      # 이어지는 줄은 한 문단으로 합친다
            while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||>|-\s|```|---)', lines[i]):
                buf.append(lines[i].rstrip()); i += 1
            out.append('<p>' + ' '.join(buf) + '</p>'); continue
        i += 1
    close_table()
    body = '\n'.join(out)
    body = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', body)
    body = re.sub(r'`([^`]+)`', r'<code>\1</code>', body)
    body = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', body)
    return body

CSS = '''@page{size:210mm 297mm;margin:18mm 16mm}
body{font-family:"Pretendard","Apple SD Gothic Neo",-apple-system,sans-serif;color:#17171a;line-height:1.65;font-size:10pt}
h1{font-size:19pt;margin:0 0 .5em;letter-spacing:-.02em}
h2{font-size:12.5pt;margin:1.5em 0 .5em;padding-top:.45em;border-top:2px solid #17171a}
h3{font-size:10.5pt;margin:1.1em 0 .3em;color:#c0392b}
p{margin:.45em 0}
table{width:100%;border-collapse:collapse;margin:.6em 0 1.1em}
td{padding:.4em .6em;border-bottom:1px solid #e3e3e6;vertical-align:top}
tr td:first-child{width:27%;font-weight:600;color:#3a3a3d}
blockquote{margin:.7em 0;padding:.55em .9em;background:#f6f6f7;border-left:3px solid #c0392b;font-size:9pt}
pre{background:#f4f4f5;padding:.7em .9em;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:8.6pt;line-height:1.5;white-space:pre-wrap;border-left:3px solid #d0d0d3}
code{font-family:ui-monospace,Menlo,monospace;font-size:9pt;background:#f2f2f3;padding:.08em .3em;border-radius:3px}
li{margin:.15em 0}
hr{border:none;border-top:1px solid #ddd;margin:1.4em 0}
a{color:#c0392b}'''

if __name__ == '__main__':
    src_path, out_path = sys.argv[1], sys.argv[2]
    body = convert(open(src_path).read())
    open(out_path, 'w').write(f'<!doctype html><meta charset=utf-8><style>{CSS}</style>{body}')
    print(f'{out_path} 작성')
