/* Full-viewport slide/beat reader for the published site.
   Navigation language: hash beats, overview, slow transitions.
   Implementation and typography are original. No artifact source or 3D worlds. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);

  const state = {
    deck: null,
    scene: 0,
    beat: 0,
    busy: false,
    autoplay: false,
    autoTimer: 0,
    idleTimer: 0,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  const TRANS_MS = {
    fade: 1300,
    fold: 1500,
    wash: 2000,
    "portal-in": 1600,
    "portal-out": 1600,
  };
  /* Apply the incoming scene tone only after the outgoing page is covered or faded. */
  const TONE_MS = {
    fade: 550,
    fold: 650,
    wash: 500,
    "portal-in": 650,
    "portal-out": 700,
  };

  const segmenter =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter("zh", { granularity: "word" })
      : null;

  const TRAIL = /^[的了着过们吗呢吧啊呀么嘛得地]$/;
  const PUNCT_ONLY = /^[。．、，；：！？!?…—–)）」』】》'"”’％%]+$/;
  const OPEN = /^[（(「『【《“‘"']/;
  const PREFIX = new Set(
    Array.from(
      "从把被让向对在用比和与或也不没未可会能要想去来给到很最太更挺才又再还就都所已正因以于按据及即连同为你我他她它这那其是之再"
    )
  );
  const CLAUSE = /[。！？!?，、；：]$/;
  const LEX = [
    "契克森米哈赖",
    "麦克斯威尔",
    "巴克敏斯特",
    "阿尔弗雷德",
    "亚里士多德",
    "最小可行愿景",
    "深度工作法",
    "具体结果",
    "身份认同",
    "心智层级",
    "操作系统",
    "新年决心",
    "生活方式",
    "财务自由",
    "信息茧房",
    "人生使命",
    "自我保护",
    "自我觉察",
    "身份宣言",
    "内在动机",
    "电子游戏",
    "整个人生",
    "真正改变",
    "彻底修正",
    "彻底失败",
    "彻底受够",
    "想要之物",
    "主线任务",
    "日常任务",
    "深度工作",
    "工作法",
    "反愿景",
    "自律",
    "纳瓦尔",
    "马尔茨",
    "阿德勒",
    "塞涅卡",
    "居高临下",
    "毫不费力",
    "毫无进展",
    "身份地位",
    "行为改变",
    "宏大目标",
    "地球村",
    "电子小屋",
    "家庭手工业",
    "生产消费者",
    "心流状态",
    "一年透镜",
    "一个月透镜",
    "每日透镜",
    "心理挖掘",
    "自动驾驶",
    "无意识",
    "有意义",
    "氛围编程",
    "能动性",
    "财务自由",
    "心智层级",
    "残酷真相",
    "宝典五周年",
    "具体知识",
    "特定知识",
    "杠杆",
    "判断力",
    "湿件",
    "纳瓦尔",
    "丹科",
    "生活方式生意",
    "一人公司",
    "数字文艺复兴",
    "大规模替代",
    "工资奴役",
    "极致专注",
    "深度工作法",
    "工作的未来",
    "战略思维",
    "身份地位",
    "心流",
    "反愿景",
    "最小可行",
  ].sort((a, b) => Array.from(b).length - Array.from(a).length);

  function isCJK(ch) {
    return /[\u4e00-\u9fff]/.test(ch);
  }
  function cjkCount(s) {
    return Array.from(s).filter(isCJK).length;
  }
  function firstCJK(s) {
    return Array.from(s).find(isCJK) || "";
  }
  function isLooseSingle(s) {
    return cjkCount(s) === 1 && !/[A-Za-z0-9]/.test(s);
  }

  function lexSplit(line) {
    const chars = Array.from(line);
    const parts = [];
    let i = 0;
    while (i < chars.length) {
      let hit = null;
      for (const w of LEX) {
        const wchars = Array.from(w);
        if (chars.slice(i, i + wchars.length).join("") === w) {
          hit = w;
          break;
        }
      }
      if (hit) {
        parts.push({ lex: true, t: hit });
        i += Array.from(hit).length;
      } else {
        if (parts.length && parts[parts.length - 1].lex === false) parts[parts.length - 1].t += chars[i];
        else parts.push({ lex: false, t: chars[i] });
        i += 1;
      }
    }
    return parts;
  }

  function rawSegments(text) {
    if (segmenter) {
      const raw = [];
      for (const run of lexSplit(text)) {
        if (run.lex) raw.push(run.t);
        else for (const { segment } of segmenter.segment(run.t)) raw.push(segment);
      }
      return raw;
    }
    return lexSplit(text).map((p) => p.t);
  }

  function tokenizeLine(line) {
    const raw = rawSegments(line);
    const acc = [];
    for (const seg of raw) {
      if (!seg) continue;
      if (acc.length && (PUNCT_ONLY.test(seg) || TRAIL.test(seg))) {
        acc[acc.length - 1] += seg;
        continue;
      }
      acc.push(seg);
    }
    const gluedOpen = [];
    for (const seg of acc) {
      const prev = gluedOpen[gluedOpen.length - 1];
      if (prev && OPEN.test(prev) && cjkCount(prev) === 0) gluedOpen[gluedOpen.length - 1] += seg;
      else gluedOpen.push(seg);
    }
    const merged = [];
    for (const seg of gluedOpen) {
      const prev = merged[merged.length - 1];
      const canMerge =
        prev && isLooseSingle(prev) && isLooseSingle(seg) && !PREFIX.has(firstCJK(seg));
      if (canMerge) merged[merged.length - 1] += seg;
      else merged.push(seg);
    }
    const out = [];
    for (let i = 0; i < merged.length; i++) {
      const seg = merged[i];
      if (!isLooseSingle(seg) || /^\s+$/.test(seg)) {
        out.push(seg);
        continue;
      }
      const prev = out[out.length - 1];
      const next = merged[i + 1];
      const prevGlue = prev && cjkCount(prev) && !CLAUSE.test(prev);
      const nextGlue = next && cjkCount(next);
      if (PREFIX.has(firstCJK(seg)) && nextGlue) merged[i + 1] = seg + next;
      else if (PREFIX.has(firstCJK(seg)) && next && /^\s/.test(next)) out.push(seg);
      else if (prevGlue) out[out.length - 1] = prev + seg;
      else if (nextGlue) merged[i + 1] = seg + next;
      else out.push(seg);
    }
    return out;
  }

  function shouldNowrap(tok) {
    return cjkCount(tok) >= 2 || (cjkCount(tok) >= 1 && /[。．、，；：！？!?…—–)）」』】》'"”’]/.test(tok));
  }

  function fillLine(target, line) {
    tokenizeLine(line).forEach((tok) => {
      if (tok === "") return;
      if (shouldNowrap(tok)) {
        const s = document.createElement("span");
        s.className = "nw";
        s.textContent = tok;
        target.appendChild(s);
      } else {
        target.appendChild(document.createTextNode(tok));
      }
    });
  }

  function appendProtected(node, text, opts) {
    const lock = opts && opts.lockLines;
    const lines = String(text ?? "").split("\n");
    lines.forEach((line, i) => {
      if (i) node.appendChild(document.createElement("br"));
      if (lock) {
        const wrap = document.createElement("span");
        wrap.className = "line-lock";
        fillLine(wrap, line);
        node.appendChild(wrap);
      } else {
        fillLine(node, line);
      }
    });
  }

  function sceneOf(i) {
    return state.deck.scenes[i];
  }
  function beatOf(si, bi) {
    return state.deck.scenes[si].beats[bi];
  }
  function totals() {
    const scenes = state.deck.scenes;
    return { scenes: scenes.length, beats: scenes[state.scene].beats.length };
  }

  function hashFor(si, bi) {
    const id = scenesSafe(si).id;
    return bi === 0 ? `#${id}` : `#${id}-${bi + 1}`;
  }
  function scenesSafe(i) {
    return state.deck.scenes[Math.max(0, Math.min(i, state.deck.scenes.length - 1))];
  }

  function cfg() {
    return window.DK_READER || {};
  }

  function classicOnlyId(id) {
    return /^(actions|enfull)$/i.test(id);
  }

  function findPid(pid) {
    const scenes = state.deck.scenes;
    for (let si = 0; si < scenes.length; si++) {
      const beats = scenes[si].beats;
      for (let bi = 0; bi < beats.length; bi++) {
        const ids = beats[bi].pids || [];
        if (ids.includes(pid)) return { scene: si, beat: bi };
      }
    }
    return null;
  }

  function parseHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    if (!raw) return { scene: 0, beat: 0 };
    const m = raw.match(/^([A-Za-z][A-Za-z0-9]*)(?:-(\d+))?$/);
    if (!m) return { scene: 0, beat: 0 };
    const id = m[1];
    if (classicOnlyId(id) && cfg().classicUrl) {
      return { redirect: cfg().classicUrl + location.hash };
    }
    const si = state.deck.scenes.findIndex((s) => s.id === id);
    if (si >= 0) {
      const max = state.deck.scenes[si].beats.length;
      let bi = m[2] ? parseInt(m[2], 10) - 1 : 0;
      if (Number.isNaN(bi) || bi < 0) bi = 0;
      if (bi >= max) bi = max - 1;
      return { scene: si, beat: bi };
    }
    const hit = findPid(id);
    if (hit) return hit;
    return { scene: 0, beat: 0 };
  }

  function setHash(si, bi) {
    const next = hashFor(si, bi);
    if (location.hash === next) return;
    history.replaceState(null, "", next);
  }

  function essayTitle() {
    const t = (state.deck.meta && state.deck.meta.title) || document.title;
    return String(t).replace(/\n/g, "");
  }

  function updateDocTitle() {
    document.title = essayTitle() + " · 纳瓦尔与 Dan Koe";
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null && text !== "") appendProtected(n, text);
    return n;
  }

  function writeChars(target, text, opts) {
    const lock = !opts || opts.lockLines !== false;
    const frag = document.createDocumentFragment();
    let delay = 0;
    String(text ?? "")
      .split("\n")
      .forEach((line, li) => {
        if (li) frag.appendChild(document.createElement("br"));
        const lineWrap = document.createElement("span");
        lineWrap.className = lock ? "line-lock" : "tw";
        tokenizeLine(line).forEach((tok) => {
          const wrap = document.createElement("span");
          wrap.className = shouldNowrap(tok) ? "nw" : "tw";
          Array.from(tok).forEach((ch) => {
            if (ch === " ") {
              wrap.appendChild(document.createTextNode("\u00a0"));
              delay += 1;
              return;
            }
            const s = document.createElement("span");
            s.className = "ch";
            s.textContent = ch;
            s.style.animationDelay = `${Math.min(delay * 0.045, 2.8)}s`;
            wrap.appendChild(s);
            delay += 1;
          });
          lineWrap.appendChild(wrap);
        });
        frag.appendChild(lineWrap);
      });
    target.appendChild(frag);
  }

  function renderBeat(scene, beat) {
    const root = el("div", `beat layout-${beat.layout || "read"} reveal-${beat.reveal || "fade"}`);
    const appear = (node) => {
      node.classList.add("appear");
      return node;
    };

    if (beat.kicker) root.appendChild(appear(el("p", "kicker", beat.kicker)));
    if (beat.title) {
      const h = document.createElement("h1");
      h.className = "title" + (beat.titleSize === "quiet" ? " quiet" : "");
      if (beat.reveal === "write") writeChars(h, beat.title);
      else {
        appear(h);
        appendProtected(h, beat.title, { lockLines: true });
      }
      root.appendChild(h);
    }
    if (beat.en) root.appendChild(appear(el("p", "en", beat.en)));
    if (beat.lead) root.appendChild(appear(el("p", "lead", beat.lead)));

    if (beat.layout === "toc" && beat.cards) {
      const toc = appear(document.createElement("div"));
      toc.className = "toc appear";
      beat.cards.forEach((c) => {
        const a = document.createElement("a");
        a.className = "card";
        a.href = `#${c.goto}`;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          jumpToId(c.goto, 0);
        });
        if (c.kicker) a.appendChild(el("p", "cd", c.kicker));
        a.appendChild(el("h2", "", c.title));
        if (c.en) a.appendChild(el("p", "ce", c.en));
        if (c.blurb) a.appendChild(el("p", "cx", c.blurb));
        toc.appendChild(a);
      });
      root.appendChild(toc);
    }

    let firstP = true;
    if (beat.blocks) {
      beat.blocks.forEach((b) => {
        if (b.type === "p") {
          const p = appear(el("p", "block p" + (firstP ? " first" : ""), b.text));
          firstP = false;
          root.appendChild(p);
        } else if (b.type === "claim") {
          const p = document.createElement("p");
          p.className = "block claim appear";
          const lock = String(b.text || "").includes("\n");
          if (beat.reveal === "write") writeChars(p, b.text, { lockLines: lock });
          else appendProtected(p, b.text, { lockLines: lock });
          root.appendChild(p);
        } else if (b.type === "quote") {
          const q = document.createElement("blockquote");
          q.className = "block quote appear";
          appendProtected(q, b.text);
          if (b.attr) q.appendChild(el("span", "attr", b.attr));
          root.appendChild(q);
        } else if (b.type === "hint") {
          root.appendChild(appear(el("p", "hint", b.text)));
        } else if (b.type === "credit") {
          const d = document.createElement("div");
          d.className = "credit appear";
          if (b.html) d.innerHTML = b.html;
          else appendProtected(d, b.text || "");
          root.appendChild(d);
        } else if (b.type === "comment") {
          root.appendChild(appear(el("p", "block comment", b.text)));
        }
      });
    }

    if (beat.list) {
      const list = appear(document.createElement(beat.list.ordered === false ? "ul" : "ol"));
      list.className = "list appear";
      const start = beat.list.start || 1;
      if (start !== 1) {
        list.setAttribute("start", String(start));
        list.style.counterReset = "n " + (start - 1);
      }
      beat.list.items.forEach((item) => {
        const li = document.createElement("li");
        const zh = typeof item === "string" ? item : item.zh;
        li.appendChild(el("span", "zh", zh));
        if (item && item.en) li.appendChild(el("span", "en", item.en));
        list.appendChild(li);
      });
      root.appendChild(list);
    }

    if (beat.questions) {
      const box = appear(document.createElement("div"));
      box.className = "questions appear";
      beat.questions.forEach((q) => {
        const p = document.createElement("p");
        p.className = "q";
        if (q.n) p.appendChild(el("span", "n", q.n));
        appendProtected(p, q.text);
        box.appendChild(p);
      });
      root.appendChild(box);
    }

    if (beat.map) {
      const box = appear(document.createElement("div"));
      box.className = "game-map appear";
      beat.map.forEach((row) => {
        const r = document.createElement("div");
        r.className = "row";
        r.appendChild(el("div", "k", row.k));
        r.appendChild(el("div", "v", row.v));
        box.appendChild(r);
      });
      root.appendChild(box);
    }

    if (beat.figure) {
      const fig = appear(document.createElement("figure"));
      fig.className = "shot appear";
      const img = document.createElement("img");
      img.src = beat.figure.src;
      img.alt = beat.figure.alt || "";
      img.loading = "lazy";
      fig.appendChild(img);
      if (beat.figure.caption) fig.appendChild(el("figcaption", "", beat.figure.caption));
      root.appendChild(fig);
    }

    if (beat.links) {
      const box = appear(document.createElement("div"));
      box.className = "end-links appear";
      beat.links.forEach((l) => {
        const a = document.createElement("a");
        a.href = l.href;
        a.addEventListener("click", (e) => e.stopPropagation());
        if (l.kicker) a.appendChild(el("p", "ek", l.kicker));
        a.appendChild(el("p", "et", l.title));
        box.appendChild(a);
      });
      root.appendChild(box);
    }

    if (beat.hint) root.appendChild(appear(el("p", "hint", beat.hint)));
    return root;
  }

  function updateHud() {
    const t = totals();
    const s = String(state.scene + 1).padStart(2, "0");
    const S = String(t.scenes).padStart(2, "0");
    const b = String(state.beat + 1);
    $("#hud").textContent = `${s} / ${S}  ·  ${b} / ${t.beats}`;
  }

  function updateNotes() {
    const scene = sceneOf(state.scene);
    const beat = beatOf(state.scene, state.beat);
    const t = totals();
    const body = $("#notes-body");
    body.replaceChildren();
    body.appendChild(el("p", "", scene.title.replace(/\n/g, "")));
    body.appendChild(el("p", "dim", `${state.scene + 1} / ${t.scenes}  ·  ${state.beat + 1} / ${t.beats}`));
    body.appendChild(el("p", "", beat.note || "正文均逐字取自已发布译本，未改写文章。"));
    const citeHtml = scene.citation || (state.deck.meta && state.deck.meta.citation);
    if (citeHtml) {
      const cite = document.createElement("div");
      cite.className = "citation";
      cite.innerHTML = citeHtml;
      body.appendChild(cite);
    }
    const meta = state.deck.meta || {};
    const links = document.createElement("div");
    links.className = "notes-links";
    const add = (href, label) => {
      if (!href) return;
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      links.appendChild(a);
    };
    add(meta.home || "../index.html", "返回首页");
    add(meta.classic, "原版排印（划线、听读、行动卡）");
    add(meta.notes || "../notes.html", "我的笔记");
    add(meta.glossary || "../glossary.html", "概念词典");
    if (meta.prev) add(meta.prev.href, "上一篇：" + meta.prev.title);
    if (meta.next) add(meta.next.href, "下一篇：" + meta.next.title);
    body.appendChild(links);
    if (meta.attribution) body.appendChild(el("p", "dim", meta.attribution));
  }

  function flattenLabel(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .replace(/\s*([，。！？；：、])\s*/g, "$1")
      .trim();
  }

  function clipLabel(s, max) {
    const t = flattenLabel(s);
    if (!t) return "";
    const chars = Array.from(t);
    const limit = max || 28;
    if (chars.length <= limit) return t;
    const grace = Math.min(chars.length, limit + 8);
    for (let i = 8; i < grace; i++) {
      if (/[。！？]/.test(chars[i])) return chars.slice(0, i + 1).join("");
    }
    const slice = chars.slice(0, limit);
    const punct = /[。！？；：，、]/;
    for (let i = slice.length - 1; i >= Math.max(8, slice.length - 10); i--) {
      if (punct.test(slice[i])) return slice.slice(0, i + 1).join("");
    }
    return slice.join("").replace(/[，、；：\s]+$/, "") + "…";
  }

  function scrollOverviewToCurrent() {
    const list = $("#overview-grid");
    const ov = $("#overview");
    if (!list || !ov || !ov.classList.contains("open")) return;
    const scene = list.querySelector(".toc-scene.current");
    if (!scene) return;
    const beat = list.querySelector(".toc-beats button.current");
    const listRect = list.getBoundingClientRect();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.top >= listRect.top - 2 && r.bottom <= listRect.bottom + 2;
    };
    const header = scene.querySelector(".toc-row") || scene;
    if (visible(header) && (!beat || visible(beat))) return;
    const span = (beat ? beat.getBoundingClientRect().bottom : header.getBoundingClientRect().bottom) - scene.getBoundingClientRect().top;
    if (span <= listRect.height - 4) {
      scene.scrollIntoView({ block: "start" });
      return;
    }
    (beat || scene).scrollIntoView({ block: "nearest" });
  }

  function beatLabel(beat, index) {
    if (beat.title) return clipLabel(beat.title, 32) || `第 ${index + 1} 拍`;
    const claim = (beat.blocks || []).find((b) => b.type === "claim" && b.text);
    if (claim) return clipLabel(claim.text);
    if (beat.kicker) return clipLabel(beat.kicker);
    if (beat.lead) return clipLabel(beat.lead);
    const firstBlock = (beat.blocks || []).find((b) => b.text);
    if (firstBlock) return clipLabel(firstBlock.text);
    if (beat.list && beat.list.items && beat.list.items.length) {
      const item = beat.list.items[0];
      const zh = typeof item === "string" ? item : item.zh;
      if (zh) return clipLabel(zh);
    }
    if (beat.questions && beat.questions.length) {
      const q = beat.questions[0];
      const n = q.n ? `${q.n} ` : "";
      if (q.text) return clipLabel(n + q.text);
    }
    if (beat.figure) {
      const fig = clipLabel(beat.figure.caption || beat.figure.alt);
      if (fig) return fig;
    }
    if (beat.map && beat.map.length) {
      const row = beat.map[0];
      const t = clipLabel([row.k, row.v].filter(Boolean).join(" "));
      if (t) return t;
    }
    if (beat.cards && beat.cards.length && beat.cards[0].title) return clipLabel(beat.cards[0].title);
    if (beat.links && beat.links[0] && beat.links[0].title) return clipLabel(beat.links[0].title);
    if (beat.hint) return clipLabel(beat.hint);
    return `第 ${index + 1} 拍`;
  }

  function paintOverview(opts) {
    const list = $("#overview-grid");
    if (!list || !state.deck) return;
    const keepScroll = opts && opts.keepScroll ? list.scrollTop : null;
    list.replaceChildren();
    if (!state.tocExpanded) state.tocExpanded = new Set([state.scene]);
    state.deck.scenes.forEach((sc, i) => {
      const n = sc.beats.length;
      const expanded = n > 1 && state.tocExpanded.has(i);
      const sceneEl = document.createElement("div");
      sceneEl.className = "toc-scene" + (i === state.scene ? " current" : "") + (expanded ? " open" : "");

      const row = document.createElement("div");
      row.className = "toc-row";

      const go = document.createElement("button");
      go.type = "button";
      go.className = "toc-go";
      go.textContent = flattenLabel(sc.title);
      if (i === state.scene) go.setAttribute("aria-current", "page");
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        closeOverlays();
        jump(i, 0);
      });
      row.appendChild(go);

      if (n > 1) {
        const tog = document.createElement("button");
        tog.type = "button";
        tog.className = "toc-toggle";
        tog.setAttribute("aria-expanded", expanded ? "true" : "false");
        tog.setAttribute("aria-label", `${expanded ? "收起" : "展开"}${n}拍`);
        const count = document.createElement("span");
        count.className = "toc-n";
        count.textContent = `${n} 拍`;
        const chev = document.createElement("span");
        chev.className = "toc-chev";
        chev.setAttribute("aria-hidden", "true");
        chev.textContent = expanded ? "▴" : "▾";
        tog.appendChild(count);
        tog.appendChild(chev);
        tog.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.tocExpanded.has(i)) state.tocExpanded.delete(i);
          else state.tocExpanded.add(i);
          paintOverview({ keepScroll: true });
        });
        row.appendChild(tog);
      } else {
        const meta = document.createElement("span");
        meta.className = "toc-count";
        meta.textContent = "1 拍";
        row.appendChild(meta);
      }

      sceneEl.appendChild(row);

      if (expanded) {
        const beats = document.createElement("div");
        beats.className = "toc-beats";
        beats.setAttribute("role", "list");
        sc.beats.forEach((beat, bi) => {
          const bbtn = document.createElement("button");
          bbtn.type = "button";
          bbtn.setAttribute("role", "listitem");
          if (i === state.scene && bi === state.beat) {
            bbtn.classList.add("current");
            bbtn.setAttribute("aria-current", "true");
          }
          const num = document.createElement("span");
          num.className = "n";
          num.textContent = String(bi + 1);
          const lab = document.createElement("span");
          lab.className = "lab";
          lab.textContent = beatLabel(beat, bi);
          bbtn.appendChild(num);
          bbtn.appendChild(lab);
          bbtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeOverlays();
            jump(i, bi);
          });
          beats.appendChild(bbtn);
        });
        sceneEl.appendChild(beats);
      }

      list.appendChild(sceneEl);
    });

    if (keepScroll != null) {
      list.scrollTop = keepScroll;
      return;
    }
    scrollOverviewToCurrent();
  }

  function applyTone(scene) {
    $("#stage").dataset.tone = scene.tone || "paper";
  }

  function mount(si, bi, trans) {
    const scene = sceneOf(si);
    const beat = beatOf(si, bi);
    const root = $("#scene-root");
    const incoming = document.createElement("div");
    incoming.className = "scene-layer entering";
    incoming.dataset.tone = scene.tone || "paper";
    incoming.appendChild(renderBeat(scene, beat));
    if (beat.drift !== false && beat.layout === "claim") incoming.classList.add("hold-drift");

    const outgoing = root.querySelector(".scene-layer");

    if (!outgoing || trans === "none" || state.reduced) {
      applyTone(scene);
      root.replaceChildren(incoming);
      incoming.classList.remove("entering");
      finishMount(si, bi);
      return;
    }

    state.busy = true;
    $("#stage").classList.remove("trans-fade", "trans-fold", "trans-wash", "trans-portal-in", "trans-portal-out");
    const name = trans || "fade";
    $("#stage").classList.add(`trans-${name}`);
    outgoing.classList.add("leaving");
    outgoing.classList.remove("entering");
    root.appendChild(incoming);

    const toneAt = TONE_MS[name] || 550;
    window.clearTimeout(state.toneTimer);
    state.toneTimer = window.setTimeout(() => applyTone(scene), toneAt);

    const ms = TRANS_MS[name] || 1300;
    window.clearTimeout(state.transTimer);
    state.transTimer = window.setTimeout(() => {
      outgoing.remove();
      incoming.classList.remove("entering");
      $("#stage").classList.remove(`trans-${name}`);
      applyTone(scene);
      finishMount(si, bi);
    }, ms);
  }

  function relaxOverflowingLocks(root) {
    if (!root) return;
    const beat = root.querySelector(".beat") || root;
    const limit = beat.clientWidth;
    if (!limit) return;
    const beatRight = beat.getBoundingClientRect().right;
    beat.querySelectorAll(".line-lock").forEach((el) => {
      el.classList.remove("relax");
      const r = el.getBoundingClientRect();
      // inline spans often report scrollWidth 0; use the painted box instead
      if (r.width > limit + 0.5 || r.right > beatRight + 0.5) el.classList.add("relax");
    });
    if (beat.scrollWidth > beat.clientWidth + 1) {
      beat.querySelectorAll(".nw").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > limit + 0.5 || r.right > beatRight + 0.5) el.classList.add("relax");
      });
    }
  }

  function afterLayout() {
    const layer = document.querySelector("#scene-root .scene-layer:not(.leaving)");
    if (layer) relaxOverflowingLocks(layer);
  }

  function finishMount(si, bi) {
    state.scene = si;
    state.beat = bi;
    state.busy = false;
    setHash(si, bi);
    updateHud();
    updateNotes();
    updateDocTitle();
    paintOverview();
    scheduleAutoplay();
    requestAnimationFrame(() => {
      afterLayout();
      requestAnimationFrame(afterLayout);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(afterLayout).catch(() => {});
    }
  }

  function go(delta, opts) {
    if (state.busy) return;
    if ($("#overview").classList.contains("open") || $("#help").classList.contains("open") || $("#notes").classList.contains("open")) return;
    let si = state.scene;
    let bi = state.beat + delta;
    const scenes = state.deck.scenes;
    if (bi >= scenes[si].beats.length) {
      if (si >= scenes.length - 1) {
        const nxt = state.deck.meta && state.deck.meta.next;
        if ((!opts || !opts.fromTap) && nxt && nxt.href) location.href = nxt.href;
        return;
      }
      si += 1;
      bi = 0;
      mount(si, bi, scenes[si].enter || "fade");
      return;
    }
    if (bi < 0) {
      if (si <= 0) return;
      si -= 1;
      bi = scenes[si].beats.length - 1;
      mount(si, bi, "fade");
      return;
    }
    mount(si, bi, "fade");
  }

  function jump(si, bi) {
    if (state.busy) return;
    si = Math.max(0, Math.min(si, state.deck.scenes.length - 1));
    bi = Math.max(0, Math.min(bi, state.deck.scenes[si].beats.length - 1));
    if (si === state.scene && bi === state.beat) return;
    const trans = si === state.scene ? "fade" : state.deck.scenes[si].enter || "fade";
    mount(si, bi, trans);
  }

  function jumpToId(id, bi) {
    const si = state.deck.scenes.findIndex((s) => s.id === id);
    if (si >= 0) jump(si, bi || 0);
  }

  function closeOverlays() {
    ["help", "overview", "notes"].forEach((id) => $(`#${id}`).classList.remove("open"));
  }

  function toggle(id) {
    const eln = $(`#${id}`);
    const open = eln.classList.contains("open");
    closeOverlays();
    if (!open) {
      if (id === "overview") {
        state.tocExpanded = new Set([state.scene]);
        paintOverview();
      }
      if (id === "notes") updateNotes();
      eln.classList.add("open");
      if (id === "overview") {
        requestAnimationFrame(() => requestAnimationFrame(scrollOverviewToCurrent));
      }
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function scheduleAutoplay() {
    window.clearTimeout(state.autoTimer);
    if (!state.autoplay) return;
    const beat = beatOf(state.scene, state.beat);
    const hold = beat.hold || 5000;
    const last =
      state.scene === state.deck.scenes.length - 1 &&
      state.beat === sceneOf(state.scene).beats.length - 1;
    if (last) {
      state.autoplay = false;
      return;
    }
    state.autoTimer = window.setTimeout(() => go(1), hold);
  }

  function pokeIdle() {
    document.body.classList.remove("idle");
    window.clearTimeout(state.idleTimer);
    state.idleTimer = window.setTimeout(() => document.body.classList.add("idle"), 3200);
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "Escape") {
      closeOverlays();
      return;
    }
    if (k === "?" || (k === "/" && e.shiftKey)) {
      e.preventDefault();
      toggle("help");
      return;
    }
    if (k === "o" || k === "O") {
      e.preventDefault();
      toggle("overview");
      return;
    }
    if (k === "n" || k === "N") {
      e.preventDefault();
      toggle("notes");
      return;
    }
    if (k === "f" || k === "F") {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (k === "a" || k === "A") {
      e.preventDefault();
      state.autoplay = !state.autoplay;
      scheduleAutoplay();
      return;
    }
    if (k === "t" || k === "T") {
      e.preventDefault();
      toggleTheme();
      return;
    }
    if (k === "ArrowRight" || k === " " || k === "Spacebar") {
      e.preventDefault();
      go(1);
      return;
    }
    if (k === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  const gesture = { start: null };

  function isInteractive(el) {
    return !!(el && el.closest && el.closest("a, button, #chrome, #hud, #toc-btn, .overlay, .card, .panel, .end-links, #tap-hint"));
  }

  function overlaysOpen() {
    return $("#help").classList.contains("open") || $("#overview").classList.contains("open") || $("#notes").classList.contains("open");
  }

  function onPointerDown(e) {
    if (e.isPrimary === false) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (isInteractive(e.target) || overlaysOpen()) {
      gesture.start = null;
      return;
    }
    const beat = e.target.closest(".beat");
    gesture.start = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      scroll: beat ? beat.scrollTop : 0,
      beat,
      moved: false,
    };
  }

  function onPointerMove(e) {
    const g = gesture.start;
    if (!g || g.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) g.moved = true;
    if (g.beat && Math.abs(g.beat.scrollTop - g.scroll) > 2) g.moved = true;
  }

  function onClick(e) {
    if (isInteractive(e.target)) return;
    if (overlaysOpen()) {
      closeOverlays();
      return;
    }
    const g = gesture.start;
    gesture.start = null;
    if (g && (g.moved || (g.beat && Math.abs(g.beat.scrollTop - g.scroll) > 2))) return;
    if (g && performance.now() - g.t > 800) return;
    const stage = $("#stage");
    const rect = stage.getBoundingClientRect();
    const y = e.clientY;
    const delta = y < rect.top + rect.height / 2 ? -1 : 1;
    hideTapHint();
    go(delta, { fromTap: true });
  }

  function hideTapHint() {
    const el = state.tapHint || $("#tap-hint");
    if (!el) return;
    el.classList.remove("show");
    try {
      localStorage.setItem("dk:tap-hint", "1");
    } catch (err) {
      /* storage may be blocked */
    }
    window.setTimeout(() => el.remove(), 500);
    state.tapHint = null;
  }

  function setupTapHint() {
    const coarse = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (!coarse) return;
    try {
      if (localStorage.getItem("dk:tap-hint") === "1") return;
    } catch (err) {
      /* continue and show */
    }
    if ($("#tap-hint")) return;
    const el = document.createElement("div");
    el.id = "tap-hint";
    el.setAttribute("role", "status");
    el.textContent = "上半屏上一拍 · 下半屏下一拍";
    document.body.appendChild(el);
    state.tapHint = el;
    requestAnimationFrame(() => el.classList.add("show"));
    window.setTimeout(() => hideTapHint(), 5200);
  }

  function onBackdrop(e) {
    if (e.target.classList.contains("overlay")) closeOverlays();
  }

  function toggleTheme() {
    const cur = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("dk:theme", next);
    } catch (err) {
      /* storage may be blocked */
    }
  }

  function enhanceOverviewShell() {
    const ov = $("#overview");
    if (!ov) return;
    ov.setAttribute("aria-label", "目录");
    const wrap = ov.querySelector(".wrap") || ov;
    const h2 = ov.querySelector("h2");
    const hint = ov.querySelector(".close-hint");
    const sub = ov.querySelector(".sub");
    if (h2) h2.textContent = "目录";
    if (hint) hint.textContent = "点空白处关闭";
    if (sub) sub.textContent = "点章节到开头 · 点右侧拍数可展开再选某一拍";
    if (h2 && hint && !ov.querySelector(".toc-head")) {
      const head = document.createElement("div");
      head.className = "toc-head";
      head.appendChild(h2);
      head.appendChild(hint);
      wrap.insertBefore(head, wrap.firstChild);
    }
    const grid = $("#overview-grid");
    if (grid) {
      grid.classList.remove("grid");
      grid.classList.add("toc-list");
    }
    ov.addEventListener("click", (e) => {
      if (e.target.closest(".toc-row, .toc-beats, .toc-go, .toc-toggle")) return;
      closeOverlays();
    });
  }

  function enhanceHelp() {
    const dl = $("#help dl");
    if (!dl || dl.dataset.tocHelp === "1") return;
    dl.dataset.tocHelp = "1";
    const dts = Array.from(dl.querySelectorAll("dt"));
    const o = dts.find((dt) => dt.textContent.trim() === "O");
    if (o) {
      o.textContent = "目录 · O";
      const dd = o.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        dd.textContent = "打开目录，可跳到某一节或某一拍。顶栏的目录、右下角页码也可打开；点空白处关闭";
      }
    } else {
      const dt = document.createElement("dt");
      dt.textContent = "目录 · O";
      const dd = document.createElement("dd");
      dd.textContent = "打开目录，可跳到某一节或某一拍。顶栏的目录、右下角页码也可打开；点空白处关闭";
      const first = dl.querySelector("dt");
      if (first) {
        dl.insertBefore(dt, first);
        dl.insertBefore(dd, first);
      } else {
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
    }
  }

  function enhanceHud() {
    const old = $("#hud");
    if (!old) return;
    const btn = old.tagName === "BUTTON" ? old : document.createElement("button");
    if (btn !== old) {
      btn.id = "hud";
      btn.textContent = old.textContent;
      old.replaceWith(btn);
    }
    btn.type = "button";
    btn.setAttribute("aria-label", "打开目录");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.removeAttribute("aria-hidden");
    if (btn.dataset.tocBound === "1") return;
    btn.dataset.tocBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle("overview");
    });
  }

  function injectTocChrome() {
    const chrome = $("#chrome");
    if (!chrome || $("#toc-btn")) return;
    const classic = Array.from(chrome.querySelectorAll("a")).find((a) => a.textContent.trim() === "原版");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "toc-btn";
    btn.textContent = "目录";
    btn.setAttribute("aria-label", "打开目录");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle("overview");
    });
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "·";
    if (classic) {
      chrome.insertBefore(btn, classic);
      chrome.insertBefore(sep, classic);
    } else {
      const themeBtn = $("#theme");
      if (themeBtn) {
        chrome.insertBefore(btn, themeBtn);
        chrome.insertBefore(sep, themeBtn);
      } else {
        chrome.appendChild(btn);
      }
    }
  }

  function bindChrome() {
    const themeBtn = $("#theme");
    if (themeBtn) themeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTheme();
    });
    injectTocChrome();
    enhanceHud();
    enhanceOverviewShell();
    enhanceHelp();
  }

  async function start() {
    const c = cfg();
    const url = c.deckUrl;
    if (!url) throw new Error("missing deck url");
    const rawHash = (location.hash || "").replace(/^#/, "").split("-")[0];
    if (classicOnlyId(rawHash) && c.classicUrl) {
      location.replace(c.classicUrl + location.hash);
      return;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("deck " + res.status);
    state.deck = await res.json();
    const pos = parseHash();
    if (pos.redirect) {
      location.replace(pos.redirect);
      return;
    }
    $("#load").classList.add("hide");
    mount(pos.scene, pos.beat, "none");
    window.addEventListener("hashchange", () => {
      const p = parseHash();
      if (p.redirect) {
        location.replace(p.redirect);
        return;
      }
      if (p.scene !== state.scene || p.beat !== state.beat) jump(p.scene, p.beat);
    });
    window.addEventListener("keydown", onKey);
    const stage = $("#stage");
    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointercancel", () => { gesture.start = null; });
    stage.addEventListener("click", onClick);
    ["help", "overview", "notes"].forEach((id) => $(`#${id}`).addEventListener("click", onBackdrop));
    document.addEventListener("mousemove", pokeIdle);
    document.addEventListener("keydown", pokeIdle);
    window.addEventListener("resize", () => {
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(afterLayout, 80);
    });
    bindChrome();
    setupTapHint();
    pokeIdle();
  }

  start().catch((err) => {
    const load = $("#load");
    load.classList.remove("hide");
    load.textContent = "这篇的翻页阅读未能打开。";
    console.error(err);
  });
})();
