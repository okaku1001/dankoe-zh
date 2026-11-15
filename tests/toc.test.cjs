const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
function dom(file='a/01.html',initial={}) {
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const d=new JSDOM(html,{url:'https://local.test/dankoe-zh/'+file,runScripts:'outside-only',pretendToBeVisual:true});
  const w=d.window;
  const css=w.document.createElement('style');
  css.textContent=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');
  w.document.head.append(css);
  w.matchMedia=q=>({matches:String(q).includes('reduce')});
  w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.ResizeObserver=class{observe(){}disconnect(){}};
  for(const [k,v] of Object.entries(initial))w.localStorage.setItem(k,v);
  for(const file of ['meta.js','notes-core.js','notes-ui.js','app.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  return d;
}
const buttons=(w,label)=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===label);

test('article keeps existing TOC and adds a mobile outline control',()=>{
  const d=dom('a/n03.html'),w=d.window,doc=w.document;
  const toc=doc.querySelector('#article-toc')||doc.querySelector('.toc');
  assert(toc);
  const hrefs=[...toc.querySelectorAll('a')].map(a=>a.getAttribute('href'));
  assert.deepEqual(hrefs,['#s1','#s2','#s3','#s4','#s5','#actions']);
  assert(doc.querySelector('.toc-bar'));
  assert.equal(doc.querySelector('#toc-open').getAttribute('aria-expanded'),'false');
  assert.equal(doc.body.classList.contains('toc-open'),false);
  doc.querySelector('#toc-open').click();
  assert(doc.body.classList.contains('toc-open'));
  assert.equal(doc.querySelector('#toc-open').getAttribute('aria-expanded'),'true');
  toc.querySelector('a[href="#s3"]').click();
  assert.equal(doc.body.classList.contains('toc-open'),false);
  w.close();
});

test('outline lists the same headings as the article and does not rewrite the body',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','a/n12.html'),'utf8');
  const before=html.split('<article id="content">')[1].split('</article>')[0];
  const d=dom('a/n12.html'),w=d.window,doc=w.document;
  const after=doc.querySelector('#content').innerHTML;
  // jsdom may normalize, compare text of locked Chinese headings
  const ids=[...doc.querySelectorAll('#content h2[id],#content h3[id]')].map(h=>h.id);
  const hrefs=[...doc.querySelectorAll('.toc a')].map(a=>a.getAttribute('href').slice(1)).filter(id=>id!=='actions');
  assert.deepEqual(hrefs,ids);
  assert(doc.querySelector('#content').textContent.includes('第一部分：浪费 token，节省时间'));
  assert.equal(doc.querySelector('#content').textContent.includes(doc.querySelector('h2#s1').textContent),true);
  w.close();
});

test('saved reading position appears in the outline and jumps back',()=>{
  const d=dom('a/01.html',{'dk:read:01':JSON.stringify({done:false,pos:800,t:1})});
  const w=d.window,btn=w.document.querySelector('.toc-resume');
  assert(btn);assert.equal(btn.hidden,false);
  assert.match(btn.textContent,/回到上次/);
  w.document.querySelector('#toc-open').click();
  assert(w.document.body.classList.contains('toc-open'));
  let y=null;w.scrollTo=(...args)=>{y=typeof args[0]==='object'?args[0].top:args[1]};
  btn.click();
  assert.equal(w.document.body.classList.contains('toc-open'),false);
  assert.equal(y,800);
  w.close();
});

test('Escape and close button dismiss the outline',()=>{
  const d=dom(),w=d.window,doc=w.document;
  doc.querySelector('#toc-open').click();
  assert(doc.body.classList.contains('toc-open'));
  doc.querySelector('.toc-close').click();
  assert.equal(doc.body.classList.contains('toc-open'),false);
  doc.querySelector('#toc-open').click();
  doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(doc.body.classList.contains('toc-open'),false);
  w.close();
});
