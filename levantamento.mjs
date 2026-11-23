import {linhaDoSistema,gerarCSV,lerCSV,validarLinha} from './levantamento-core.mjs?v=20261112';
const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brDate=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const hojeManaus=()=>new Date(Date.now()-4*3600000).toISOString().slice(0,10);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const missing=e=>e?.code==='PGRST202'||/Could not find|schema cache|does not exist/i.test(e?.message||'');
const SETUP='Aplique sql/levantamento_saldo_inicial.sql no Supabase para usar o levantamento.';
const CAMPOS=[['atraso','Ainda deve de diárias (R$)'],['caucao_saldo','Saldo da caução (R$)'],['caucao_parcela','Parcela da caução (R$)'],['caucao_inicio','1ª parcela da caução'],['extras','Extras (R$)'],['extras_descricao','Descrição dos extras']];

// Levantamento: data de corte, uma linha por locação, planilha para a equipe e aplicação única.
export async function mountLevantamento({db,company,host,admin}){
 host.replaceChildren();
 if(!document.querySelector('#levantamento-styles')){const st=el('style');st.id='levantamento-styles';st.textContent='#levantamento>section.panel{padding:22px 26px;margin-bottom:16px}#levantamento .flow-note{max-width:none}#levantamento table input{width:120px}#levantamento table input[data-k=extras_descricao]{width:180px}#levantamento tr.lev-feito{opacity:.55}#levantamento .lev-erro{color:#b42318;font-size:.85rem}#levantamento .lev-acoes{display:flex;flex-wrap:wrap;gap:10px;align-items:center}#levantamento .lev-acoes label{display:flex;flex-direction:row;align-items:center;gap:8px}';document.head.append(st);}
 const wrap=el('div');wrap.id='levantamento';host.append(wrap);
 if(!admin){wrap.append(el('p','Somente o administrador faz o levantamento dos locatários.','flow-note'));return;}
 const intro=el('section',null,'panel');intro.append(el('h2','Levantamento dos locatários'),
  el('p','Escolha a data de corte. Todas as diárias antes dela ficam quitadas como "levantamento" (não entra no caixa). O que o locatário ainda deve na data de corte você informa aqui: diárias em atraso, saldo da caução e extras. A partir do corte, todo pagamento é feito pelo botão Receber.'),
  el('p','Linha marcada sem nenhum valor significa: locatário em dia até o corte.','section-note'));
 const acoes=el('div',null,'lev-acoes'),corteLabel=el('label'),corte=el('input');corte.type='date';corte.value=hojeManaus();corte.min='2026-10-10';corteLabel.append(el('span','Data de corte'),corte);
 const carregar=el('button','Carregar lista','btn btn-quiet'),baixar=el('button','Baixar planilha (Excel)','btn btn-quiet'),importarLabel=el('label',null,'btn btn-quiet'),arquivo=el('input'),todas=el('button','Marcar todas','btn btn-quiet');
 for(const b of [carregar,baixar,todas])b.type='button';arquivo.type='file';arquivo.accept='.csv,text/csv';arquivo.hidden=true;importarLabel.append(document.createTextNode('Importar planilha preenchida'),arquivo);
 acoes.append(corteLabel,carregar,baixar,importarLabel,todas);intro.append(acoes);
 const status=el('p',null,'flow-note'),scroll=el('div',null,'table-scroll'),table=el('table'),thead=el('thead'),tbody=el('tbody'),hr=el('tr');
 for(const h of ['Incluir','Locatário','Diária','Em aberto no sistema','Última paga','Caução',...CAMPOS.map(c=>c[1])])hr.append(el('th',h));thead.append(hr);table.append(thead,tbody);scroll.append(table);
 const lista=el('section',null,'panel');lista.append(status,scroll);
 const resumo=el('section',null,'panel'),resumoTexto=el('p'),erro=el('p',null,'finance-entry-error'),aplicar=el('button','Aplicar levantamento','btn btn-primary');aplicar.type='button';erro.setAttribute('role','alert');resumo.append(el('h2','Conferência'),resumoTexto,erro,aplicar);
 wrap.append(intro,lista,resumo);
 let linhas=[],corteCarregado='',operacao=null,enviado=null,ocupado=false;

 function conferir(){
  let inc=0,quitar=0,atraso=0,caucao=0,extras=0,comErro=0;
  for(const r of linhas){const v=validarLinha(r.l,r.sis);r.msg.textContent=r.inc?v.erros.join(' · '):'';if(!r.inc)continue;inc++;if(v.erros.length)comErro++;quitar+=Number(r.sis.abertas_valor)||0;atraso+=v.envio.atraso;caucao+=v.envio.caucao_saldo;extras+=v.envio.extras;}
  resumoTexto.textContent=inc?`${inc} locação(ões) marcada(s). Serão quitadas como levantamento ${brl(quitar)} em diárias antes de ${brDate(corte.value)}. Saldo inicial: ${brl(atraso)} de diárias em atraso, ${brl(caucao)} de caução e ${brl(extras)} de extras.${comErro?` ${comErro} linha(s) com problema.`:''}`:'Marque as locações que já foram conferidas.';
  aplicar.disabled=ocupado||!inc||comErro>0||corte.value!==corteCarregado;erro.textContent=corte.value!==corteCarregado&&linhas.length?'A data de corte mudou: clique em Carregar lista de novo.':'';
 }
 function desenhar(){
  tbody.replaceChildren();
  for(const r of linhas){const tr=el('tr');if(r.sis.levantado_em)tr.className='lev-feito';
   const tdInc=el('td'),inc=el('input');inc.type='checkbox';inc.checked=r.inc;inc.disabled=Boolean(r.sis.levantado_em);inc.setAttribute('aria-label','Incluir '+r.l.placa);inc.onchange=()=>{r.inc=inc.checked;conferir();};r.box=inc;tdInc.append(inc);
   const nome=el('td');nome.append(el('strong',r.l.locatario||'Sem locatário'),el('br'),el('small',r.l.placa+(r.sis.em_andamento?'':' · encerrada')));r.msg=el('div',null,'lev-erro');nome.append(r.msg);
   tr.append(tdInc,nome,el('td',brl(r.sis.diaria)),el('td',(r.sis.abertas_qtd||0)+' · '+brl(r.sis.abertas_valor)),el('td',brDate(r.sis.ultima_paga)),el('td',r.sis.levantado_em?'Levantada em '+brDate(r.sis.levantado_em):r.l.caucao_situacao));
   for(const [k,label] of CAMPOS){const td=el('td'),i=el('input');i.dataset.k=k;i.type=k==='caucao_inicio'?'date':'text';if(k!=='caucao_inicio'&&k!=='extras_descricao')i.inputMode='decimal';
    i.value=k==='caucao_inicio'?(r.l[k]||''):r.l[k];i.setAttribute('aria-label',label+' · '+r.l.placa);
    i.disabled=Boolean(r.sis.levantado_em)||(r.sis.caucao_parcelada&&k.startsWith('caucao'));
    i.oninput=()=>{r.l[k]=i.value;if(!r.inc&&i.value.trim()){r.inc=true;inc.checked=true;}conferir();};td.append(i);tr.append(td);}
   tbody.append(tr);}
  status.textContent=linhas.length?`${linhas.length} locação(ões) em andamento ou com diárias em aberto antes de ${brDate(corteCarregado)}.`:'Nenhuma locação encontrada.';
  conferir();
 }
 async function load(){
  carregar.disabled=true;status.textContent='Carregando…';
  try{const {data,error}=await db.rpc('levantamento_locatarios',{p_empresa:company.id,p_corte:corte.value});if(error)throw error;
   corteCarregado=corte.value;operacao=crypto.randomUUID();enviado=null;
   linhas=(data||[]).map(sis=>({sis,l:linhaDoSistema(sis),inc:false}));desenhar();}
  catch(e){linhas=[];tbody.replaceChildren();status.textContent=missing(e)?SETUP:'Não foi possível carregar: '+e.message;conferir();}
  finally{carregar.disabled=false;}
 }
 baixar.onclick=()=>{if(!linhas.length)return alert('Carregue a lista primeiro.');const blob=new Blob([gerarCSV(linhas.map(r=>r.l))],{type:'text/csv;charset=utf-8'}),a=el('a');a.href=URL.createObjectURL(blob);a.download='levantamento-locatarios-'+corteCarregado+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 arquivo.onchange=async()=>{const f=arquivo.files[0];arquivo.value='';if(!f)return;if(!linhas.length)return alert('Carregue a lista primeiro, com a mesma data de corte da planilha.');
  try{const lidas=lerCSV(await f.text());let usadas=0,fora=0;
   for(const x of lidas){const r=linhas.find(r=>r.l.codigo===x.codigo);if(!r||r.sis.levantado_em){fora++;continue;}
    for(const [k] of CAMPOS)r.l[k]=k==='caucao_inicio'?(x[k]?(x[k].includes('/')?x[k].split('/').reverse().map(p=>p.padStart(2,'0')).join('-'):x[k]):''):x[k];r.l.observacao=x.observacao;
    r.inc=CAMPOS.some(([k])=>String(x[k]||'').trim())||String(x.observacao||'').trim()!=='';usadas++;}
   desenhar();status.textContent+=` Planilha lida: ${usadas} linha(s) aplicada(s) na tela${fora?`, ${fora} ignorada(s) (código desconhecido ou já levantada)`:''}. Confira antes de aplicar.`;}
  catch(e){alert(e.message);}};
 todas.onclick=()=>{for(const r of linhas)if(!r.sis.levantado_em)r.inc=true;desenhar();};
 corte.onchange=conferir;carregar.onclick=load;
 aplicar.onclick=async()=>{
  const marcadas=linhas.filter(r=>r.inc),envio=[];for(const r of marcadas){const v=validarLinha(r.l,r.sis);if(v.erros.length)return conferir();envio.push(v.envio);}
  if(!envio.length)return;
  if(!confirm(resumoTexto.textContent+'\n\nIsso só pode ser feito uma vez por locação. Confirmar o levantamento?'))return;
  const payload={p_empresa:company.id,p_operacao:operacao,p_corte:corteCarregado,p_linhas:envio},chave=JSON.stringify(payload);
  if(enviado&&enviado!==chave){erro.textContent='Este levantamento já foi enviado. Clique em Carregar lista para conferir o resultado antes de enviar de novo.';return;}
  enviado=chave;ocupado=true;aplicar.disabled=true;erro.textContent='';
  try{const {data,error}=await db.rpc('levantamento_aplicar',payload);if(error){if(error.code&&error.code!=='FETCH_ERROR')enviado=null;throw Error(missing(error)?SETUP:error.message);}
   window.bgClearListCache?.();const n=(data||[]).length,q=(data||[]).reduce((s,x)=>s+(Number(x.diarias_quitadas)||0),0);await load();status.textContent=`Levantamento aplicado em ${n} locação(ões): ${q} diária(s) antigas quitadas. Os saldos iniciais já aparecem em Contas a receber. `+status.textContent;}
  catch(e){erro.textContent=e.message;}finally{ocupado=false;conferir();}
 };
 await load();
}
