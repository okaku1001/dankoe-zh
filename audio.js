/* audio.js — ListenHub AI 朗读播放器
 * 依赖 site/audio-manifest.json（由 build/generate_audio.py 生成）
 * manifest 格式：{ "01": { title, parts: [{audioUrl, subtitlesUrl, ...}] } }
 *   - 超长文章自动分多段，连续自动播放
 * 文章页：标题下方插入播放器（滚动时吸顶）；首页：有音频的文章卡片加 🔊 标识
 * 播放进度/倍速保存在 localStorage，与站点现有数据（dk:*）同一命名空间
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const R = document.body.dataset.root || '';
  const PG = document.body.dataset.page;
  const J = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch (e) { return d } };
  const W = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } };
  const fmt = s => { if (!isFinite(s) || s < 0) s = 0; s = Math.round(s); const m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0') };
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

  fetch(R + 'audio-manifest.json', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(man => {
      if (!man) return;
      if (PG === 'article') initArticle(man);
      else if (PG === 'home') initHome(man);
    });

  /* ---------- 首页：卡片标识 ---------- */
  function initHome(man) {
    $$('.card[data-slug]').forEach(c => {
      const m = man[c.dataset.slug];
      if (m && m.parts && m.parts.some(p => p && p.audioUrl)) {
        const cd = c.querySelector('.cd');
        if (cd) {
          const b = document.createElement('span');
          b.className = 'audb';
          b.title = '本篇有 AI 朗读';
          b.textContent = '🔊';
          cd.appendChild(b);
        }
      }
    });
  }

  /* ---------- 文章页：播放器 ---------- */
  function initArticle(man) {
    const main = $('.reader');
    const slug = main && main.dataset.slug;
    const m = man[slug];
    const urls = (m && m.parts || []).filter(p => p && p.audioUrl).map(p => p.audioUrl);
    if (!urls.length) return;
    const multi = urls.length > 1;

    const bar = document.createElement('div');
    bar.className = 'audio-bar';
    bar.innerHTML =
      '<button class="ab-play" aria-label="播放朗读">▶</button>' +
      '<div class="ab-main">' +
      '<div class="ab-head"><span class="ab-tag">🔊 AI 朗读</span>' +
      (multi ? '<span class="ab-part"></span>' : '') +
      '<span class="ab-dur"></span></div>' +
      '<div class="ab-seek" role="slider" aria-label="播放进度"><div class="ab-fill"></div></div>' +
      '</div>' +
      '<span class="ab-time">0:00</span>' +
      '<button class="ab-speed" title="播放速度">1×</button>' +
      '<span class="ab-err" hidden></span>';
    const titleBlock = main.querySelector('.title-block');
    titleBlock ? titleBlock.after(bar) : main.prepend(bar);

    const au = new Audio();
    au.preload = 'none';
    au.playbackRate = J('dk:aud:rate', 1);

    const play = $('.ab-play', bar), fill = $('.ab-fill', bar), seek = $('.ab-seek', bar),
      time = $('.ab-time', bar), dur = $('.ab-dur', bar), spd = $('.ab-speed', bar),
      err = $('.ab-err', bar), partEl = $('.ab-part', bar);

    let pi = 0;                       // 当前段索引
    const posKey = 'dk:aud:pos:' + slug;
    const saved = J(posKey, null) || {};   // {p, t}

    function loadPart(i, restoreT) {
      pi = i;
      au.src = urls[i];
      if (partEl) partEl.textContent = `第 ${i + 1}/${urls.length} 段`;
      au.addEventListener('loadedmetadata', function once() {
        au.removeEventListener('loadedmetadata', once);
        dur.textContent = fmt(au.duration);
        if (restoreT > 15 && restoreT < au.duration - 20) au.currentTime = restoreT;
        else if (restoreT > 0) au.currentTime = restoreT;
      });
      au.load();
    }

    /* 倍速 */
    const paintRate = () => { spd.textContent = au.playbackRate + '×' };
    paintRate();
    spd.onclick = () => {
      let i = SPEEDS.indexOf(au.playbackRate);
      au.playbackRate = SPEEDS[(i + 1) % SPEEDS.length] || 1;
      W('dk:aud:rate', au.playbackRate); paintRate();
    };

    /* 播放控制 */
    play.onclick = () => { if (au.paused) au.play().catch(() => {}); else au.pause(); };
    au.addEventListener('play', () => { play.textContent = '⏸'; play.setAttribute('aria-label', '暂停') });
    au.addEventListener('pause', () => { play.textContent = '▶'; play.setAttribute('aria-label', '继续播放'); savePos() });
    au.addEventListener('ended', () => {
      if (pi + 1 < urls.length) {          /* 自动连播下一段 */
        loadPart(pi + 1, 0);
        au.play().catch(() => {});
      } else {
        localStorage.removeItem(posKey);
        play.textContent = '▶';
        play.setAttribute('aria-label', '重新播放');
      }
    });
    au.addEventListener('error', () => {
      if (!au.src) return;
      err.hidden = false; err.textContent = '音频加载失败，可稍后重试'; play.disabled = true;
    });

    let lastSave = 0;
    au.addEventListener('timeupdate', () => {
      const p = au.currentTime / (au.duration || 1);
      fill.style.width = (p * 100).toFixed(2) + '%';
      time.textContent = fmt(au.currentTime);
      const now = Date.now();
      if (now - lastSave > 5000) { lastSave = now; savePos() }
    });

    function savePos() {
      if (au.currentTime > 0) W(posKey, { p: pi, t: au.currentTime });
    }

    /* 拖拽跳转（进度条对应当前段；多段时通过段内进度 + 自动连播衔接） */
    const seekTo = e => {
      const r = seek.getBoundingClientRect();
      const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
      if (au.duration) au.currentTime = x * au.duration;
      fill.style.width = (x * 100).toFixed(2) + '%';
    };
    let dragging = false;
    seek.addEventListener('pointerdown', e => { dragging = true; seek.setPointerCapture(e.pointerId); seekTo(e) });
    seek.addEventListener('pointermove', e => { if (dragging) seekTo(e) });
    seek.addEventListener('pointerup', () => { dragging = false; savePos() });

    addEventListener('pagehide', savePos);

    /* 初始加载：恢复上次段与位置 */
    const startP = (saved && typeof saved.p === 'number') ? Math.min(saved.p, urls.length - 1) : 0;
    loadPart(startP, (saved && saved.t) || 0);
  }
})();
