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

  /* 文章页：先在标题下方占住播放条的高度。
   * 播放条要等 manifest 到达才能渲染，若此时页面已经画完，正文会整体往下弹 ~80px。
   * 占位与真实播放条同高，替换时不产生位移。 */
  let holder = null;
  if (PG === 'article') {
    const tb = $('.reader .title-block');
    if (tb) {
      holder = document.createElement('div');
      holder.className = 'audio-bar ab-ph';
      holder.setAttribute('aria-hidden', 'true');
      holder.innerHTML = '<span class="ab-ph-dot"></span>' +
        '<span class="ab-ph-main"><i></i><i></i></span>';
      tb.after(holder);
    }
  }

  fetch(R + 'audio-manifest.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(man => {
      if (!man) { if (holder) holder.remove(); return }
      if (PG === 'article') initArticle(man);
      else if (PG === 'home') initHome(man);
      else if (PG === 'posts') initPosts(man);
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
          b.innerHTML = '<i></i><i></i><i></i>';
          cd.appendChild(b);
        }
      }
    });
  }

  /* ---------- 短帖页：内联朗读按钮 ---------- */
  function initPosts(man) {
    $$('.post[data-slug]').forEach(post => {
      const m = man[post.dataset.slug];
      const part = m && m.parts && m.parts.find(p => p && p.audioUrl);
      if (!part) return;
      const ph = post.querySelector('.ph');
      if (!ph || ph.querySelector('.post-aud')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'post-aud';
      btn.textContent = 'AI 朗读';
      btn.title = '播放这条短帖的 AI 朗读';
      btn.addEventListener('click', () => {
        let box = post.querySelector('.post-audio');
        if (!box) {
          box = document.createElement('div');
          box.className = 'post-audio';
          const tag = document.createElement('span');
          tag.textContent = 'AI 朗读';
          const au = document.createElement('audio');
          au.controls = true;
          au.preload = 'none';
          au.src = part.audioUrl;
          box.appendChild(tag);
          box.appendChild(au);
          const pt = post.querySelector('.pt');
          pt ? pt.after(box) : post.appendChild(box);
          btn.textContent = '已展开';
          return;
        }
        box.hidden = !box.hidden;
        btn.textContent = box.hidden ? 'AI 朗读' : '已展开';
      });
      ph.appendChild(btn);
    });
  }

  /* ---------- 文章页：播放器 ---------- */
  function initArticle(man) {
    const main = $('.reader');
    const slug = main && main.dataset.slug;
    const m = man[slug];
    const urls = (m && m.parts || []).filter(p => p && p.audioUrl).map(p => p.audioUrl);
    if (!urls.length) { if (holder) holder.remove(); return }
    const multi = urls.length > 1;

    /* 声纹进度轨：按 slug 生成稳定起伏，既好看又能点/拖 */
    const spkRaw = (m && m.speaker) || '';
    let who;
    if ((m && m.mode) === 'dialogue' || spkRaw.indexOf('dual:') === 0) {
      const names = spkRaw.replace(/^dual:/, '').split('/').filter(Boolean);
      who = names.length ? names.join(' × ') + ' 对谈' : '双人对谈';
    } else {
      const VOICE = { 'zh-male-guchuan-9d6a4666': '谷川' };
      who = VOICE[spkRaw] || '单人朗读';
    }

    /* 声纹：细密竖条 + 平滑包络，像真实音轨而不是条形码 */
    const N = innerWidth < 700 ? 54 : 88;
    let seed = 7;
    for (let i = 0; i < slug.length; i++) seed = (seed * 33 + slug.charCodeAt(i)) % 99991;
    const ph = (seed % 29) / 7;
    const bars = [];
    for (let i = 0; i < N; i++) {
      const env = 0.46 + 0.3 * Math.sin(i * 0.34 + ph) + 0.17 * Math.sin(i * 1.27 + ph * 1.9)
        + 0.07 * Math.sin(i * 2.9 + ph);
      const h = Math.max(3, Math.min(17, Math.round(3 + env * 14)));
      bars.push('<i style="height:' + h + 'px"></i>');
    }

    const bar = document.createElement('div');
    bar.className = 'audio-bar';
    bar.innerHTML =
      (multi ?
        '<button class="ab-prev" type="button" aria-label="回到上一段开头" title="上一段（已在第一段开头则从 0:00 重放）">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.6 5h2.3v14H5.6zM19.4 5.3v13.4L9.6 12z"></path></svg>' +
        '</button>' : '') +
      '<button class="ab-play" aria-label="播放朗读">' +
      '<svg class="ab-ring" viewBox="0 0 46 46" aria-hidden="true">' +
      '<circle class="trk" cx="23" cy="23" r="20.5"></circle>' +
      '<circle class="bar" cx="23" cy="23" r="20.5"></circle></svg>' +
      '<svg class="ab-ic ab-ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.9v14.2L18.8 12z"></path></svg>' +
      '<svg class="ab-ic ab-ic-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6h3.5v14.8H7zM13.5 4.6H17v14.8h-3.5z"></path></svg>' +
      '</button>' +
      (multi ?
        '<button class="ab-next" type="button" aria-label="跳到下一段" title="下一段（最后一段则回到第 1 段）">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.1 5h2.3v14h-2.3zM4.6 5.3v13.4L14.4 12z"></path></svg>' +
        '</button>' : '') +
      '<div class="ab-main">' +
      '<div class="ab-head"><span class="ab-eq"><i></i><i></i><i></i></span>' +
      '<span class="ab-tag">AI 朗读</span>' +
      '<span class="ab-who">' + who + '</span>' +
      (multi ? '<button class="ab-part" type="button" aria-haspopup="true" aria-expanded="false" aria-label="切换朗读分段" title="切换分段">' +
        '<span class="ab-pn"></span><i class="ab-cv"></i></button>' : '') + '</div>' +
      '<div class="ab-seek" role="slider" aria-label="播放进度">' + bars.join('') + '</div>' +
      '</div>' +
      '<span class="ab-time"><b>0:00</b><span class="ab-sep">/</span><span class="ab-tdur">0:00</span></span>' +
      '<button class="ab-speed" title="播放速度">1×</button>' +
      '<span class="ab-err" hidden></span>';
    const titleBlock = main.querySelector('.title-block');
    if (holder) holder.replaceWith(bar);
    else if (titleBlock) titleBlock.after(bar);
    else main.prepend(bar);

    const au = new Audio();
    au.preload = 'none';
    au.playbackRate = J('dk:aud:rate', 1);

    const play = $('.ab-play', bar), seek = $('.ab-seek', bar),
      tCur = $('.ab-time b', bar), tDur = $('.ab-tdur', bar),
      spd = $('.ab-speed', bar), err = $('.ab-err', bar), partEl = $('.ab-part', bar),
      prevBtn = $('.ab-prev', bar), nextBtn = $('.ab-next', bar),
      ringBar = $('.ab-ring .bar', bar), waveBars = $$('i', seek);
    const RING = 2 * Math.PI * 20.5;

    /* 分段面板：点段落胶囊展开，直选任意一段 */
    const partBtns = [], partDur = [];
    let partsPanel = null;
    if (multi) {
      partsPanel = document.createElement('div');
      partsPanel.className = 'ab-parts';
      partsPanel.hidden = true;
      const hd = document.createElement('div');
      hd.className = 'ab-pt';
      hd.innerHTML = '<span>朗读分段</span><span class="ab-pc">共 ' + urls.length + ' 段</span>';
      partsPanel.appendChild(hd);
      urls.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ab-pi';
        b.innerHTML = '<span class="ab-pin">第 ' + (i + 1) + ' 段</span>' +
          '<span class="ab-pid"></span>' +
          '<svg class="ab-pic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 6.2 9.4 17.1 3.7 11.4l1.5-1.5 4.2 4.2 9.4-9.4z"></path></svg>';
        b.addEventListener('click', e => { e.stopPropagation(); gotoPart(i) });
        partsPanel.appendChild(b);
        partBtns.push(b);
      });
      bar.appendChild(partsPanel);
    }

    function paintPartUI() {
      if (!multi) return;
      const pn = partEl.querySelector('.ab-pn');
      if (pn) pn.textContent = (pi + 1) + ' / ' + urls.length;
      partBtns.forEach((b, i) => b.classList.toggle('on', i === pi));
    }

    function openParts(on) {
      if (!partsPanel) return;
      partsPanel.hidden = !on;
      partEl.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (!on) return;
      paintPartUI();
      const cur = partBtns[pi];
      if (cur) partsPanel.scrollTop = Math.max(0, cur.offsetTop - 44);
      probeDur();
    }
    const closeParts = () => openParts(false);
    if (multi) {
      partEl.addEventListener('click', e => { e.stopPropagation(); openParts(partsPanel.hidden) });
      document.addEventListener('click', e => {
        if (!partsPanel || partsPanel.hidden) return;
        if (e.target.closest && (e.target.closest('.ab-parts') || e.target.closest('.ab-part'))) return;
        openParts(false);
      });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') openParts(false) });
    }

    /* 探测各段时长（打开面板时并发进行，结果缓存在 partDur） */
    let probing = false;
    function probeDur() {
      if (probing) return;
      probing = true;
      let next = 0, running = 0;
      const pick = () => {
        while (running < 4 && next < urls.length) {
          if (partDur[next]) { next++; continue }
          const k = next++, a = new Audio();
          let done = false;
          running++;
          const fin = ok => {
            if (done) return; done = true; running--;
            const dur = a.duration;
            try { a.removeAttribute('src'); a.load() } catch (e) { }
            if (ok && isFinite(dur) && dur > 0) {
              partDur[k] = dur;
              const d = partBtns[k] && partBtns[k].querySelector('.ab-pid');
              if (d) d.textContent = fmt(dur);
            }
            if (next < urls.length || running) pick();
            else probing = false;
          };
          a.preload = 'metadata';
          a.addEventListener('loadedmetadata', () => fin(true));
          a.addEventListener('error', () => fin(false));
          setTimeout(() => fin(false), 9000);
          a.src = urls[k];
        }
        if (!running && next >= urls.length) probing = false;
      };
      pick();
    }

    /* 跳段：keep 未指定时沿用当前播放状态 */
    function gotoPart(i, keep) {
      i = Math.max(0, Math.min(urls.length - 1, i | 0));
      const wasPlaying = !au.paused;
      loadPart(i, 0);
      paintPartUI();
      if (keep === undefined ? wasPlaying : keep) au.play().catch(() => { });
      closeParts();
    }


    function paintProgress(p) {
      p = Math.max(0, Math.min(1, p || 0));
      const on = Math.round(p * waveBars.length);
      waveBars.forEach((b, i) => b.classList.toggle('on', i < on));
      ringBar.style.strokeDasharray = (p * RING).toFixed(1) + ' ' + RING.toFixed(1);
    }

    let pi = 0;                       // 当前段索引
    const posKey = 'dk:aud:pos:' + slug;
    const saved = J(posKey, null) || {};   // {p, t}

    function loadPart(i, restoreT) {
      pi = i;
      au.src = urls[i];
      paintPartUI();
      tCur.textContent = '0:00';
      paintProgress(0);
      au.addEventListener('loadedmetadata', function once() {
        au.removeEventListener('loadedmetadata', once);
        tDur.textContent = fmt(au.duration);
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
    play.onclick = () => { if (au.paused) au.play().catch(() => { }); else au.pause(); };
    if (prevBtn) prevBtn.onclick = () => {
      if (pi === 0) {                       /* 已在第一段：回到开头 */
        au.currentTime = 0;
      } else if (au.currentTime > 2.5) {    /* 本段已听一会儿：先回本段开头 */
        au.currentTime = 0;
      } else {                              /* 刚进入本段：退回上一段 */
        gotoPart(pi - 1);
      }
    };
    if (nextBtn) nextBtn.onclick = () => {
      gotoPart((pi + 1) % urls.length);     /* 最后一段则回到第 1 段 */
    };
    au.addEventListener('play', () => { bar.classList.add('playing'); play.setAttribute('aria-label', '暂停') });
    au.addEventListener('pause', () => { bar.classList.remove('playing'); play.setAttribute('aria-label', '继续播放'); savePos() });
    au.addEventListener('ended', () => {
      if (pi + 1 < urls.length) {          /* 自动连播下一段 */
        loadPart(pi + 1, 0);
        au.play().catch(() => { });
      } else {
        localStorage.removeItem(posKey);
        bar.classList.remove('playing');
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
      paintProgress(p);
      tCur.textContent = fmt(au.currentTime);
      const now = Date.now();
      if (now - lastSave > 5000) { lastSave = now; savePos() }
    });

    function savePos() {
      if (au.ended) return;         /* 听完最后一段不留进度 */
      if (au.currentTime > 0) W(posKey, { p: pi, t: au.currentTime });
    }

    /* 拖拽跳转（进度条对应当前段；多段时通过段内进度 + 自动连播衔接） */
    const seekTo = e => {
      const r = seek.getBoundingClientRect();
      const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
      if (au.duration) au.currentTime = x * au.duration;
      paintProgress(x);
      tCur.textContent = fmt(x * (au.duration || 0));
    };
    let dragging = false;
    seek.addEventListener('pointerdown', e => { dragging = true; seek.setPointerCapture(e.pointerId); seekTo(e) });
    seek.addEventListener('pointermove', e => { if (dragging) seekTo(e) });
    seek.addEventListener('pointerup', () => { dragging = false; savePos() });

    /* 锁屏/系统媒体控制（Media Session API）：锁屏显示标题封面，耳机按键可控 */
    if ('mediaSession' in navigator) {
      const updateMS = () => {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: document.title.replace(' · Dan Koe 知识网站', '') +
              (multi ? ' · 第 ' + (pi + 1) + '/' + urls.length + ' 段' : ''),
            artist: 'AI 朗读 · ' + who,
            album: 'Dan Koe 知识网站',
            artwork: [{ src: R + 'img/' + slug + '_cover.jpg', sizes: 'any' }],
          });
          navigator.mediaSession.playbackState = au.paused ? 'paused' : 'playing';
        } catch (e) { }
      };
      updateMS();
      au.addEventListener('play', updateMS);
      au.addEventListener('pause', updateMS);
      const acts = { play: () => au.play().catch(() => { }), pause: () => au.pause() };
      try {
        navigator.mediaSession.setActionHandler('play', acts.play);
        navigator.mediaSession.setActionHandler('pause', acts.pause);
        navigator.mediaSession.setActionHandler('seekbackward', () => { au.currentTime = Math.max(0, au.currentTime - 15) });
        navigator.mediaSession.setActionHandler('seekforward', () => { au.currentTime += 15 });
        if (multi) {   /* 耳机/锁屏也能前后切段 */
          navigator.mediaSession.setActionHandler('previoustrack', () => gotoPart(pi - 1));
          navigator.mediaSession.setActionHandler('nexttrack', () => gotoPart((pi + 1) % urls.length));
        }
      } catch (e) { }
    }

    addEventListener('pagehide', savePos);

    /* 初始加载：恢复上次段与位置 */
    const startP = (saved && typeof saved.p === 'number') ? Math.min(saved.p, urls.length - 1) : 0;
    loadPart(startP, (saved && saved.t) || 0);
  }
})();
