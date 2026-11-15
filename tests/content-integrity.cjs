/* Verify locked article originals/translations against the current local base commit. */
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const parse5=require('parse5');
const files=execFileSync('git',['ls-files','*.html'],{encoding:'utf8'}).trim().split('\n');
function locked(html) {
 const root=parse5.parse(html,{sourceCodeLocationInfo:true}),out=[];
 function walk(n){const attrs=Object.fromEntries((n.attrs||[]).map(x=>[x.name,x.value]));
  if(['content','enfull','tl'].includes(attrs.id)||(attrs.class||'').split(' ').includes('cmo')){
   const loc=n.sourceCodeLocation;if(!loc?.endTag)throw Error('Unclosed content container');out.push(html.slice(loc.startOffset,loc.endOffset));return;
  }
  for(const c of n.childNodes||[])walk(c);
 }
 walk(root);return out;
}
let containers=0;
for(const file of files){const before=locked(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8',maxBuffer:20*1024*1024})),after=locked(fs.readFileSync(file,'utf8'));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Locked article/post content changed: '+file);containers+=before.length;}
console.log(`PASS: ${files.length} HTML pages, ${containers} locked containers byte-for-byte unchanged from HEAD.`);
