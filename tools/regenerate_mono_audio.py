#!/usr/bin/env python3
"""基于精修后的中文正文，重新生成独白文（Dan Koe 01-23）的单人 AI 朗读。

沿用已有音色 zh-male-guchuan-9d6a4666，逐字朗读（mode=direct）。
分块按 UTF-8 字节（单人端点 source content 上限 20000 字节，留余量）。
结果覆盖写入 audio-manifest.json 对应条目；保留旧 episodeId 到 state 便于回溯。

用法：
    python3 tools/regenerate_mono_audio.py --dry 01 02       # 预演
    python3 tools/regenerate_mono_audio.py 01 02             # 生成
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
SITE = WORKSPACE / "dankoe-src"
ARTICLES = SITE / "a"
MANIFEST = SITE / "audio-manifest.json"
STATE = WORKSPACE / "tools" / "mono_audio_state.json"
KEY_PATH = Path("/Users/zeyuansun/WorkBuddy/2026-11-03-12-18-35/data/audio/api_key.txt")

API = "https://api.marswave.ai/openapi/v1"
SPEAKER = "zh-male-guchuan-9d6a4666"
CHUNK_BYTES = 17000
THROTTLE_SEC = 6.0
POLL_SEC = 5
POLL_TIMEOUT = 2400
CREATE_RETRIES = 3


def log(*p): print(*p, flush=True)


def mask(s): return re.sub(r"(lh_sk_[A-Za-z0-9_\-]{6})[A-Za-z0-9_\-]+", r"\1***", s)


def api_key():
    k = KEY_PATH.read_text(encoding="utf-8").strip() if KEY_PATH.is_file() else ""
    if not k: raise RuntimeError("API Key 缺失")
    return k


def request(path, payload=None, timeout=60):
    headers = {"Authorization": "Bearer " + api_key()}
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=headers,
                                 method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try: return e.code, json.loads(raw)
        except Exception: return e.code, {"error": mask(raw[:300])}


def extract(slug):
    raw = (ARTICLES / (slug + ".html")).read_text(encoding="utf-8")
    hm = re.search(r"<h1[^>]*>(.*?)</h1>", raw, re.S)
    title = html.unescape(re.sub(r"<[^>]+>", "", hm.group(1))).strip() if hm else slug
    cm = re.search(r'<article id="content">(.*?)(?:id="enfull"|</article>)', raw, re.S)
    if not cm: raise RuntimeError(f"{slug}: 无正文")
    x = cm.group(1)
    x = re.sub(r'<blockquote class="meta">.*?</blockquote>', "", x, flags=re.S)
    x = re.sub(r'<div class="en-p"[^>]*>.*?</div>', "", x, flags=re.S)
    x = re.sub(r"<script.*?</script>|<style.*?</style>|<!--.*?-->", "", x, flags=re.S)
    x = re.sub(r"<(h[1-6]|p|li|br|section|div|blockquote)[^>]*>", "\n", x, flags=re.I)
    x = re.sub(r"<[^>]+>", "", x)
    x = html.unescape(x)
    x = re.sub(r"[ \t]+", " ", x)
    x = re.sub(r"\n{3,}", "\n\n", x).strip()
    if len(x) < 100: raise RuntimeError(f"{slug}: 正文太短")
    return title, x


def chunk_text(text):
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    chunks, cur, size = [], [], 0
    for p in paras:
        b = len(p.encode("utf-8"))
        if size + b > CHUNK_BYTES and cur:
            chunks.append("\n".join(cur)); cur, size = [], 0
        cur.append(p); size += b
    if cur: chunks.append("\n".join(cur))
    if len(chunks) > 1 and len(chunks[-1].encode("utf-8")) < 2400:
        tail = chunks.pop()
        chunks[-1] += "\n" + tail
    return chunks


def load(p, d):
    if not p.is_file(): return d
    try: return json.loads(p.read_text(encoding="utf-8"))
    except Exception: return d


def save(p, data):
    t = p.with_suffix(p.suffix + ".tmp")
    t.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    t.replace(p)


last = 0.0


def throttle():
    global last
    w = last + THROTTLE_SEC - time.time()
    if w > 0: time.sleep(w)
    last = time.time()


def create(chunk, title, idx, total):
    payload = {"sources": [{"type": "text", "content": chunk}],
               "speakers": [{"speakerId": SPEAKER}], "language": "zh",
               "mode": "direct", "format": "mp3",
               "title": title[:36] + f"（{idx + 1}/{total}）"}
    for a in range(1, CREATE_RETRIES + 1):
        throttle()
        st, j = request("/flow-speech/episodes", payload, timeout=120)
        data = (j or {}).get("data") if isinstance(j, dict) else None
        ep = (data or {}).get("episodeId") if isinstance(data, dict) else None
        if st == 200 and (j or {}).get("code") in (0, 200) and ep:
            return str(ep)
        log(f"  创建失败 {a}/{CREATE_RETRIES}: {mask(json.dumps(j, ensure_ascii=False)[:200] if isinstance(j, dict) else str(j)[:200])}")
        time.sleep(6 * a)
    raise RuntimeError("创建失败")


def wait(ep):
    t0 = time.time()
    while time.time() - t0 < POLL_TIMEOUT:
        time.sleep(POLL_SEC)
        st, j = request("/flow-speech/episodes/" + ep, timeout=45)
        d = (j or {}).get("data") if isinstance(j, dict) else {}
        d = d if isinstance(d, dict) else {}
        s = str(d.get("processStatus") or d.get("status") or "").lower()
        if s in {"success", "completed", "done", "ready", "finished"}:
            url = d.get("audioUrl") or d.get("audioURL")
            if not url: raise RuntimeError("完成但无 audioUrl")
            return str(url), float(d.get("credits") or 0)
        if s in {"fail", "failed", "error"}:
            raise RuntimeError("生成失败")
    raise RuntimeError("轮询超时")


def verify(url):
    with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=45) as r:
        if r.status >= 400: raise RuntimeError(f"HEAD {r.status}")


def main(argv):
    dry = "--dry" in argv
    targets = [a for a in argv if not a.startswith("--")]
    if not targets: print("用法：regenerate_mono_audio.py [--dry] <slug...>", file=sys.stderr); return 2
    manifest, state = load(MANIFEST, {}), load(STATE, {})
    spent = 0.0
    for slug in targets:
        title, text = extract(slug)
        chunks = chunk_text(text)
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        st = state.get(slug) or {}
        if st.get("hash") != digest:
            st = {"title": title, "hash": digest, "chars": len(text), "chunks": []}
            state[slug] = st; save(STATE, state)
        log(f"\n=== {slug} · {title} · {len(text)} 字 / {len(chunks)} 块 ===")
        if dry:
            for i, c in enumerate(chunks):
                log(f"  [{i+1}/{len(chunks)}] {len(c)} 字 / {len(c.encode('utf-8'))} 字节")
            continue
        for i, chunk in enumerate(chunks):
            done = st["chunks"][i] if i < len(st["chunks"]) else None
            if done and done.get("audioUrl"):
                log(f"  [{i+1}/{len(chunks)}] 已有，跳过"); continue
            for a in range(1, 3):
                try:
                    ep = create(chunk, title, i, len(chunks))
                    url, used = wait(ep); verify(url)
                    while len(st["chunks"]) <= i: st["chunks"].append(None)
                    st["chunks"][i] = {"episodeId": ep, "audioUrl": url, "chars": len(chunk), "credits": used}
                    spent += used; save(STATE, state)
                    parts = [{"audioUrl": c["audioUrl"], "audioStreamUrl": None,
                              "subtitlesUrl": "", "episodeId": c["episodeId"]}
                             for c in st["chunks"] if c and c.get("audioUrl")]
                    manifest[slug] = {"title": title, "speaker": SPEAKER, "parts": parts, "mode": "mono"}
                    save(MANIFEST, manifest)
                    log(f"  [{i+1}/{len(chunks)}] OK · {used:g} 积分")
                    break
                except Exception as e:
                    log(f"  [{i+1}/{len(chunks)}] 失败 {a}/2: {mask(str(e)[:200])}")
                    if a == 2: save(STATE, state); save(MANIFEST, manifest); return 1
                    time.sleep(12)
        log(f"=== {slug} 完成 ===")
    log(f"\n本次消耗约 {spent:g} 积分")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
