/* =====================================================================
   FINORA LANDING — JS isolado (sem dependências)
   • Monta sozinho quando existe #finora-landing na página.
   • Em sistema com rotas por # (SPA): chame FinoraLanding.mount() quando a
     página inicial for exibida e FinoraLanding.unmount() ao sair dela.
   • A abertura animada aparece uma vez por sessão do navegador.
   ===================================================================== */
(function(){
'use strict';
let limpa=[],obs=[],montado=null;
function jaViu(){try{return sessionStorage.getItem('fnl-abertura')==='1'}catch(e){return false}}
function marcaVisto(){try{sessionStorage.setItem('fnl-abertura','1')}catch(e){}}
const IO=window.IntersectionObserver;
function mount(root){
root=root||document.getElementById('finora-landing');
if(!root||root===montado||root.dataset.montado)return;
unmount();montado=root;root.dataset.montado='1';
const IntersectionObserver=function(cb,o){const x=new IO(cb,o);obs.push(x);return x};

const reduz=matchMedia('(prefers-reduced-motion:reduce)').matches;
const $=(q,c=root)=>c.querySelector(q), $$=(q,c=root)=>[...c.querySelectorAll(q)];

/* divide títulos em palavras mascaradas */
$$('.split').forEach(h=>{let i=0;const base=h.hasAttribute('data-auto')?250:0;
  const walk=node=>[...node.childNodes].forEach(n=>{
    if(n.nodeType===3&&n.textContent.trim()){const f=document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(p=>{if(!p)return;if(/^\s+$/.test(p)){f.append(' ');return}
        const w=document.createElement('span');w.className='w';const s=document.createElement('span');
        s.textContent=p;s.style.transitionDelay=(base+(i++)*90)+'ms';w.append(s);f.append(w)});n.replaceWith(f)}
    else if(n.nodeType===1&&n.tagName!=='BR')walk(n)});walk(h)});

/* revelação por scroll */
const ro=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;const el=e.target;
  setTimeout(()=>{el.classList.add('on');el.dispatchEvent(new Event('revelado'))},+(el.dataset.d||0));ro.unobserve(el)}),{threshold:.15,rootMargin:'0px 0px -5% 0px'});
const alvos=()=>$$('[data-r],.split,.lanc,.resposta,.lanc .valor,.saldo .valor');

/* brasas */
const br=$('.brasas');
if(!reduz)for(let i=0;i<26;i++){const e=document.createElement('i'),z=1+Math.random()*2;
  Object.assign(e.style,{left:Math.random()*100+'%',width:z+'px',height:z+'px',animationDuration:(7+Math.random()*9)+'s',animationDelay:(-Math.random()*14)+'s'});
  e.style.setProperty('--dx',(Math.random()*120-60)+'px');br.append(e)}

/* luz segue o cursor (com rAF) */
const hero=$('.hero');let raf;
hero.addEventListener('pointermove',ev=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const r=hero.getBoundingClientRect();
  hero.style.setProperty('--mx',(ev.clientX-r.left)+'px');hero.style.setProperty('--my',(ev.clientY-r.top)+'px')})});

/* linhas do extrato em cascata */
$$('.lanc').forEach((l,i)=>l.dataset.d=i*110);

/* contagem dos valores */
const fmt=v=>(v<0?'− ':'+ ')+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
$$('.valor[data-v]').forEach(el=>{el.dataset.d=el.closest('.lanc')?.dataset.d||0;
  el.addEventListener('revelado',()=>{if(reduz)return;const alvo=+el.dataset.v,t0=performance.now();
    (function f(t){const p=Math.min((t-t0)/1200,1),k=1-Math.pow(1-p,3);el.textContent=fmt(alvo*k);if(p<1)requestAnimationFrame(f)})(t0)})});

/* consultor digitando */
const resp=$('.resposta'),txt=resp.dataset.texto;
if(reduz){resp.textContent=txt}else{
  resp.addEventListener('revelado',()=>{let i=0;const cur='<span class="cur" aria-hidden="true"></span>';
    (function d(){i+=2;resp.innerHTML=txt.slice(0,i)+cur;if(i<txt.length)setTimeout(d,22);else setTimeout(()=>resp.textContent=txt,1600)})()});
  resp.dataset.d=500}

/* índice: seção atual */
const idx=$('.indice'),atual=$('.atual',idx),links=$$('a',idx);
const so=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;
  atual.textContent='/ '+e.target.dataset.nome;links.forEach(a=>a.setAttribute('aria-current',a.dataset.alvo===e.target.id))}),{rootMargin:'-45% 0px -50% 0px'});
$$('section[id]').forEach(s=>so.observe(s));
const vai=id=>{const al=root.querySelector('#'+id);al&&al.scrollIntoView({behavior:reduz?'auto':'smooth'})};
$$('[data-alvo]').forEach(a=>a.addEventListener('click',ev=>{ev.preventDefault();idx.open=false;vai(a.dataset.alvo)}));
$$('[data-entrar]').forEach(a=>a.setAttribute('href',root.dataset.login||'#login'));

/* progresso */
const pg=$('.progresso');
const onScroll=()=>{const h=document.documentElement;pg.style.transform=`scaleX(${h.scrollTop/(h.scrollHeight-h.clientHeight)||0})`};
addEventListener('scroll',onScroll,{passive:true});limpa.push(()=>removeEventListener('scroll',onScroll));

/* formulário */
const form=$('.form'),msg=$('.msg',form),inp=$('#fnl-email');
const erro=t=>{msg.className='msg erro';msg.textContent=t;inp.setAttribute('aria-invalid','true')};
const limpaErro=()=>{msg.textContent='';msg.className='msg';inp.removeAttribute('aria-invalid')};
form.addEventListener('submit',ev=>{ev.preventDefault();const v=inp.value.trim();
  if(!v){erro('Digite seu e-mail para receber o convite.');inp.focus();return}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){erro('Esse e-mail parece incompleto. Confira o que vem depois do @.');inp.focus();return}
  const api=root.dataset.api,btn=$('button',form);
  const ok=()=>{limpaErro();msg.className='msg ok';msg.textContent='Pedido recebido. O convite chega em '+v+'.';form.reset()};
  if(!api){ok();return}
  btn.disabled=true;msg.className='msg';msg.textContent='Enviando…';inp.removeAttribute('aria-invalid');
  fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:v})})
    .then(r=>r.json().catch(()=>({ok:r.ok})).then(d=>{
      if(r.ok&&d.ok!==false)ok();
      else erro(d.erro||'Não foi possível enviar agora. Tente de novo em instantes.')}))
    .catch(()=>erro('Sem conexão com o servidor. Confira sua internet e tente de novo.'))
    .finally(()=>{btn.disabled=false})});
inp.addEventListener('input',()=>{if(msg.classList.contains('erro'))limpaErro()});

/* abertura */
const pre=$('.pre');
function inicia(){alvos().forEach(el=>ro.observe(el))}
if(!pre||reduz||jaViu()){pre&&pre.remove();inicia();return}
marcaVisto();
document.documentElement.style.overflow='hidden';limpa.push(()=>{document.documentElement.style.overflow=''});
const n=$('.n',pre),b=$('.pre-linha b',pre),t=$('.t',pre),T=1500,t0=performance.now();
const fases=['Conciliando lançamentos','Lendo o extrato','Escrevendo notas'];
(function f(now){const p=Math.min((now-t0)/T,1),k=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
  n.textContent=String(Math.round(k*100)).padStart(3,'0');b.style.transform=`scaleX(${k})`;t.textContent=fases[Math.min(2,Math.floor(p*3))];
  if(p<1)requestAnimationFrame(f);else setTimeout(()=>{pre.classList.add('sai');inicia();
    setTimeout(()=>{pre.remove();document.documentElement.style.overflow=''},1100)},250)})(t0);

}
function unmount(){
obs.forEach(o=>o.disconnect());obs=[];limpa.forEach(f=>f());limpa=[];
if(montado)delete montado.dataset.montado;montado=null;
}
window.FinoraLanding={mount,unmount};
function porHash(){const m={'#acesso':'fnl-acesso','#consultor':'fnl-consultor','#contas':'fnl-contas','#extrato':'fnl-extrato'}[location.hash];
  const el=m&&document.getElementById(m);if(el)setTimeout(()=>el.scrollIntoView(),60)}
addEventListener('load',porHash);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount());else mount();
})();
