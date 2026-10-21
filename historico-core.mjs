import {mileageSummary} from './frota-km-core.mjs';
const time=v=>v?Date.parse(v):NaN;
const list=(d,key)=>d[key]||[];
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const historyDate=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Manaus'}):'Data não informada';
export function durationLabel(start,end,now=Date.now()) {if(!Number.isFinite(time(start)))return 'Duração não calculável: entrada não informada';const ms=Math.max(0,(end?time(end):now)-time(start));if(!Number.isFinite(ms))return 'Duração não informada';const hours=Math.floor(ms/3600000),minutes=Math.floor(ms%3600000/60000);return Math.floor(hours/24)+' dia(s), '+hours%24+'h '+minutes+'min'+(!end?' · em andamento':'');}
export function occupationSegments(data){
 const result=[],keys=new Set(),push=p=>{if(!p.carro_id||!p.cliente_id)return;const key=[p.carro_id,p.cliente_id,p.start||'',p.end||''].join('|');if(keys.has(key))return;keys.add(key);result.push(p);};
 const swaps=list(data,'swaps').filter(s=>s.confirmado_em).sort((a,b)=>time(a.data_troca)-time(b.data_troca));
 for(const p of list(data,'periods').filter(p=>p.tipo==='locacao'))push({...p,key:'periodo:'+p.id,start:p.inicio,end:p.fim,reason:p.observacoes,source:'Período de ocupação'});
 for(const r of list(data,'rentals')){
  if(r.status==='Cancelada'&&!r.contrato_gerado_em)continue;
  const chain=swaps.filter(s=>s.origem_tipo==='locacao'&&s.origem_id===r.id),closed=list(data,'operations').find(e=>e.locacao_id===r.id&&e.acao==='devolucao'),delivered=list(data,'operations').find(e=>e.locacao_id===r.id&&e.acao==='entrega');
  let start=delivered?.dados?.vistoria?.data_hora||r.data_inicio,car=chain[0]?.anterior_id||r.carro_id;
  const actualEnd=closed?.dados?.vistoria?.data_hora||closed?.dados?.data||closed?.dados?.data_hora||(closed?closed.criado_em:null);
  for(const s of chain){push({...r,key:'locacao:'+r.id,carro_id:car,start,end:s.data_troca,reason:s.valores?.motivo_alteracao,source:'Locação com contrato'});start=s.data_troca;car=s.posterior_id;}
  const covered=list(data,'periods').some(p=>p.tipo==='locacao'&&p.carro_id===car&&p.cliente_id===r.cliente_id&&p.inicio===start);
  if(!covered)push({...r,key:'locacao:'+r.id,carro_id:car,start,end:actualEnd,endUnknown:['Encerrada','Cancelada'].includes(r.status)&&!actualEnd,source:r.status==='Cancelada'?'Locação cancelada':r.status==='Reservada'?'Reserva registrada — entrega a confirmar':'Locação com contrato',reserved:!['Ativa','Encerrada'].includes(r.status)});
 }
 for(const s of swaps.filter(s=>s.origem_tipo==='levantamento')){const o=s.snapshot?.ocupacao||{};push({...o,key:'levantamento:'+s.origem_id+':'+s.cliente_id,carro_id:s.anterior_id,cliente_id:s.cliente_id,start:o.inicio,end:s.data_troca,reason:s.valores?.motivo_alteracao,source:'Ocupação anterior à substituição'});}
 for(const c of list(data,'closures').filter(c=>c.origem==='levantamento')){const o=c.snapshot||{};push({...o,key:'levantamento:'+c.origem_id+':'+o.cliente_id,carro_id:c.carro_id,start:o.inicio,end:c.fim,reason:c.motivo,source:'Ocupação encerrada'});}
 for(const o of list(data,'imported').filter(o=>o.ativo)){
  if(result.some(p=>p.carro_id===o.carro_id&&p.cliente_id===o.cliente_id&&!p.end))continue;
  push({...o,key:'levantamento:'+o.id+':'+o.cliente_id,start:o.inicio,end:null,source:'Ocupação informada'});
 }
 return result;
}
export function maintenancePeriods(data){
 const result=list(data,'periods').filter(p=>p.tipo==='manutencao').map(p=>({...p,start:p.inicio,end:p.fim,reason:p.observacoes,context:p.cliente_contexto_id||p.cliente_id,source:'Período de manutenção',recorded:true}));
 const events=[...list(data,'statuses')].sort((a,b)=>time(a.criado_em)-time(b.criado_em));
 for(const car of list(data,'cars')){const rows=events.filter(e=>e.carro_id===car.id);let entry=null;
  for(const e of rows){const maintenance=['Manutenção','Revisão'].includes(e.situacao_nova);if(maintenance&&!entry)entry=e;else if(!maintenance&&entry){if(!result.some(p=>p.carro_id===car.id&&time(p.start)<=time(e.criado_em)&&(!p.end||time(p.end)>=time(entry.criado_em))))result.push({id:'situacao:'+entry.id,carro_id:car.id,start:entry.criado_em,end:e.criado_em,reason:entry.descricao,source:'Mudança de situação — datas dos registros',recorded:false});entry=null;}}
  if(entry&&!result.some(p=>p.carro_id===car.id&&!p.end))result.push({id:'situacao:'+entry.id,carro_id:car.id,start:entry.criado_em,end:null,reason:entry.descricao||car.observacoes,source:'Mudança de situação — data do registro',recorded:false});
  if(['Manutenção','Revisão'].includes(car.situacao)&&!result.some(p=>p.carro_id===car.id&&!p.end))result.push({id:'sem-data:'+car.id,carro_id:car.id,start:null,end:null,reason:car.observacoes,source:'Situação atual sem data de entrada',recorded:false});
 }
 return result;
}
const overlaps=(a,b)=>Number.isFinite(time(a.start))&&Number.isFinite(time(b.start))&&time(a.start)<(b.end?time(b.end):Infinity)&&time(b.start)<(a.end?time(a.end):Infinity);
export function buildHistory(data,{kind,id,from='',until='',type='',search='',now=Date.now()}={}){
 const people=new Map(list(data,'clients').map(c=>[c.id,c.nome_completo||c.nome])),cars=new Map(list(data,'cars').map(c=>[c.id,c]));
 const person=id=>people.get(id)||'Locatário não identificado',plate=id=>cars.get(id)?.placa||'Veículo não identificado';
 const segments=occupationSegments(data),mine=segments.filter(p=>kind==='carro'?p.carro_id===id:p.cliente_id===id),events=[];
 const add=e=>events.push(e),applies=(car,client)=>kind==='carro'?car===id:client===id;
 for(const p of mine)add({id:'uso:'+p.key+':'+(p.start||''),type:'ocupacao',start:p.start,end:p.end,endUnknown:p.endUnknown,carro_id:p.carro_id,cliente_id:p.cliente_id,title:(p.status==='Cancelada'?'Locação cancelada · ':p.reserved?'Reserva de ':'Uso do veículo ')+plate(p.carro_id),description:person(p.cliente_id)+' · '+p.source,detail:p.reason||'',rental:p.source.includes('contrato')||p.source.includes('Reserva')?p.id:null,interval:true});
 for(const m of maintenancePeriods(data)){
  const related=mine.filter(p=>p.carro_id===m.carro_id&&!p.reserved&&!p.endUnknown&&overlaps(p,m));
  if(kind==='carro'?m.carro_id!==id:m.context!==id&&!related.length)continue;
  const workshop=list(data,'suppliers').find(f=>f.id===m.fornecedor_id),where=workshop?.nome_fantasia||workshop?.razao_social||m.localizacao||'Oficina não informada';
  add({id:'manutencao:'+m.id,type:'manutencao',start:m.start,end:m.end,carro_id:m.carro_id,cliente_id:m.context,title:'Manutenção · '+plate(m.carro_id),description:where+' · '+(m.reason||'Motivo não informado'),detail:[m.source,m.context?'Locatário relacionado: '+person(m.context)+'; vínculo de contexto, sem cobrança automática.':kind==='cliente'?'Coincide com o período de uso; responsabilidade não atribuída.':'',m.conclusao_manutencao&&'Conclusão: '+m.conclusao_manutencao,m.custo_manutencao!=null&&'Custo informado: '+Number(m.custo_manutencao).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),m.previsao&&'Previsão: '+historyDate(m.previsao)].filter(Boolean).join(' · '),interval:true,maintenance:m,estimated:!m.recorded});
 }
 for(const s of list(data,'swaps').filter(s=>s.confirmado_em&&(kind==='carro'?s.anterior_id===id||s.posterior_id===id:s.cliente_id===id)))add({id:'troca:'+s.id,type:'substituicao',start:s.data_troca,carro_id:s.posterior_id,cliente_id:s.cliente_id,title:'Substituição '+(s.valores?.tipo_substituicao==='temporaria'?'temporária':'permanente'),description:person(s.cliente_id)+' · '+plate(s.anterior_id)+' → '+plate(s.posterior_id),detail:s.valores?.motivo_alteracao||'Motivo não informado',href:'/locacao/substituicao?termo='+encodeURIComponent(s.id)});
 for(const c of list(data,'changes').filter(c=>kind==='carro'?c.carro_id===id:c.cliente_anterior===id||c.cliente_novo===id))add({id:'pessoa:'+c.id,type:'operacao',start:c.data_movimentacao||c.criado_em,carro_id:c.carro_id,title:c.acao==='corrigir'?'Correção do vínculo do locatário':'Troca de locatário',description:plate(c.carro_id)+' · '+person(c.cliente_anterior)+' → '+person(c.cliente_novo),detail:c.motivo});
 const rentalIds=new Set(mine.filter(p=>p.key.startsWith('locacao:')).map(p=>p.id));
 for(const r of list(data,'rentals').filter(r=>applies(r.carro_id,r.cliente_id)))rentalIds.add(r.id);
 for(const o of list(data,'operations').filter(o=>rentalIds.has(o.locacao_id))){const actualCar=o.dados?.locacao_snapshot?.carro_id;if(kind==='carro'&&actualCar&&actualCar!==id)continue;add({id:'operacao:'+o.id,type:'operacao',start:o.dados?.vistoria?.data_hora||o.dados?.data||o.dados?.data_hora||o.criado_em,carro_id:actualCar,title:({entrega:'Entrega confirmada',devolucao:'Devolução confirmada',encerramento:'Locação encerrada'})[o.acao]||'Operação da locação',description:'Locação '+o.locacao_id.slice(0,8),detail:o.dados?.motivo||o.dados?.observacoes||'',rental:o.locacao_id});}
 for(const r of list(data,'mileage').filter(r=>applies(r.carro_id,r.cliente_id)))add({id:'km:'+r.id,type:'km',start:r.leitura_em,carro_id:r.carro_id,cliente_id:r.cliente_id,title:Number(r.km).toLocaleString('pt-BR')+' km · '+plate(r.carro_id),description:r.responsavel||person(r.cliente_id),detail:[r.observacoes,r.precisao_data==='dia'?'Precisão de dia; horário não informado':''].filter(Boolean).join(' · ')});
 for(const d of [...list(data,'documents').map(d=>({...d,bucket:'documentos-contratuais',path:d.arquivo_assinado_path||d.arquivo_original_path})),...list(data,'modelDocuments').map(d=>({...d,bucket:'documentos-modelos',path:d.arquivo_path}))].filter(d=>rentalIds.has(d.locacao_id)))add({id:'documento:'+d.id,type:'documento',start:d.gerado_em||d.criado_em,title:d.nome||'Documento da locação',description:d.status||'Documento emitido',detail:d.versao?'Versão '+d.versao:'',rental:d.locacao_id,file:d.path?{bucket:d.bucket,path:d.path}:null});
 for(const c of list(data,'closures').filter(c=>kind==='carro'?c.carro_id===id:c.snapshot?.cliente_id===id))add({id:'encerramento:'+c.id,type:'operacao',start:c.fim,carro_id:c.carro_id,cliente_id:c.snapshot?.cliente_id,title:'Ocupação encerrada · '+plate(c.carro_id),description:c.motivo,detail:'Situação após encerramento: '+c.situacao_posterior});
 for(const s of list(data,'statuses').filter(s=>kind==='carro'&&s.carro_id===id))add({id:'situacao:'+s.id,type:'operacao',start:s.criado_em,carro_id:s.carro_id,title:'Situação: '+s.situacao_nova,description:(s.situacao_anterior||'Não informada')+' → '+s.situacao_nova,detail:s.descricao||''});
 for(const r of list(data,'receipts')){
  const bill=list(data,'bills').find(b=>b.grupo_id===r.grupo_id&&b.competencia===r.competencia),at=r.competencia+'T12:00:00-04:00',p=segments.filter(p=>(p.grupo_id||p.id)===r.grupo_id&&(!p.start||time(p.start)<time(at)+43200000)&&(!p.end||time(p.end)>time(at)-43200000)).sort((a,b)=>time(b.start)-time(a.start))[0];
  const car=bill?.carro_id||p?.carro_id,client=bill?.cliente_id||p?.cliente_id;if(!applies(car,client))continue;
  add({id:'recebimento:'+r.id,type:'recebimento',start:r.recebido_em||r.criado_em,carro_id:car,cliente_id:client,title:'Recebimento: '+Number(r.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),description:person(client)+' · '+plate(car),detail:'Competência: '+r.competencia+' · Composição e baixa no Financeiro',href:'/financeiro?secao=recebidos&de='+r.competencia+'&ate='+r.competencia});
 }
 for(const r of list(data,'importedReceipts').filter(r=>applies(r.carro_id,r.cliente_id)))add({id:'recebimento-importado:'+r.id,type:'recebimento',start:r.data_recebimento?r.data_recebimento+'T12:00:00-04:00':null,dayOnly:true,carro_id:r.carro_id,cliente_id:r.cliente_id,title:'Recebimento importado: '+Number(r.valor).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),description:person(r.cliente_id)+' · '+plate(r.carro_id),detail:'Horário não informado · Composição: '+(r.composicao_status||'a conferir'),href:'/financeiro?secao=recebidos&de='+encodeURIComponent(r.data_recebimento||'')+'&ate='+encodeURIComponent(r.data_recebimento||'')});
 const begin=from?time(from+'T00:00:00-04:00'):-Infinity,end=until?time(until+'T23:59:59.999-04:00'):Infinity,q=norm(search);
 const visible=events.filter(e=>{const start=time(e.start),finish=e.interval?(e.end?time(e.end):now):start;return (!type||e.type===type)&&(!q||norm([e.title,e.description,e.detail].join(' ')).includes(q))&&(!Number.isFinite(start)||start<=end&&finish>=begin);}).sort((a,b)=>(Number.isFinite(time(b.start))?time(b.start):-Infinity)-(Number.isFinite(time(a.start))?time(a.start):-Infinity));
 const maint=visible.filter(e=>e.type==='manutencao'&&!e.estimated),ranges=new Map();for(const m of maint){if(!ranges.has(m.carro_id))ranges.set(m.carro_id,[]);ranges.get(m.carro_id).push([Math.max(begin,time(m.start)),Math.min(end,m.end?time(m.end):now,now)]);}
 let maintenanceMs=0;for(const intervals of ranges.values()){intervals.sort((a,b)=>a[0]-b[0]);let current=null;for(const [s,e]of intervals){if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s)continue;if(current&&s<=current[1])current[1]=Math.max(current[1],e);else{if(current)maintenanceMs+=current[1]-current[0];current=[s,e];}}if(current)maintenanceMs+=current[1]-current[0];}
 const filteredMine=mine.filter(p=>!p.reserved&&(!p.start||time(p.start)<=end)&&(!p.end||time(p.end)>=begin));
 const averages=[];for(const carId of new Set(mine.map(p=>p.carro_id))){const readings=list(data,'mileage').filter(r=>r.carro_id===carId&&time(r.leitura_em)>=begin&&time(r.leitura_em)<=end),interruptions=list(data,'periods').filter(p=>p.carro_id===carId&&p.tipo!=='locacao').map(p=>({key:'periodo:'+p.id,start:p.inicio,end:p.fim}));const summary=mileageSummary(readings,[...segments.filter(p=>p.carro_id===carId).map(p=>({key:p.key,start:p.start,end:p.end})),...interruptions]);const target=kind==='cliente'?summary.people.filter(p=>p.cliente_id===id):summary.people;for(const p of target)averages.push({...p,carro_id:carId,placa:plate(carId)});}
 return {events:visible,segments:mine,averages,summary:{related:new Set(filteredMine.map(p=>kind==='carro'?p.cliente_id:p.carro_id)).size,maintenanceCount:visible.filter(e=>e.type==='manutencao').length,maintenanceDays:maintenanceMs/86400000,readings:visible.filter(e=>e.type==='km').length}};
}
