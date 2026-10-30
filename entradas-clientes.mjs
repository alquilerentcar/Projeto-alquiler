import {agruparEntradas} from './entradas-clientes-core.mjs';
import {mountExtras} from './cliente-complementos.mjs';
const money=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'Não definida';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function criarEntradasClientes({db,company,openPayment,openTerm,onClose}){
 let extras={parcelas:[]},contracts=[],warning='',groups=[],childDialogs=[];
 const dialog=el('dialog',null,'client-dialog entradas-cliente-dialog'),header=el('div',null,'dialog-header'),title=el('h2'),close=el('button','Fechar','btn btn-quiet'),body=el('div',null,'dialog-body');close.type='button';close.onclick=()=>dialog.close();header.append(title,close);dialog.append(header,body);document.body.append(dialog);dialog.addEventListener('close',()=>{for(const d of childDialogs)d.remove();childDialogs=[];onClose();});
 async function load(){
  warning='';const [a,b]=await Promise.all([db.rpc('cliente_debitos_painel',{p_empresa:company.id,p_cliente:null}),(async()=>{const all=[];for(let offset=0;;offset+=1000){const r=await db.from('locacoes').select('id,cliente_id,carro_id,status,valor_caucao,valor_caucao_pago,saldo_caucao,numero_parcelas_caucao,valor_parcela_caucao').eq('empresa_id',company.id).in('status',['Ativa','Reservada']).order('id').range(offset,offset+999);if(r.error)return r;all.push(...r.data);if(r.data.length<1000)return {data:all};}})()]);
  extras=a.error?{parcelas:[]}:a.data||{parcelas:[]};contracts=b.error?[]:b.data||[];
  if(a.error)warning='Não foi possível consultar as parcelas de caução e extras: '+a.error.message;
  if(b.error)warning+=(warning?' · ':'')+'Não foi possível consultar a caução dos contratos: '+b.error.message;
 }
 function render({rows,panel,day,query,filter,body:tableBody,metrics,count}){
  const names=new Map((panel.clientes||[]).map(c=>[c.id,c.nome||c.nome_completo]));
  groups=agruparEntradas(rows,extras.parcelas||[],contracts.map(c=>({...c,nome_cliente:names.get(c.cliente_id)})),day);
  tableBody.replaceChildren();const total=groups.reduce((t,g)=>({previsto:t.previsto+g.total,recebido:t.recebido+g.recebido,saldo:t.saldo+g.saldo}),{previsto:0,recebido:0,saldo:0});metrics.replaceChildren();for(const [label,value]of [['Previsto no dia',money(total.previsto/100)],['Recebido dessas cobranças',money(total.recebido/100)],['Saldo do dia',money(total.saldo/100)],['Locatários',groups.length]]){const m=el('div',null,'metric');m.append(el('span',label),el('strong',value));metrics.append(m);}
  let shown=0;for(const g of groups){if(filter&&g.status!==filter||!`${g.nome} ${g.diarias.map(r=>r.placa).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query))continue;shown++;const tr=el('tr'),name=el('td'),button=el('button',g.nome,'btn btn-quiet entradas-nome');button.type='button';button.onclick=()=>open(g,day);name.append(button);tr.append(name);for(const v of [g.diarias.map(r=>r.placa).join(' · ')||'Sem diária no dia',money(g.base/100),money(g.caucao/100),money((g.extras+g.multa)/100),money(g.total/100),money(g.recebido/100),money(g.saldo/100),g.status])tr.append(el('td',v));tableBody.append(tr);}
  if(!shown){const tr=el('tr'),td=el('td','Nenhum locatário corresponde ao dia e aos filtros.');td.colSpan=9;tr.append(td);tableBody.append(tr);}count.textContent=shown+' de '+groups.length+' locatário(s) · Clique no nome para ver diária, caução e demais débitos.'+(warning?' '+warning:'');
 }
 async function open(g,day){
  title.textContent=g.nome;body.replaceChildren(el('p','Cobranças de '+date(day)+'. Parcelas de outros dias ficam no detalhamento abaixo.','section-note'));
  if(!g.id)body.append(el('p','Vincule o cliente à ocupação para reunir também a caução e os outros débitos.','finance-entry-error'));
  const summary=el('div',null,'metrics');for(const [label,value]of [['Diárias',g.base],['Caução no dia',g.caucao],['Multa da diária e extras',g.multa+g.extras],['Saldo no dia',g.saldo]]){const m=el('div',null,'metric');m.append(el('span',label),el('strong',money(value/100)));summary.append(m);}body.append(summary);
  body.append(el('h3','Diárias e recebimento'));for(const r of g.diarias){const row=el('section',null,'form-section');row.append(el('p',r.placa+' · Diária: '+money(r.diaria_base??r.diaria)+' · Multa: '+money(r.multa)+' · Recebido: '+money(r.recebido)));const pay=el('button','Registrar recebimento / dividir valor','btn btn-primary');pay.type='button';const today=new Date(Date.now()-4*3600000).toISOString().slice(0,10);pay.disabled=day>today||(day>='2026-10-10'&&r.diaria_base==null)||(r.diaria_base==null&&Number(r.diaria)<=Number(r.recebido));pay.onclick=()=>openPayment(r,day);row.append(pay);if(r.cobranca_id||r.diaria_base!=null){const end=el('button','Definir término','btn btn-quiet');end.type='button';end.onclick=()=>openTerm(r);row.append(end);}body.append(row);}
  if(!g.diarias.length)body.append(el('p','Não há diária para este dia. As parcelas podem ser recebidas no detalhamento de débitos abaixo.'));
  body.append(el('h3','Caução informada na locação'));for(const c of g.contratos){const box=el('section',null,'form-section');box.append(el('p','Total contratual: '+money(c.valor_caucao)+' · Entrada informada: '+money(c.valor_caucao_pago)+' · Saldo contratual: '+money(c.saldo_caucao??Math.max(0,Number(c.valor_caucao)-Number(c.valor_caucao_pago)))));box.append(el('p',(c.numero_parcelas_caucao||'—')+' parcela(s) · Valor informado por parcela: '+money(c.valor_parcela_caucao)));const a=el('a','Ver contrato','btn btn-quiet');a.href='/locacao/contrato?id='+encodeURIComponent(c.id);box.append(a);body.append(box);}
  if(!g.contratos.length)body.append(el('p','Nenhuma locação ativa ou reservada vinculada a este cliente.'));
  body.append(el('p','A caução do contrato é uma referência, não um recebimento confirmado. Somente as parcelas financeiras cadastradas entram no previsto do dia. Ao cadastrar o parcelamento, confira os débitos existentes para evitar duplicidade.','section-note'));
  if(warning)body.append(el('p',warning,'finance-entry-error'));dialog.showModal();
  if(g.id){const host=el('div');body.append(host);try{const existing=new Set(document.querySelectorAll('dialog'));const pending=mountExtras(db,company,g.id,host);childDialogs=[...document.querySelectorAll('dialog')].filter(d=>!existing.has(d));await pending;}catch(e){host.append(el('p',e.message,'finance-entry-error'));}}
 }
 return {load,render};
}
