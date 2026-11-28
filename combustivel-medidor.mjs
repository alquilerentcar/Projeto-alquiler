// Medidor de combustível igual ao painel do carro (ex.: VW Tera): 8 tracinhos de 0 a 1, toque para marcar.
// Guarda o valor como texto (Reserva, 1/8 … 7/8, Cheio) no input escondido que o formulário já usa.
export const NIVEIS=['Reserva','1/8','1/4','3/8','1/2','5/8','3/4','7/8','Cheio'];
const ANTIGOS={'vazio':0,'reserva':0,'0':0,'1/4':2,'1/2':4,'3/4':6,'cheio':8,'1':8};
export function nivelDoTexto(t){const s=String(t??'').trim().toLowerCase();if(!s)return null;const i=NIVEIS.findIndex(n=>n.toLowerCase()===s);return i>=0?i:(s in ANTIGOS?ANTIGOS[s]:null);}
// Nome de cada tracinho, nas identificações de sempre: Reserva, 1/4, 1/2, 3/4, Cheio.
export const STATUS=['Reserva (vazio)','Reserva (1/8)','1/4','Entre 1/4 e 1/2 (3/8)','1/2','Entre 1/2 e 3/4 (5/8)','3/4','Quase cheio (7/8)','Cheio'];
export function textoCombustivel(nivel,autonomia){const n=nivel==null?'':STATUS[nivel]||'',a=Number(autonomia)>0?`autonomia ${Number(autonomia).toLocaleString('pt-BR')} km`:'';return [n,a].filter(Boolean).join(' · ');}

const CSS=`.fuel-field{display:flex;flex-direction:column;gap:8px;grid-column:1/-1}
.fuel-gauge{display:flex;flex-direction:column;gap:6px;user-select:none}
.fuel-gauge .fuel-bars{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:12px 10px 8px;border-radius:12px;background:#0f1115}
.fuel-gauge .fuel-bar{height:30px;border:0;border-radius:4px;padding:0;background:#2b2f36;cursor:pointer;transition:background .18s ease,transform .12s ease,box-shadow .18s ease}
.fuel-gauge .fuel-bar::after{content:'';display:block;height:6px;margin:12px 6px;border-radius:3px;background:#4a505a;transition:background .18s ease}
.fuel-gauge .fuel-bar.on::after{background:#fff;box-shadow:0 0 3px rgba(255,255,255,.7)}
.fuel-gauge .fuel-bar.on.low::after{background:#ff5a4f;box-shadow:0 0 3px rgba(255,90,79,.7)}
.fuel-gauge .fuel-bar:hover{transform:translateY(-1px)}.fuel-gauge .fuel-bar:focus-visible{outline:2px solid #6ea8ff;outline-offset:2px}
.fuel-gauge .fuel-scale{position:relative;height:18px;margin:0 10px;font-size:.78rem;color:#6b7280;font-weight:600}
.fuel-gauge .fuel-scale span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;transition:color .18s ease}
.fuel-gauge .fuel-scale span:first-child{transform:none}.fuel-gauge .fuel-scale span:last-child{transform:translateX(-100%)}
.fuel-gauge .fuel-scale span.on{color:#111827}
.fuel-gauge .fuel-foot strong{display:inline-block}.fuel-gauge .fuel-foot strong.pop{animation:fuel-pop .28s ease}
@keyframes fuel-pop{0%{transform:scale(.92);opacity:.4}100%{transform:scale(1);opacity:1}}
.fuel-gauge .fuel-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.9rem}
.fuel-gauge .fuel-zero{border:1px solid #d0d5dd;background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:.82rem}
.fuel-gauge .fuel-zero.on{border-color:#ff5a4f;color:#c0362c;background:#fff3f2}
@media (prefers-reduced-motion:reduce){.fuel-gauge *{transition:none!important;animation:none!important}}`;

// Liga o medidor a um input (hidden) existente. Retorna {definir(valor)}.
export function montarMedidor(host,input){
 if(!document.getElementById('fuel-gauge-css')){const st=document.createElement('style');st.id='fuel-gauge-css';st.textContent=CSS;document.head.append(st);}
 const box=document.createElement('div');box.className='fuel-gauge';box.setAttribute('role','group');box.setAttribute('aria-label','Nível de combustível');
 const bars=document.createElement('div');bars.className='fuel-bars';const scale=document.createElement('div');scale.className='fuel-scale';
 const marcas=[[0,'Reserva'],[2,'1/4'],[4,'1/2'],[6,'3/4'],[8,'Cheio']].map(([n,t])=>{const sp=Object.assign(document.createElement('span'),{textContent:t});sp.style.left=(n/8*100)+'%';sp.dataset.nivel=n;scale.append(sp);return sp;});
 const foot=document.createElement('div');foot.className='fuel-foot';const leitura=document.createElement('strong');const zero=document.createElement('button');zero.type='button';zero.className='fuel-zero';zero.textContent='Reserva (vazio)';foot.append(leitura,zero);
 const botoes=[];for(let i=1;i<=8;i++){const b=document.createElement('button');b.type='button';b.className='fuel-bar';b.setAttribute('aria-label',NIVEIS[i]);b.title=STATUS[i];b.onclick=()=>escolher(i);botoes.push(b);bars.append(b);}
 zero.onclick=()=>escolher(0);box.append(bars,scale,foot);host.replaceChildren(box);
 // Escrita no input pelo código (carregar a vistoria) atualiza o desenho.
 const proto=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 Object.defineProperty(input,'value',{configurable:true,get(){return proto.get.call(input);},set(v){proto.set.call(input,v);desenhar();}});
 function desenhar(){const n=nivelDoTexto(proto.get.call(input));botoes.forEach((b,k)=>{b.classList.toggle('on',n!=null&&k<n);b.classList.toggle('low',n!=null&&n<=1);b.setAttribute('aria-pressed',String(n!=null&&k<n));});zero.classList.toggle('on',n===0);
  const marca=n==null?null:marcas.reduce((m,sp)=>Math.abs(sp.dataset.nivel-n)<Math.abs(m.dataset.nivel-n)?sp:m);marcas.forEach(sp=>sp.classList.toggle('on',sp===marca));
  const novo=n==null?'Toque nos tracinhos como está no painel':STATUS[n];if(leitura.textContent!==novo){leitura.textContent=novo;leitura.classList.remove('pop');void leitura.offsetWidth;leitura.classList.add('pop');}}
 function escolher(i){proto.set.call(input,NIVEIS[i]);desenhar();input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
 desenhar();return {definir:v=>{input.value=v;}};
}
