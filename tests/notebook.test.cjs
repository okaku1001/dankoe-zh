const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const N=require('../notes-core.js');
const record=(id='test')=>({id,article:'01',title:'原题',segments:[N.makeSegment('b:1','abc quote xyz',4,9)],color:'y',note:'个人笔记',ai:[],createdAt:1,updatedAt:1});
const fakeStorage=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
function dom(file='a/01.html',initial={},options={}) {
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const d=new JSDOM(html,{url:'https://local.test/dankoe-zh/'+file,runScripts:'outside-only',pretendToBeVisual:true});
  const w=d.window;const css=w.document.createElement('style');css.textContent=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');w.document.head.append(css);w.TextEncoder=TextEncoder;w.confirm=()=>true;w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=()=>{throw Error('No real API calls allowed in tests');};
  w.URL.createObjectURL=()=>'';w.URL.revokeObjectURL=()=>{};
  for(const [k,v]of Object.entries(initial))w.localStorage.setItem(k,v);
  if(options.denied)Object.defineProperty(w,'localStorage',{get(){throw Error('denied');}});
  for(const file of ['meta.js','notes-core.js','notes-ui.js','app.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  return d;
}
function selectText(w,b,start,end){const r=w.document.createRange();r.setStart(b.firstChild,start);r.setEnd(b.firstChild,end);return r;}
const buttons=(w,label)=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);
test('store round trip, migration, persistence and removal',()=>{const s=fakeStorage();s.setItem('dk:hl:01',JSON.stringify([{id:'old',b:'1',s:0,e:3,text:'abc',c:'g',note:'before',t:1}]));const st=new N.Store(s);assert.equal(st.notes[0].segments[0].block,'b:1');assert(st.save(record()));const reload=new N.Store(s);assert.equal(reload.notes.length,2);assert(reload.remove('01','old'));assert.equal(new N.Store(s).notes.length,1);assert(s.getItem('dk:hl:01'));});
test('quota and private mode errors never acknowledge success or mutate data',()=>{const s=fakeStorage(),errors=[];const st=new N.Store(s,e=>errors.push(e));s.setItem=()=>{throw Error('quota');};assert.equal(st.save(record()),false);assert.equal(st.notes.length,0);assert.match(errors[0],/保存失败/);const denied=new N.Store({getItem(){throw Error();}},e=>errors.push(e));assert(denied.blocked);assert.equal(denied.save(record()),false);});
test('schema, size, malformed JSON, unsafe URLs and config rejected',()=>{for(const s of ['{','[]',JSON.stringify({format:'dk-notebook',version:9,notes:[],reader:{}}),JSON.stringify({'dk:key':'secret'})])assert.throws(()=>N.parseBackup(s));assert.throws(()=>N.parseBackup(' '.repeat(N.MAX_BYTES+1)));const bad=record();bad.segments[0].start=-1;assert.throws(()=>N.cleanRecord(bad));for(const x of ['http://x/v1/chat/completions','https://u:p@x/v1/chat/completions','https://x/v1/chat/completions?key=x','https://x/responses','javascript:alert(1)'])assert.throws(()=>N.endpoint(x));assert.equal(N.endpoint('https://api.example/v1/chat/completions'),'https://api.example/v1/chat/completions');});
test('backup merge deduplicates and preserves conflicting edits, drops unknown secrets',()=>{const a=record(),b={...record(),note:'other',updatedAt:2};const merged=N.mergeNotes([a],[a,b]);assert.equal(merged.length,2);assert.equal(N.mergeNotes(merged,[b]).length,2);const st=new N.Store(fakeStorage());st.save({...a,apiKey:'MUST_NOT_EXPORT'});const backup=JSON.stringify(st.backup());assert(!backup.includes('MUST_NOT_EXPORT'));assert.equal(N.parseBackup(backup).notes.length,1);const reader={'dk:act:01':{checks:{a1:true},ans:{a1:'old'}}};assert(N.parseBackup(JSON.stringify({format:'dk-notebook',version:2,notes:[a],reader})));});
test('quote anchors handle repeated snippets with context and reject ambiguity',()=>{const t='first quote then second quote end';const s=N.makeSegment('b:1',t,24,29);assert.equal(s.quote,'quote');assert.equal(N.locate('prefix '+t,s),31);assert.equal(N.locate('quote xx quote',{start:99,end:104,quote:'quote',prefix:'',suffix:''}),-1);});
test('request sends only selected quote and personal note, not AI output/config',()=>{const a=record();a.ai=[{text:'DO_NOT_SEND'}];const m=JSON.stringify(N.messages([a],'思考'));assert(m.includes('个人笔记'));assert(!m.includes('DO_NOT_SEND'));assert(!m.includes('apiKey'));});
for(const file of ['a/01.html','a/n01.html','a/n02.html'])test(file+' multi-paragraph and English capture; highlights preserve full text',()=>{
 const d=dom(file),w=d.window,C=w.document.querySelector('#content'),before=C.textContent;
 const blocks=[...C.querySelectorAll('[data-nb-block]')].filter(b=>b.dataset.nbBlock.startsWith('b:'));
 const r=w.document.createRange();r.setStart(blocks[0].firstChild,1);r.setEnd(blocks[1].firstChild,Math.min(4,blocks[1].firstChild.length));
 const parts=w.DKNotes.capture(r);assert(parts.length>=2);assert.equal(parts[0].quote,blocks[0].textContent.slice(1));
 const rec={...record(),article:w.document.querySelector('.reader').dataset.slug,segments:Array.from(parts)};
 assert(w.DKNotes.store.save(rec));w.DKNotes.render();assert(C.querySelectorAll('mark.nb-mark').length>=2);assert.equal(C.textContent,before);
 const en=C.querySelector('.en-p');w.document.body.classList.add('par');const er=selectText(w,en,0,8);const es=w.DKNotes.capture(er);assert.equal(es.length,1);assert.match(es[0].block,/^en:/);
 const full=[...w.document.querySelectorAll('#enfull [data-nb-block]')].find(x=>x.textContent===en.textContent);assert(full);w.document.body.classList.add('enall');const fullParts=w.DKNotes.capture(selectText(w,full,0,8));assert.equal(fullParts.length,1);assert.equal(fullParts[0].block,es[0].block);
 // Toggle language twice and reload all stored marks; offsets and content remain unchanged.
 w.document.querySelector('#enall').click();w.document.querySelector('#enall').click();w.DKNotes.render();assert.equal(C.textContent,before);
 const backup=w.DKNotes.backup();const fresh=dom(file,{[N.KEY]:JSON.stringify({version:2,notes:backup.notes})});assert(fresh.window.document.querySelector('mark.nb-mark'));fresh.window.close();w.close();
});
test('short-post highlights use stable post IDs and support original English',()=>{const d=dom('posts.html'),w=d.window;const p=w.document.querySelector('.pt .pz'),r=selectText(w,p,0,5),parts=w.DKNotes.capture(r);assert.match(parts[0].block,/^p\d+:zh:/);assert(w.DKNotes.store.save({...record(),article:'posts',segments:Array.from(parts)}));w.DKNotes.render();assert(p.querySelector('mark'));w.close();});
test('notes list safely renders malicious note and AI text, existing action cards retained',()=>{const r=record();r.note='<img src=x onerror=alert(1)>';r.ai=[{id:'ai',text:'<script>alert(1)</script>',model:'m',question:'q',createdAt:1,sourceIds:['test']}];const d=dom('notes.html',{[N.KEY]:JSON.stringify({version:2,notes:[r]}),'dk:act:01':JSON.stringify({checks:{a1:true},ans:{a1:'<img src=x>'}})}),w=d.window;const box=w.document.querySelector('#notes');assert(box.textContent.includes(r.note));assert(!box.querySelector('img,script'));w.close();});
test('storage denied does not crash article and reports visible failure',()=>{const d=dom('a/n01.html',{}, {denied:true}),w=d.window;assert(w.DKNotes);assert(w.document.querySelector('.nb-status.error'));assert(w.document.querySelector('#nb-open'));w.close();});
test('opt-in AI mock: explicit data selection, memory-only key, save separated output',async()=>{
 const d=dom(),w=d.window;const a=record(),b={...record('second'),note:'NOT_SELECTED'};
 w.DKNotes.store.save(a);w.DKNotes.store.save(b);w.DKNotes.showList();buttons(w,'AI 思考').click();
 const dialog=w.document.querySelector('dialog'),fields=dialog.querySelectorAll('.nb-config input'),q=dialog.querySelector('.nb-config textarea');
 fields[0].value='https://provider.example/v1/chat/completions';fields[1].value='mock-model';fields[2].value='TEST_ONLY_NOT_REAL';q.value='请比较';q.dispatchEvent(new w.Event('input'));
 let called=0;w.fetch=async(url,opts)=>{called++;assert(opts.headers.Authorization.includes('TEST_ONLY'));assert(!opts.body.includes('NOT_SELECTED'));assert.equal(opts.credentials,'omit');return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'<img src=x> AI 思考'}}]})};};
 const send=buttons(w,'发送并生成');await send.onclick();assert.equal(called,1);assert(dialog.textContent.includes('尚未保存'));assert(!dialog.querySelector('.nb-output img'));
 buttons(w,'保存 AI 思考（独立于我的笔记）').click();const saved=w.DKNotes.store.notes.find(r=>r.id==='test');assert.equal(saved.note,'个人笔记');assert.equal(saved.ai.length,1);
 assert(!JSON.stringify(w.DKNotes.backup()).includes('TEST_ONLY'));for(let i=0;i<w.localStorage.length;i++)assert(!w.localStorage.getItem(w.localStorage.key(i)).includes('TEST_ONLY'));w.close();
});
test('AI errors do not claim success; cancellation is available',async()=>{
 const d=dom(),w=d.window;w.DKNotes.store.save(record());w.DKNotes.showList();buttons(w,'AI 思考').click();
 const fields=w.document.querySelectorAll('.nb-config input');fields[0].value='https://provider.example/v1/chat/completions';fields[1].value='mock';fields[2].value='FAKE';w.document.querySelector('.nb-config textarea').value='q';
 w.fetch=async()=>({ok:false,status:429});await buttons(w,'发送并生成').onclick();assert(w.document.querySelector('dialog').textContent.includes('HTTP 429'));assert(buttons(w,'保存 AI 思考（独立于我的笔记）').disabled);
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new w.DOMException('Aborted','AbortError'))));const p=buttons(w,'发送并生成').onclick();buttons(w,'取消生成').click();await p;assert(w.document.querySelector('dialog').textContent.includes('已取消'));w.close();
});
test('selection toolbar -> personal editor -> save/edit/delete are usable end to end',async()=>{
 const d=dom(),w=d.window,doc=w.document;const b=doc.querySelector('#content [data-b]');const range=selectText(w,b,0,7);w.getSelection().addRange(range);doc.dispatchEvent(new w.Event('selectionchange'));await new Promise(r=>setTimeout(r,220));
 assert.equal(doc.querySelector('#hltool').hidden,false);buttons(w,'✎ 记笔记').click();let ta=doc.querySelector('dialog textarea');ta.value='my first note';ta.dispatchEvent(new w.Event('input'));buttons(w,'保存笔记').click();assert.equal(w.DKNotes.store.notes[0].note,'my first note');
 buttons(w,'编辑 / 取消高亮').click();ta=doc.querySelector('dialog textarea');ta.value='edited';buttons(w,'保存笔记').click();assert.equal(w.DKNotes.store.notes[0].note,'edited');
 buttons(w,'编辑 / 取消高亮').click();buttons(w,'删除划线及其笔记').click();assert.equal(w.DKNotes.store.notes.length,0);assert.equal(doc.querySelectorAll('mark.nb-mark').length,0);w.close();
});
test('nested bilingual list excludes English from Chinese anchor offsets',()=>{
 const d=dom(),w=d.window;w.document.body.classList.add('par');const li=w.document.querySelector('#content li[data-b]');assert(li);const en=li.querySelector('.en-p');const range=selectText(w,li,0,5);const parts=w.DKNotes.capture(range);assert.equal(parts.length,1);assert.equal(parts[0].quote,li.firstChild.data.slice(0,5));assert(parts[0].block.startsWith('b:'));
 const er=selectText(w,en,0,5),ep=w.DKNotes.capture(er);assert.equal(ep[0].block,'en:'+li.dataset.b);w.close();
});
test('full-English and bilingual marks restore together; paragraph relocation finds unique quote',()=>{
 const d=dom(),w=d.window,doc=w.document;doc.body.classList.add('par');const en=doc.querySelector('#content .en-p'),parts=w.DKNotes.capture(selectText(w,en,0,12));w.DKNotes.store.save({...record(),segments:Array.from(parts)});w.DKNotes.render();assert(doc.querySelector('#enfull mark.nb-mark'));assert(doc.querySelector('#content .en-p mark.nb-mark'));
 w.DKNotes.store.remove('01','test');const b=doc.querySelector('#content [data-b]'),seg=N.makeSegment('b:nonexistent',b.textContent,0,8);w.DKNotes.store.save({...record(),segments:[seg]});w.DKNotes.render();assert(b.querySelector('mark.nb-mark'));w.close();
});
test('legacy full export allows plain-text preferences but imports notes only',()=>{const legacy={'dk:theme':'dark','dk:fs':'19','dk:last':'"01"','dk:hl:01':JSON.stringify([{id:'old',b:'1',s:0,e:3,text:'abc',c:'y',note:'note',t:1}])};const p=N.parseBackup(JSON.stringify(legacy));assert.equal(p.notes.length,1);assert.deepEqual(p.reader,{});});
test('import merges reader answers without replacing local answers; denied writes return failure',()=>{const s=fakeStorage(),st=new N.Store(s);s.setItem('dk:act:01',JSON.stringify({checks:{a1:true},ans:{a1:'local'}}));assert.equal(st.import({notes:[record()],reader:{'dk:act:01':{checks:{a1:false,a2:true},ans:{a1:'incoming',a2:'new'}}}}),true);const a=JSON.parse(s.getItem('dk:act:01'));assert.equal(a.ans.a1,'local');assert.equal(a.ans.a2,'new');assert.equal(st.import({notes:[record()],reader:{}}),true);assert.equal(st.notes.length,1);});
test('cancel highlight preserves notes and AI, and can restore highlight',()=>{const d=dom(),w=d.window;const b=w.document.querySelector('#content [data-b]'),seg=N.makeSegment('b:'+b.dataset.b,b.textContent,0,5);w.DKNotes.store.save({...record(),segments:[seg]});w.DKNotes.render();w.DKNotes.showList();buttons(w,'取消高亮（保留笔记）').click();assert.equal(w.DKNotes.store.notes[0].note,'个人笔记');assert.equal(w.DKNotes.store.notes[0].highlighted,false);assert.equal(w.document.querySelectorAll('mark.nb-mark').length,0);buttons(w,'恢复高亮').click();assert(w.document.querySelector('mark.nb-mark'));w.close();});
test('AI timeout and empty/non-JSON responses remain unsaved errors',async()=>{
 const d=dom(),w=d.window;w.DKNotes.store.save(record());w.DKNotes.showList();buttons(w,'AI 思考').click();
 const f=w.document.querySelectorAll('.nb-config input');f[0].value='https://provider.example/v1/chat/completions';f[1].value='mock';f[2].value='FAKE';w.document.querySelector('.nb-config textarea').value='q';
 const native=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>native(fn,ms===60000?1:ms,...args);
 w.fetch=(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new w.DOMException('Aborted','AbortError'))));await buttons(w,'发送并生成').onclick();assert(w.document.querySelector('dialog').textContent.includes('请求超时'));
 w.fetch=async()=>({ok:true,text:async()=>'{not-json'});await buttons(w,'发送并生成').onclick();assert(w.document.querySelector('dialog').textContent.includes('不是有效 JSON'));
 w.fetch=async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:''}}]})});await buttons(w,'发送并生成').onclick();assert(buttons(w,'保存 AI 思考（独立于我的笔记）').disabled);assert.equal(w.DKNotes.store.notes[0].ai.length,0);w.close();
});
test('keyboard selection shortcut opens editor; Escape cancel handles unsaved content',async()=>{
 const d=dom(),w=d.window,doc=w.document,b=doc.querySelector('#content [data-b]');w.getSelection().addRange(selectText(w,b,0,5));doc.dispatchEvent(new w.Event('selectionchange'));await new Promise(r=>setTimeout(r,180));doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'n',altKey:true,bubbles:true}));const dialog=doc.querySelector('dialog');assert(dialog.open);const ta=dialog.querySelector('textarea');ta.value='unsaved';ta.dispatchEvent(new w.Event('input'));w.confirm=()=>false;dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert(dialog.open);w.confirm=()=>true;dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(dialog.open,false);assert.equal(w.DKNotes.store.notes.length,0);w.close();
});
