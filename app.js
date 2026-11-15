(()=>{const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const R=document.body.dataset.root||'',PG=document.body.dataset.page;
const storageError=()=>{let e=document.getElementById('reader-storage-error');if(!e){e=document.createElement('p');e.id='reader-storage-error';e.className='nb-status error';e.setAttribute('role','alert');document.body.append(e)}e.textContent='浏览器存储失败，这次修改未保存。请先备份，检查空间或隐私模式。'};
const get=k=>{try{return localStorage.getItem(k)}catch{storageError();return null}},put=(k,v)=>{try{localStorage.setItem(k,v);return true}catch{storageError();return false}};
const J=(k,d)=>{try{return JSON.parse(get(k))??d}catch(e){storageError();return d}},W=(k,v)=>put(k,JSON.stringify(v));
const dl=(name,txt,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove()};
const flash=(el,t)=>{if(el){el.textContent=t;setTimeout(()=>el.textContent='',2000)}};
$('#theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;put('dk:theme',t)};
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register(R+'sw.js',{scope:R||'./',updateViaCache:'none'}).catch(()=>{});
const pr=$('#progress');addEventListener('scroll',()=>{const h=document.documentElement;pr.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight||1)*100)+'%'},{passive:true});
function status(s){const r=J('dk:read:'+s,null);if(!r)return null;return r.done?'done':'ing'}
function paintStatus(){$$('.st[data-slug]').forEach(e=>{const s=status(e.dataset.slug);e.className='st '+(s||'');e.textContent=s==='done'?'✓ 已读':s==='ing'?'◔ 在读':''})}
function importFile(inp,after){window.DKNotes?.importInput(inp,after)}
const HN={y:'黄',g:'绿',b:'蓝',p:'粉'};
// ---------- home ----------
if(PG==='home'){paintStatus();const q=$('#q');q&&(q.oninput=()=>{const v=q.value.trim().toLowerCase();$$('.card').forEach(c=>{const dq=c.dataset.q||'';c.style.display=!v||dq.includes(v)?'':'none'})});
 const cards=$$('.card[data-slug]');const n=cards.filter(c=>status(c.dataset.slug)==='done').length;$('#homeprog')&&($('#homeprog').textContent=`已读 ${n} / ${cards.length}`);
 const last=J('dk:last',null);if(last){const b=$('#resume');if(b){b.hidden=false;b.href='a/'+last+'.html';b.textContent='继续上次阅读 →'}}}
// ---------- article ----------
if(PG==='article'){const main=$('.reader'),slug=main.dataset.slug,C=$('#content');put('dk:last',JSON.stringify(slug));
 const toc=$('.toc'),rk='dk:read:'+slug;
 const hs=[...$$('#content h2[id],#content h3[id]'),$('#actions')].filter(Boolean);
 const links=()=>toc?$$('a[href^="#"]',toc):[];
 const topH=()=>{const h=$('.top')?.offsetHeight||52;document.documentElement.style.setProperty('--top-h',h+'px');return h};
 const markToc=()=>{
  const threshold=topH()+(($('.toc-bar')?.offsetHeight)||0)+8;
  let cur='';
  hs.forEach(h=>{if(h.id&&h.getBoundingClientRect().top<threshold)cur=h.id});
  links().forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+cur));
  const lab=$('.toc-bar-now'),count=$('.toc-bar-count'),on=toc?.querySelector('a.on');
  const sections=links().filter(a=>a.getAttribute('href')!=='#actions');
  if(lab)lab.textContent=(on&&on.getAttribute('href')!=='#actions')?on.textContent.trim():'本篇目录';
  if(count){
   const i=sections.findIndex(a=>a.classList.contains('on'));
   count.textContent=i>=0?`${i+1}/${sections.length}`:`${sections.length} 节`;
  }
 };
 let setOpen=()=>{};
 if(toc){
  toc.id=toc.id||'article-toc';
  toc.setAttribute('role','navigation');
  toc.setAttribute('aria-label','本篇目录');
  const bar=document.createElement('div');
  bar.className='toc-bar';
  const now=document.createElement('span');now.className='toc-bar-now';now.textContent='本篇目录';
  const count=document.createElement('span');count.className='toc-bar-count';
  const open=document.createElement('button');open.type='button';open.id='toc-open';open.textContent='目录';
  open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-controls',toc.id);open.setAttribute('aria-expanded','false');open.setAttribute('aria-label','打开本篇目录');
  bar.append(now,count,open);
  $('.top')?.after(bar);
  const backdrop=document.createElement('div');backdrop.className='toc-backdrop';backdrop.hidden=true;document.body.append(backdrop);
  if(!toc.querySelector('.toc-head')){
   const head=document.createElement('div');head.className='toc-head';
   const title=toc.querySelector('.tt');
   if(title)head.append(title);else{const t=document.createElement('div');t.className='tt';t.textContent='本篇目录';head.append(t)}
   const close=document.createElement('button');close.type='button';close.className='toc-close';close.textContent='关闭';close.setAttribute('aria-label','关闭目录');
   head.append(close);toc.prepend(head);
  }
  const resume=document.createElement('button');resume.type='button';resume.className='toc-resume';resume.hidden=true;toc.querySelector('.toc-head')?.after(resume);
  setOpen=on=>{
   document.body.classList.toggle('toc-open',on);
   open.setAttribute('aria-expanded',on?'true':'false');
   backdrop.hidden=!on;
   if(on){const closeBtn=toc.querySelector('.toc-close');closeBtn?.focus();toc.querySelector('a.on')?.scrollIntoView({block:'nearest'})}
   else open.focus();
  };
  open.onclick=()=>setOpen(true);
  toc.querySelector('.toc-close').onclick=()=>setOpen(false);
  backdrop.onclick=()=>setOpen(false);
  addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('toc-open')){e.preventDefault();setOpen(false)}});
  toc.addEventListener('click',e=>{if(e.target.closest('a[href^="#"]'))setOpen(false)});
 }
 addEventListener('scroll',markToc,{passive:true});
 addEventListener('resize',()=>{topH();markToc()},{passive:true});
 if(window.ResizeObserver&&$('.top'))new ResizeObserver(()=>{topH();markToc()}).observe($('.top'));
 topH();markToc();
 // font size
 const fs=d=>{let v=Math.min(26,Math.max(14,(+get('dk:fs')||18.5)+d));put('dk:fs',v);document.documentElement.style.setProperty('--fs',v+'px')};$('#fsm').onclick=()=>fs(-1);$('#fsp').onclick=()=>fs(1);
 // en
 const tg=(id,cls,key)=>{const b=$(id);if(!b)return;const set=on=>{document.body.classList.toggle(cls,on);b.classList.toggle('on',on);put(key,on?'1':'')};set(!!get(key));b.onclick=()=>set(!document.body.classList.contains(cls))};
 tg('#enpar','par','dk:par');tg('#enall','enall','dk:enall');
 // read status & resume
 const rs=J(rk,{done:false,pos:0}),stat=$('#rstat'),mb=$('#markread');
 const paint=()=>{const r=J(rk,{});mb.textContent=r.done?'✓ 已读（点击取消）':'标记已读';mb.classList.toggle('on',!!r.done);stat.textContent=r.done?'· ✓ 已读':''};paint();
 mb.onclick=()=>{const r=J(rk,{pos:0});r.done=!r.done;W(rk,r);paint()};
 const sectionNameAt=pos=>{
  let last=null;
  hs.forEach(h=>{if(h.id&&h.offsetTop<=pos+20)last=h});
  if(!last||last.id==='actions')return '';
  return toc?.querySelector(`a[href="#${last.id}"]`)?.textContent.trim()||'';
 };
 const paintResume=()=>{
  const btn=$('.toc-resume');if(!btn)return;
  const r=J(rk,{pos:0});
  if(!(r.pos>300)){btn.hidden=true;return}
  const name=sectionNameAt(r.pos);
  btn.hidden=false;
  btn.textContent=name?`↩ 回到上次：${name}`:'↩ 回到上次读到的位置';
  btn.onclick=()=>{setOpen(false);scrollTo({top:r.pos,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})};
 };
 paintResume();
 if(!location.hash&&rs.pos>300){const bar=document.createElement('div');bar.className='resume-bar';bar.innerHTML='<button type="button">↩ 回到上次读到的位置</button>';bar.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:70';bar.firstChild.style.cssText='background:var(--acc);color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2)';document.body.appendChild(bar);bar.firstChild.onclick=()=>{scrollTo(0,rs.pos);bar.remove()};setTimeout(()=>bar.remove(),9000)}
 let tm;addEventListener('scroll',()=>{clearTimeout(tm);tm=setTimeout(()=>{const r=J(rk,{done:false});r.pos=scrollY;r.t=Date.now();const h=document.documentElement;const act=$('#actions');if(act&&scrollY+innerHeight>=act.offsetTop)r.done=true;W(rk,r);paint();paintResume()},400)},{passive:true});
 // actions
 const ak='dk:act:'+slug,ACT=()=>J(ak,{checks:{},ans:{}}),sv=$('.actions .saved');
 $$('.act').forEach(li=>{const id=li.dataset.id,cb=$('input',li),tx=$('textarea',li),a=ACT();cb.checked=!!a.checks[id];li.classList.toggle('done',cb.checked);if(tx){tx.value=a.ans[id]||'';if(tx.value&&tx.closest('details'))tx.closest('details').open=true}
  cb.onchange=()=>{const a=ACT();a.checks[id]=cb.checked;if(W(ak,a)){li.classList.toggle('done',cb.checked);flash(sv,'已保存')}};
  tx&&(tx.oninput=()=>{const a=ACT();a.ans[id]=tx.value;if(W(ak,a))flash(sv,'已自动保存')})});
 const title=$('.reader h1').textContent;
 $$('.actions [data-x]').forEach(b=>b.onclick=()=>{const a=ACT();if(b.dataset.x==='json')dl(`dankoe-${slug}-行动卡.json`,JSON.stringify(window.DKNotes.backup(),null,2),'application/json');
  else{let m=`# ${title} · 行动卡\n\n`;$$('.act').forEach((li,i)=>{const id=li.dataset.id;m+=`${i+1}. [${a.checks[id]?'x':' '}] ${$('.at',li).textContent}\n`;if(a.ans[id])m+=`   > ${a.ans[id].replace(/\n/g,'\n   > ')}\n`});dl(`dankoe-${slug}-行动卡.md`,m,'text/markdown')}});
 const ii=$('.actions .imp input');ii&&importFile(ii,()=>location.reload());
 // Highlight editing and notes are provided by notes-ui.js (legacy data migrated).
}
})();
