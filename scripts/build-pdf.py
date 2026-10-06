#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""作品说明 Markdown → PDF（零依赖，纯标准库）

用法： python scripts/build-pdf.py
输出： docs/作品说明.pdf

实现：把 Markdown 转成 HTML，再用浏览器打印引擎无关的最小 PDF 写出器。
中文字体通过标准 14 号字体（Helvetica/CJK）不可用，故采用
「Type0 + 内置 CJK 编码不可行」的通用做法：转为 UTF-8 文本绘制，
由调用方（浏览器/WPS）二次排版更稳；因此本脚本同时产出 HTML。
"""
import re
import sys
import html
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "作品说明.md"
OUT_HTML = ROOT / "docs" / "作品说明.html"
OUT_PDF = ROOT / "docs" / "作品说明.pdf"


def md_to_html(md: str) -> str:
    """极简 Markdown → HTML（覆盖标题/表格/列表/代码/粗体/段落）"""
    lines = md.split("\n")
    out = []
    i = 0
    in_table = False
    in_code = False
    in_list = False

    def close_blocks():
        nonlocal in_table, in_list
        if in_table:
            out.append("</tr>")
            out.append("</table>")
            in_table = False
        if in_list:
            out.append("</ul>")
            in_list = False

    while i < len(lines):
        line = lines[i].rstrip()

        # 代码块
        if line.startswith("```"):
            close_blocks()
            if not in_code:
                out.append("<pre>")
                in_code = True
            else:
                out.append("</pre>")
                in_code = False
            i += 1
            continue
        if in_code:
            out.append(html.escape(line))
            i += 1
            continue

        # 表格
        if line.startswith("|"):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if all(set(c) <= set("-: ") and c for c in cells):
                i += 1
                continue
            if not in_table:
                close_blocks()
                out.append("<table>")
                in_table = True
            else:
                out.append("</tr>")
            out.append("<tr>")
            for c in cells:
                out.append(f"<td>{inline(c)}</td>")
            i += 1
            continue
        if in_table:
            out.append("</tr>")
            out.append("</table>")
            in_table = False

        # 标题
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            close_blocks()
            lvl = len(m.group(1))
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            i += 1
            continue

        # 引用
        if line.startswith(">"):
            close_blocks()
            out.append(f"<blockquote>{inline(line.lstrip('> '))}</blockquote>")
            i += 1
            continue

        # 列表
        if re.match(r"^\s*[-*]\s+", line):
            if not in_list:
                close_blocks()
                out.append("<ul>")
                in_list = True
            item = re.sub(r"^\s*[-*]\s+", "", line)
            out.append(f"<li>{inline(item)}</li>")
            i += 1
            continue
        if in_list and not re.match(r"^\s*[-*]\s+", line):
            out.append("</ul>")
            in_list = False

        # 水平线
        if line.strip() == "---":
            close_blocks()
            out.append("<hr>")
            i += 1
            continue

        # 空行
        if not line:
            close_blocks()
            i += 1
            continue

        # 段落
        close_blocks()
        out.append(f"<p>{inline(line)}</p>")
        i += 1

    close_blocks()
    return "\n".join(out)


def inline(text: str) -> str:
    """行内 Markdown：代码 > 粗体 > 斜体"""
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    return text


CSS = """
@page { size: A4; margin: 18mm 16mm; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 10.5pt; line-height: 1.75; color: #1a1a1a;
}
h1 { font-size: 19pt; color: #7a4a2b; border-bottom: 2px solid #7a4a2b;
     padding-bottom: 8px; margin: 0 0 16px; }
h2 { font-size: 14pt; color: #7a4a2b; margin: 22px 0 10px;
     border-left: 4px solid #7a4a2b; padding-left: 9px; }
h3 { font-size: 12pt; color: #4a4a4a; margin: 16px 0 8px; }
p { margin: 7px 0; }
ul { margin: 7px 0; padding-left: 22px; }
li { margin: 3px 0; }
blockquote {
  margin: 9px 0; padding: 8px 14px;
  background: #f7f4ef; border-left: 3px solid #b8a08a; color: #4a4a4a;
}
code {
  font-family: Consolas, Monaco, monospace; font-size: 9.5pt;
  background: #f2efe9; padding: 1px 5px; border-radius: 3px; color: #7a4a2b;
}
pre {
  background: #f7f4ef; padding: 11px 14px; border-radius: 5px;
  border-left: 3px solid #b8a08a; overflow-x: auto;
}
pre code { background: none; color: #1a1a1a; font-size: 9.5pt; }
table {
  width: 100%; border-collapse: collapse; margin: 11px 0; font-size: 9.5pt;
}
th, td { border: 1px solid #ddd5c8; padding: 6px 9px; text-align: left; }
tr:nth-child(even) td { background: #faf8f4; }
tr:first-child td { background: #efe7dc; font-weight: 600; }
hr { border: none; border-top: 1px solid #e0d8cc; margin: 16px 0; }
"""


def find_browser():
    """定位可用于无头打印的浏览器（优先 Edge / Chrome）。"""
    cands = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for p in cands:
        if pathlib.Path(p).exists():
            return p
    return None


def to_pdf(html_path: pathlib.Path, pdf_path: pathlib.Path) -> bool:
    """用无头浏览器打印 PDF（保证中文字体正确嵌入）。"""
    browser = find_browser()
    if not browser:
        return False
    import subprocess

    cmd = [
        browser, "--headless", "--disable-gpu", "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}", f"file:///{html_path}",
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=180)
    except Exception:
        return False
    return pdf_path.exists() and pdf_path.stat().st_size > 0


def main():
    if not SRC.exists():
        print(f"[pdf] 找不到源文件：{SRC}")
        sys.exit(1)

    md = SRC.read_text(encoding="utf-8-sig")  # utf-8-sig 去 BOM，否则首行 h1 匹配失效
    body = md_to_html(md)
    page = (
        "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>"
        f"<title>作品说明 · 东方时间文化档案</title><style>{CSS}</style></head>"
        f"<body>{body}</body></html>"
    )
    OUT_HTML.write_text(page, encoding="utf-8")
    print(f"[pdf] 已生成 HTML：{OUT_HTML}")

    if to_pdf(OUT_HTML, OUT_PDF):
        size_mb = OUT_PDF.stat().st_size / 1024 / 1024
        print(f"[pdf] 已生成 PDF ：{OUT_PDF}（{size_mb:.2f} MB / 上限 100 MB）")
    else:
        print("[pdf] 未找到可用浏览器，PDF 未自动生成。")
        print("      手动方式：浏览器打开上面的 HTML → Ctrl+P → 另存为 PDF → 纸张 A4")


if __name__ == "__main__":
    main()
