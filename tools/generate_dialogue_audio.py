#!/usr/bin/env python3
"""把对话体文章（有「克里斯：/纳瓦尔：」等说话人前缀）生成双人对讲 AI 朗读。

逐字朗读精修后的中文正文，按说话人分配音色，用 ListenHub 的
/v1/flow-speech/episodes/tts（多人异步逐字）端点。段首说话人姓名不念出来。
生成结果合并写入 dankoe-src/audio-manifest.json。API key 只读本地文件，不上网页、不打印。

用法：
    python3 tools/generate_dialogue_audio.py n02            # 单篇
    python3 tools/generate_dialogue_audio.py n02 n01 n03    # 多篇
    python3 tools/generate_dialogue_audio.py --dry n02      # 只预演，不调用 API
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
STATE = WORKSPACE / "tools" / "dialogue_audio_state.json"
KEY_PATH = Path("/Users/zeyuansun/WorkBuddy/2026-11-03-12-18-35/data/audio/api_key.txt")

API = "https://api.marswave.ai/openapi/v1"
SPEAKERS = {
    # 主人声：纳瓦尔固定男声「振松」
    "纳瓦尔": "nanzhongyin-4897116a",
    # 主持人/嘉宾：按性别与音色差异分配，保证对讲可辨
    "克里斯": "gaoqing3-bfb5c88a",        # 高晴 · 女声
    "尼维": "suzhe-45bbbe54",             # 苏哲 · 男声
    "埃里克": "chat-girl-105-cn",         # 晓曼 · 女声
    "吉列尔莫": "dp-6cc9831f",            # 约翰大叔 · 男声
    "马克斯": "xiaoyun",                  # 若云 · 女声
    "布莱克": "liyan3-f74976d9",          # 子墨 · 男声
    # 带姓氏的全名写法归到同一角色
    "吉列尔莫·劳赫": "dp-6cc9831f",
    "马克斯·霍达克": "xiaoyun",
    "布莱克·肖尔": "liyan3-f74976d9",
}
DEFAULT_SPEAKER = SPEAKERS["纳瓦尔"]
CHUNK_BYTES = 17000          # 文档写 20000 characters，但服务端按 UTF-8 字节算；中文 3B/字，留余量
THROTTLE_SEC = 6.0
POLL_SEC = 5
POLL_TIMEOUT = 2400
CREATE_RETRIES = 3

# 从文章里识别段首说话人（2-6 个汉字 + 冒号）
SPK_RE = re.compile(r"^([\u4e00-\u9fa5·]{2,6})[：:]")


def log(*parts):
    print(*parts, flush=True)


def mask(s: str) -> str:
    return re.sub(r"(lh_sk_[A-Za-z0-9_\-]{6})[A-Za-z0-9_\-]+", r"\1***", s)


def api_key() -> str:
    key = KEY_PATH.read_text(encoding="utf-8").strip() if KEY_PATH.is_file() else ""
    if not key:
        raise RuntimeError("API Key 不存在或为空：" + str(KEY_PATH))
    return key


def request(path: str, payload: dict | None = None, timeout: int = 60):
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
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": mask(raw[:300])}


def extract_script(slug: str) -> tuple[str, list[dict]]:
    raw = (ARTICLES / (slug + ".html")).read_text(encoding="utf-8")
    hm = re.search(r"<h1[^>]*>(.*?)</h1>", raw, re.S)
    title = html.unescape(re.sub(r"<[^>]+>", "", hm.group(1))).strip() if hm else slug
    cm = re.search(r'<article id="content">(.*?)(?:id="enfull"|</article>)', raw, re.S)
    if not cm:
        raise RuntimeError(f"{slug}: 找不到正文")
    body = cm.group(1)
    body = re.sub(r'<blockquote class="meta">.*?</blockquote>', "", body, flags=re.S)
    body = re.sub(r'<div class="en-p"[^>]*>.*?</div>', "", body, flags=re.S)
    pat = re.compile(r"<(h2|p)\s+data-b=\"[^\"]*\"\s+id=\"([^\"]+)\"[^>]*>(.*?)</\1>", re.S)
    lines: list[dict] = []
    current = None
    for tag, pid, zh in pat.findall(body):
        text = html.unescape(re.sub(r"<[^>]+>", "", zh)).strip()
        text = re.sub(r"\s+", " ", text)
        if not text:
            continue
        m = SPK_RE.match(text)
        if m and m.group(1) in SPEAKERS:
            current = m.group(1)
            text = text[m.end():].strip()   # 不念说话人姓名
        if not text:
            continue
        lines.append({"content": text, "speakerId": SPEAKERS.get(current, DEFAULT_SPEAKER),
                      "speaker": current or "纳瓦尔"})
    if len(lines) < 5:
        raise RuntimeError(f"{slug}: 有效台词太少")
    return title, lines


def chunk_script(lines: list[dict]) -> list[list[dict]]:
    chunks: list[list[dict]] = []
    cur: list[dict] = []
    size = 0
    for ln in lines:
        n = len(ln["content"].encode("utf-8"))
        if size + n > CHUNK_BYTES and cur:
            chunks.append(cur)
            cur, size = [], 0
        cur.append(ln)
        size += n
    if cur:
        chunks.append(cur)
    # 尾块太小则并入前块
    if len(chunks) > 1 and sum(len(x["content"].encode("utf-8")) for x in chunks[-1]) < 2400:
        tail = chunks.pop()
        chunks[-1].extend(tail)
    return chunks


def load_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)


last_create = 0.0


def throttle():
    global last_create
    wait = last_create + THROTTLE_SEC - time.time()
    if wait > 0:
        time.sleep(wait)
    last_create = time.time()


def create_episode(scripts: list[dict], title: str, idx: int, total: int) -> str:
    payload = {"scripts": [{"content": x["content"], "speakerId": x["speakerId"]} for x in scripts],
               "title": title[:36] + f"（对讲 {idx + 1}/{total}）"}
    for attempt in range(1, CREATE_RETRIES + 1):
        throttle()
        status, j = request("/flow-speech/episodes/tts", payload, timeout=120)
        data = (j or {}).get("data") if isinstance(j, dict) else None
        ep = (data or {}).get("episodeId") if isinstance(data, dict) else None
        if status == 200 and (j or {}).get("code") in (0, 200) and ep:
            return str(ep)
        msg = mask(json.dumps(j, ensure_ascii=False)[:300] if isinstance(j, dict) else str(j)[:300])
        log(f"  创建失败 {attempt}/{CREATE_RETRIES} HTTP {status}: {msg}")
        time.sleep(6 * attempt)
    raise RuntimeError("创建 episode 连续失败")


def wait_episode(epid: str) -> tuple[str, float]:
    t0 = time.time()
    while time.time() - t0 < POLL_TIMEOUT:
        time.sleep(POLL_SEC)
        status, j = request("/flow-speech/episodes/" + epid, timeout=45)
        data = (j or {}).get("data") if isinstance(j, dict) else {}
        data = data if isinstance(data, dict) else {}
        st = str(data.get("processStatus") or data.get("status") or "").lower()
        if st in {"success", "completed", "done", "ready", "finished"}:
            url = data.get("audioUrl") or data.get("audioURL")
            if not url:
                raise RuntimeError(f"episode {epid} 完成但没有 audioUrl")
            return str(url), float(data.get("credits") or 0)
        if st in {"fail", "failed", "error"}:
            raise RuntimeError(f"episode {epid} 失败: {mask(json.dumps(data, ensure_ascii=False)[:200])}")
    raise RuntimeError(f"episode {epid} 轮询超时")


def verify_url(url: str):
    req = urllib.request.Request(url, method="HEAD")
    with urllib.request.urlopen(req, timeout=45) as r:
        if r.status >= 400:
            raise RuntimeError(f"audio HEAD {r.status}")


def main(argv: list[str]) -> int:
    dry = "--dry" in argv
    targets = [a for a in argv if a != "--dry"]
    if not targets:
        print("用法：generate_dialogue_audio.py [--dry] <slug...>", file=sys.stderr)
        return 2
    manifest = load_json(MANIFEST, {})
    state = load_json(STATE, {})
    spent = 0.0

    status, sub = request("/user/subscription", timeout=30)
    credits = ((sub or {}).get("data") or {}).get("totalAvailableCredits") if isinstance(sub, dict) else None
    log(f"ListenHub 积分：{credits}；目标：{', '.join(targets)}；dry={dry}")

    for slug in targets:
        title, lines = extract_script(slug)
        chunks = chunk_script(lines)
        digest = hashlib.sha256(json.dumps(lines, ensure_ascii=False).encode()).hexdigest()[:16]
        st = state.get(slug) or {}
        if st.get("hash") != digest:
            st = {"title": title, "hash": digest, "lines": len(lines), "chunks": []}
            state[slug] = st
            save_json(STATE, state)
        total_chars = sum(len(x["content"]) for x in lines)
        log(f"\n=== {slug} · {title} · {len(lines)} 句 / {total_chars} 字 / {len(chunks)} 块 ===")
        if dry:
            for i, c in enumerate(chunks):
                s = sum(len(x["content"]) for x in c)
                by = sum(len(x["content"].encode("utf-8")) for x in c)
                a = sum(1 for x in c if x["speaker"] == "克里斯")
                b = len(c) - a
                log(f"  [{i+1}/{len(chunks)}] {s} 字 / {by} 字节 · 克里斯{a}句/纳瓦尔{b}句")
            continue
        for i, chunk in enumerate(chunks):
            done = st["chunks"][i] if i < len(st["chunks"]) else None
            if done and done.get("audioUrl"):
                log(f"  [{i+1}/{len(chunks)}] 已有音频，跳过")
                continue
            for attempt in range(1, 3):
                try:
                    ep = create_episode(chunk, title, i, len(chunks))
                    url, used = wait_episode(ep)
                    verify_url(url)
                    while len(st["chunks"]) <= i:
                        st["chunks"].append(None)
                    st["chunks"][i] = {"episodeId": ep, "audioUrl": url, "chars": sum(len(x["content"]) for x in chunk), "credits": used}
                    spent += used
                    save_json(STATE, state)
                    parts = [{"audioUrl": c["audioUrl"], "audioStreamUrl": None,
                              "subtitlesUrl": "", "episodeId": c["episodeId"]}
                             for c in st["chunks"] if c and c.get("audioUrl")]
                    manifest[slug] = {"title": title, "speaker": "dual:高晴/振松", "parts": parts,
                                      "mode": "dialogue"}
                    save_json(MANIFEST, manifest)
                    log(f"  [{i+1}/{len(chunks)}] OK · {used:g} 积分 · {url.rsplit('/',1)[-1]}")
                    break
                except Exception as e:
                    log(f"  [{i+1}/{len(chunks)}] 失败 {attempt}/2: {mask(str(e)[:250])}")
                    if attempt == 2:
                        save_json(STATE, state); save_json(MANIFEST, manifest)
                        return 1
                    time.sleep(12)
        log(f"=== {slug} 完成 · {len([c for c in st['chunks'] if c and c.get('audioUrl')])} 段 ===")
    log(f"\n本次新增消耗约 {spent:g} 积分。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
