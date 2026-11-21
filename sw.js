const V='dk-book-20261121-v11';
/* 预缓存只放「骨架」：脚本、样式、字体清单、音频清单、首页，合计约 170KB。
 * 旧版这里列了 143 项（含 89 张图，约 20MB）并且用 cache.addAll 原子安装：
 * 任何一项超时或失败，整个 install 就作废，浏览器随后不断重试、持续抢占连接，
 * 手机上表现就是页面迟迟打不开。文章页与图片改成「看过才缓存」。 */
const CORE=[
  'notes-core.js','notes-ui.js','notes.css','fonts/fonts.css',
  'style.css','app.js','reading-layout.js','audio-manifest.json','audio.js','index.html'
];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(V);
    await Promise.all(CORE.map(u=>c.add(u).catch(()=>{})));  /* 单项失败不影响整体安装 */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(k=>Promise.all(k.filter(x=>x.startsWith('dk-')&&x!==V).map(x=>caches.delete(x))))
    .then(()=>self.clients.claim()));
});

/* 弱网兜底：网络请求 8 秒不返回就先用缓存顶上，避免页面一直转圈 */
const TIMEOUT=8000;
const race=(p,ms)=>new Promise((res,rej)=>{
  const t=setTimeout(()=>rej(new Error('timeout')),ms);
  p.then(v=>{clearTimeout(t);res(v)},e=>{clearTimeout(t);rej(e)});
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return; /* 跨域资源（音频 CDN 等）直接放行，避免干扰 Range 请求 */

  const cacheFirst=/\.(woff2?|ttf|otf|jpe?g|png|gif|webp|svg|ico)$/i.test(u.pathname); /* 图片字体：缓存优先 */
  if(cacheFirst){
    e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{
      if(res.ok){const cl=res.clone();caches.open(V).then(c=>c.put(e.request,cl).catch(()=>{}))}
      return res
    })));
    return
  }

  /* HTML/JS/CSS/JSON：网络优先，保证访客总能拿到最新版；超时或失败回退缓存 */
  e.respondWith(
    race(fetch(e.request),TIMEOUT)
      .then(res=>{
        if(res.ok){const cl=res.clone();caches.open(V).then(c=>c.put(e.request,cl).catch(()=>{}))}
        return res
      })
      .catch(async()=>{
        let r=await caches.match(e.request,{ignoreSearch:true});
        if(r)return r;
        if(u.pathname.endsWith('/')){            /* 根路径离线时对应 index.html */
          r=await caches.match(new Request(u.href.replace(/\/$/,'/index.html')),{ignoreSearch:true});
          if(r)return r;
        }
        return Response.error()
      })
  );
});
