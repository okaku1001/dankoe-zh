#!/usr/bin/env python3
"""Generate huberman/*.html from huberman/catalog.json. Edit the JSON, then rerun."""

from __future__ import annotations

import html as htmlmod
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "huberman" / "catalog.json"
OUT = ROOT / "huberman"
STYLE_V = "huberman-20261127-nav"
DZ_V = "duizhao-20261127-h"
HB_V = "huberman-20261128-featured"
APP_V = "zoom-20261123"
NOTES_V = "2"
SITE = "纳瓦尔、Dan Koe 与 Huberman"


def format_census(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return s
    return f"{dt.year} 年 {dt.month} 月 {dt.day} 日"


def format_date_zh(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    try:
        dt = datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError:
        return s
    return f"{dt.year} 年 {dt.month} 月 {dt.day} 日"


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


def esc(s: str) -> str:
    return htmlmod.escape(s, quote=True)


def nav(root: str, current: str = "") -> str:
    i = f"{root}index.html"
    cur = ' aria-current="page"'
    return (
        f'<header class="top"><a class="brand" href="{i}">'
        f'<span class="bn">纳瓦尔、Dan Koe 与 </span><b>Huberman</b></a>'
        f'<nav class="tnav">'
        f'<a href="{i}#naval">纳瓦尔</a>'
        f'<a href="{i}#dankoe">Dan Koe</a>'
        f'<a href="{root}huberman/index.html"{" aria-current=\"page\"" if current=="huberman" else ""}>Huberman</a>'
        f'<a href="{root}duizhao/index.html">对照</a>'
        f'<a href="{root}glossary.html">概念词典</a>'
        f'<a href="{root}notes.html">我的笔记</a>'
        f'<button id="theme" aria-label="切换明暗">◐</button>'
        f"</nav></header>"
    )


def head(title: str, root: str) -> str:
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · {esc(SITE)}</title>
<link rel="stylesheet" href="{root}fonts/fonts.css"><link rel="stylesheet" href="{root}style.css?v={STYLE_V}"><link rel="stylesheet" href="{root}duizhao/duizhao.css?v={DZ_V}"><link rel="stylesheet" href="{root}huberman/huberman.css?v={HB_V}"><link rel="stylesheet" href="{root}notes.css?v={NOTES_V}"><link rel="manifest" href="{root}manifest.json"><meta name="theme-color" content="#a84b2a">
<script>try{{document.documentElement.dataset.theme=localStorage.getItem('dk:theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.style.setProperty('--fs',(localStorage.getItem('dk:fs')||18.5)+'px')}}catch(e){{}}</script></head>"""


def foot(root: str) -> str:
    return (
        f'<footer class="foot">{esc(SITE)} · 纳瓦尔与 Dan Koe 的中文译本仅供个人学习 · Huberman 目录为编者整理的官网元数据，正文请在官网阅读</footer>'
        f'<script src="{root}notes-core.js?v={NOTES_V}"></script>'
        f'<script src="{root}notes-ui.js?v={NOTES_V}"></script>'
        f'<script src="{root}app.js?v={APP_V}"></script>'
        f"</body></html>"
    )


def copyrights(page_kind: str) -> str:
    extra = {
        "index": "本页是目录入口，按官方主题分类浏览，不在本站打开全文阅读页。",
        "topic": "本页只列出官网「全部节目」列表里，被标到这一官方主题下的条目。",
        "all": "本页按官网全部节目列表的日期排列。点标题即打开官网对应页。",
        "newsletter": "本页只列出 Neural Network Newsletter 归档中的标题、日期和官网链接，不收录通讯正文。",
    }[page_kind]
    return f"""<aside class="hb-copyrights" aria-label="版权说明">
<p>{esc(extra)}只收录官网公开可见的元数据：官方英文标题、发布日期、节目类型、官方主题分类名，以及标题里出现的嘉宾名。点标题会在新标签打开官网对应页。</p>
<p>Huberman Lab 的播客、通讯、社交媒体发言及其他内容，版权归 Scicomm Media LLC 所有。本站不收录逐字稿、通讯全文、音视频，也不做翻译、改编或再创作。本站不是官方站点，未获授权，也不是合作或附属项目。</p>
<p>完整内容请到 <a href="https://www.hubermanlab.com/" target="_blank" rel="noopener">hubermanlab.com</a> 阅读。版权说明见 <a href="https://www.scicommedia.com/copyright-guidelines/" target="_blank" rel="noopener">Scicomm Media Copyright Guidelines</a>。</p>
</aside>"""


def ext_link(href: str, label: str, extra_class: str = "") -> str:
    cls = "hb-ext" if not extra_class else f"{extra_class} hb-ext"
    return f'<a class="{cls}" href="{esc(href)}" target="_blank" rel="noopener">{esc(label)}</a>'


def item_html(ep: dict, show_topics: bool = True) -> str:
    guest = f" · {esc(ep['guest'])}" if ep.get("guest") else ""
    topics = ""
    if show_topics and ep.get("topics"):
        names = "、".join(t["name"] for t in ep["topics"])
        topics = f'<span class="hb-sub">{esc(names)}</span>'
    typ = ep.get("type") or ""
    return f"""<li>
{ext_link(ep["url"], "", "hb-item")}
<span class="hb-when">{esc(ep.get("date") or "")}</span>
<span>
<strong class="hb-title" lang="en">{esc(ep["title"])}</strong>
<span class="hb-sub">{esc(typ)}{guest}</span>
{topics}
</span>
</a>
</li>"""


# The item_html above is messy because ext_link wraps only label. Fix in a cleaner function.

def episode_li(ep: dict, show_topics: bool = True) -> str:
    guest = f" · {esc(ep['guest'])}" if ep.get("guest") else ""
    topics = ""
    if show_topics and ep.get("topics"):
        names = "、".join(t["name"] for t in ep["topics"])
        topics = f'<span class="hb-sub">{esc(names)}</span>'
    typ = ep.get("type") or ""
    date = ep.get("date") or ""
    return (
        f"<li><a class=\"hb-item hb-ext\" href=\"{esc(ep['url'])}\" target=\"_blank\" rel=\"noopener\">"
        f"<span class=\"hb-when\">{esc(date)}</span>"
        f"<span><strong class=\"hb-title\" lang=\"en\">{esc(ep['title'])}</strong>"
        f"<span class=\"hb-sub\">{esc(typ)}{guest}</span>{topics}</span></a></li>"
    )


def newsletter_li(item: dict) -> str:
    return (
        f"<li><a class=\"hb-item hb-ext\" href=\"{esc(item['url'])}\" target=\"_blank\" rel=\"noopener\">"
        f"<span class=\"hb-when\">{esc(item.get('date') or '')}</span>"
        f"<span><strong class=\"hb-title\" lang=\"en\">{esc(item['title'])}</strong>"
        f"<span class=\"hb-sub\">Neural Network Newsletter</span></span></a></li>"
    )


def filter_script() -> str:
    return """<script>
(function(){
  var input=document.getElementById('hb-q');
  if(!input) return;
  var items=Array.prototype.slice.call(document.querySelectorAll('[data-hb-q]'));
  input.addEventListener('input', function(){
    var q=input.value.trim().toLowerCase();
    items.forEach(function(li){
      var hay=li.getAttribute('data-hb-q')||'';
      li.hidden=q!=='' && hay.indexOf(q)===-1;
    });
  });
})();
</script>"""



FEATURED_EXPECTED = {
    "teach-and-learn-better-with-a-neuroplasticity-super-protocol": {
        "title": 'Teach & Learn Better With A "Neuroplasticity Super Protocol"',
        "date": "2021-10-29",
        "url": "https://www.hubermanlab.com/newsletter/teach-and-learn-better-with-a-neuroplasticity-super-protocol",
    },
    "tools-to-manage-dopamine-and-improve-motivation-and-drive": {
        "title": "Tools to Manage Dopamine and Improve Motivation & Drive",
        "date": "2022-10-06",
        "url": "https://www.hubermanlab.com/newsletter/tools-to-manage-dopamine-and-improve-motivation-and-drive",
    },
    "improve-working-memory-attention": {
        "title": "Improve Working Memory & Attention",
        "date": "2025-06-04",
        "url": "https://www.hubermanlab.com/newsletter/improve-working-memory-attention",
    },
    "build-or-break-habits-using-science-based-tools": {
        "title": "Build or Break Habits Using Science-Based Tools",
        "date": "2022-01-30",
        "url": "https://www.hubermanlab.com/newsletter/build-or-break-habits-using-science-based-tools",
    },
    "toolkit-for-sleep": {
        "title": "Toolkit for Sleep",
        "date": "2021-09-20",
        "url": "https://www.hubermanlab.com/newsletter/toolkit-for-sleep",
    },
}


def resolve_featured(data: dict) -> list[dict]:
    featured = data.get("featured_reading") or {}
    items = featured.get("items") or []
    if not items:
        die("catalog.json missing featured_reading.items")
    by = {n["slug"]: n for n in data["newsletters"]}
    resolved = []
    for item in items:
        slug = item.get("slug")
        tag = (item.get("tag") or "").strip()
        src = by.get(slug)
        if not src:
            die(f"featured slug not in newsletters: {slug}")
        expect = FEATURED_EXPECTED.get(slug)
        if not expect:
            die(f"featured slug not in the approved reading list: {slug}")
        if src["title"] != expect["title"] or src["date"] != expect["date"] or src["url"] != expect["url"]:
            die(f"featured metadata drifted from official listing: {slug}")
        if not tag:
            die(f"featured item missing editor tag: {slug}")
        resolved.append({
            "slug": slug,
            "title": src["title"],
            "date": src["date"],
            "url": src["url"],
            "tag": tag,
        })
    return resolved


def featured_li(item: dict) -> str:
    date = format_date_zh(item["date"])
    return (
        f'<li><a class="hb-item hb-ext" href="{esc(item["url"])}" target="_blank" rel="noopener">'
        f'<span class="hb-when">{esc(date)}</span>'
        f'<span><strong class="hb-title" lang="en">{esc(item["title"])}</strong>'
        f'<span class="hb-sub"><span class="hb-tag">编者 · {esc(item["tag"])}</span>'
        f' · Neural Network Newsletter</span></span></a></li>'
    )


def featured_section(data: dict, *, index_href: str | None = None) -> str:
    featured = data.get("featured_reading") or {}
    items = resolve_featured(data)
    lis = "".join(featured_li(it) for it in items)
    heading = featured.get("heading") or "值得先读"
    dek = featured.get("dek") or ""
    pointer = ""
    if index_href:
        pointer = (
            f'<p class="hb-note">完整归档在下面。若要从目录入口看这一组，也可以回 '
            f'<a href="{esc(index_href)}">Huberman 目录的「值得先读」</a>。</p>'
        )
    return f"""<section class="hb-first" id="first-read" aria-labelledby="first-h">
<h2 id="first-h">{esc(heading)}</h2>
<p class="hb-note">{esc(dek)}</p>
{pointer}
<ul class="hb-list">{lis}</ul>
</section>"""


def index_page(data: dict) -> str:
    meta = data["meta"]
    coverage = data["coverage"]
    featured = [t for t in data["topics"] if t.get("featured")]
    rest = [t for t in data["topics"] if not t.get("featured")]
    counts = defaultdict(int)
    for ep in data["episodes"]:
        for t in ep.get("topics") or []:
            counts[t["slug"]] += 1

    def topic_link(t: dict, featured: bool = False) -> str:
        n = counts.get(t["slug"], 0)
        cls = ' class="is-featured"' if featured else ""
        return f'<li{cls}><a href="topics/{esc(t["slug"])}.html">{esc(t["name"])} <small>{n}</small></a></li>'

    feat_list = "".join(topic_link(t, True) for t in featured)
    all_list = "".join(topic_link(t) for t in data["topics"])
    recent = data["episodes"][:8]
    recent_list = "".join(episode_li(ep) for ep in recent)
    types = coverage.get("episode_types") or {}
    type_bits = "、".join(f"{k} {v} 集" for k, v in types.items())
    census = format_census(meta.get("censused_at", ""))
    untagged = coverage.get("episodes_without_topic_chips", 0)
    zero = coverage.get("official_topics_with_no_listed_episodes") or []
    zero_note = ""
    if zero:
        zero_note = (
            f'<p class="hb-note">官网主题里的「{"、".join(zero)}」在本轮全部节目列表的分类标签中没有出现条目，主题页仍保留，请以官网主题页为准。</p>'
        )
    extra = coverage.get("episodes_listed_on_all_episodes_not_in_sitemap") or []
    extra_note = ""
    if extra:
        slug = extra[0].rsplit("/", 1)[-1]
        extra_note = (
            f'<p class="hb-note">清点时，官网全部节目列表比当时的 sitemap 多 1 集（{esc(slug)}），已按列表收入。</p>'
        )
    return f"""{head("Huberman 目录", "../")}
<body data-page="huberman" data-root="../">
<div id="progress"></div>
{nav("../", "huberman")}
<main class="hb-main">
<p class="hb-kicker">Andrew Huberman · Huberman Lab</p>
<h1>目录和外链</h1>
<p class="hb-lead">这一层只做官方目录。正文、逐字稿和通讯都在 <a href="https://www.hubermanlab.com/" target="_blank" rel="noopener">Huberman Lab 官网</a>，本站不搬。</p>
<p class="hb-copy">你可以按官方主题看，也可以按日期把全部节目翻一遍。标题保持官方英文。神经与可塑性、学习、习惯、专注、动机和睡眠放在前面，其余官方分类都还在。</p>
<p class="hb-copy">若要和本站已收录的纳瓦尔、Dan Koe 段落一起读，请看 <a href="../duizhao/index.html#huberman">对照里的编者部分</a>。那一层标明「编者」，不编造对话，也不把官网标题写成这里有全文。</p>
{copyrights("index")}
<p class="hb-meta">本轮清点到 {esc(census)}（亚洲/上海）。节目 {coverage['episodes']} 集，通讯 {coverage['newsletters']} 封，官方主题 {coverage['topics']} 个。节目类型：{esc(type_bits)}。其中 {untagged} 集在全部节目列表上尚未挂主题标签，它们仍出现在完整目录里。</p>
{zero_note}{extra_note}
{featured_section(data)}
<section aria-labelledby="feat-h">
<h2 id="feat-h">先看这些主题</h2>
<p class="hb-note">顺序是编者排的，名字是官网主题页上的正式名称。</p>
<ul class="hb-jump">{feat_list}</ul>
</section>
<section aria-labelledby="all-topics-h">
<h2 id="all-topics-h">全部官方主题</h2>
<p class="hb-note">排列按官网 Topics 页「All Topics」当时的顺序。</p>
<ul class="hb-jump">{all_list}</ul>
</section>
<section aria-labelledby="recent-h">
<h2 id="recent-h">最近几集</h2>
<p class="hb-note">完整按日目录见 <a href="all.html">全部节目</a>。通讯见 <a href="newsletter.html">Neural Network Newsletter 归档</a>。</p>
<ul class="hb-list">{recent_list}</ul>
</section>
<section aria-labelledby="out-h">
<h2 id="out-h">官网和账号</h2>
<p class="hb-copy"><a href="https://www.hubermanlab.com/all-episodes" target="_blank" rel="noopener">全部节目</a> · <a href="https://www.hubermanlab.com/topics" target="_blank" rel="noopener">主题</a> · <a href="https://www.hubermanlab.com/newsletter" target="_blank" rel="noopener">通讯归档</a> · <a href="https://x.com/hubermanlab" target="_blank" rel="noopener">X 账号 @hubermanlab</a>（官网页脚现写作 <a href="https://twitter.com/hubermanlab" target="_blank" rel="noopener">twitter.com/hubermanlab</a>，同一账号）。本站不采集或转载其发言。</p>
</section>
</main>
{foot("../")}
"""


def topic_page(data: dict, topic: dict) -> str:
    slug = topic["slug"]
    eps = [e for e in data["episodes"] if any(t["slug"] == slug for t in e.get("topics") or [])]
    items = "".join(episode_li(ep, show_topics=False) for ep in eps)
    body = items and f'<ul class="hb-list">{items}</ul>' or (
        f'<p class="hb-empty">本轮清点时，官网全部节目列表的分类标签里没有挂到「{esc(topic["name"])}」的条目。不在这里补条。请以 <a href="{esc(topic["url"])}" target="_blank" rel="noopener">官网这一主题页</a> 为准。</p>'
    )
    return f"""{head(topic["name"], "../../")}
<body data-page="huberman" data-root="../../">
<div id="progress"></div>
{nav("../../", "huberman")}
<main class="hb-main">
<p class="hb-kicker"><a href="../index.html">Huberman 目录</a></p>
<h1 lang="en">{esc(topic["name"])}</h1>
<p class="hb-lead">官方主题。下列条目来自官网全部节目列表上的分类标签。点标题打开官网。</p>
<p class="hb-meta">{len(eps)} 集 · <a href="{esc(topic["url"])}" target="_blank" rel="noopener">在官网查看这一主题</a></p>
{copyrights("topic")}
{body}
<p class="hb-note"><a href="../index.html">回到目录</a> · <a href="../all.html">全部节目</a></p>
</main>
{foot("../../")}
"""


def all_page(data: dict) -> str:
    by_year: dict[str, list] = defaultdict(list)
    for ep in data["episodes"]:
        year = (ep.get("date") or "undated")[:4]
        by_year[year].append(ep)
    years = sorted(by_year.keys(), reverse=True)
    year_nav = "".join(f'<li><a href="#y{esc(y)}">{esc(y)}</a></li>' for y in years)
    sections = []
    for y in years:
        lis = []
        for ep in by_year[y]:
            hay = " ".join(
                [
                    ep.get("title") or "",
                    ep.get("type") or "",
                    ep.get("guest") or "",
                    " ".join(t["name"] for t in ep.get("topics") or []),
                    ep.get("date") or "",
                ]
            ).lower()
            li = episode_li(ep)
            li = li.replace("<li>", f'<li data-hb-q="{esc(hay)}">', 1)
            lis.append(li)
        sections.append(
            f'<h2 class="hb-year" id="y{esc(y)}">{esc(y)} <small>{len(by_year[y])} 集</small></h2>'
            f'<ul class="hb-list">{"".join(lis)}</ul>'
        )
    types = data["coverage"].get("episode_types") or {}
    type_note = "、".join(f"{k} {v}" for k, v in types.items())
    return f"""{head("全部节目", "../")}
<body data-page="huberman" data-root="../">
<div id="progress"></div>
{nav("../", "huberman")}
<main class="hb-main">
<p class="hb-kicker"><a href="index.html">Huberman 目录</a></p>
<h1>全部节目</h1>
<p class="hb-lead">按官网全部节目列表的日期排列，共 {len(data["episodes"])} 集。点标题打开官网，本站没有全文阅读页。</p>
<p class="hb-meta">类型：{esc(type_note)}。</p>
{copyrights("all")}
<div class="hb-filter"><label for="hb-q">按标题、类型或主题筛选</label><input id="hb-q" type="search" placeholder="例如 dopamine、Sleep、Solo Episode" autocomplete="off"></div>
<ul class="hb-jump">{year_nav}</ul>
{"".join(sections)}
</main>
{filter_script()}
{foot("../")}
"""


def newsletter_page(data: dict) -> str:
    items = "".join(newsletter_li(n) for n in data["newsletters"])
    return f"""{head("Neural Network Newsletter", "../")}
<body data-page="huberman" data-root="../">
<div id="progress"></div>
{nav("../", "huberman")}
<main class="hb-main">
<p class="hb-kicker"><a href="index.html">Huberman 目录</a></p>
<h1 lang="en">Neural Network Newsletter</h1>
<p class="hb-lead">官网通讯归档里的 {len(data["newsletters"])} 封。这里只有标题、日期和链接，没有正文。</p>
<p class="hb-note">日期取自 <a href="https://www.hubermanlab.com/newsletter" target="_blank" rel="noopener">官网归档卡片</a>。较新的通讯有时会晚几周才出现在归档里。</p>
{copyrights("newsletter")}
{featured_section(data, index_href="index.html#first-read")}
<h2 id="archive-h">全部归档</h2>
<p class="hb-note">下面按官网归档日期排列全部通讯，同样只有标题、日期和链接。</p>
<ul class="hb-list">{items}</ul>
<p class="hb-note"><a href="index.html">回到目录</a></p>
</main>
{foot("../")}
"""


def main() -> None:
    data = json.loads(DATA.read_text())
    if "episodes" not in data or "topics" not in data or "newsletters" not in data:
        die("catalog.json missing required keys")
    topics_dir = OUT / "topics"
    topics_dir.mkdir(parents=True, exist_ok=True)
    for p in topics_dir.glob("*.html"):
        p.unlink()
    (OUT / "index.html").write_text(index_page(data))
    (OUT / "all.html").write_text(all_page(data))
    (OUT / "newsletter.html").write_text(newsletter_page(data))
    for t in data["topics"]:
        (topics_dir / f"{t['slug']}.html").write_text(topic_page(data, t))
    print(f"wrote {3 + len(data['topics'])} pages in {OUT}")


if __name__ == "__main__":
    main()
