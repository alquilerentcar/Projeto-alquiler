// Animação curta de comemoração: um carrinho chega, a chave balança e aparece a mensagem.
// Não bloqueia a tela (cliques passam por baixo) e some sozinha. Quem desativa animações vê só a mensagem.
const CSS=`.celebra{position:fixed;inset:0;z-index:99999;pointer-events:none;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.18);animation:celebra-fundo 2.2s ease forwards}
.celebra-card{position:relative;width:min(360px,calc(100vw - 32px));padding:22px 20px 18px;border-radius:20px;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.28);text-align:center;overflow:hidden;animation:celebra-card 2.2s cubic-bezier(.2,.9,.25,1.2) forwards}
.celebra-pista{position:relative;height:74px;margin:0 -20px 8px;overflow:hidden}
.celebra-pista::after{content:'';position:absolute;left:0;right:0;bottom:6px;height:3px;background:repeating-linear-gradient(90deg,#cbd5e1 0 18px,transparent 18px 32px);animation:celebra-faixa .9s linear 2}
.celebra-carro{position:absolute;bottom:9px;left:50%;width:118px;margin-left:-59px;animation:celebra-chega 1.05s cubic-bezier(.15,.85,.3,1) both}
.celebra-carro .roda{transform-box:fill-box;transform-origin:center;animation:celebra-roda .35s linear 3}
.celebra-chave{position:absolute;top:2px;left:50%;margin-left:44px;width:34px;transform-origin:20% 15%;animation:celebra-chave 1s ease .95s both}
.celebra-card strong{display:block;font-size:1.15rem;color:#0f172a;animation:celebra-texto .5s ease .75s both}
.celebra-card span{display:block;margin-top:4px;font-size:.9rem;color:#64748b;animation:celebra-texto .5s ease .9s both}
@keyframes celebra-fundo{0%{opacity:0}12%{opacity:1}82%{opacity:1}100%{opacity:0}}
@keyframes celebra-card{0%{transform:translateY(16px) scale(.92);opacity:0}14%{transform:none;opacity:1}84%{transform:none;opacity:1}100%{transform:translateY(-10px) scale(.97);opacity:0}}
@keyframes celebra-chega{0%{transform:translateX(-260px)}78%{transform:translateX(8px)}100%{transform:translateX(0)}}
@keyframes celebra-roda{to{transform:rotate(360deg)}}
@keyframes celebra-faixa{to{background-position:-64px 0}}
@keyframes celebra-chave{0%{opacity:0;transform:translateY(-14px) rotate(-30deg)}40%{opacity:1;transform:translateY(0) rotate(18deg)}65%{transform:rotate(-10deg)}85%{transform:rotate(6deg)}100%{opacity:1;transform:rotate(0)}}
@keyframes celebra-texto{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.celebra,.celebra *{animation:none!important}.celebra{animation:celebra-fundo 1.6s linear forwards!important}}`;

const CARRO=`<svg class="celebra-carro" viewBox="0 0 120 52" aria-hidden="true"><path d="M8 36c0-6 3-9 9-10l14-3 13-11c3-2 6-3 10-3h24c4 0 7 1 10 4l11 10 9 2c6 1 9 4 9 9v4c0 2-2 4-4 4H12c-2 0-4-2-4-4z" fill="#1d3fa8"/><path d="M48 14c2-2 4-2 7-2h10v12H38zM70 12h9c3 0 5 1 7 3l8 9H70z" fill="#cfe0ff"/><rect x="104" y="30" width="8" height="4" rx="2" fill="#ffd166"/><rect x="9" y="31" width="6" height="4" rx="2" fill="#ff6b6b"/><g class="roda"><circle cx="32" cy="42" r="9" fill="#111827"/><circle cx="32" cy="42" r="3.5" fill="#cbd5e1"/><rect x="31" y="34" width="2" height="16" fill="#475569"/></g><g class="roda"><circle cx="92" cy="42" r="9" fill="#111827"/><circle cx="92" cy="42" r="3.5" fill="#cbd5e1"/><rect x="91" y="34" width="2" height="16" fill="#475569"/></g></svg>`;
const CHAVE=`<svg class="celebra-chave" viewBox="0 0 40 40" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#f59e0b" stroke-width="4"/><path d="M15 15l18 18m-6-6 4-4m-1 9 4-4" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/></svg>`;

// celebrar('Locação criada!','O carro já está reservado.') → resolve quando a animação termina.
export function celebrar(titulo,detalhe=''){
 try{
  if(!document.getElementById('celebra-css')){const st=document.createElement('style');st.id='celebra-css';st.textContent=CSS;document.head.append(st);}
  document.querySelector('.celebra')?.remove();
  const o=document.createElement('div');o.className='celebra';o.setAttribute('role','status');o.setAttribute('aria-live','polite');
  const c=document.createElement('div');c.className='celebra-card';const pista=document.createElement('div');pista.className='celebra-pista';pista.innerHTML=CARRO+CHAVE;
  const t=document.createElement('strong');t.textContent=titulo;c.append(pista,t);if(detalhe){const d=document.createElement('span');d.textContent=detalhe;c.append(d);}
  o.append(c);document.body.append(o);
  return new Promise(res=>{const fim=()=>{o.remove();res();};o.addEventListener('animationend',e=>{if(e.target===o)fim();});setTimeout(fim,2600);});
 }catch{return Promise.resolve();}
}
