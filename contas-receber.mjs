import {agruparContas,totaisContas,distribuirPagamento} from './contas-receber-core.mjs?v=20261109-baixa';
const money=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brDate=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const TIPO={diaria:'Diária',caucao:'Caução',multa:'Multa',manutencao:'Manutenção',outro:'Outro'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const missing=error=>error?.code==='PGRST202'||/Could not find|schema cache|does not exist/i.test(error?.message||'');
const SETUP_BAIXA='Aplique sql/contas_receber_baixa.sql no Supabase para registrar pagamentos por locatário.';
const nowLocal=()=>new Date(Date.now()-4*3600000).toISOString().slice(0,16);
const SETUP='Aplique sql/caucao_automatica_contas_receber.sql no Supabase para ver Contas a receber com caução e histórico.';

// Contas a receber: tudo o que cada locatário deve, diárias, caução e extras, vencido ou a vencer.
export async function mountContasReceber({db,company,host,admin}){
 host.replaceChildren();
 if(!document.querySelector('#contas-receber-styles')){const st=el('style');st.id='contas-receber-styles';st.textContent='#contas-receber-baixa .contas-baixa-item{display:flex!important;flex-direction:row!important;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line,#e3e5ea)}#contas-receber-baixa .contas-baixa-item input{width:130px;flex:none}#contas-receber-baixa .contas-baixa-item span{flex:1}#contas-receber-baixa details{margin:10px 0}#contas-receber-baixa summary{cursor:pointer;font-weight:600}';document.head.append(st);}
 const panel=el('section',null,'panel'),top=el('div',null,'panel-top'),heading=el('div');heading.append(el('h2','Em aberto por locatário'),el('p','Diárias geradas até hoje e parcelas de caução e extras de qualquer vencimento. Clique no nome para ver o histórico.'));
 const refresh=el('button','Atualizar','btn btn-quiet');refresh.type='button';const topActions=el('div',null,'table-actions');if(admin){const lev=el('a','Levantamento dos locatários','btn btn-quiet');lev.href='financeiro.html?secao=levantamento';topActions.append(lev);}topActions.append(refresh);top.append(heading,topActions);
 const filters=el('div',null,'document-filters'),search=el('input'),filter=el('select');search.type='search';search.placeholder='Buscar locatário ou placa';search.setAttribute('aria-label','Buscar locatário ou placa');
 for(const [v,l] of [['','Todos'],['Vencido','Com valor vencido'],['A vencer','Só a vencer']]){const o=el('option',l);o.value=v;filter.append(o);}filter.setAttribute('aria-label','Situação');filters.append(search,filter);
 const status=el('p',null,'flow-note'),scroll=el('div',null,'table-scroll'),table=el('table'),head=el('thead'),hr=el('tr'),body=el('tbody');
 for(const h of ['Locatário','Diárias vencidas','Caução vencida','Extras vencidos','Total vencido','A vencer','Próximo vencimento',''])hr.append(el('th',h));head.append(hr);table.append(head,body);scroll.append(table);
 panel.append(top,filters,status,scroll);
 const metrics=el("div",null,"metrics dashboard-metrics"),pending=el('section',null,'panel');pending.hidden=true;
 host.append(metrics,panel,pending);
 let groups=[],today='';

 function draw(){
  const q=search.value.toLocaleLowerCase('pt-BR').trim();body.replaceChildren();let shown=0;
  for(const g of groups){if(filter.value&&g.situacao!==filter.value)continue;if(q&&!(g.nome+' '+g.placas.join(' ')).toLocaleLowerCase('pt-BR').includes(q))continue;shown++;
   const tr=el('tr'),name=el('td'),button=el('button',g.nome,'btn btn-quiet entradas-nome');button.type='button';button.onclick=()=>openHistory(g);name.append(button);if(g.placas.length)name.append(el('small',' '+g.placas.join(' · ')));tr.append(name);
   for(const v of [money(g.vencido.diarias),money(g.vencido.caucao),money(g.vencido.extras),money(g.vencidoTotal),money(g.aVencer),brDate(g.proximo)])tr.append(el('td',v));
   const act=el('td',null,'table-actions'),pay=el('button','Receber','btn btn-primary');pay.type='button';pay.onclick=()=>openPayment(g);act.append(pay);
   const rel=el('button','O que falta pagar (PDF)','btn btn-quiet');rel.type='button';rel.onclick=async()=>{rel.disabled=true;try{const {gerarDevedorPdf}=await import('./devedor-pdf.mjs?v=20261128');const bytes=await gerarDevedorPdf({db,company,grupo:g,hoje:today});
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=el('a');a.href=url;a.download='falta-pagar-'+g.nome.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    import('./celebrar.mjs?v=20261128').then(m=>m.celebrar('Relatório gerado!','O que falta pagar · '+g.nome)).catch(()=>{});}catch(e){status.textContent='Não foi possível gerar o relatório: '+e.message;}finally{rel.disabled=false;}};act.append(rel);tr.append(act);body.append(tr);}
  if(!shown){const tr=el('tr'),td=el('td',groups.length?'Nenhum locatário corresponde à busca.':'Nenhum valor em aberto.');td.colSpan=8;tr.append(td);body.append(tr);}
  status.textContent=shown+' de '+groups.length+' locatário(s) com valores em aberto';
 }
 function drawMetrics(){const t=totaisContas(groups);metrics.replaceChildren();for(const [l,v] of [['Vencido até hoje',money(t.vencido)],['Caução vencida',money(t.caucao)],['A vencer',money(t.aVencer)],['Locatários',String(groups.length)]]){const m=el('div',null,'metric');m.append(el('span',l),el('strong',v));metrics.append(m);}}

 async function drawPending(){
  const {data,error}=await db.rpc('caucao_pendentes',{p_empresa:company.id});pending.replaceChildren();
  if(error||!data?.length){pending.hidden=true;return;}pending.hidden=false;
  const top=el('div',null,'panel-top'),h=el('div');h.append(el('h2','Caução sem parcelas'),el('p','Locações ativas com saldo de caução que ainda não viraram parcelas. Confira antes: se a caução já foi cobrada de outra forma, não parcele.'));top.append(h);pending.append(top);
  const list=el('div',null,'table-scroll'),t=el('table'),tb=el('tbody'),th=el('tr');for(const x of ['Locatário','Veículo','Saldo','Parcela','Primeira parcela',''])th.append(el('th',x));const thead=el('thead');thead.append(th);t.append(thead,tb);list.append(t);pending.append(list);
  for(const p of data){const tr=el('tr');tr.append(el('td',p.nome),el('td',p.placa||'—'),el('td',brl(p.saldo)),el('td',Number(p.valor_parcela_caucao)>0?brl(p.valor_parcela_caucao)+' por dia':(p.numero_parcelas_caucao||100)+' parcelas'));
   const when=el('td'),date=el('input');date.type='date';date.value=p.primeira_sugerida||'';date.setAttribute('aria-label','Primeira parcela de '+p.nome);when.append(date);tr.append(when);
   const act=el('td',null,'table-actions');
   if(p.caucao_manual)act.append(el('small','Já tem caução parcelada em Débitos extras'));
   else if(admin){const b=el('button','Parcelar caução');b.type='button';b.onclick=async()=>{if(!date.value)return alert('Informe a data da primeira parcela.');if(!confirm('Criar as parcelas diárias da caução de '+p.nome+' a partir de '+brDate(date.value)+'?'))return;b.disabled=true;const r=await db.rpc('locacao_caucao_parcelar',{p_empresa:company.id,p_locacao:p.locacao_id,p_primeiro:date.value});if(r.error){alert(r.error.message);b.disabled=false;return;}window.bgClearListCache?.();await load();};act.append(b);}
   else act.append(el('small','O administrador parcela'));
   tr.append(act);tb.append(tr);}
 }

 async function load(){
  refresh.disabled=true;status.textContent='Carregando…';
  try{const {data,error}=await db.rpc('contas_receber_painel',{p_empresa:company.id});
   if(error)throw error;today=data.hoje;groups=agruparContas({diarias:data.diarias||[],parcelas:data.parcelas||[],hoje:data.hoje});drawMetrics();draw();await drawPending();}
  catch(error){groups=[];body.replaceChildren();metrics.replaceChildren();status.textContent=missing(error)?SETUP:'Não foi possível carregar: '+error.message;}
  finally{refresh.disabled=false;}
 }

 const dialog=el('dialog',null,'client-dialog');dialog.id='contas-historico';document.body.append(dialog);
 async function openHistory(g){
  dialog.replaceChildren();const header=el('div',null,'dialog-header'),close=el('button','Fechar','btn btn-quiet'),bodyBox=el('div',null,'dialog-body');close.type='button';close.onclick=()=>dialog.close();header.append(el('h2',g.nome),close);dialog.append(header,bodyBox);
  bodyBox.append(el('p','Carregando histórico…'));dialog.showModal();
  if(!g.id){bodyBox.replaceChildren(el('p','Esta ocupação não tem locatário vinculado. Vincule o locatário na Frota para ver o histórico.'));return;}
  const {data,error}=await db.rpc('locatario_extrato',{p_empresa:company.id,p_cliente:g.id});bodyBox.replaceChildren();
  if(error)return bodyBox.append(el('p',missing(error)?SETUP:error.message));
  const section=(title,cols,rows,cells)=>{bodyBox.append(el('h3',title));const wrap=el('div',null,'table-scroll'),t=el('table'),th=el('thead'),tr=el('tr'),tb=el('tbody');for(const c of cols)tr.append(el('th',c));th.append(tr);t.append(th,tb);wrap.append(t);bodyBox.append(wrap);
   if(!rows.length){const r=el('tr'),td=el('td','Nada registrado.');td.colSpan=cols.length;r.append(td);tb.append(r);}for(const x of rows){const r=el('tr');for(const v of cells(x))r.append(el('td',v));tb.append(r);}};
  const abertos=(data.cobrancas||[]).filter(x=>Number(x.valor)>Number(x.recebido));
  bodyBox.append(el('p','Em aberto: '+brl(abertos.reduce((s,x)=>s+Number(x.valor)-Number(x.recebido),0))+' · Pago no total: '+brl((data.pagamentos||[]).reduce((s,x)=>s+Number(x.valor),0))));
  section('Cobranças',['Vencimento','Tipo','Descrição','Valor','Pago','Saldo'],data.cobrancas||[],x=>[brDate(x.vencimento),TIPO[x.tipo]||x.tipo,x.descricao||'',brl(x.valor),brl(x.recebido),brl(Math.max(0,Number(x.valor)-Number(x.recebido)))]);
  section('Pagamentos',['Recebido em','Tipo','Referente a','Valor'],data.pagamentos||[],x=>[x.recebido_em?new Date(x.recebido_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Manaus'}):'—',TIPO[x.tipo]||x.tipo,(x.descricao||'')+(x.referencia?' · '+brDate(x.referencia):''),brl(x.valor)]);
 }

 // Baixa por locatário: o valor recebido quita do mais antigo para o mais novo, e dá para ajustar item por item.
 const payDialog=el('dialog',null,'client-dialog');payDialog.id='contas-receber-baixa';document.body.append(payDialog);
 let paying=false;
 function openPayment(g){
  payDialog.replaceChildren();
  const form=el('form',null,'client-form'),header=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');
  header.append(el('h2','Registrar pagamento · '+g.nome));
  const grid=el('div',null,'form-grid'),field=(label,type)=>{const w=el('label'),i=el('input');i.type=type;w.append(el('span',label),i);grid.append(w);return i;};
  const total=field('Valor recebido (R$)','number'),when=field('Recebido em · horário de Manaus','datetime-local'),note=field('Observação / comprovante','text');
  total.min='0.01';total.step='0.01';total.required=true;when.required=true;when.value=nowLocal();when.max=nowLocal();note.maxLength=1000;
  const help=el('p',admin?'O valor é distribuído da diária mais antiga para a mais nova, junto com a caução e os extras do mesmo dia. Ajuste item por item se precisar. Para lançar pagamentos antigos, informe a data e hora reais em que o dinheiro entrou.':'O valor é distribuído da diária mais antiga para a mais nova. Pagamentos de datas anteriores só o administrador registra.','section-note');
  const listVencido=el('div'),future=el('details'),listFuture=el('div'),summary=el('p',null,'section-note'),error=el('p',null,'finance-entry-error');error.setAttribute('role','alert');summary.setAttribute('aria-live','polite');
  const vencidos=g.itens.filter(i=>i.vencimento<=today),futuros=g.itens.filter(i=>i.vencimento>today);
  future.append(el('summary','Antecipar itens a vencer ('+futuros.length+')'),listFuture);future.hidden=!futuros.length;
  const cents=v=>Math.round((Number(v)||0)*100);
  const rows=[...vencidos,...futuros].map(i=>{const line=el('label',null,'contas-baixa-item'),input=el('input');input.type='number';input.min='0';input.step='0.01';input.max=(i.saldo/100).toFixed(2);input.value='0.00';input.setAttribute('aria-label','Pagar '+(TIPO[i.tipo]||i.tipo)+' de '+brDate(i.vencimento));
   const tipo=TIPO[i.tipo]||i.tipo;line.append(el('span',brDate(i.vencimento)+' · '+(i.descricao.startsWith(tipo)?'':tipo+' · ')+i.descricao+' · saldo '+money(i.saldo)),input);(i.vencimento<=today?listVencido:listFuture).append(line);input.oninput=()=>refresh();return {i,input};});
  if(!vencidos.length)listVencido.append(el('p','Nada vencido até hoje.','section-note'));
  function refresh(){error.textContent='';const dist=rows.reduce((s,r)=>s+cents(r.input.value),0),rest=cents(total.value)-dist;summary.textContent='Recebido: '+money(cents(total.value))+' · Distribuído: '+money(dist)+(rest?(rest>0?' · Falta distribuir: ':' · Distribuído a mais: ')+money(Math.abs(rest)):' · Conferido');if(rows.some(r=>r.i.vencimento>today&&cents(r.input.value)>0))future.open=true;}
  function distribute(){const v=distribuirPagamento(rows.map(r=>r.i),cents(total.value));rows.forEach((r,k)=>r.input.value=(v[k]/100).toFixed(2));refresh();}
  total.oninput=distribute;
  const fill=el('button','Distribuir do mais antigo','btn btn-quiet');fill.type='button';fill.onclick=distribute;
  box.append(grid,help,el('h3','Vencido até hoje'),listVencido,future,fill,summary,error);
  const cancel=el('button','Cancelar','btn btn-quiet'),save=el('button','Registrar pagamento','btn btn-primary');cancel.type='button';save.type='submit';cancel.onclick=()=>{if(!paying)payDialog.close();};foot.append(cancel,save);
  form.append(header,box,foot);payDialog.append(form);
  const operation=crypto.randomUUID();let sent=null;
  form.onsubmit=async event=>{event.preventDefault();if(paying||!form.reportValidity())return;error.textContent='';
   if(rows.some(r=>cents(r.input.value)>r.i.saldo)){error.textContent='Um dos itens recebeu mais que o saldo dele.';return;}
   const itens=rows.filter(r=>cents(r.input.value)>0).map(r=>{const v=cents(r.input.value)/100;return r.i.tipo==='diaria'?{tipo:'diaria',grupo_id:r.i.grupo_id,dia:r.i.vencimento,valor:v}:{tipo:'parcela',parcela_id:r.i.parcela_id,valor:v};});
   const soma=itens.reduce((s,x)=>s+cents(x.valor),0);
   if(!itens.length||soma!==cents(total.value)){error.textContent='Distribua o valor recebido inteiro entre os itens. Nenhum valor pode ficar sem destino.';return;}
   const payload={p_empresa:company.id,p_cliente:g.id,p_operacao:operation,p_total:soma/100,p_recebido_em:new Date(when.value+':00-04:00').toISOString(),p_itens:itens,p_observacao:note.value.trim()||null};
   const key=JSON.stringify(payload);if(sent&&sent!==key){error.textContent='Este pagamento já foi enviado. Feche, atualize a lista e confira o histórico antes de registrar de novo.';return;}
   sent=key;paying=true;save.disabled=cancel.disabled=true;
   try{const r=await db.rpc('locatario_receber',payload);if(r.error){if(r.error.code&&r.error.code!=='FETCH_ERROR')sent=null;throw Error(missing(r.error)?SETUP_BAIXA:r.error.message);}
    payDialog.close();window.bgClearListCache?.();await load();status.textContent='Pagamento de '+money(soma)+' registrado para '+g.nome+'. '+status.textContent;}
   catch(e){error.textContent=e.message;}finally{paying=false;save.disabled=cancel.disabled=false;}};
  payDialog.showModal();total.value=((g.vencidoTotal||g.itens[0]?.saldo||0)/100).toFixed(2);distribute();total.focus();total.select();
 }

 search.oninput=draw;filter.onchange=draw;refresh.onclick=load;window.addEventListener('bg-page-resume',load);
 await load();
}
