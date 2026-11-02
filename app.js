(()=>{const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const R=document.body.dataset.root||'',PG=document.body.dataset.page;
const J=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},W=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const dl=(name,txt,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove()};
const flash=(el,t)=>{if(el){el.textContent=t;setTimeout(()=>el.textContent='',2000)}};
$('#theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;localStorage.setItem('dk:theme',t)};
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register(R+'sw.js',{scope:R||'./'}).catch(()=>{});
const pr=$('#progress');addEventListener('scroll',()=>{const h=document.documentElement;pr.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight||1)*100)+'%'},{passive:true});
function status(s){const r=J('dk:read:'+s,null);if(!r)return null;return r.done?'done':'ing'}
function paintStatus(){$$('.st[data-slug]').forEach(e=>{const s=status(e.dataset.slug);e.className='st '+(s||'');e.textContent=s==='done'?'✓ 已读':s==='ing'?'◔ 在读':''})}
function dumpAll(){const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('dk:'))o[k]=localStorage.getItem(k)}return o}
function importFile(inp,after){inp.onchange=()=>{const f=inp.files[0];if(!f)return;f.text().then(t=>{const o=JSON.parse(t);for(const k in o)if(k.startsWith('dk:'))localStorage.setItem(k,typeof o[k]==='string'?o[k]:JSON.stringify(o[k]));after&&after()})}}
const HN={y:'黄',g:'绿',b:'蓝',p:'粉'};
// ---------- home ----------
if(PG==='home'){paintStatus();const q=$('#q');q&&(q.oninput=()=>{const v=q.value.trim().toLowerCase();$$('.card').forEach(c=>c.style.display=!v||c.dataset.q.includes(v)?'':'none')});
 const n=$$('.card').filter(c=>status(c.dataset.slug)==='done').length;$('#homeprog').textContent=`已读 ${n} / ${$$('.card').length}`;
 const last=J('dk:last',null);if(last){const b=$('#resume');b.hidden=false;b.href='a/'+last+'.html';b.textContent='继续阅读第 '+(+last)+' 篇 →'}}
// ---------- article ----------
if(PG==='article'){const main=$('.reader'),slug=main.dataset.slug,C=$('#content');localStorage.setItem('dk:last',JSON.stringify(slug));
 // toc
 const hs=$$('#content h2,#content h3'),ta=$$('.toc a');addEventListener('scroll',()=>{let cur;hs.forEach(h=>{if(h.getBoundingClientRect().top<120)cur=h.id});ta.forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+cur))},{passive:true});
 // font size
 const fs=d=>{let v=Math.min(26,Math.max(14,(+localStorage.getItem('dk:fs')||18)+d));localStorage.setItem('dk:fs',v);document.documentElement.style.setProperty('--fs',v+'px')};$('#fsm').onclick=()=>fs(-1);$('#fsp').onclick=()=>fs(1);
 // en
 const tg=(id,cls,key)=>{const b=$(id);if(!b)return;const set=on=>{document.body.classList.toggle(cls,on);b.classList.toggle('on',on);localStorage.setItem(key,on?'1':'')};set(!!localStorage.getItem(key));b.onclick=()=>set(!document.body.classList.contains(cls))};
 tg('#enpar','par','dk:par');tg('#enall','enall','dk:enall');
 // read status & resume
 const rk='dk:read:'+slug,rs=J(rk,{done:false,pos:0}),stat=$('#rstat'),mb=$('#markread');
 const paint=()=>{const r=J(rk,{});mb.textContent=r.done?'✓ 已读（点击取消）':'标记已读';mb.classList.toggle('on',!!r.done);stat.textContent=r.done?'· ✓ 已读':''};paint();
 mb.onclick=()=>{const r=J(rk,{pos:0});r.done=!r.done;W(rk,r);paint()};
 if(!location.hash&&rs.pos>300){const bar=document.createElement('div');bar.className='resume-bar';bar.innerHTML='<button>↩ 回到上次读到的位置</button>';bar.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:70';bar.firstChild.style.cssText='background:var(--acc);color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.2)';document.body.appendChild(bar);bar.firstChild.onclick=()=>{scrollTo(0,rs.pos);bar.remove()};setTimeout(()=>bar.remove(),9000)}
 let tm;addEventListener('scroll',()=>{clearTimeout(tm);tm=setTimeout(()=>{const r=J(rk,{done:false});r.pos=scrollY;r.t=Date.now();const h=document.documentElement;if(scrollY+innerHeight>=$('#actions').offsetTop)r.done=true;W(rk,r);paint()},400)},{passive:true});
 // actions
 const ak='dk:act:'+slug,ACT=()=>J(ak,{checks:{},ans:{}}),sv=$('.actions .saved');
 $$('.act').forEach(li=>{const id=li.dataset.id,cb=$('input',li),tx=$('textarea',li),a=ACT();cb.checked=!!a.checks[id];li.classList.toggle('done',cb.checked);if(tx){tx.value=a.ans[id]||'';if(tx.value&&tx.closest('details'))tx.closest('details').open=true}
  cb.onchange=()=>{const a=ACT();a.checks[id]=cb.checked;W(ak,a);li.classList.toggle('done',cb.checked);flash(sv,'已保存')};
  tx&&(tx.oninput=()=>{const a=ACT();a.ans[id]=tx.value;W(ak,a);flash(sv,'已自动保存')})});
 const title=$('.reader h1').textContent;
 $$('.actions [data-x]').forEach(b=>b.onclick=()=>{const a=ACT();if(b.dataset.x==='json')dl(`dankoe-${slug}-行动卡.json`,JSON.stringify({[ak]:JSON.stringify(a),['dk:hl:'+slug]:JSON.stringify(J('dk:hl:'+slug,[]))},null,1),'application/json');
  else{let m=`# ${title} · 行动卡\n\n`;$$('.act').forEach((li,i)=>{const id=li.dataset.id;m+=`${i+1}. [${a.checks[id]?'x':' '}] ${$('.at',li).textContent}\n`;if(a.ans[id])m+=`   > ${a.ans[id].replace(/\n/g,'\n   > ')}\n`});dl(`dankoe-${slug}-行动卡.md`,m,'text/markdown')}});
 const ii=$('.actions .imp input');ii&&importFile(ii,()=>location.reload());
 // highlights
 const hk='dk:hl:'+slug,HL=()=>J(hk,[]),tool=$('#hltool');let pending=null,curId=null;
 const blk=n=>(n.nodeType===3?n.parentElement:n).closest('[data-b]');
 const offIn=(b,node,off)=>{const r=document.createRange();r.setStart(b,0);r.setEnd(node,off);return r.toString().length};
 function wrap(h){const b=C.querySelector(`[data-b="${h.b}"]`);if(!b)return false;let txt=b.textContent,s=h.s;if(txt.slice(s,h.e)!==h.text){s=txt.indexOf(h.text);if(s<0)return false}const e=s+h.text.length;
  const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.en-p')?2:1});let pos=0,n,segs=[];
  while(n=w.nextNode()){const L=n.length,a=Math.max(s,pos),z=Math.min(e,pos+L);if(a<z)segs.push([n,a-pos,z-pos]);pos+=L}
  // note: en-p text excluded from walker but included in textContent; offsets computed on same basis below
  segs.forEach(([n,a,z])=>{const r=document.createRange();r.setStart(n,a);r.setEnd(n,z);const m=document.createElement('mark');m.className='hl '+h.c;m.dataset.id=h.id;if(h.note){m.dataset.note=h.note;m.title='笔记：'+h.note}r.surroundContents(m)});return true}
 const btext=b=>{let t='';const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.en-p')?2:1});let n;while(n=w.nextNode())t+=n.data;return t};
 function wrap2(h){const b=C.querySelector(`[data-b="${h.b}"]`);if(!b)return;const T=btext(b);let s=T.slice(h.s,h.e)===h.text?h.s:T.indexOf(h.text);if(s<0)return;const e=s+h.text.length;
  const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.en-p')?2:1});let pos=0,n,segs=[];while(n=w.nextNode()){const L=n.length,a=Math.max(s,pos),z=Math.min(e,pos+L);if(a<z)segs.push([n,a-pos,z-pos]);pos+=L}
  segs.forEach(([n,a,z])=>{const r=document.createRange();r.setStart(n,a);r.setEnd(n,z);const m=document.createElement('mark');m.className='hl '+h.c;m.dataset.id=h.id;if(h.note){m.dataset.note=h.note;m.title='笔记：'+h.note}r.surroundContents(m)})}
 const unwrapAll=()=>$$('mark.hl',C).forEach(m=>{m.replaceWith(...m.childNodes)});const render=()=>{unwrapAll();C.normalize();HL().forEach(wrap2)};render();
 const boff=(b,node,off)=>{let t=0;const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.en-p')?2:1});let n;while(n=w.nextNode()){if(n===node)return t+off;t+=n.length}return t};
 const place=rect=>{tool.hidden=false;tool.style.top=(scrollY+rect.top-44)+'px';tool.style.left=Math.max(8,scrollX+rect.left)+'px'};
 document.addEventListener('mouseup',ev=>{if(tool.contains(ev.target))return;setTimeout(()=>{const sel=getSelection();if(sel.isCollapsed||!C.contains(sel.anchorNode)){if(!ev.target.closest('mark.hl')){tool.hidden=true;pending=null}return}
  const r=sel.getRangeAt(0),b=blk(r.startContainer);if(!b){return}let sn=r.startContainer,so=r.startOffset,en=r.endContainer,eo=r.endOffset;
  if(sn.nodeType!==3){const w=document.createTreeWalker(sn,NodeFilter.SHOW_TEXT);const f=w.nextNode();if(!f)return;sn=f;so=0}
  const s=boff(b,sn,so);let e;if(b.contains(en)&&en.nodeType===3)e=boff(b,en,eo);else e=btext(b).length;const text=btext(b).slice(s,e);if(!text.trim())return;
  pending={b:b.dataset.b,s,e,text};curId=null;place(r.getBoundingClientRect())},10)});
 C.addEventListener('click',ev=>{const m=ev.target.closest('mark.hl');if(!m)return;curId=m.dataset.id;pending=null;place(m.getBoundingClientRect())});
 tool.addEventListener('mousedown',e=>e.preventDefault());
 tool.onclick=ev=>{const bt=ev.target.closest('button');if(!bt)return;let L=HL();
  if(bt.dataset.c){if(pending){L.push({id:Date.now().toString(36),...pending,c:bt.dataset.c,note:'',t:Date.now()});}else if(curId){const h=L.find(x=>x.id===curId);h&&(h.c=bt.dataset.c)}}
  else if(bt.dataset.a==='note'){let h=curId&&L.find(x=>x.id===curId);if(!h&&pending){h={id:Date.now().toString(36),...pending,c:'y',note:'',t:Date.now()};L.push(h)}if(h){const v=prompt('为这段划线写笔记：',h.note||'');if(v!==null)h.note=v}}
  else if(bt.dataset.a==='del'&&curId)L=L.filter(x=>x.id!==curId);
  W(hk,L);getSelection().removeAllRanges();tool.hidden=true;pending=null;curId=null;render()};
 window.__dk={render,HL}}
// ---------- notes ----------
if(PG==='notes'){const M=window.DKMETA||{},box=$('#notes');
 function build(){let h='',md='# 我的 Dan Koe 笔记\n\n',cnt=0;
  for(const s of Object.keys(M).sort()){const m=M[s],hl=J('dk:hl:'+s,[]),a=J('dk:act:'+s,{checks:{},ans:{}}),r=J('dk:read:'+s,null);
   const ids=Object.keys(m.acts).filter(id=>a.checks[id]||a.ans[id]);if(!hl.length&&!ids.length)continue;cnt++;
   h+=`<section class="nart"><h2><a href="a/${s}.html">${s} · ${m.t}</a> ${r&&r.done?'<small class="st done">✓ 已读</small>':''}</h2>`;md+=`## ${s} · ${m.t}\n\n`;
   if(hl.length){h+='<h3>划线与笔记</h3>';md+='### 划线与笔记\n\n';hl.forEach(x=>{h+=`<div class="nitem"><mark class="hl ${x.c}">${esc(x.text)}</mark> <a href="a/${s}.html#p${x.b}">↗</a>${x.note?`<div class="nn">✎ ${esc(x.note)}</div>`:''}</div>`;md+=`> ${x.text}\n\n`+(x.note?`笔记：${x.note}\n\n`:'')})}
   if(ids.length){h+='<h3>行动卡</h3>';md+='### 行动卡\n\n';ids.forEach(id=>{h+=`<div class="nitem">${a.checks[id]?'☑':'☐'} ${esc(m.acts[id])} <a href="a/${s}.html#${id}">↗</a>${a.ans[id]?`<div class="nn">${esc(a.ans[id]).replace(/\n/g,'<br>')}</div>`:''}</div>`;md+=`- [${a.checks[id]?'x':' '}] ${m.acts[id]}\n`+(a.ans[id]?`  > ${a.ans[id].replace(/\n/g,'\n  > ')}\n`:'')});md+='\n'}
   h+='</section>'}
  box.innerHTML=cnt?h:'<p class="muted">还没有笔记。打开任意文章，选中文字即可划线；文末行动卡可勾选和作答。</p>';return md}
 const esc=t=>t.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));let md=build();
 $$('[data-x]').forEach(b=>b.onclick=()=>{md=build();b.dataset.x==='md'?dl('dankoe-我的笔记.md',md,'text/markdown'):dl('dankoe-笔记备份.json',JSON.stringify(dumpAll(),null,1),'application/json')});
 importFile($('.imp input'),()=>{md=build();flash($('.saved'),'已导入')})}
})();
