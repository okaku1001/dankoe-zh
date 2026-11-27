#!/usr/bin/env python3
"""Parse published long-essay HTML and generate slide/beat decks + reader shells.

Source text is copied verbatim from article HTML. This script only groups
paragraphs into beats and inserts typographic line breaks on titles/claims.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from html import escape
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[1]
ART_DIR = ROOT / "a"
CLASSIC_DIR = ROOT / "classic"
DECK_DIR = ROOT / "decks"
INDEX = ROOT / "index.html"

TONES = ("paper", "dusk", "paper", "ink", "dawn")
ENTERS = ("fade", "fold", "wash", "portal-in", "fade")

# Homepage card order for prev/next among long pieces only.
def library_order(soup: BeautifulSoup) -> list[str]:
    ids = []
    for a in soup.select("a.card"):
        href = a.get("href") or ""
        m = re.match(r"a/([0-9n]+)\.html$", href)
        if m:
            ids.append(m.group(1))
    return ids


def text_of(node: Tag | NavigableString | None, skip_en: bool = True) -> str:
    if node is None:
        return ""
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    if node.name in ("script", "style"):
        return ""
    if skip_en and node.name in ("div", "p") and "en-p" in (node.get("class") or []):
        return ""
    parts: list[str] = []
    for child in node.children:
        if isinstance(child, NavigableString):
            parts.append(str(child))
        elif isinstance(child, Tag):
            if child.name == "br":
                parts.append("\n")
            else:
                parts.append(text_of(child, skip_en=skip_en))
    return "".join(parts)


def clean(s: str) -> str:
    # Preserve internal spaces and newlines; trim edges; drop leftover rstat noise.
    s = s.replace("\u00a0", " ")
    s = re.sub(r"\n[ \t]+", "\n", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    return s.strip()


def cjk_len(s: str) -> int:
    return sum(1 for ch in s if "\u4e00" <= ch <= "\u9fff")


def phrase_break(title: str) -> str:
    """Insert a typographic newline without changing characters."""
    t = clean(title).replace("\n", "")
    if not t:
        return t
    for sep in ("：", ":", "——"):
        i = t.find(sep)
        if i < 0:
            continue
        left, right = t[: i + len(sep)], t[i + len(sep) :]
        if cjk_len(left) >= 4 and cjk_len(right.strip()) >= 4:
            return left + "\n" + right.strip()
    if "，" in t and cjk_len(t) >= 14:
        best = None
        start = 0
        mid = cjk_len(t) / 2
        while True:
            i = t.find("，", start)
            if i < 0:
                break
            left, right = t[: i + 1], t[i + 1 :]
            if cjk_len(left) >= 4 and cjk_len(right) >= 4:
                score = abs(cjk_len(left) - mid)
                if best is None or score < best[0]:
                    best = (score, left + "\n" + right)
            start = i + 1
        if best:
            return best[1]
    return t


def claim_break(text: str) -> str:
    t = clean(text).replace("\n", "")
    if cjk_len(t) < 16 or t.count("，") + t.count("。") == 0:
        return t
    # Break after commas / periods that leave both sides substantial.
    parts = re.split(r"(?<=[，。])", t)
    parts = [p for p in parts if p]
    if len(parts) <= 1:
        return t
    # Keep short tails attached.
    lines: list[str] = []
    buf = ""
    for p in parts:
        if not buf:
            buf = p
            continue
        if cjk_len(buf) >= 8 and cjk_len(p) >= 6:
            lines.append(buf)
            buf = p
        else:
            buf += p
    if buf:
        lines.append(buf)
    if len(lines) <= 1:
        return t
    return "\n".join(lines)


def next_en(el: Tag) -> str | None:
    sib = el.find_next_sibling()
    if isinstance(sib, Tag) and "en-p" in (sib.get("class") or []):
        t = clean(text_of(sib, skip_en=False))
        return t or None
    return None


def pid_of(el: Tag) -> str | None:
    i = el.get("id")
    if i:
        return i
    return None


def extract_items(lst: Tag) -> list[dict]:
    items = []
    for li in lst.find_all("li", recursive=False):
        en_el = li.find("div", class_="en-p") or li.find("p", class_="en-p")
        en = clean(text_of(en_el, skip_en=False)) if en_el else ""
        # Clone-like: text of li without en-p
        zh = clean(text_of(li, skip_en=True))
        if not zh:
            continue
        rec = {"zh": zh, "pids": [pid_of(li)] if pid_of(li) else []}
        if en:
            rec["en"] = en
        items.append(rec)
    return items


def citation_html(meta: Tag | None) -> str:
    if meta is None:
        return ""
    rows = []
    mrows = meta.select(".mrow")
    if mrows:
        for row in mrows:
            fields = []
            fls = row.select(".mfl")
            if fls:
                for fl in fls:
                    # Keep published inline markup (links, citation spans).
                    inner = "".join(str(c) for c in fl.contents).strip()
                    inner = re.sub(r"\s+", " ", inner)
                    if inner:
                        fields.append(inner)
            else:
                t = clean(text_of(row))
                if t:
                    fields.append(escape(t))
            if fields:
                rows.append(" · ".join(fields))
    else:
        for p in meta.find_all("p"):
            t = clean(text_of(p))
            if t:
                rows.append(escape(t))
        if not rows:
            t = clean(text_of(meta))
            if t:
                rows.append(escape(t))
    return "<br>".join(rows)


def credit_line(kind: str, kicker: str) -> str:
    author = "Naval Ravikant" if kind == "naval" else "Dan Koe"
    date = ""
    m = re.search(r"(20\d{2}-\d{2}-\d{2})", kicker)
    if m:
        date = m.group(1)
    if date:
        return f"{author}  ·  {date}  ·  出处见 N"
    return f"{author}  ·  出处见 N"


def is_question_item(text: str) -> bool:
    return bool(re.search(r"[？?]\s*$", text))


def is_dialogue(text: str) -> bool:
    return bool(re.match(r"^[^：:\n]{1,12}[：:]", text))


def is_short_claim(text: str) -> bool:
    t = clean(text)
    if not t or "\n" in t:
        return False
    n = cjk_len(t)
    if n == 0 or n > 16:
        return False
    if is_dialogue(t):
        return False
    # One short sentence or fragment.
    return t.count("。") + t.count("！") + t.count("？") <= 1


def hold_for(text: str, base: int = 5000) -> int:
    n = cjk_len(text) + max(0, len(text) - cjk_len(text)) // 4
    return min(14000, max(base, 3500 + n * 18))


class EssayBuilder:
    def __init__(self, essay_id: str, kind: str, max_chars: int, max_paras: int):
        self.essay_id = essay_id
        self.kind = kind
        self.max_chars = max_chars
        self.max_paras = max_paras
        self.scenes: list[dict] = []
        self.cur: dict | None = None
        self.buf: list[dict] = []  # pending paragraph-like items
        self.used_ids: set[str] = set()
        self.source_units: list[tuple[str, str]] = []  # (kind, text) for coverage

    def unique_id(self, raw: str, fallback: str) -> str:
        base = re.sub(r"[^A-Za-z0-9_-]", "", raw) or fallback
        if base[0].isdigit():
            base = "s-" + base
        cand = base
        n = 2
        while cand in self.used_ids:
            cand = f"{base}-{n}"
            n += 1
        self.used_ids.add(cand)
        return cand

    def start_scene(self, sid: str, title: str, tone: str, enter: str, **extra):
        self.flush()
        sid = self.unique_id(sid, "s")
        thumb_title = phrase_break(title)
        # Shorter overview caption: first locked line only if broken.
        thumb_short = thumb_title.split("\n")[0]
        if thumb_short.endswith("，") or thumb_short.endswith("："):
            # keep first line; it's the hook
            pass
        scene = {
            "id": sid,
            "title": title.replace("\n", ""),
            "enter": enter,
            "tone": tone,
            "thumb": {
                "kicker": extra.get("thumb_kicker", ""),
                "title": thumb_title,
                "line": "",
            },
            "beats": [],
        }
        if extra.get("citation"):
            scene["citation"] = extra["citation"]
        self.cur = scene
        self.scenes.append(scene)
        return scene

    def add_beat(self, beat: dict):
        if self.cur is None:
            raise RuntimeError("no scene")
        # collect pids
        pids = list(beat.get("pids") or [])
        for b in beat.get("blocks") or []:
            pids.extend(b.get("pids") or [])
        for it in (beat.get("list") or {}).get("items") or []:
            if isinstance(it, dict):
                pids.extend(it.get("pids") or [])
        if pids:
            beat["pids"] = [p for p in pids if p]
        self.cur["beats"].append(beat)

    def flush(self):
        if not self.buf or self.cur is None:
            self.buf = []
            return
        items = self.buf
        self.buf = []
        # Pack into chunks.
        chunks: list[list[dict]] = []
        cur: list[dict] = []
        chars = 0
        for it in items:
            length = len(it["text"])
            would = cur and (chars + length > self.max_chars or len(cur) >= self.max_paras)
            # Keep a short claim attached to the previous chunk when it fits.
            if would and is_short_claim(it["text"]) and len(cur) < self.max_paras + 1 and chars < self.max_chars + 40:
                would = False
            # Keep a tight Q+A pair together if we just started a dialogue.
            if would:
                chunks.append(cur)
                cur, chars = [], 0
            cur.append(it)
            chars += length
        if cur:
            chunks.append(cur)
        for ch in chunks:
            self._emit_chunk(ch)

    def _emit_chunk(self, chunk: list[dict]):
        blocks = []
        pids = []
        texts = []
        for i, it in enumerate(chunk):
            typ = it.get("type") or "p"
            text = it["text"]
            # Last short line of a longer group can be set as a claim, but wording stays verbatim.
            if typ == "p" and is_short_claim(text) and (i == len(chunk) - 1) and len(chunk) > 1:
                typ = "claim"
            elif typ == "comment":
                typ = "comment"
            blk = {"type": typ, "text": text}
            if it.get("pids"):
                blk["pids"] = it["pids"]
                pids.extend(it["pids"])
            blocks.append(blk)
            texts.append(text)
        # A lone short claim gets the claim layout.
        if len(blocks) == 1 and blocks[0]["type"] == "claim":
            beat = {
                "layout": "claim",
                "reveal": "write",
                "hold": hold_for(texts[0], 6000),
                "blocks": blocks,
            }
        elif len(blocks) == 1 and blocks[0]["type"] == "p" and is_short_claim(blocks[0]["text"]):
            blocks[0]["type"] = "claim"
            beat = {
                "layout": "claim",
                "reveal": "write",
                "hold": hold_for(blocks[0]["text"], 6000),
                "blocks": blocks,
            }
        else:
            beat = {
                "layout": "read",
                "reveal": "lines",
                "hold": hold_for("".join(texts)),
                "blocks": blocks,
            }
        if pids:
            beat["pids"] = pids
        self.add_beat(beat)

    def push_p(self, text: str, pid: str | None = None, typ: str = "p"):
        rec = {"type": typ, "text": text}
        if pid:
            rec["pids"] = [pid]
        self.buf.append(rec)

    def add_quote(self, text: str, attr: str | None, pid: str | None):
        self.flush()
        # If the published quote already has line breaks (multiple p tags), keep them.
        beat = {
            "layout": "quote",
            "reveal": "lines",
            "hold": hold_for(text, 6000),
            "blocks": [{"type": "quote", "text": text, **({"attr": attr} if attr else {})}],
        }
        if pid:
            beat["pids"] = [pid]
        self.add_beat(beat)

    def add_list(self, items: list[dict], ordered: bool, start: int):
        self.flush()
        # Prefer question layout when most items are questions.
        q_count = sum(1 for it in items if is_question_item(it["zh"]))
        use_q = q_count >= max(2, int(len(items) * 0.7))
        group = 4 if use_q else 5
        # Long items: smaller groups
        if any(len(it["zh"]) > 80 for it in items):
            group = 3 if use_q else 4
        for i in range(0, len(items), group):
            chunk = items[i : i + group]
            hold = hold_for("".join(it["zh"] for it in chunk), 6500)
            if use_q:
                questions = []
                pids = []
                for j, it in enumerate(chunk):
                    n = start + i + j
                    questions.append({"n": f"{n}.", "text": it["zh"]})
                    pids.extend(it.get("pids") or [])
                beat = {"layout": "read", "reveal": "lines", "hold": hold, "questions": questions}
                if pids:
                    beat["pids"] = pids
                self.add_beat(beat)
            else:
                out_items = []
                pids = []
                for it in chunk:
                    rec = {"zh": it["zh"]}
                    if it.get("en"):
                        rec["en"] = it["en"]
                    if it.get("pids"):
                        rec["pids"] = it["pids"]
                        pids.extend(it["pids"])
                    out_items.append(rec)
                beat = {
                    "layout": "read",
                    "reveal": "lines",
                    "hold": hold,
                    "list": {
                        "ordered": ordered,
                        "start": start + i,
                        "items": out_items,
                    },
                }
                if pids:
                    beat["pids"] = pids
                self.add_beat(beat)

    def add_figure(self, src: str, alt: str, caption: str | None):
        self.flush()
        beat = {
            "layout": "figure",
            "reveal": "lines",
            "hold": 4500,
            "figure": {"src": src, "alt": alt or "原文配图"},
        }
        if caption:
            beat["figure"]["caption"] = caption
        self.add_beat(beat)

    def add_comment(self, text: str):
        self.flush()
        self.add_beat(
            {
                "layout": "read",
                "reveal": "lines",
                "hold": hold_for(text, 4500),
                "kicker": "读者评论 / 译注",
                "blocks": [{"type": "comment", "text": text}],
            }
        )

    def add_promo(self, kicker: str, paras: list[tuple[str, str | None]]):
        self.flush()
        blocks = [{"type": "p", "text": t, **({"pids": [pid]} if pid else {})} for t, pid in paras]
        pids = [pid for _, pid in paras if pid]
        beat = {
            "layout": "read",
            "reveal": "lines",
            "hold": hold_for("".join(t for t, _ in paras), 5000),
            "kicker": kicker or "作者产品推广（原文折叠）",
            "blocks": blocks,
        }
        if pids:
            beat["pids"] = pids
        self.add_beat(beat)


def parse_essay(path: Path, kind: str) -> tuple[dict, EssayBuilder, dict]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    essay_id = path.stem
    article = soup.select_one("article")
    if article is None:
        raise SystemExit(f"no article in {path}")
    tb = soup.select_one(".title-block")
    kicker_el = tb.select_one(".kicker") if tb else None
    kicker = clean(text_of(kicker_el)) if kicker_el else ""
    h1 = tb.select_one("h1") if tb else soup.select_one("h1")
    title = clean(text_of(h1))
    en_el = tb.select_one(".en") if tb else None
    en = clean(text_of(en_el)) if en_el else ""
    meta = article.select_one("blockquote.meta")
    cite = citation_html(meta)
    cover = soup.select_one("img.cover")
    cover_src = cover.get("src") if cover else None

    max_chars = 640 if kind == "naval" else 520
    max_paras = 5 if kind == "naval" else 4
    b = EssayBuilder(essay_id, kind, max_chars, max_paras)

    # Title scene
    b.start_scene(
        "title",
        title,
        tone="paper",
        enter="fade",
        thumb_kicker=kicker.split("·")[0].strip() if kicker else "",
        citation=cite,
    )
    b.add_beat(
        {
            "layout": "title",
            "reveal": "write",
            "hold": 5500,
            "kicker": kicker,
            "title": phrase_break(title),
            "en": en,
            "blocks": [{"type": "credit", "text": credit_line(kind, kicker)}],
            "note": "标题、信息条与出处取自已发布文首。",
        }
    )

    # Walk article
    tone_i = 0
    intro_started = False
    section_index = 0

    def ensure_intro():
        nonlocal intro_started
        if intro_started:
            return
        intro_started = True
        b.start_scene("intro", "开篇", tone="paper", enter="fade", thumb_kicker="开篇")
        # If no intro content, scene may end up empty; we'll drop empty scenes later.

    def new_section(hid: str, heading: str, en_title: str | None):
        nonlocal tone_i, section_index, intro_started
        intro_started = True
        tone = TONES[tone_i % len(TONES)]
        enter = ENTERS[tone_i % len(ENTERS)]
        tone_i += 1
        section_index += 1
        sid = hid or f"s{section_index}"
        b.start_scene(sid, heading, tone=tone, enter=enter, thumb_kicker=f"第 {section_index} 节")
        beat = {
            "layout": "title",
            "reveal": "write",
            "hold": 5000,
            "title": phrase_break(heading),
            "titleSize": "quiet" if cjk_len(heading) < 12 else None,
            "note": "本节标题取自已发布正文。",
        }
        if en_title:
            beat["en"] = en_title
        # drop None
        if beat["titleSize"] is None:
            del beat["titleSize"]
        b.add_beat(beat)

    for child in list(article.children):
        if not isinstance(child, Tag):
            continue
        classes = child.get("class") or []
        if "en-p" in classes:
            continue
        if child.name == "blockquote" and "meta" in classes:
            continue
        if child.name in ("h2", "h3"):
            heading = clean(text_of(child))
            if heading:
                b.source_units.append(("h", heading))
            new_section(child.get("id") or "", heading, next_en(child))
            continue
        if child.name == "hr":
            b.flush()
            continue
        if child.name == "p":
            t = clean(text_of(child))
            if not t:
                continue
            b.source_units.append(("p", t))
            if b.cur and b.cur["id"] == "title":
                ensure_intro()
            elif b.cur is None:
                ensure_intro()
            typ = "p"
            b.push_p(t, pid_of(child), typ=typ)
            continue
        if child.name in ("ul", "ol"):
            items = extract_items(child)
            for it in items:
                b.source_units.append(("li", it["zh"]))
            if b.cur and b.cur["id"] == "title":
                ensure_intro()
            start = 1
            if child.get("start"):
                try:
                    start = int(child.get("start"))
                except ValueError:
                    start = 1
            b.add_list(items, ordered=(child.name == "ol"), start=start)
            continue
        if child.name == "blockquote":
            paras = [clean(text_of(p)) for p in child.find_all("p")]
            paras = [p for p in paras if p]
            if not paras:
                t = clean(text_of(child))
                paras = [t] if t else []
            if not paras:
                continue
            attr = None
            if paras[-1].startswith("——") or paras[-1].startswith("—"):
                attr = paras[-1]
                body_paras = paras[:-1] or paras
            else:
                body_paras = paras
            body = "\n".join(body_paras)
            b.source_units.append(("q", body + (("\n" + attr) if attr else "")))
            if b.cur and b.cur["id"] == "title":
                ensure_intro()
            b.add_quote(body, attr, pid_of(child))
            continue
        if child.name == "figure":
            img = child.find("img")
            if not img or not img.get("src"):
                continue
            cap_el = child.find("figcaption")
            cap = clean(text_of(cap_el)) if cap_el else ""
            alt = img.get("alt") or ""
            if cap:
                b.source_units.append(("fig", cap))
            if b.cur and b.cur["id"] == "title":
                ensure_intro()
            b.add_figure(img.get("src"), alt, cap or None)
            continue
        if child.name == "details":
            summary = child.find("summary")
            kicker = clean(text_of(summary)) if summary else ""
            paras = []
            for p in child.find_all("p"):
                t = clean(text_of(p))
                if t:
                    paras.append((t, pid_of(p)))
                    b.source_units.append(("p", t))
            if not paras:
                t = clean(text_of(child))
                # strip summary text if present
                if kicker and t.startswith(kicker):
                    t = t[len(kicker) :].strip()
                if t:
                    paras.append((t, None))
                    b.source_units.append(("p", t))
            if paras:
                if b.cur and b.cur["id"] == "title":
                    ensure_intro()
                b.add_promo(kicker, paras)
            continue
        if child.name == "aside":
            t = clean(text_of(child))
            if t:
                b.source_units.append(("c", t))
                if b.cur and b.cur["id"] == "title":
                    ensure_intro()
                b.add_comment(t)
            continue
        # Unknown top-level node: include visible text if any, so nothing is dropped.
        if child.name:
            t = clean(text_of(child))
            if t:
                b.source_units.append(("x", t))
                if b.cur and b.cur["id"] == "title":
                    ensure_intro()
                b.push_p(t, pid_of(child))

    b.flush()

    # Drop empty intro (title-only leftover)
    kept = []
    for sc in b.scenes:
        if sc["id"].startswith("intro") and len(sc["beats"]) == 0:
            continue
        if not sc["beats"]:
            continue
        kept.append(sc)
    b.scenes = kept

    info = {
        "id": essay_id,
        "kind": kind,
        "title": title,
        "en": en,
        "kicker": kicker,
        "citation": cite,
        "cover": cover_src,
    }
    return info, b, {"units": b.source_units}


READER_SHELL = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>{title} · 纳瓦尔与 Dan Koe</title>
  <link rel="stylesheet" href="../fonts/fonts.css">
  <link rel="stylesheet" href="../css/reader.css?v=slide5">
  <link rel="manifest" href="../manifest.json">
  <meta name="theme-color" content="#a84b2a">
  <script>try{{document.documentElement.dataset.theme=localStorage.getItem('dk:theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}}catch(e){{}}</script>
</head>
<body data-page="reader" data-root="../" data-slug="{eid}">
  <div id="load" aria-live="polite">打开阅读<div class="bar" aria-hidden="true"><i></i></div></div>

  <nav id="chrome" aria-label="站点导航">
    <a class="brand" href="../index.html"><span class="bn">纳瓦尔与 </span><b>Dan Koe</b></a>
    <span class="spacer"></span>
    <a href="../classic/{eid}.html">原版</a>
    <span class="sep">·</span>
    <a href="../notes.html">笔记</a>
    <span class="sep">·</span>
    <a href="../glossary.html">词典</a>
    <span class="sep">·</span>
    <button type="button" id="theme" aria-label="切换明暗">◐</button>
  </nav>

  <div id="stage" role="application" aria-label="阅读放映">
    <div id="wash" aria-hidden="true"></div>
    <div id="scene-root"></div>
    <div id="hud" aria-hidden="true"></div>
  </div>

  <div id="help" class="overlay" role="dialog" aria-label="操作说明" aria-modal="true">
    <div class="panel">
      <span class="close-hint">? 或 Esc 关闭</span>
      <h2>操作</h2>
      <dl>
        <dt>→ 或 空格</dt><dd>下一拍</dd>
        <dt>←</dt><dd>上一拍</dd>
        <dt>上半屏 / 下半屏</dt><dd>点一下：上一拍 / 下一拍</dd>
        <dt>O</dt><dd>全部页总览</dd>
        <dt>F</dt><dd>全屏</dd>
        <dt>A</dt><dd>自动播放（再按停止）</dd>
        <dt>N</dt><dd>说明与出处</dd>
        <dt>T</dt><dd>切换明暗</dd>
        <dt>? 或 Esc</dt><dd>打开或关闭本说明</dd>
      </dl>
      <p class="dim">正文取自已发布的中文译本，未改写。哈希深链形如 <code>#s1</code> 或 <code>#s1-2</code>，不会刷新页面。划线、听读与行动卡在原版排印里。</p>
      <div class="help-links">
        <a href="../index.html">返回首页</a>
        <a href="../classic/{eid}.html">打开原版排印</a>
        <a href="../notes.html">我的笔记</a>
        <a href="../glossary.html">概念词典</a>
      </div>
    </div>
  </div>

  <div id="overview" class="overlay" role="dialog" aria-label="全部页" aria-modal="true">
    <div class="wrap">
      <span class="close-hint">O 或 Esc 关闭</span>
      <h2>全部页</h2>
      <p class="sub">16:9 缩略 · 当前节以浅线描出 · 点击即跳转</p>
      <div id="overview-grid" class="grid"></div>
    </div>
  </div>

  <div id="notes" class="overlay" role="dialog" aria-label="说明与出处" aria-modal="true">
    <div class="panel">
      <span class="close-hint">N 或 Esc 关闭</span>
      <h2>说明与出处</h2>
      <div id="notes-body"></div>
    </div>
  </div>

  <script>
    window.DK_READER = {{
      essayId: {eid_js},
      deckUrl: {deck_js},
      classicUrl: {classic_js},
      homeUrl: "../index.html",
      notesUrl: "../notes.html",
      glossaryUrl: "../glossary.html"
    }};
  </script>
  <script src="../js/reader.js?v=slide5"></script>
</body>
</html>
"""


def write_reader_shell(eid: str, title: str) -> None:
    html = READER_SHELL.format(
        title=escape(title),
        eid=eid,
        eid_js=json.dumps(eid, ensure_ascii=False),
        deck_js=json.dumps(f"../decks/{eid}.json", ensure_ascii=False),
        classic_js=json.dumps(f"../classic/{eid}.html", ensure_ascii=False),
    )
    (ART_DIR / f"{eid}.html").write_text(html, encoding="utf-8")


CLASSIC_BANNER = (
    '<p class="classic-banner">当前为原版排印，可划线、听读、使用行动卡。'
    '<a href="../a/{eid}.html">打开幻灯阅读</a></p>\n'
)


def patch_classic(eid: str) -> None:
    path = CLASSIC_DIR / f"{eid}.html"
    html = path.read_text(encoding="utf-8")
    if "classic-banner" in html:
        return
    banner = CLASSIC_BANNER.format(eid=eid)
    # Insert immediately after <body ...>
    new, n = re.subn(r"(<body[^>]*>)", r"\1" + banner, html, count=1, flags=re.I)
    if n != 1:
        raise SystemExit(f"could not insert classic banner in {path}")
    new = new.replace("../style.css?v=book-20261126", "../style.css?v=slide-20261126")
    path.write_text(new, encoding="utf-8")


def coverage_check(units: list[tuple[str, str]], deck: dict, eid: str) -> list[str]:
    blob = []

    def walk(obj):
        if isinstance(obj, str):
            blob.append(obj)
        elif isinstance(obj, dict):
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(deck)
    def flat(s: str) -> str:
        return re.sub(r"\s+", "", s)

    joined = "\n".join(blob)
    joined_flat = flat(joined)
    missing = []
    for kind, text in units:
        if text and flat(text) not in joined_flat:
            missing.append(f"{kind}: {text[:80]}")
    return missing


def main() -> int:
    DECK_DIR.mkdir(exist_ok=True)
    CLASSIC_DIR.mkdir(exist_ok=True)

    index_soup = BeautifulSoup(INDEX.read_text(encoding="utf-8"), "html.parser")
    order = library_order(index_soup)
    files = sorted(ART_DIR.glob("*.html"))
    # Parse from classic copies so we don't depend on yet-unreplaced a/
    # If classic is already a copy of originals, use that. If a/ is still original
    # (first run), use a/. After first run a/ becomes shells — classic stays source.
    sources = {}
    for f in CLASSIC_DIR.glob("*.html"):
        sources[f.stem] = f
    # Prefer classic as the verbatim source of published articles.
    if not sources:
        for f in files:
            sources[f.stem] = f

    # Keep order as homepage, then any missing file-id.
    ids = list(order)
    for stem in sorted(sources):
        if stem not in ids:
            ids.append(stem)

    catalog = []
    missing_all = {}
    stats = []

    # First pass: parse all
    parsed = []
    for eid in ids:
        src = sources.get(eid)
        if src is None:
            print("skip missing", eid, file=sys.stderr)
            continue
        kind = "naval" if eid.startswith("n") else "dankoe"
        # If this file is already a reader shell, refuse.
        head = src.read_text(encoding="utf-8", errors="ignore")[:400]
        if "DK_READER" in head or 'data-page="reader"' in head:
            raise SystemExit(f"source {src} looks like a reader shell; expected classic HTML")
        info, builder, extra = parse_essay(src, kind)
        parsed.append((info, builder, extra))

    # Attach prev/next in library order
    by_id = {info["id"]: (info, builder, extra) for info, builder, extra in parsed}

    for i, (info, builder, extra) in enumerate(parsed):
        eid = info["id"]
        prev_info = parsed[i - 1][0] if i > 0 else None
        next_info = parsed[i + 1][0] if i + 1 < len(parsed) else None

        # End scene
        links = [
            {
                "kicker": "原版排印",
                "title": "划线、听读与行动卡",
                "href": f"../classic/{eid}.html",
            },
            {"kicker": "回图书馆", "title": "纳瓦尔与 Dan Koe", "href": "../index.html"},
        ]
        if next_info:
            links.insert(
                0,
                {
                    "kicker": "下一篇",
                    "title": next_info["title"],
                    "href": f"{next_info['id']}.html",
                },
            )
        builder.start_scene("end", "本篇完", tone="dusk", enter="fade", thumb_kicker="本篇完")
        builder.add_beat(
            {
                "layout": "title",
                "reveal": "lines",
                "hold": 6000,
                "kicker": "本篇完",
                "title": phrase_break(info["title"]),
                "titleSize": "quiet",
                "hint": "按 → 进入下一篇，或打开原版排印。",
                "links": links,
                "note": "本篇正文到此结束。行动卡、英文全文与听读仍在原版排印页。",
            }
        )

        meta = {
            "id": eid,
            "kind": info["kind"],
            "title": info["title"],
            "en": info["en"],
            "kicker": info["kicker"],
            "citation": info["citation"],
            "classic": f"../classic/{eid}.html",
            "home": "../index.html",
            "notes": "../notes.html",
            "glossary": "../glossary.html",
            "attribution": "正文取自已发布中文译本，未改写。中文译本仅供个人学习。",
        }
        if prev_info:
            meta["prev"] = {"id": prev_info["id"], "title": prev_info["title"], "href": f"{prev_info['id']}.html"}
        if next_info:
            meta["next"] = {"id": next_info["id"], "title": next_info["title"], "href": f"{next_info['id']}.html"}

        deck = {"meta": meta, "scenes": builder.scenes}
        missing = coverage_check(extra["units"], deck, eid)
        if missing:
            missing_all[eid] = missing

        (DECK_DIR / f"{eid}.json").write_text(
            json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        write_reader_shell(eid, info["title"])
        patch_classic(eid)

        beats = sum(len(s["beats"]) for s in builder.scenes)
        catalog.append(
            {
                "id": eid,
                "kind": info["kind"],
                "title": info["title"],
                "en": info["en"],
                "kicker": info["kicker"],
                "file": f"a/{eid}.html",
                "classic": f"classic/{eid}.html",
                "deck": f"decks/{eid}.json",
                "scenes": len(builder.scenes),
                "beats": beats,
            }
        )
        stats.append((eid, len(builder.scenes), beats, len(extra["units"]), len(missing)))
        print(f"{eid:4}  scenes={len(builder.scenes):3}  beats={beats:4}  units={len(extra['units']):4}  missing={len(missing)}")

    manifest = {
        "source": "okaku1001/dankoe-zh",
        "order": [c["id"] for c in catalog],
        "essays": catalog,
    }
    (DECK_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if missing_all:
        print("\nCOVERAGE GAPS:", file=sys.stderr)
        for eid, miss in missing_all.items():
            print(f"  {eid}: {len(miss)}", file=sys.stderr)
            for line in miss[:8]:
                print("    ", line, file=sys.stderr)
        return 1

    dk = sum(1 for c in catalog if c["kind"] == "dankoe")
    nv = sum(1 for c in catalog if c["kind"] == "naval")
    print(f"\nOK  Dan Koe {dk}  Naval {nv}  total {len(catalog)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
