#!/usr/bin/env python3
"""Generate duizhao/*.html from duizhao/pairs.json. Edit the JSON, then rerun."""

from __future__ import annotations

import html as htmlmod
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "duizhao" / "pairs.json"
HUB_DATA = ROOT / "duizhao" / "huberman-pairs.json"
CATALOG = ROOT / "huberman" / "catalog.json"
SITE = "纳瓦尔、Dan Koe 与 Huberman"
OUT_DIR = ROOT / "duizhao"
CSS_V = "duizhao-20261127-h"
APP_V = "zoom-20261123"
NOTES_V = "2"


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def classic_text(slug: str, pid: str) -> str:
    text = (ROOT / "classic" / f"{slug}.html").read_text()
    m = re.search(
        rf'<(p|h2|h3|li|blockquote)([^>]*id="{re.escape(pid)}"[^>]*)>(.*?)</\1>',
        text,
        re.S,
    )
    if not m:
        die(f"missing classic {slug} #{pid}")
    body = m.group(3)
    enm = re.search(r'<div class="en-p"', body)
    if enm:
        body = body[: enm.start()]
    return htmlmod.unescape(re.sub(r"<[^>]+>", "", body)).strip()


def verify(data: dict) -> None:
    for pair in data["pairs"]:
        for side in ("naval", "dankoe"):
            src = pair[side]
            slug, pids, zh = src["slug"], src["pids"], src["zh"]
            combined = "\n".join(classic_text(slug, pid) for pid in pids)
            # Allow a continuous excerpt of a single paragraph.
            if len(pids) == 1:
                if zh not in combined:
                    die(f"quote mismatch {slug} #{pids[0]}\nWANT: {zh}\nHAVE: {combined}")
            else:
                if zh != combined:
                    die(
                        f"multi-pid quote mismatch {slug} {pids}\nWANT: {zh}\nHAVE: {combined}"
                    )


def esc(s: str) -> str:
    return htmlmod.escape(s, quote=True)

TITLE_TAILS = ("星期二", "收窄", "哪练", "工作", "上路", "脑子", "不在", "最好走的", "挨饿")

def title_html(s: str) -> str:
    for tail in TITLE_TAILS:
        if s.endswith(tail) and len(s) > len(tail):
            return esc(s[:-len(tail)]) + f'<span class="nw">{esc(tail)}</span>'
    return esc(s)


def nl2br(s: str) -> str:
    return "<br>".join(esc(line) for line in s.split("\n"))


def nav(root: str) -> str:
    i = f"{root}index.html"
    return (
        f'<header class="top"><a class="brand" href="{i}">'
        f'<span class="bn">纳瓦尔、Dan Koe 与 </span><b>Huberman</b></a>'
        f'<nav class="tnav">'
        f'<a href="{i}#naval">纳瓦尔</a>'
        f'<a href="{i}#dankoe">Dan Koe</a>'
        f'<a href="{root}huberman/index.html">Huberman</a>'
        f'<a href="{root}duizhao/index.html" aria-current="page">对照</a>'
        f'<a href="{root}glossary.html">概念词典</a>'
        f'<a href="{root}notes.html">我的笔记</a>'
        f'<button id="theme" aria-label="切换明暗">◐</button>'
        f"</nav></header>"
    )


def head(title: str, root: str) -> str:
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · {esc(SITE)}</title>
<link rel="stylesheet" href="{root}fonts/fonts.css"><link rel="stylesheet" href="{root}style.css?v=huberman-20261127-nav"><link rel="stylesheet" href="{root}duizhao/duizhao.css?v={CSS_V}"><link rel="stylesheet" href="{root}notes.css?v={NOTES_V}"><link rel="manifest" href="{root}manifest.json"><meta name="theme-color" content="#a84b2a">
<script>try{{document.documentElement.dataset.theme=localStorage.getItem('dk:theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.style.setProperty('--fs',(localStorage.getItem('dk:fs')||18.5)+'px')}}catch(e){{}}</script></head>"""


def foot(root: str) -> str:
    return (
        f'<footer class="foot">{SITE} · 中文译本仅供个人学习 · 对照为编者整理，原文一句不改 · Huberman 一侧仅链到官网</footer>'
        f'<script src="{root}notes-core.js?v={NOTES_V}"></script>'
        f'<script src="{root}notes-ui.js?v={NOTES_V}"></script>'
        f'<script src="{root}app.js?v={APP_V}"></script>'
        f"</body></html>"
    )


def quote_block(src: dict, side: str) -> str:
    label = "纳瓦尔" if side == "naval" else "Dan Koe"
    kicker = "先把你打醒" if side == "naval" else "已经走在前面"
    pids = "、".join(src["pids"])
    en = ""
    if src.get("en"):
        en = f'<p class="dz-en" lang="en">{nl2br(src["en"])}</p>'
    return f"""<figure class="dz-quote" data-side="{side}">
<p class="dz-who"><span>{esc(label)}</span><small>{esc(kicker)}</small></p>
<blockquote>
<p class="dz-zh">{nl2br(src["zh"])}</p>
{en}
</blockquote>
<figcaption>——《{esc(src["work"])}》 · <a href="{esc(src["href"])}">阅读原段落 {esc(pids)} ↗</a></figcaption>
</figure>"""


def pair_page(data: dict, index: int) -> str:
    pairs = data["pairs"]
    pair = pairs[index]
    prev = pairs[index - 1] if index else None
    nxt = pairs[index + 1] if index + 1 < len(pairs) else None
    qs = "".join(f"<li>{esc(q)}</li>" for q in pair["questions"])
    further = "".join(
        f'<li><a href="{esc(item["href"])}">{esc(item["label"])} ↗</a>'
        f'<small>《{esc(item["work"])}》 · {esc(item["hash"])}</small></li>'
        for item in pair["further"]
    )
    nav_links = ['<a href="index.html">全部对照</a>']
    if prev:
        nav_links.append(f'<a href="{prev["id"]}.html">上一组：{title_html(prev["title"])}</a>')
    if nxt:
        nav_links.append(f'<a href="{nxt["id"]}.html">下一组：{title_html(nxt["title"])}</a>')
    return f"""{head(pair["title"], "../")}
<body data-page="duizhao" data-root="../" class="dz-body">
<div id="progress"></div>
{nav("../")}
<main class="dz-main">
<p class="dz-kicker">对照 · {index + 1} / {len(pairs)} · {esc(pair["kind"])}</p>
<h1>{title_html(pair["title"])}</h1>
<p class="dz-dek">{esc(pair["dek"])}</p>
<div class="dz-pair">
{quote_block(pair["naval"], "naval")}
{quote_block(pair["dankoe"], "dankoe")}
</div>
<aside class="dz-editor" aria-label="编者按">
<p class="dz-editor-label">编者</p>
<p>{esc(pair["editor"])}</p>
</aside>
<section class="dz-q" aria-labelledby="q-h">
<h2 id="q-h">先问自己</h2>
<ol>{qs}</ol>
</section>
<section class="dz-more" aria-labelledby="more-h">
<h2 id="more-h">读完可以再往下看</h2>
<p class="dz-more-note">不是第二组对照，只是同篇里口径相近的原段落。</p>
<ul>{further}</ul>
</section>
<nav class="dz-pager">{"".join(nav_links)}</nav>
</main>
{foot("../")}
"""


def index_list(pairs: list, start: int = 1) -> str:
    items = []
    for i, pair in enumerate(pairs, start):
        if "naval" in pair and "dankoe" in pair:
            small = f'{esc(pair["naval"]["work"])} · {esc(pair["naval"]["hash"])} × {esc(pair["dankoe"]["work"])} · {esc(pair["dankoe"]["hash"])}'
        else:
            works = [esc(s["work"]) + " · " + esc(s["hash"]) for s in pair.get("sides") or []]
            works.append(esc(pair["huberman"]["title"]))
            small = " × ".join(works)
        items.append(
            f"""<li>
<a href="{pair["id"]}.html">
<span class="dz-n">{i:02d}</span>
<span class="dz-item-body">
<strong>{title_html(pair["title"])}</strong>
<em>{esc(pair["kind"])}</em>
<span>{esc(pair["dek"])}</span>
<small>{small}</small>
</span>
</a>
</li>"""
        )
    return "".join(items)


def index_page(data: dict, hub: dict | None = None) -> str:
    meta = data["meta"]
    hub_section = ""
    if hub:
        hmeta = hub["meta"]
        hub_section = f"""
<section class="dz-path" id="huberman" aria-labelledby="hub-h">
<h2 id="hub-h">{esc(hmeta["section_title"])}</h2>
<p>{esc(hmeta["section_dek"])}</p>
<p class="dz-hub-copy">Huberman Lab 相关内容版权归 Scicomm Media LLC 所有。本站未获授权，只提供官网目录和链接。</p>
<ol class="dz-list">
{index_list(hub["pairs"], 1)}
</ol>
</section>"""
    return f"""{head("对照", "../")}
<body data-page="duizhao" data-root="../" class="dz-body">
<div id="progress"></div>
{nav("../")}
<main class="dz-main dz-index">
<p class="dz-kicker">{esc(meta["eyebrow"])}</p>
<h1>{esc(meta["title"])}</h1>
<p class="dz-lead">{esc(meta["lead"])}</p>
<p class="dz-note">{esc(meta["note"])}</p>
<section class="dz-path" aria-labelledby="path-h">
<h2 id="path-h">{esc(meta["path_title"])}</h2>
<p>{esc(meta["path_dek"])}</p>
<ol class="dz-list">
{index_list(data["pairs"])}
</ol>
</section>
{hub_section}
</main>
{foot("../")}
"""


def verify_hub_quotes(pair: dict) -> None:
    for src in pair["sides"]:
        slug, pids, zh = src["slug"], src["pids"], src["zh"]
        combined = "\n".join(classic_text(slug, pid) for pid in pids)
        if len(pids) == 1:
            if zh not in combined:
                die(f"hub quote mismatch {slug} #{pids[0]}\nWANT: {zh}\nHAVE: {combined}")
        else:
            if zh != combined:
                die(f"hub multi-pid quote mismatch {slug} {pids}\nWANT: {zh}\nHAVE: {combined}")


def verify_huberman(hub: dict, catalog: dict) -> None:
    by_url = {e["url"]: e for e in catalog["episodes"]}
    for pair in hub["pairs"]:
        verify_hub_quotes(pair)
        h = pair["huberman"]
        ep = by_url.get(h["url"])
        if not ep:
            die(f"huberman url not in catalog: {h['url']}")
        if ep["title"] != h["title"] or ep["type"] != h["type"] or ep["date"] != h["date"]:
            die(f"huberman metadata mismatch {h['url']}: catalog={ep['title'], ep['type'], ep['date']} pair={h['title'], h['type'], h['date']}")


def side_block(src: dict) -> str:
    label = src["author"]
    kicker = src.get("role") or ""
    pids = "、".join(src["pids"])
    en = ""
    if src.get("en"):
        en = f'<p class="dz-en" lang="en">{nl2br(src["en"])}</p>'
    return f"""<figure class="dz-quote">
<p class="dz-who"><span>{esc(label)}</span><small>{esc(kicker)}</small></p>
<blockquote>
<p class="dz-zh">{nl2br(src["zh"])}</p>
{en}
</blockquote>
<figcaption>——《{esc(src["work"])}》 · <a href="{esc(src["href"])}">阅读原段落 {esc(pids)} ↗</a></figcaption>
</figure>"""


def huberman_block(h: dict) -> str:
    return f"""<figure class="dz-quote dz-huberman-link">
<p class="dz-who"><span>Huberman Lab</span><small>官网目录，无全文</small></p>
<div class="dz-hub">
<p class="dz-hub-title" lang="en">{esc(h["title"])}</p>
<p class="dz-hub-meta">{esc(h["type"])} · {esc(h["date"])}</p>
<p class="dz-hub-note">{esc(h["note"])}</p>
<p class="dz-hub-copy">该集内容版权归 Scicomm Media LLC 所有。本站未获授权，不收录正文或译文。</p>
<p><a href="{esc(h["url"])}" target="_blank" rel="noopener">在官网打开这一集 ↗</a></p>
</div>
</figure>"""


def huberman_page(hub: dict, index: int) -> str:
    pairs = hub["pairs"]
    pair = pairs[index]
    prev = pairs[index - 1] if index else None
    nxt = pairs[index + 1] if index + 1 < len(pairs) else None
    qs = "".join(f"<li>{esc(q)}</li>" for q in pair["questions"])
    further_bits = []
    for item in pair["further"]:
        extra = ' target="_blank" rel="noopener"' if item.get("external") else ""
        further_bits.append(
            f'<li><a href="{esc(item["href"])}"{extra}>{esc(item["label"])} ↗</a>'
            f'<small>{esc(item["work"])} · {esc(item["hash"])}</small></li>'
        )
    further = "".join(further_bits)
    nav_links = ['<a href="index.html#huberman">全部对照</a>']
    if prev:
        nav_links.append(f'<a href="{prev["id"]}.html">上一组：{title_html(prev["title"])}</a>')
    if nxt:
        nav_links.append(f'<a href="{nxt["id"]}.html">下一组：{title_html(nxt["title"])}</a>')
    sides = "".join(side_block(s) for s in pair["sides"])
    return f"""{head(pair["title"], "../")}
<body data-page="duizhao" data-root="../" class="dz-body">
<div id="progress"></div>
{nav("../")}
<main class="dz-main">
<p class="dz-kicker">对照 · 编者 · {index + 1} / {len(pairs)} · {esc(pair["kind"])}</p>
<h1>{title_html(pair["title"])}</h1>
<p class="dz-dek">{esc(pair["dek"])}</p>
<div class="dz-pair">
{sides}
{huberman_block(pair["huberman"])}
</div>
<aside class="dz-editor" aria-label="编者按">
<p class="dz-editor-label">编者</p>
<p>{esc(pair["editor"])}</p>
</aside>
<section class="dz-q" aria-labelledby="q-h">
<h2 id="q-h">先问自己</h2>
<ol>{qs}</ol>
</section>
<section class="dz-more" aria-labelledby="more-h">
<h2 id="more-h">读完可以再往下看</h2>
<p class="dz-more-note">本站篇目仍是原段落。Huberman 的主题页只是官网外链。</p>
<ul>{further}</ul>
</section>
<nav class="dz-pager">{"".join(nav_links)}</nav>
</main>
{foot("../")}
"""


def main() -> None:
    data = json.loads(DATA.read_text())
    verify(data)
    hub = json.loads(HUB_DATA.read_text())
    catalog = json.loads(CATALOG.read_text())
    verify_huberman(hub, catalog)
    # Remove previously generated pair pages, keep css/json.
    for p in OUT_DIR.glob("*.html"):
        p.unlink()
    (OUT_DIR / "index.html").write_text(index_page(data, hub))
    for i, pair in enumerate(data["pairs"]):
        (OUT_DIR / f"{pair['id']}.html").write_text(pair_page(data, i))
    for i, pair in enumerate(hub["pairs"]):
        (OUT_DIR / f"{pair['id']}.html").write_text(huberman_page(hub, i))
    print(f"wrote {1 + len(data['pairs']) + len(hub['pairs'])} pages in {OUT_DIR}")


if __name__ == "__main__":
    main()
