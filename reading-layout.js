/* reading-layout.js — 只改排版，不改一个字。
 * 1) 对话：把已有说话人前缀包成 .dlg-spk，正文包成 .dlg-body。
 * 2) 长段：在句号等自然停顿处拆成 .pseg 视觉段，仍留在同一个 <p> 里。
 * 所有片段都是原文 textNode 的切片，拼接后与原 textContent 逐字相同。
 * 必须在 notes-ui.js 之前加载，让笔记模块在包装后的 DOM 上初始化。
 */
(() => {
  'use strict';
  if (document.body.dataset.page !== 'article') return;

  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ZH = [
    '吉列尔莫·劳赫', '布莱克·肖尔', '马克斯·霍达克',
    '纳瓦尔', '克里斯', '埃里克', '尼维', '马克斯', '吉列尔莫', '布莱克',
  ];
  const EN = [
    'Guillermo Rauch', 'Blake Scholl', 'Max Hodak',
    'Naval', 'Chris', 'Eric', 'Nivi', 'Max', 'Guillermo', 'Blake',
  ];

  function speakerPrefix(text, lang) {
    const names = lang === 'zh' ? ZH : EN;
    const sep = lang === 'zh' ? '：' : ':';
    for (const name of names) {
      const prefix = name + sep;
      if (text.startsWith(prefix)) return { prefix, name };
    }
    return null;
  }

  // 切片后 join('') 必须严格等于入参；不新增、不删除、不替换任何字符。
  function splitSentences(text, lang) {
    const threshold = lang === 'zh' ? 118 : 260;
    if (text.length <= threshold) return [text];
    const re = lang === 'zh'
      ? /[。！？；!?]+[”』」）)]?|…+[”』」）)]?/g
      : /[.!?]+["'”’)\]]?\s+/g;
    const raw = [];
    let last = 0, m;
    while ((m = re.exec(text))) {
      raw.push(text.slice(last, re.lastIndex));
      last = re.lastIndex;
    }
    if (last < text.length) raw.push(text.slice(last));
    if (raw.length <= 1) return [text];

    // 太短的视觉段并入上一段，避免孤零零一两个字单独成行。
    const out = [];
    for (const s of raw) {
      if (out.length && s.length < 12) out[out.length - 1] += s;
      else out.push(s);
    }
    if (out.length > 1 && out[out.length - 1].length < 18) {
      out[out.length - 2] += out.pop();
    }
    return out;
  }

  function decorate(el, lang) {
    // 只处理纯文本段落；含 <em>/<a> 等的段落保持原样，绝不重组。
    if (el.childNodes.length !== 1 || el.firstChild.nodeType !== Node.TEXT_NODE) return;
    const text = el.firstChild.nodeValue;
    if (!text || text.length < 2) return;

    const hit = speakerPrefix(text, lang);
    const rest = hit ? text.slice(hit.prefix.length) : text;
    const parts = splitSentences(rest, lang);

    const frag = document.createDocumentFragment();
    if (hit) {
      const spk = document.createElement('span');
      spk.className = 'dlg-spk';
      spk.textContent = hit.prefix;
      frag.appendChild(spk);
      el.classList.add('dlg', hit.name === '纳瓦尔' || hit.name === 'Naval' ? 'dlg-answer' : 'dlg-ask');
    }
    if (hit || parts.length > 1) {
      const body = document.createElement('span');
      body.className = hit ? 'dlg-body' : 'pbody';
      for (const part of parts) {
        const seg = document.createElement('span');
        seg.className = 'pseg';
        seg.textContent = part;
        body.appendChild(seg);
      }
      frag.appendChild(body);
    } else {
      frag.appendChild(document.createTextNode(rest));
    }
    el.replaceChildren(frag);
  }

  $$('#content p[data-b]').forEach(el => decorate(el, 'zh'));
  $$('#content .en-p').forEach(el => decorate(el, 'en'));
  $$('#enfull p, #enfull li').forEach(el => decorate(el, 'en'));
})();
