import {rentalNextStep,rentalSteps,withFlowFlags} from './locacao-fluxo.mjs';
import {createOperationDialog} from './locacao-etapa-dialog.mjs';
import {openQuickClose,closedMessage} from './locacao-encerrar.mjs';
import {createClient} from "https://esm.sh/@supabase/supabase-js@2"; import {requireAuth,bindLogout} from "./auth-guard.js";
const db=createClient("https://xtelzwclrzzlsqjecscl.supabase.co","sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3"); await requireAuth(db); bindLogout(db);
const $=s=>document.querySelector(s),id=new URLSearchParams(location.search).get('locacao'),company=window.alquilerContext.company.id,state={row:null,client:null,car:null,inspections:[],events:[]};
const money=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=d=>d?new Date(d).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Manaus'}):'—';
const carName=car=>car?`${car.placa} · ${car.marca||''} ${car.modelo||''}`.trim():'Veículo indisponível';
function toast(text,error=false){const x=$('#toast');x.textContent=text;x.classList.toggle('error',error);x.classList.add('show');setTimeout(()=>x.classList.remove('show'),4000);}
const operationDialog=createOperationDialog({db,date,title:()=>(state.client?.nome_completo||'Cliente indisponível')+' · '+carName(state.car),onDone:async()=>{await load();toast('Etapa confirmada e registrada no histórico.');}});
const quickClose=()=>openQuickClose({db,company,row:state.row,title:(state.client?.nome_completo||'Cliente indisponível')+' · '+carName(state.car),onDone:async result=>{await load();toast(closedMessage(result),Boolean(result.cobrancas_apos_devolucao));}});
const tags={current:'Etapa atual',attention:'Conferir',pending:'',done:'',skipped:'Sem registro'};
function renderSteps(unavailable){
  const list=$('#rental-stepper');list.replaceChildren();
  rentalSteps(state.row,state.inspections,state.events,{unavailable}).forEach((step,index)=>{
    const item=document.createElement('li'),mark=document.createElement('span'),text=document.createElement('div'),title=document.createElement('strong');
    item.dataset.state=step.state;mark.className='step-mark';mark.setAttribute('aria-hidden','true');mark.textContent=step.state==='done'?'✓':step.state==='attention'?'!':String(index+1);
    text.className='step-text';title.textContent=step.title;text.append(title);
    if(step.state==='done'&&step.date){const when=document.createElement('small');when.textContent=date(step.date);text.append(when);}
    if(step.key==='assinatura'&&['current','attention'].includes(step.state)){const hint=document.createElement('small');hint.textContent=step.hint;text.append(hint);}
    if(tags[step.state]){const tag=document.createElement('span');tag.className='step-tag';tag.textContent=tags[step.state];text.append(tag);}
    if(step.state==='current')item.setAttribute('aria-current','step');
    item.append(mark,text);list.append(item);
  });
}
function renderFacts(){
  const r=state.row,facts=$('#rental-facts');facts.replaceChildren();
  for(const [label,value] of [['Situação',r.status],['Locatário',state.client?.nome_completo||'Cliente indisponível'],['Veículo',carName(state.car)],['Início',date(r.data_inicio)],['Fim previsto',date(r.data_fim)],['Diária',money(r.valor_diaria)],['Caução total',money(r.valor_caucao)],['Saldo da caução',money(r.saldo_caucao)]]){
    const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);facts.append(row);
  }
  const key=encodeURIComponent(r.id),links=[['Contrato e vistorias','contrato.html?locacao='+key],['Documentos e pagamentos','registros.html?locacao='+key]];
  if(r.contrato_gerado_em)links.splice(1,0,['Assinatura','assinaturas.html?locacao='+key]);
  const host=$('#rental-links');host.replaceChildren();for(const [label,href] of links){const a=document.createElement('a');a.className='btn btn-quiet';a.textContent=label;a.href=href;host.append(a);}
  if(r.status==='Ativa'&&r.__pdfActivated&&!r.__delivered){const end=document.createElement('button');end.type='button';end.id='rental-close';end.className='btn btn-quiet';end.textContent='Encerrar locação';end.onclick=quickClose;host.append(end);}
}
function renderNext(unavailable,eventsFailed){
  const next=rentalNextStep(state.row,state.inspections,{unavailable,canManage:Boolean(window.alquilerContext.canManageCompany)}),link=$('#next-link'),button=$('#next-operation');
  $('#next-stage').textContent=next.stage;$('#next-note').textContent=eventsFailed?'Não foi possível conferir as etapas confirmadas. Atualize a página antes de continuar.':next.note;
  link.hidden=eventsFailed||next.kind!=='link';button.hidden=eventsFailed||next.kind!=='operation';
  if(next.kind==='link'){link.textContent=next.label;link.href=next.url;}
  if(next.kind==='operation'){button.textContent=next.label;button.onclick=next.operation==='encerrar'?quickClose:()=>operationDialog.open(state.row,state.events);}
  $('#rental-next').hidden=false;
}
function fail(message){$('#rental-title').textContent='Locação indisponível';$('#rental-subtitle').textContent=message;$('#rental-next').hidden=true;$('#rental-alert').hidden=true;$('#rental-content').hidden=true;}
async function load(){
  if(!id)return fail('Abra esta página a partir da lista de Locações.');
  const rental=await db.from('locacoes').select('*').eq('id',id).eq('empresa_id',company).maybeSingle();
  if(rental.error)return fail(rental.error.message);
  if(!rental.data)return fail('Locação não encontrada nesta empresa.');
  const [client,car,inspections,events]=await Promise.all([db.from('clientes').select('nome_completo,email').eq('id',rental.data.cliente_id).maybeSingle(),db.from('carros').select('placa,marca,modelo').eq('id',rental.data.carro_id).maybeSingle(),db.from('vistorias_locacao').select('locacao_id,tipo,data_hora,responsavel,quilometragem,combustivel,condicao_geral').eq('locacao_id',id),db.from('locacao_eventos').select('locacao_id,acao,criado_em,usuario_id,dados').eq('locacao_id',id).order('criado_em')]);
  state.client=client.data||null;state.car=car.data||null;state.inspections=inspections.data||[];state.events=events.data||[];state.row=withFlowFlags(rental.data,state.events);
  $('#rental-title').textContent=state.client?.nome_completo||'Cliente indisponível';$('#rental-subtitle').textContent=carName(state.car);
  renderNext(Boolean(inspections.error),Boolean(events.error));renderSteps(Boolean(inspections.error));renderFacts();
  const open=!['Encerrada','Cancelada'].includes(state.row.status);
  $('#rental-alert').hidden=!(open&&state.client&&!state.client.email&&!state.row.assinatura_referencia);
  $('#rental-content').hidden=false;
}
await load();
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
