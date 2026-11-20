/* reading-layout.js — 只改排版，不改一个字。
 *
 * 认人规则（不写死名单）：段首反复出现的名字 = 说话人；名字换了 = 换个人在说。
 *   1) 全篇统计段首候选，出现 >=4 次才认定为说话人（小标题只出现 1–2 次，自动排除）。
 *   2) 中文段与紧随的英文段自动配对，建立「克里斯 ↔ Chris」身份映射，中英同色。
 *   3) 每个身份按「首次开口顺序」分配稳定颜色：第一位靠左，第二位靠右，多人则
 *      靠颜色 + 姓名牌 + 换人分隔线区分；同一人连续的段落收拢成一组。
 *
 * 所有片段都是原文 textNode 的切片，拼接后与原 textContent 逐字相同。
 * 不改变 #content 的段落层级（笔记模块依赖 previousElementSibling 配对中英文）。
 * 必须在 notes-ui.js 之前加载，让笔记模块在包装后的 DOM 上初始化。
 */
(() => {
  'use strict';
  if (document.body.dataset.page !== 'article') return;

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const MIN_HITS = 4;      // 段首名字至少出现这么多次才算说话人
  const COLORS = 6;        // 最多 6 种稳定身份色

  const firstText = el =>
    el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE ? el.firstChild.nodeValue : '';

  /* 段首名字抽取：中文「纳瓦尔：」/ 英文「Naval:」 */
  function nameZh(text) {
    const m = text.match(/^([\u4e00-\u9fa5·]{2,7})[：:]/);
    return m ? m[1].split('·')[0] : null;         // 吉列尔莫·劳赫 → 吉列尔莫
  }
  function nameEn(text) {
    // Guillermo Rauch: → Guillermo；The question now is: 这类长短语会被词数限制排除
    const m = text.match(/^([A-Z][A-Za-z.'-]{1,20})(?:[ ][A-Z][A-Za-z.'-]{1,20}){0,2}[：:]/);
    return m ? m[1] : null;
  }
  const rawZh = t => { const m = t.match(/^.{1,9}?[：:]/); return m ? m[0] : null; };
  const rawEn = t => {
    const m = t.match(/^[A-Z][A-Za-z.'-]{1,20}(?:[ ][A-Z][A-Za-z.'-]{1,20}){0,2}[：:]/);
    return m ? m[0] : null;
  };

  function freq(els, pick) {
    const f = new Map();
    for (const el of els) { const n = pick(firstText(el)); if (n) f.set(n, (f.get(n) || 0) + 1); }
    return f;
  }
  const validNames = f => new Set([...f].filter(([, c]) => c >= MIN_HITS).map(([n]) => n));

  // 中文段 ↔ 紧随的英文段，投票建立姓名映射
  function buildBilingualMap(cnEls, cnValid, enValid) {
    const votes = new Map();
    for (const el of cnEls) {
      const cn = nameZh(firstText(el));
      const nx = el.nextElementSibling;
      if (!nx || !nx.classList.contains('en-p')) continue;
      const en = nameEn(firstText(nx));
      if (!cnValid.has(cn) || !enValid.has(en)) continue;
      if (!votes.has(cn)) votes.set(cn, new Map());
      const m = votes.get(cn);
      m.set(en, (m.get(en) || 0) + 1);
    }
    const en2cn = new Map();
    for (const [cn, m] of votes) {
      let best = '', top = 0;
      for (const [en, c] of m) if (c > top) { top = c; best = en; }
      if (best) en2cn.set(best, cn);
    }
    return en2cn;
  }

  /* 长段按句读拆视觉小段：同一 <p>，拼接后逐字等于原文 */
  function splitSentences(text, lang) {
    const threshold = lang === 'zh' ? 240 : 440;
    if (text.length <= threshold) return [text];
    const re = lang === 'zh'
      ? /[。！？；!?]+[”』」）)]?|…+[”』」）)]?/g
      : /[.!?]+["'”’)\]]?\s+/g;
    const raw = [];
    let last = 0, m;
    while ((m = re.exec(text))) { raw.push(text.slice(last, re.lastIndex)); last = re.lastIndex; }
    if (last < text.length) raw.push(text.slice(last));
    if (raw.length <= 1) return [text];
    const out = [];
    for (const s of raw) {
      if (out.length && s.length < (lang === 'zh' ? 24 : 40)) out[out.length - 1] += s;
      else out.push(s);
    }
    if (out.length > 1 && out[out.length - 1].length < (lang === 'zh' ? 38 : 60)) {
      out[out.length - 2] += out.pop();
    }
    // 块数多于 3 就按句子合并成 3 块：块一多，每块末尾的短行会把正文切成楼梯
    if (out.length > 3) {
      const merged = [];
      const per = Math.ceil(out.length / 3);
      for (let i = 0; i < out.length; i += per) merged.push(out.slice(i, i + per).join(''));
      return merged;
    }
    return out;
  }

  function appendSegments(parent, text, lang) {
    for (const part of splitSentences(text, lang)) {
      const seg = document.createElement('span');
      seg.className = 'pseg';
      seg.textContent = part;
      parent.appendChild(seg);
    }
  }

  /* 段内包装；state = null 时按普通段落只拆句读 */
  function wrap(el, lang, prefixRaw, state) {
    const text = firstText(el);
    if (!text || text.length < 2) return;
    const rest = prefixRaw ? text.slice(prefixRaw.length) : text;
    const frag = document.createDocumentFragment();

    if (state) {
      el.classList.add('spk', 'spk-s' + state.slot,
        state.side === 'l' ? 'spk-left' : 'spk-right',
        state.isNew ? 'spk-new' : 'spk-cont');
      if (state.showsName === false) el.classList.add('spk-echo');  // 同人续段，原文无姓名
      el.dataset.spk = state.id;
      el.setAttribute('aria-label', state.id + ' 说');
      if (prefixRaw) {
        const chip = document.createElement('span');
        chip.className = 'spk-chip';
        chip.textContent = prefixRaw;              // 原文前缀，名字与冒号
        frag.appendChild(chip);
      }
      const body = document.createElement('span');
      body.className = 'spk-body';
      appendSegments(body, rest, lang);
      frag.appendChild(body);
    } else if (splitSentences(rest, lang).length > 1) {
      const body = document.createElement('span');
      body.className = 'pbody';
      appendSegments(body, rest, lang);
      frag.appendChild(body);
    } else {
      frag.appendChild(document.createTextNode(rest));
    }
    el.replaceChildren(frag);
  }

  const canDecorate = el =>
    el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE;

  /* ============ 主流程：中文正文 + 紧随英文对照 ============ */
  const content = $('#content');
  let globalEn2cn = new Map();
  if (content) {
    const cnEls = $$('p[data-b]', content);
    const cnF = freq(cnEls, nameZh);
    const enF = freq($$('.en-p', content), nameEn);
    const cnValid = validNames(cnF), enValid = validNames(enF);
    globalEn2cn = buildBilingualMap(cnEls, cnValid, enValid);

    // 身份按首次开口顺序定：第一个说话的人 = 提问方（靠左），之后依次分配
    const order = [];
    for (const el of cnEls) {
      const n = nameZh(firstText(el));
      if (n && cnValid.has(n) && !order.includes(n)) order.push(n);
    }
    const slotOf = new Map(order.map((n, i) => [n, Math.min(i, COLORS - 1)]));
    // 没有说话人 = 独立长文（Dan Koe 随笔）：走书页式单栏，不走对话分栏
    if (order.length === 0) document.body.classList.add('essay-mode');
    // 正好两人时左右分栏；三人及以上统一靠左，靠颜色/姓名牌/分隔线区分
    const splitLr = order.length === 2;
    const sideOf = id => splitLr ? (slotOf.get(id) === 0 ? 'l' : 'r') : 'l';

    // 访谈稿体例：换人才写名字，同一人连说多段时后续段不带名字。
    // 因此：段首有名 → 更新当前说话人；段首无名 → 继承当前说话人（同人续段）。
    let current = null;          // 当前说话人 id
    let prevSpoken = null;       // 上一个「写出名字」的说话人
    let currentNamed = false;    // 当前这一段是否自带姓名（决定是否显示姓名牌）
    for (const el of [...content.children]) {
      if (!el.matches('p[data-b]') || !canDecorate(el)) continue;

      const cn = nameZh(firstText(el));
      const named = cn && cnValid.has(cn);
      if (named) {
        current = cn;
        currentNamed = true;
      } else {
        // 无名段：继承当前说话人；但若上一段也没名字、或从未出现说话人，则当作普通正文
        currentNamed = false;
      }
      const id = current;                       // 有名/无名都归属当前说话人
      const isNew = named && id !== prevSpoken; // 只有「写出名字且换了人」才算换人
      if (named) prevSpoken = id;

      let state = null;
      if (id) {
        state = {
          id, slot: slotOf.get(id) ?? 0, side: sideOf(id),
          isNew, showsName: currentNamed,        // 续段不显示姓名牌（原文没有名字，不能造字）
        };
      }
      // 姓名牌前缀只取自带名字的段
      wrap(el, 'zh', named ? rawZh(firstText(el)) : null, state);

      const nx = el.nextElementSibling;
      if (nx && nx.classList.contains('en-p') && canDecorate(nx)) {
        let enState = null;
        if (state) enState = { ...state, showsName: currentNamed };
        // 英文对照用英文姓名（若原文段首有英文名），续段无前缀
        const enNamed = named && nameEn(firstText(nx));
        wrap(nx, 'en', enState && enNamed ? rawEn(firstText(nx)) : null, enState);
      }
    }
  }

  /* ============ 英文全文 #enfull：独立认人，沿用首开口顺序规则 ============ */
  const full = $('#enfull');
  if (full) {
    const fEls = $$('p, li', full).filter(el =>
      !el.classList.contains('enh') && !el.querySelector('p,li,pre,h2,h3,h4'));
    const fF = freq(fEls, nameEn);
    const fValid = validNames(fF);
    const order = [];
    for (const el of fEls) {
      const n = nameEn(firstText(el));
      if (n && fValid.has(n) && !order.includes(n)) order.push(n);
    }
    const slotOf = new Map(order.map((n, i) => [n, Math.min(i, COLORS - 1)]));
    const splitLr = order.length === 2;
    let current = null, prevSpoken = null, named = false;
    for (const el of fEls) {
      if (!canDecorate(el)) continue;
      const en = nameEn(firstText(el));
      named = !!(en && fValid.has(en));
      if (named) current = globalEn2cn.get(en) || en;
      const id = current;
      const isNew = named && id !== prevSpoken;
      if (named) prevSpoken = id;
      let state = null;
      if (id) {
        const key = en && fValid.has(en) ? en : null;
        const slot = key ? (slotOf.get(key) ?? 0) : (slotOf.get(id) ?? 0);
        state = { id, slot, side: splitLr ? (slot === 0 ? 'l' : 'r') : 'l',
                  isNew, showsName: named };
      }
      wrap(el, 'en', named ? rawEn(firstText(el)) : null, state);
    }
  }

  /* 目录形态：窄屏一律用底部抽屉；独立长文在桌面也用顶部细条，
     把正文从「左目录 + 中正文」里解放出来，左右页边距对称。 */
  const syncTocSheet = () => {
    const narrow = window.matchMedia('(max-width:1100px)').matches;
    document.body.classList.toggle('toc-sheet',
      narrow || document.body.classList.contains('essay-mode'));
  };
  syncTocSheet();
  addEventListener('resize', syncTocSheet, { passive: true });
})();
