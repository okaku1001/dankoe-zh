document.getElementById('theme').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;localStorage.theme=t};
const pb=document.getElementById('progress');addEventListener('scroll',()=>{const h=document.documentElement;pb.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+'%';
const hs=[...document.querySelectorAll('#content h2,#content h3')];let cur=null;for(const x of hs){if(x.getBoundingClientRect().top<120)cur=x.id}
document.querySelectorAll('.toc a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+cur))});
const q=document.getElementById('q');if(q)q.oninput=()=>{const v=q.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(c=>c.style.display=c.dataset.q.includes(v)?'':'none')};
