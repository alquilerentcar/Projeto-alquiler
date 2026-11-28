// Avisos automáticos da operação: devolução amanhã, devolução atrasada e CNH vencendo/vencida.
// A lista é atualizada pelo banco toda vez que alguém abre (e uma vez por dia pela rotina da Vercel).
const NIVEL={urgente:['tom-vermelho','Urgente'],atencao:['tom-laranja','Atenção'],info:['tom-azul','Aviso']};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const CHAVE=e=>'bgsys:avisos:'+e;

export async function listarAvisos(db,empresa){const {data,error}=await db.rpc('avisos_listar',{p_empresa:empresa});if(error)throw error;try{sessionStorage.setItem(CHAVE(empresa),JSON.stringify({em:Date.now(),n:data.length}));}catch{}atualizarContador(data.length);return data;}
export function atualizarContador(n){document.querySelectorAll('.professional-menu a[href="notificacoes.html"] .menu-count').forEach(b=>{b.textContent=n>99?'99+':String(n);b.classList.toggle('tem-avisos',n>0);});}

// Contador do menu: usa o valor guardado por até 5 minutos para não consultar a cada tela.
export async function contarAvisos(db,empresa){try{const c=JSON.parse(sessionStorage.getItem(CHAVE(empresa))||'null');if(c&&Date.now()-c.em<300000){atualizarContador(c.n);return c.n;}}catch{}
 try{return (await listarAvisos(db,empresa)).length;}catch{return null;}}

export async function montarAvisos(db,empresa,host){
 const sec=el('section',null,'panel avisos-painel'),top=el('div',null,'panel-top'),cab=el('div'),atual=el('button','Atualizar','btn btn-quiet'),lista=el('div',null,'avisos-lista'),status=el('p',null,'flow-note');
 atual.type='button';cab.append(el('h2','Avisos automáticos'),el('p','Devoluções de amanhã, devoluções atrasadas e CNH vencendo dos locatários com carro.'));top.append(cab,atual);sec.append(top,status,lista);host.prepend(sec);
 if(!document.getElementById('avisos-css')){const st=el('style');st.id='avisos-css';st.textContent=`.avisos-painel>.flow-note{padding:0 20px;margin:0 0 8px}.avisos-lista{display:grid;gap:10px;padding:0 20px 20px}.aviso{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid var(--ui-border,#e3e5ea);border-left-width:4px;border-radius:14px;background:var(--company-surface,#fff);animation:aviso-entra .25s ease both}.aviso.urgente{border-left-color:#c0362c}.aviso.atencao{border-left-color:#b45309}.aviso.info{border-left-color:#1d4ed8}.aviso strong{display:block;font-size:14px}.aviso p{margin:3px 0 0;font-size:12.5px;color:var(--ui-muted,#64748b)}.aviso .acoes{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.aviso.saindo{animation:aviso-sai .25s ease forwards}.avisos-vazio{padding:22px;text-align:center;color:var(--ui-muted,#64748b)}.menu-count.tem-avisos{background:#c0362c!important;color:#fff!important}@keyframes aviso-entra{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes aviso-sai{to{opacity:0;transform:translateX(12px)}}@media(max-width:700px){.aviso{grid-template-columns:1fr}.aviso .acoes{justify-content:flex-start}}@media (prefers-reduced-motion:reduce){.aviso{animation:none!important}}`;document.head.append(st);}
 async function carregar(){atual.disabled=true;status.textContent='Conferindo…';try{const avisos=await listarAvisos(db,empresa);lista.replaceChildren();
   status.textContent=avisos.length?avisos.length+' aviso(s) em aberto.':'';
   if(!avisos.length){lista.append(el('div','Nenhum aviso em aberto. Tudo em dia por aqui.','avisos-vazio'));return;}
   avisos.forEach((a,i)=>{const [tom,rotulo]=NIVEL[a.nivel]||NIVEL.info,card=el('article',null,'aviso '+a.nivel);card.style.animationDelay=Math.min(i,8)*40+'ms';
    const txt=el('div');txt.append(el('strong',a.titulo),el('p',a.mensagem));const acoes=el('div',null,'acoes');
    if(a.link){const ab=el('a','Abrir','btn btn-quiet');ab.href=a.link;acoes.append(ab);}
    const ok=el('button','Resolvido','btn btn-quiet');ok.type='button';ok.onclick=async()=>{ok.disabled=true;try{const {error}=await db.rpc('avisos_resolver',{p_empresa:empresa,p_aviso:a.id});if(error)throw error;card.classList.add('saindo');setTimeout(()=>carregar(),260);}catch(e){status.textContent=e.message;ok.disabled=false;}};acoes.append(ok);
    card.append(el('span',rotulo,'tom '+tom),txt,acoes);lista.append(card);});}
  catch(e){status.textContent=/avisos_listar|Could not find|schema cache/i.test(e.message||'')?'Aplique sql/avisos_automaticos.sql no Supabase para ativar os avisos.':e.message;}finally{atual.disabled=false;}}
 atual.onclick=carregar;await carregar();return {recarregar:carregar};
}
