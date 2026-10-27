import {centavos,saldoDiaria,sugerirComposicao,fimCaucao} from './pagamento-composicao.mjs';
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labelDate=d=>d?d.split('-').reverse().join('/'):'—';
const nowLocal=()=>new Date(Date.now()-4*3600000).toISOString().slice(0,16);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const categorias={caucao:'Caução',multa:'Multa / infração',manutencao:'Manutenção',outro:'Outro'};
export function criarBaixaComposta({db,company,onSaved}){
 if(!document.querySelector('#finance-payment-styles')){const css=el('link');css.id='finance-payment-styles';css.rel='stylesheet';css.href='/financeiro-baixa.css?v=20261027';document.head.append(css);}
 const dialog=el('dialog',null,'client-dialog finance-payment-dialog'),form=el('form',null,'client-form'),head=el('div',null,'dialog-header'),body=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');
 const title=el('h2','Registrar pagamento do locatário'),who=el('p'),status=el('p',null,'finance-entry-error'),summary=el('p',null,'section-note');status.setAttribute('role','alert');summary.setAttribute('aria-live','polite');
 const field=(host,label,type='number',required=true)=>{const wrap=el('label'),input=el('input');input.type=type;input.required=required;if(type==='number'){input.min='0';input.step='.01';}wrap.append(el('span',label),input);host.append(wrap);return input;};
 const top=el('div',null,'form-grid'),total=field(top,'Total recebido (R$)'),when=field(top,'Recebido em · horário de Manaus','datetime-local'),note=field(top,'Observação / comprovante','text',false);total.min='.01';note.maxLength=1000;
 const include=el('input');include.type='checkbox';const includeLabel=el('label');includeLabel.append(include,document.createTextNode('Incluir a multa de atraso desta diária na sugestão'));
 const dailyInfo=el('p',null,'section-note'),daily=field(body,'Destinar à diária e à multa de atraso (R$)');
 const suggest=el('button','Sugerir divisão','btn btn-quiet');suggest.type='button';const list=el('div'),plans=el('div'),newToggle=el('input');newToggle.type='checkbox';const newLabel=el('label');newLabel.append(newToggle,document.createTextNode('Cadastrar caução que ainda não tem parcelamento no sistema'));
 const newBox=el('fieldset'),newLegend=el('legend','Parcelamento da caução');newBox.append(newLegend);
 const description=field(newBox,'Referência do contrato / descrição','text'),unit=field(newBox,'Valor da parcela diária (R$)'),count=field(newBox,'Parcelas que ainda faltam','number'),prior=field(newBox,'Já pago anteriormente (R$)'),first=field(newBox,'Primeira parcela pendente','date'),newPaid=field(newBox,'Deste pagamento, destinar à primeira parcela (R$)'),end=el('p',null,'section-note');
 unit.min='.01';count.min='1';count.max='120';count.step='1';newPaid.min='.01';description.maxLength=1000;newBox.append(end);newBox.hidden=true;newBox.disabled=true;
 const antecipado=el('input');antecipado.type='checkbox';const antecipadoLabel=el('label');antecipadoLabel.append(antecipado,document.createTextNode('Confirmo que o dinheiro foi recebido antes do dia da diária (pagamento antecipado).'));antecipadoLabel.hidden=true;
 const save=el('button','Confirmar divisão e registrar','btn btn-primary'),cancel=el('button','Cancelar','btn btn-quiet');save.type='submit';cancel.type='button';head.append(title);foot.append(cancel,save);
 body.prepend(who,top,antecipadoLabel,dailyInfo,includeLabel);body.append(suggest,el('h3','Caução e outros débitos pendentes'),plans,list,newLabel,newBox,summary,status);form.append(head,body,foot);dialog.append(form);document.body.append(dialog);
 let current=null,parcelas=[],inputs=[],busy=false,loading=false,probing=false,operation=null,submitted=null;
 const lock=()=>{save.disabled=busy||loading;cancel.disabled=busy;};
 const close=()=>{if(!busy)dialog.close();};cancel.onclick=close;dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 function showEnd(){const last=fimCaucao(first.value,Number(count.value));end.textContent=last?`${count.value} parcela(s) de ${money(unit.value)}. Término previsto: ${labelDate(last)}. Já pago anteriormente não gera outra entrada no caixa.`:'Informe a primeira parcela e a quantidade para calcular quando termina.';}
 function chosen(){return inputs.filter(x=>centavos(x.input.value)>0).map(x=>({parcela_id:x.p.id,valor:centavos(x.input.value)/100}));}
 function refresh(){
  if(!current)return;const allocated=centavos(daily.value)+chosen().reduce((s,x)=>s+centavos(x.valor),0)+(newToggle.checked?centavos(newPaid.value):0),rest=centavos(total.value)-allocated;
  antecipadoLabel.hidden=!when.value||when.value.slice(0,10)>=current.day;antecipado.required=!antecipadoLabel.hidden;
  summary.textContent=`Total recebido: ${money(total.value)} · Distribuído: ${money(allocated/100)} · ${rest<0?'Excesso na divisão':'Falta distribuir'}: ${money(Math.abs(rest)/100)}. Confira antes de confirmar.`;
  const due=saldoDiaria(current.row,when.value?when.value+':00-04:00':null);daily.max=due.toFixed(2);dailyInfo.textContent=`Diária de ${labelDate(current.day)}: ${money(current.row.diaria_base)} · Multa calculada: ${money(Math.max(0,due-Math.max(0,Number(current.row.diaria_base)-Number(current.row.recebido))))} · Saldo da diária e multa: ${money(due)}. Desmarcar a multa não perdoa o débito; ele continua pendente.`;
  showEnd();
 }
 function suggestValues(){
  if(!current)return;const row=current.row,due=saldoDiaria(row,when.value?when.value+':00-04:00':null),base=Math.max(0,centavos(row.diaria_base)-centavos(row.recebido))/100;
  const s=sugerirComposicao(total.value,include.checked?due:Math.min(base,due),parcelas,current.day);daily.value=s.diaria.toFixed(2);
  for(const x of inputs)x.input.value=(s.itens.find(i=>i.parcela_id===x.p.id)?.valor||0).toFixed(2);
  if(newToggle.checked)newPaid.value=Math.min(Math.max(0,s.semDestino),Number(unit.value)||0).toFixed(2);refresh();
 }
 function draw(data){
  parcelas=(data.parcelas||[]).filter(p=>centavos(p.valor)>centavos(p.recebido));inputs=[];list.replaceChildren();plans.replaceChildren();
  const caucao=(data.debitos||[]).filter(d=>d.categoria==='caucao');
  if(!caucao.length)plans.append(el('p','Não há caução cadastrada para este locatário. Se parte do pagamento for caução, informe o parcelamento abaixo.','section-note'));
  for(const d of caucao){const ps=(data.parcelas||[]).filter(p=>p.debito_id===d.id),pending=ps.filter(p=>centavos(p.valor)>centavos(p.recebido)),saldo=pending.reduce((s,p)=>s+centavos(p.valor)-centavos(p.recebido),0)/100,last=pending.map(p=>p.vencimento).sort().at(-1);plans.append(el('p',`${d.descricao} · Saldo: ${money(saldo)} · ${pending.length} parcela(s) pendente(s) · Término previsto: ${labelDate(last)}.`,'section-note'));}
  const fines=parcelas.filter(p=>p.categoria==='multa').reduce((s,p)=>s+centavos(p.valor)-centavos(p.recebido),0)/100;plans.append(el('p',fines?`Há ${money(fines)} em multas / infrações pendentes. Este pagamento inclui alguma delas? Informe o valor na parcela correspondente.`:'Nenhuma multa / infração cadastrada em aberto. A multa de atraso da diária é exibida separadamente.','section-note'));
  for(const p of [...parcelas].sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.numero-b.numero)){
   const balance=(centavos(p.valor)-centavos(p.recebido))/100,box=el('div',null,'form-section');box.append(el('p',`${categorias[p.categoria]||p.categoria} · ${p.descricao} · Parcela ${p.numero} · ${labelDate(p.vencimento)} · Saldo ${money(balance)}${p.vencimento>current.day?' · Parcela futura':''}`));const input=field(box,'Destinar a esta parcela (R$)', 'number',false);input.value='0.00';input.max=balance.toFixed(2);input.addEventListener('input',refresh);inputs.push({p,input});list.append(box);
  }
 }
 for(const input of [total,daily,newPaid,unit,count,prior,first])input.addEventListener('input',refresh);when.addEventListener('change',refresh);include.addEventListener('change',refresh);suggest.onclick=suggestValues;
 newToggle.onchange=()=>{newBox.hidden=!newToggle.checked;newBox.disabled=!newToggle.checked;refresh();};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||loading||!current||!form.reportValidity())return;status.textContent='';
  const items=chosen();if(newToggle.checked)items.push({tipo:'nova_caucao',valor:centavos(newPaid.value)/100});
  const distributed=centavos(daily.value)+items.reduce((s,x)=>s+centavos(x.valor),0);
  if(distributed!==centavos(total.value)||distributed<=0){status.textContent='Distribua o valor inteiro entre diária, caução e outros débitos. Nenhum valor pode ficar sem destino.';return;}
  const payload={p_empresa:company.id,p_grupo:current.row.grupo_id,p_dia:current.day,p_operacao:operation,p_total:centavos(total.value)/100,p_recebido_em:new Date(when.value+':00-04:00').toISOString(),p_diaria:centavos(daily.value)/100,p_itens:items,p_observacao:note.value||null,p_caucao:newToggle.checked?{descricao:description.value,parcela:centavos(unit.value)/100,quantidade:Number(count.value),anterior:centavos(prior.value)/100,primeiro:first.value}:null};
  if(submitted&&submitted!==JSON.stringify(payload)){status.textContent='Esta tentativa já foi enviada. Confira o histórico antes de alterar a composição ou abrir outra baixa; você pode repetir os mesmos dados com segurança.';return;}
  submitted=JSON.stringify(payload);busy=true;lock();
  try{const r=await db.rpc('financeiro_baixar_composto',payload);if(r.error){if(r.error.code==='PGRST202'||r.error.code==='42P01')throw Error('Ative pagamentos_compostos.sql no Supabase como postgres. Nenhuma parte desta baixa foi salva.');if(r.error.code&&r.error.code!=='FETCH_ERROR')submitted=null;throw Error(r.error.message);}dialog.close();window.bgClearListCache?.();await onSaved();}
  catch(e){status.textContent=e.message;}finally{busy=false;lock();}
 };
 return {async open(row,day){
  if(busy||loading||probing)return true;
  probing=true;let ready;try{ready=await db.rpc('financeiro_baixa_disponivel',{p_empresa:company.id});}finally{probing=false;}
  if(ready.error||ready.data!==true)return false;
  current={row,day};operation=crypto.randomUUID();submitted=null;form.reset();status.textContent='Consultando parcelas e pagamentos já registrados…';who.textContent=row.cliente+' · '+row.placa;newLabel.hidden=!window.alquilerContext.canManageCompany;newBox.hidden=true;newBox.disabled=true;prior.value='0';count.value='1';first.value=day;description.value='Caução referente à locação';when.value=nowLocal();when.max=nowLocal();when.min='2026-10-10T00:00';total.value=saldoDiaria(row,when.value+':00-04:00').toFixed(2);include.checked=true;loading=true;lock();list.replaceChildren();plans.replaceChildren();dialog.showModal();
  try{if(!row.cliente_id)throw Error('Vincule o locatário à ocupação antes de dividir o pagamento.');const result=await db.rpc('cliente_debitos_painel',{p_empresa:company.id,p_cliente:row.cliente_id});if(result.error)throw Error(result.error.message);draw(result.data||{});suggestValues();status.textContent='';}
  catch(e){status.textContent='Não foi possível consultar os débitos: '+e.message;current=null;}finally{loading=false;lock();save.disabled=!current;}return true;
 }};
}
