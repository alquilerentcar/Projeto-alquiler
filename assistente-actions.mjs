import {plainBlocks} from './rich-document.js';
export function rentalPayload(values,company){
 const daily=Number(values.diaria),deposit=Number(values.caucao||0);
 if(!values.cliente_id||!values.carro_id||!values.inicio||!Number.isFinite(daily)||daily<=0||!Number.isFinite(deposit)||deposit<0)throw Error('Informe cliente, veículo, início, diária positiva e caução válida.');
 const start=new Date(values.inicio),end=values.fim?new Date(values.fim):null;
 if(!Number.isFinite(start.getTime())||(end&&(!Number.isFinite(end.getTime())||end<=start)))throw Error('Confira as datas; o fim deve ser posterior ao início.');
 return {empresa_id:company,cliente_id:values.cliente_id,carro_id:values.carro_id,data_inicio:start.toISOString(),data_fim:end?.toISOString()||null,valor_diaria:daily,valor_caucao:deposit,valor_caucao_pago:0,saldo_caucao:deposit,numero_parcelas_caucao:100,valor_parcela_caucao:deposit/100,multa_atraso_percentual:11,status:'Reservada',observacoes:String(values.observacoes||'').slice(0,4000)||null};
}
export async function showAction({action,db,context,host,notify,userId}){
 if(!['locacao','modelo'].includes(action?.tipo))return;
 const company=context.company?.id;if(!company)throw Error('Selecione uma empresa.');
 if(action.tipo==='modelo'&&!context.canManageCompany)throw Error('Somente o administrador da empresa pode criar modelos.');
 host.querySelector('.ai-operation')?.remove();
 const form=document.createElement('form');form.className='ai-operation ai-intake';
 const title=document.createElement('strong');title.textContent=action.tipo==='modelo'?'Revisar novo modelo de documento':'Revisar locação e preparar contrato';form.append(title);
 const field=(name,label,type='text',value='')=>{const wrap=document.createElement('label'),span=document.createElement('span'),input=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');span.textContent=label;input.name=name;if(!['textarea','select'].includes(type))input.type=type;input.value=value??'';wrap.append(span,input);form.append(wrap);return input;};
 if(action.tipo==='modelo'){
  field('nome','Nome do modelo','text',action.nome).required=true;
  const text=field('conteudo','Texto do documento (revise antes de salvar)','textarea',action.conteudo);text.required=true;text.rows=12;text.maxLength=40000;
 }else{
  const [clients,cars]=await Promise.all([db.from('clientes').select('id,nome_completo,cpf').eq('empresa_id',company).order('nome_completo'),db.from('carros').select('id,placa,modelo').eq('empresa_id',company).order('placa')]);
  for(const result of [clients,cars])if(result.error)throw result.error;
  const customer=field('cliente_id','Locatário','select'),vehicle=field('carro_id','Veículo','select');
  for(const [select,rows,label]of [[customer,clients.data,c=>c.nome_completo],[vehicle,cars.data,c=>c.placa+' · '+(c.modelo||'')]]){select.required=true;select.add(new Option('Selecione',''));for(const row of rows)select.add(new Option(label(row),row.id));}
  const query=String(action.cliente||'').trim().toLocaleLowerCase('pt-BR'),digits=query.replace(/\D/g,'');const found=(clients.data||[]).filter(c=>query&&(digits.length===11?c.cpf?.replace(/\D/g,'')===digits:c.nome_completo.toLocaleLowerCase('pt-BR').includes(query)));if(found.length===1)customer.value=found[0].id;
  const plate=String(action.placa||'').replace(/\W/g,'').toUpperCase(),car=(cars.data||[]).find(c=>c.placa.replace(/\W/g,'').toUpperCase()===plate);if(car)vehicle.value=car.id;
  const start=field('inicio','Início (horário local)','datetime-local',action.inicio);start.required=true;field('fim','Fim previsto (opcional)','datetime-local',action.fim);
  const daily=field('diaria','Diária (R$)','number',action.diaria);daily.required=true;daily.min='0.01';daily.step='0.01';const deposit=field('caucao','Caução total (R$)','number',action.caucao??0);deposit.min='0';deposit.step='0.01';field('observacoes','Observações','textarea',action.observacoes);
 }
 const note=document.createElement('p');note.textContent=action.tipo==='modelo'?'Será salvo como rascunho. Publique no editor após conferir o texto.':'Será criada como Reservada. Confira caução, parcelas e multa no contrato antes do PDF. Vistoria, fotos e assinatura seguem nas etapas da locação.';form.append(note);
 const error=document.createElement('p');error.setAttribute('role','status');const save=document.createElement('button');save.type='submit';save.textContent=action.tipo==='modelo'?'Criar modelo em rascunho':'Criar locação e contrato';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>form.remove();form.append(error,save,cancel);host.append(form);
 let busy=false,done=false;form.onsubmit=async event=>{event.preventDefault();if(busy||done||!form.reportValidity())return;busy=true;save.disabled=true;error.textContent='Salvando…';try{
  const session=await db.auth.getSession();if(session.error||session.data?.session?.user.id!==userId||window.alquilerContext.company?.id!==company)throw Error('Sua conta ou empresa mudou. Prepare o pedido novamente.');
  const values=Object.fromEntries(new FormData(form));let link;
  if(action.tipo==='modelo'){
   if(!window.alquilerContext.canManageCompany)throw Error('Sem permissão para criar modelos.');
   const content=values.conteudo.trim(),name=values.nome.trim();if(!name||name.length>120||!content)throw Error('Confira nome e texto.');
   const result=await db.rpc('modelo_documento_salvar_editor',{p_empresa:company,p_id:null,p_revisao:null,p_nome:name,p_conteudo:content,p_publicar:false,p_arquivado:false,p_formatacao:plainBlocks(content),p_tipo:'outro'});if(result.error)throw result.error;link='/cadastros/modelos-contrato';
  }else{
   const payload=rentalPayload(values,company);
   const [rentals,periods]=await Promise.all([db.from('locacoes').select('id').eq('empresa_id',company).eq('carro_id',payload.carro_id).in('status',['Ativa','Reservada']),db.from('frota_periodos').select('id').eq('empresa_id',company).eq('carro_id',payload.carro_id).is('fim',null)]);
   for(const result of [rentals,periods])if(result.error)throw result.error;if(rentals.data.length||periods.data.length)throw Error('O carro já está reservado, locado ou em outra ocupação. Confira a frota.');
   const result=await db.from('locacoes').insert(payload).select('id').single();if(result.error)throw result.error;link='/locacao/contrato?locacao='+encodeURIComponent(result.data.id);
  }
  done=true;window.bgClearListCache?.();error.textContent='Salvo com sucesso.';save.textContent='Criado';cancel.remove();form.querySelectorAll('input,select,textarea').forEach(n=>n.disabled=true);const a=document.createElement('a');a.className='btn btn-primary';a.href=link;a.textContent=action.tipo==='modelo'?'Abrir editor de modelos':'Abrir contrato da locação';form.append(a);notify('Registro criado. Use o botão para conferir o documento.');
 }catch(e){error.textContent=e.message||'Não foi possível salvar.';}finally{busy=false;save.disabled=done;}};
}
