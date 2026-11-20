#!/usr/bin/env python3
"""把 /tmp/refine_batches/<slug>_b*.json 的精修结果写回对应文章 HTML。
只替换 <h2/p data-b id> 的中文文本，英文 en-p / id / data-b / enfull 全部不动。
"""
import glob
import html as H
import json
import os
import re
import shutil
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "dankoe-src"


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def apply(slug: str, dry: bool = False) -> bool:
    path = SITE / "a" / (slug + ".html")
    src = path.read_text(encoding="utf-8")
    files = sorted(glob.glob(f"/tmp/refine_batches/{slug}_b*.json"),
                   key=lambda x: int(re.search(r"_b(\d+)\.json", x).group(1)))
    if not files:
        print(f"{slug}: 无精修映射文件"); return False
    mp = {}
    for f in files:
        mp.update(json.load(open(f, encoding="utf-8")))
    applied = 0
    for pid, zh in mp.items():
        tag = "h2" if pid.startswith("s") else "p"
        pat = re.compile(r'(<' + tag + r'\s+data-b="[^"]*"\s+id="' + re.escape(pid) +
                         r'"[^>]*>)(.*?)(</' + tag + r'>)', re.S)
        m = pat.search(src)
        if not m:
            print(f"  {slug} {pid}: 未找到，跳过"); continue
        src = src[:m.start(2)] + esc(zh) + src[m.end(2):]
        applied += 1
    # validate
    pat2 = re.compile(r'<(h2|p)\s+data-b="([^"]*)"\s+id="([^"]+)"[^>]*>(.*?)</\1>\s*'
                      r'<div\s+class="en-p"[^>]*>(.*?)</div>', re.S)
    pairs = pat2.findall(src)
    ids = [x[2] for x in pairs]
    if len(ids) != len(set(ids)):
        print(f"{slug}: 重复 id，放弃写入"); return False
    if not dry:
        bak = Path(f"/tmp/{slug}_pre_refine.html")
        if not bak.exists():
            shutil.copyfile(path, bak)
        path.write_text(src, encoding="utf-8")
    print(f"{slug}: 写入 {applied} 段 / {len(pairs)} 对（{'dry' if dry else 'saved'}）")
    return True


if __name__ == "__main__":
    slugs = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry" in sys.argv
    for s in slugs:
        apply(s, dry)
