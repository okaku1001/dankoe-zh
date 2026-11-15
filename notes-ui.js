/* Reading notebook: extends the existing dk:hl store (migrated, never deleted). */
(() => {
  'use strict';
  const N=window.DKNotebook;if(!N)return;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const R=document.body.dataset.root||'', page=document.body.dataset.page;
  const article=page==='article' ? $('.reader')?.dataset.slug : page==='posts' ? location.pathname.split('/').pop().replace(/\.html$/,'') : null;
  const content=page==='article' ? $('.reader') : page==='posts' ? $('#tl') : null;
  const title=($('h1')?.textContent||document.title).slice(0,500);
  const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
  function button(label,fn,cls='') {const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;}
  const notice=el('div','nb-status');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;document.body.append(notice);
  let dialog=null,noticeTimer;
  function say(text,error=false) {
    clearTimeout(noticeTimer);notice.replaceChildren(el('span','',text),button('关闭提示',()=>notice.hidden=true));notice.hidden=false;notice.classList.toggle('error',error);
    if(dialog?.open){let local=$('.nb-local-status',dialog);if(!local){local=el('p','nb-local-status nb-warning');local.setAttribute('role','status');$('.nb-body',dialog).prepend(local);}local.textContent=text;}
    if(!error)noticeTimer=setTimeout(()=>notice.hidden=true,5500);
  }
  let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw Error();}};}
  const store=new N.Store(storage,t=>say(t,true));
  store.notes.forEach(r=>{if(r.title===r.article)r.title=(r.article===article?title:window.DKMETA?.[r.article]?.t)||r.title;});
  let blocks=[], pending=null,current=null,dirty=false,request=null,sessionKey='', opener=null,toolbar;
  const uid=()=>window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const pathFor=r=>/^(posts|naval-posts|naval-posts-2025)$/.test(r.article) ? r.article+'.html' : 'a/'+r.article+'.html';
  const linkFor=r=>R+pathFor(r)+'#note='+encodeURIComponent(r.id);
  function refreshStore() {if(dirty || request)return;store.load();render();if(page==='notes')buildNotesPage();}
  addEventListener('storage',e=>{if(e.key===N.KEY)refreshStore();});
  function initBlocks() {
    if(!content)return;
    if(page==='article') {
      blocks=$$('[data-b],.en-p',$('#content'));
      blocks.forEach((b,i)=>{b.dataset.nbBlock=b.classList.contains('en-p') ? 'en:'+(b.closest('[data-b]')?.dataset.b||b.previousElementSibling?.dataset.b||i) : 'b:'+b.dataset.b;});
      const parallel=blocks.filter(b=>b.classList.contains('en-p')),used=new Set();
      const full=$$('p,li,h2,h3,h4,pre', $('#enfull')||document.createElement('div')).filter(b=>!b.classList.contains('enh')&&!b.querySelector('p,li,h2,h3,h4,pre'));
      full.forEach((b,i)=>{const match=parallel.find(x=>!used.has(x)&&x.textContent===b.textContent);if(match)used.add(match);b.dataset.nbBlock=match?match.dataset.nbBlock:'full-en:'+i;});
      blocks.push(...full);
    } else {
      blocks=$$('.pt',content).flatMap(pt=>$$('.pz, p[lang="en"]',pt).map((b,i)=>{b.dataset.nbBlock=pt.id+':'+(b.lang==='en'?'en':'zh')+':'+i;return b;}));
    }
  }
  function visible(b) {let p=b;while(p&&p!==content){if(getComputedStyle(p).display==='none'||(p.tagName==='DETAILS'&&!p.open))return false;p=p.parentElement;}return true;}
  function textNodes(b) {const out=[],walk=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let n;while((n=walk.nextNode()))if(n.parentElement.closest('[data-nb-block]')===b)out.push(n);return out;}
  const textOf=b=>textNodes(b).map(n=>n.data).join('');
  function capture(range) {
    const segments=[];
    for(const b of blocks) {
      if(!range.intersectsNode(b)||!visible(b))continue;
      let pos=0,start=null,end=0;
      for(const n of textNodes(b)) {
        if(range.intersectsNode(n)) {
          const br=document.createRange();br.selectNodeContents(n);
          if(range.compareBoundaryPoints(Range.START_TO_START,br)>0)br.setStart(range.startContainer,range.startOffset);
          if(range.compareBoundaryPoints(Range.END_TO_END,br)<0)br.setEnd(range.endContainer,range.endOffset);
          const size=br.toString().length;
          if(size){const offset=br.startContainer===n?br.startOffset:0;if(start===null)start=pos+offset;end=pos+offset+size;}
        }
        pos+=n.length;
      }
      const t=textOf(b);if(start!==null&&end>start&&t.slice(start,end).trim())segments.push(N.makeSegment(b.dataset.nbBlock,t,start,end));
    }
    return segments;
  }
  function markSegment(r,s) {
    let targets=blocks.filter(x=>x.dataset.nbBlock===s.block);
    if(!targets.some(b=>N.locate(textOf(b),s)>=0)){
      const family=s.block.startsWith('b:')?'zh':s.block.startsWith('en:')||s.block.startsWith('full-en:')?'en':'post';
      const candidates=blocks.filter(b=>{const id=b.dataset.nbBlock;return (family==='zh'?id.startsWith('b:'):family==='en'?(id.startsWith('en:')||id.startsWith('full-en:')):id.split(':')[0]===s.block.split(':')[0])&&N.locate(textOf(b),s)>=0;});
      const keys=new Set(candidates.map(b=>b.dataset.nbBlock));targets=keys.size===1?candidates:[];
    }
    let found=false;for(const b of targets){
    const start=N.locate(textOf(b),s);if(start<0)continue;found=true;
    const end=start+s.quote.length;let at=0;const pieces=[];
    for(const n of textNodes(b)){const a=Math.max(start,at),z=Math.min(end,at+n.length);if(a<z)pieces.push({n,a:a-at,z:z-at});at+=n.length;}
    for(const {n,a,z} of pieces.reverse()) {
      const range=document.createRange();range.setStart(n,a);range.setEnd(n,z);
      const m=el('mark','hl nb-mark '+r.color);m.dataset.id=r.id;m.title=r.note?'我的笔记：'+r.note:'查看划线 / 写笔记';m.tabIndex=0;m.setAttribute('role','button');m.setAttribute('aria-label','查看划线笔记：'+s.quote.slice(0,60));
      if(r.note)m.dataset.hasNote='1';range.surroundContents(m);
    }
    }return found;
  }
  let missing=new Set();
  function render() {
    if(content){$$('mark.nb-mark',content).forEach(m=>m.replaceWith(...m.childNodes));content.normalize();missing=new Set();
      for(const r of store.notes.filter(x=>x.article===article&&x.highlighted!==false))for(const s of r.segments)if(!markSegment(r,s))missing.add(r.id);
    }
    if(toolbar)toolbar.textContent='本篇笔记 · '+store.notes.filter(x=>x.article===article).length;
  }
  function download(name,txt,type) {const url=URL.createObjectURL(new Blob([txt],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function backupButtons(container) {
    container.append(button('备份 JSON',()=>download('阅读笔记-备份.json',JSON.stringify(store.backup(),null,2),'application/json')),button('导出 Markdown',()=>download('阅读笔记.md',N.markdown(store.notes),'text/markdown')));
    const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
    container.append(button('合并导入 JSON',()=>input.click()),input);importInput(input);
  }
  function importInput(input,after) {
    input.onchange=async()=>{
      const f=input.files?.[0];if(!f)return;
      try {
        if(f.size>N.MAX_BYTES)throw Error('备份不能超过 5 MB。');
        const data=N.parseBackup(await f.text());
        const merged=N.mergeNotes(store.notes,data.notes),extra=merged.length-store.notes.length;
        if(!confirm(`备份含 ${data.notes.length} 条笔记，将新增 ${extra} 条（重复跳过，冲突保留两份）。阅读进度与行动卡只补充缺项，不覆盖本机已有内容。是否合并？`))return;
        const result=store.import(data);if(!result)return;
        render();if(page==='notes')buildNotesPage();if(dialog.open)showList();if(after&&result===true)after();
        if(result===true)say(`已合并导入，新增 ${extra} 条笔记。`);
      } catch(e) {say(e.message||'导入失败，未修改笔记。',true);} finally {input.value='';}
    };
  }
  dialog=el('dialog','nb-dialog');dialog.setAttribute('aria-labelledby','nb-title');
  const head=el('div','nb-head'),heading=el('h2','', '阅读笔记');heading.id='nb-title';
  const body=el('div','nb-body');head.append(heading,button('关闭 ✕',()=>closeDialog()));dialog.append(head,body);document.body.append(dialog);
  function closeDialog() {
    if(dirty&&!confirm('有尚未保存的内容，确定放弃这次编辑？'))return;
    if(request&&!confirm('AI 正在生成，关闭将取消请求。继续？'))return;
    if(request)request.abort();dirty=false;dialog.close();if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus();else toolbar?.focus();
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  function openDialog(label) {if(!dialog.open){opener=document.activeElement;dialog.showModal();}heading.textContent=label;body.replaceChildren();dirty=false;}
  function warning(container) {container.append(el('p','nb-warning','只保存在当前浏览器；清理站点数据会丢失。请定期备份 JSON（不含 API 密钥），可导入迁移；没有账号与云同步。'));}
  function backButton(){return button('返回笔记列表',()=>{if(!dirty||confirm('放弃尚未保存的修改？'))showList();});}
  function jump(r) {
    if(r.article!==article){location.href=linkFor(r);return;}
    dialog.close();dirty=false;
    const marks=$$('mark.nb-mark',content).filter(x=>x.dataset.id===r.id);let m=marks.find(x=>visible(x))||marks[0];if(!m&&r.highlighted===false){m=blocks.find(b=>b.dataset.nbBlock===r.segments[0].block&&N.locate(textOf(b),r.segments[0])>=0);if(m)m.tabIndex=-1;}
    if(!m){say('此划线暂未能定位；原文可能变化。摘录与笔记仍完整保留在列表。',true);return;}
    let p=m.parentElement;while(p&&p!==content){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}
    const block=m.closest('[data-nb-block]');
    if(block&&!visible(block)){if(block.closest('#enfull')){document.body.classList.add('enall');$('#enall')?.classList.add('on');}else{document.body.classList.remove('enall');$('#enall')?.classList.remove('on');if(block.classList.contains('en-p')){document.body.classList.add('par');$('#enpar')?.classList.add('on');}}}
    m.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});m.focus({preventScroll:true});
    m.classList.add('nb-found');setTimeout(()=>m.classList.remove('nb-found'),2000);
  }
  function recordCard(r,withCheckbox=false) {
    const card=el('section','nb-card'),h=el('h3','',r.title),quote=el('blockquote','',r.segments.map(s=>s.quote).join('\n\n'));
    if(withCheckbox){const label=el('label','nb-check'),check=el('input');check.type='checkbox';check.value=r.id;check.dataset.article=r.article;check.checked=current?.id===r.id&&current?.article===r.article;label.append(check,document.createTextNode('发送这条摘录与个人笔记'));card.append(label);}
    card.append(h,quote);
    if(missing.has(r.id))card.append(el('p','nb-warning','暂未能定位，摘录和笔记未丢失。'));
    card.append(el('h4','','我的笔记'),el('p','nb-text',r.note||'（还未写笔记）'));
    for(const a of r.ai){const details=el('details','nb-ai-saved'),sum=el('summary','','AI 辅助思考 · '+a.model+'（非本人笔记）');details.append(sum,el('p','nb-text','问题：'+a.question),el('p','nb-text',a.text));card.append(details);}
    if(!withCheckbox){const bar=el('div','nb-buttons');const a=el('a','','回到划线');a.href=linkFor(r);if(r.article===article)a.onclick=e=>{e.preventDefault();jump(r);};bar.append(a,button('编辑 / 取消高亮',()=>showEditor(r)),button(r.highlighted===false?'恢复高亮':'取消高亮（保留笔记）',()=>{const copy={...r,highlighted:r.highlighted===false,updatedAt:Date.now()};if(store.save(copy)){render();if(page==='notes')buildNotesPage();if(dialog.open)showList();say(copy.highlighted?'已恢复高亮。':'已取消高亮，摘录、笔记及 AI 思考仍保留。');}}),button('AI 思考',()=>showAI(r)));card.append(bar);}
    return card;
  }
  function showList() {
    openDialog(article?'本篇阅读笔记':'全部阅读笔记');warning(body);
    const bar=el('div','nb-buttons');backupButtons(bar);body.append(bar);
    const list=store.notes.filter(r=>!article||r.article===article).sort((a,b)=>b.updatedAt-a.updatedAt);
    if(!list.length)body.append(el('p','','还没有划线。回到正文，选择中文或英文，再点「高亮」或「记笔记」。支持跨段选取。'));
    list.forEach(r=>body.append(recordCard(r)));body.append(button('AI：组合指定笔记',()=>showAI(list[0]||null)));
    focusFirst();
  }
  function focusFirst(){setTimeout(()=>body.querySelector('textarea, input:not([type=file]), button, a')?.focus(),0);}
  function showEditor(record) {
    current=record ? JSON.parse(JSON.stringify(record)) : {id:uid(),article,title,segments:pending,color:'y',note:'',ai:[],createdAt:Date.now(),updatedAt:Date.now()};
    if(!current.segments?.length)return;
    openDialog('划线与我的笔记');body.append(el('blockquote','',current.segments.map(s=>s.quote).join('\n\n')));
    const label=el('label','nb-field','我的笔记（只保存在本机）'),ta=el('textarea');ta.rows=7;ta.maxLength=30000;ta.value=current.note;label.append(ta);body.append(label);ta.oninput=()=>dirty=true;
    const colorLabel=el('label','nb-field','高亮颜色'),select=el('select');for(const [v,t] of [['y','黄色'],['g','绿色'],['b','蓝色'],['p','粉色']]){const o=el('option','',t);o.value=v;select.append(o);}select.value=current.color;select.onchange=()=>dirty=true;colorLabel.append(select);body.append(colorLabel);
    const hlLabel=el('label','nb-check'),hl=el('input');hl.type='checkbox';hl.checked=current.highlighted!==false;hl.onchange=()=>dirty=true;hlLabel.append(hl,document.createTextNode('在正文显示高亮（取消勾选仍保留笔记）'));body.append(hlLabel);
    const bar=el('div','nb-buttons');
    const save=()=>{current.note=ta.value;current.color=select.value;current.highlighted=hl.checked;current.updatedAt=Date.now();if(!store.save(current))return false;dirty=false;pending=null;render();if(page==='notes')buildNotesPage();say('划线与笔记已保存在当前浏览器。');return true;};
    bar.append(button('保存笔记',()=>{if(save())showList();},'nb-primary'),button('保存并用 AI 思考',()=>{if(save())showAI(current);}),backButton());
    if(record)bar.append(button('删除划线及其笔记',()=>{if(confirm('删除这条高亮、个人笔记和已保存的 AI 思考？此操作仅影响本浏览器。')&&store.remove(current.article,current.id)){dirty=false;render();if(page==='notes')buildNotesPage();showList();say('已删除。');}},'nb-danger'));
    body.append(bar,el('p','muted','不想保留高亮时可删除整条；这也会删除该条下的个人笔记和 AI 思考，请先备份。'));ta.focus();
  }
  function showAI(record) {
    current=record;openDialog('AI 辅助思考 · 手动调用');
    body.append(el('p','nb-warning','仅在点击「发送并生成」后，浏览器才会直连你填写的服务，将下方勾选的原文摘录、个人笔记及问题发送给它；不发送其他笔记或已有 AI 思考。可能产生费用，需要该服务允许浏览器 CORS。兼容 OpenAI Chat Completions，不保证所有 API 可用。'));
    const fields=el('div','nb-config');
    function field(label,type,value,placeholder) {const l=el('label','nb-field',label),i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;i.value=value||'';i.placeholder=placeholder||'';i.autocomplete='off';i.spellcheck=false;l.append(i);fields.append(l);return i;}
    // Endpoint/model are also memory-only; no config can accidentally enter backups.
    const ep=field('HTTPS endpoint（完整路径）','url',window.__nbEndpoint||'','https://your-provider.example/v1/chat/completions');
    const model=field('模型名称','text',window.__nbModel||'','服务提供方的模型 ID');model.maxLength=200;
    const key=field('你自己的 API key（仅当前页面内存，刷新即清除）','password',sessionKey);key.maxLength=4096;key.name='notebook-session-key';
    const clear=button('立即清除会话 key',()=>{sessionKey='';key.value='';say('已清除本页内存中的 API key。');});fields.append(clear);
    const question=field('希望进一步思考的问题','textarea','','这些观点与我的笔记有哪些联系、矛盾或值得尝试的行动？');question.rows=3;question.maxLength=4000;
    body.append(fields,el('h3','','指定发送的材料（可跨文章勾选）'));
    const choices=el('div','nb-choices');store.notes.slice().sort((a,b)=>b.updatedAt-a.updatedAt).forEach(r=>choices.append(recordCard(r,true)));body.append(choices);
    const info=el('p','muted'),preview=el('pre','nb-preview');
    const previewDetails=el('details');previewDetails.append(el('summary','','查看即将发送的 JSON（不含 key）'),preview);body.append(info,previewDetails);
    const output=el('div','nb-output');output.setAttribute('aria-live','polite');
    const status=el('p');status.setAttribute('role','status');
    const bar=el('div','nb-buttons');let result=null,snapshot=null;
    const selected=()=>$$('input:checked',choices).map(c=>store.notes.find(r=>r.id===c.value&&r.article===c.dataset.article)).filter(Boolean);
    function updatePreview(){const records=selected();snapshot=N.messages(records,question.value);preview.textContent=JSON.stringify(snapshot,null,2);info.textContent=`将发送 ${records.length} 条摘录及对应个人笔记；不含 API key。`;}choices.onchange=updatePreview;question.oninput=updatePreview;updatePreview();
    const cancel=button('取消生成',()=>request?.abort());cancel.disabled=true;
    const save=button('保存 AI 思考（独立于我的笔记）',()=>{
      const target=result&&store.notes.find(r=>r.id===result.targetId&&r.article===result.targetArticle);if(!target)return;
      const r=JSON.parse(JSON.stringify(target));r.ai.push(result.ai);r.updatedAt=Date.now();if(store.save(r)){save.disabled=true;dirty=false;if(page==='notes')buildNotesPage();say('AI 思考已单独保存。');}
    });save.disabled=true;
    const send=button('发送并生成',async()=>{
      if(request)return;result=null;save.disabled=true;output.replaceChildren();
      let url;const records=selected();
      try {url=N.endpoint(ep.value.trim());if(!model.value.trim()||!key.value.trim())throw Error('请在本页填写模型与 API key；没有 key 仍可完整使用笔记。');if(!records.length)throw Error('请先勾选至少一条材料。');if(records.length>100)throw Error('一次最多选择 100 条笔记。');if(!question.value.trim())throw Error('请写下你希望思考的问题。');
        updatePreview();if(JSON.stringify(snapshot).length>120000)throw Error('选取的材料过长，请减少勾选。');
      }catch(e){status.textContent=e.message;return;}
      if(!confirm(`将把所选 ${records.length} 条摘录与个人笔记发送到 ${new URL(url).origin}，可能计费。确认发送？`))return;
      sessionKey=key.value.trim();window.__nbEndpoint=ep.value.trim();window.__nbModel=model.value.trim();
      const requestModel=model.value.trim(),requestQuestion=question.value;
      const controller=new AbortController();request=controller;let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},60000);
      send.disabled=true;cancel.disabled=false;status.textContent='生成中…（最长等待 60 秒，可取消）';body.setAttribute('aria-busy','true');
      try {
        const response=await fetch(url,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+sessionKey},body:JSON.stringify({model:requestModel,messages:snapshot,stream:false})});
        if(!response.ok)throw Error('服务返回 HTTP '+response.status+'；未生成成功。请检查 endpoint、模型、额度与权限。');
        // Do not surface provider error bodies: some gateways echo Authorization headers.
        const raw=await response.text();if(raw.length>300000)throw Error('响应过大，已拒绝处理。');
        const data=JSON.parse(raw),answer=data.choices?.[0]?.message?.content;
        if(typeof answer!=='string'||!answer.trim()||answer.length>60000)throw Error('响应不符合 Chat Completions 格式，或正文为空／过长。');
        if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
        output.append(el('h3','','AI 辅助思考（未保存，不是本人笔记）'),el('p','nb-text',answer));
        const target=records.find(r=>r.id===current?.id&&r.article===current?.article)||records[0];
        result={targetId:target.id,targetArticle:target.article,ai:{id:uid(),text:answer,model:requestModel,question:requestQuestion,createdAt:Date.now(),sourceIds:records.map(r=>r.article+':'+r.id)}};
        status.textContent='生成完成，尚未保存。将保存到「'+target.title+'」的所选划线下。';save.disabled=false;dirty=true;
      } catch(e) {status.textContent=timedOut?'请求超时，未生成成功。':controller.signal.aborted?'已取消，未保存任何 AI 思考。':e instanceof SyntaxError?'服务返回的不是有效 JSON，未生成成功。':e instanceof TypeError?'连接失败：请检查网络、HTTPS endpoint 和服务的 CORS 支持。未生成成功。':e.message;}
      finally {clearTimeout(timer);request=null;send.disabled=false;cancel.disabled=true;body.removeAttribute('aria-busy');}
    },'nb-primary');
    bar.append(send,cancel,save,button('返回列表',()=>{if(request){say('请先取消生成再返回。',true);return;}if(!dirty||confirm('AI 思考尚未保存，确定放弃？'))showList();}));body.append(bar,status,output);focusFirst();
  }
  function buildNotesPage() {
    const box=$('#notes');if(!box)return;box.replaceChildren();
    const filter=el('select');filter.setAttribute('aria-label','按文章筛选笔记');filter.append(el('option','','全部文章'));
    const articles=new Map(store.notes.map(r=>[r.article,r.title]));
    for(const [v,t] of articles){const o=el('option','',t);o.value=v;filter.append(o);}filter.options[0].value='';
    const list=el('div');function draw(){list.replaceChildren();const rs=store.notes.filter(r=>!filter.value||r.article===filter.value).sort((a,b)=>b.updatedAt-a.updatedAt);rs.forEach(r=>list.append(recordCard(r)));if(!rs.length)list.append(el('p','','还没有笔记。打开文章或短帖，选中文字即可高亮、记笔记。'));}
    box.append(filter,button('组合笔记，用 AI 思考',()=>showAI(null)),list);draw();filter.onchange=draw;
    // Retain original action-card answers, rendered as text, never HTML.
    const M=window.DKMETA||{};
    for(const [slug,m] of Object.entries(M)) {let a;try{a=JSON.parse(storage.getItem('dk:act:'+slug)||'null');}catch{continue;}if(!a)continue;
      const ids=Object.keys(m.acts||{}).filter(id=>a.checks?.[id]||a.ans?.[id]);if(!ids.length)continue;
      const section=el('section','nb-card');section.append(el('h3','','行动卡 · '+m.t));for(const id of ids){const p=el('p','nb-text',(a.checks?.[id]?'☑ ':'☐ ')+m.acts[id]+'\n'+(a.ans?.[id]||''));section.append(p);}box.append(section);
    }
  }
  function hideTool(){if(tool)tool.hidden=true;}
  let tool=$('#hltool');
  if(content){
    initBlocks();render();
    toolbar=button('本篇笔记',showList,'nb-reader-button');toolbar.id='nb-open';($('.tools')||content.parentElement).insertBefore(toolbar,($('.tools')||content.parentElement).firstChild);render();
    const hint=el('p','nb-hint','选中文字 → 高亮 / 记笔记 · 支持中文、英文与跨段选取 · 选中后 Alt+N 记笔记 · 仅本机保存，请备份');(page==='article'?$('#content'):content).before(hint);
    if(!tool){tool=el('div');tool.id='hltool';document.body.append(tool);}tool.replaceChildren();tool.className='nb-selection';tool.hidden=true;tool.setAttribute('role','toolbar');tool.setAttribute('aria-label','选中文字后的操作');
    for(const [c,label] of [['y','高亮'],['g','绿色'],['b','蓝色'],['p','粉色']]){const b=button(label,()=>{
      if(!pending?.length)return;const now=Date.now(),r={id:uid(),article,title,segments:pending,color:c,note:'',ai:[],createdAt:now,updatedAt:now};
      if(store.save(r)){pending=null;getSelection()?.removeAllRanges();hideTool();render();say('高亮已保存。点击高亮可写笔记或取消。');}
    },'nb-color '+c);b.setAttribute('aria-label',label);tool.append(b);}
    tool.append(button('✎ 记笔记',()=>{if(pending?.length){hideTool();showEditor(null);getSelection()?.removeAllRanges();}}),button('取消',()=>{hideTool();pending=null;getSelection()?.removeAllRanges();}));
    tool.addEventListener('pointerdown',e=>e.preventDefault());
    let selectionTimer;
    function selectionChanged(){clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>{
      if(dialog.open)return;const sel=getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount){hideTool();return;}
      const range=sel.getRangeAt(0);const allowed=page==='article'?[$('#content'),$('#enfull')].filter(Boolean):[content];if(!allowed.some(root=>root.contains(range.startContainer)&&root.contains(range.endContainer))){hideTool();return;}
      const parts=capture(range);if(!parts.length){hideTool();return;}
      if(parts.length>200||parts.reduce((s,p)=>s+p.quote.length,0)>30000){say('选取过长，请分批高亮（最多 200 段、3 万字符）。',true);hideTool();return;}
      pending=parts;tool.hidden=false;
    },160);}
    document.addEventListener('selectionchange',selectionChanged);content.addEventListener('pointerup',selectionChanged);content.addEventListener('touchend',selectionChanged,{passive:true});content.addEventListener('keyup',selectionChanged);
    content.addEventListener('click',e=>{const m=e.target.closest('mark.nb-mark');if(m&&getSelection()?.isCollapsed){e.preventDefault();const r=store.notes.find(x=>x.article===article&&x.id===m.dataset.id);if(r)showEditor(r);}});
    content.addEventListener('keydown',e=>{const m=e.target.closest('mark.nb-mark');if(m&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const r=store.notes.find(x=>x.article===article&&x.id===m.dataset.id);if(r)showEditor(r);}});
    function hashJump(){if(location.hash.startsWith('#note=')){let id;try{id=decodeURIComponent(location.hash.slice(6));}catch{return;}const r=store.notes.find(x=>x.article===article&&x.id===id);if(r)setTimeout(()=>jump(r),100);else say('当前浏览器中未找到这条笔记，请先导入对应 JSON 备份。',true);}}
    hashJump();addEventListener('hashchange',hashJump);
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open){hideTool();pending=null;}if(e.altKey&&e.key.toLowerCase()==='n'&&pending?.length&&!dialog.open){e.preventDefault();hideTool();showEditor(null);getSelection()?.removeAllRanges();}});
  if(page==='notes') {
    const bar=$('.abar');if(bar){bar.replaceChildren();backupButtons(bar);}const intro=$('main > .muted');if(intro)intro.textContent='个人笔记与 AI 思考分开保存，支持按文章查阅与回到原文。';
    const w=el('div');warning(w);$('#notes')?.before(w);buildNotesPage();
  }
  window.DKNotes={importInput,backup:()=>store.backup(),showList,
    // Small deterministic surface for DOM tests, not an API key or network debugging hook.
    capture,render,store};
})();
