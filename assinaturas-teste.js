import {getAuthenticatedClient} from './auth-guard.js';
const client=await getAuthenticatedClient(),context=window.alquilerContext;
if(context?.developer){
 const $=s=>document.querySelector(s),panel=$('#zapsign-test-panel'),status=$('#zapsign-test-status'),message=$('#zapsign-test-result'),links=$('#zapsign-test-links'),form=$('#zapsign-test-form'),fields=$('#zapsign-test-fields'),create=$('#zapsign-test-create'),refresh=$('#zapsign-test-refresh'),start=$('#zapsign-test-new');
 panel.hidden=false;let active=false,busy=false,current=null;
 const session=await client.auth.getSession(),key='vert:assinatura-teste-v2:'+session.data.session.user.id+':'+context.company.id;
 try{current=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
 const save=()=>{try{if(current)sessionStorage.setItem(key,JSON.stringify(current));else sessionStorage.removeItem(key);}catch{}};
 function buttons(){fields.disabled=busy||!active||Boolean(current);create.disabled=busy||!active||Boolean(current);refresh.disabled=busy||!active||!current?.reference;start.hidden=!current;start.disabled=busy;}
 function required(){form.elements.email.required=form.elements.metodo.value==='email'||form.elements.enviar_email.checked;form.elements.telefone.required=form.elements.metodo.value==='sms';}
 form.elements.metodo.onchange=required;form.elements.enviar_email.onchange=required;required();
 async function api(url,options){let response;try{response=await fetch(url,options);}catch{throw Object.assign(Error('Conexão interrompida. Confira o sandbox antes de criar outro teste.'),{uncertain:Boolean(options?.method==='POST')});}let data;try{data=await response.json();}catch{throw Object.assign(Error('O servidor não retornou a confirmação. Confira o sandbox antes de criar outro teste.'),{uncertain:Boolean(options?.method==='POST')});}if(!response.ok)throw Object.assign(Error(data.error||'Não foi possível concluir o teste.'),{uncertain:Boolean(data.uncertain)});return data;}
 function show(data){
  links.replaceChildren();const labels={new:'Aguardando assinatura','link-opened':'Link aberto',signed:'Assinado',pending:'Aguardando assinatura',refused:'Recusado'};
  let text=(data.status==='signed'?'Documento de teste assinado':labels[data.signerStatus]||'Aguardando assinatura')+' · Referência: '+data.reference+'.';
  if(data.signedAt){const date=new Date(data.signedAt);if(Number.isFinite(date.getTime()))text+=' Assinatura em '+date.toLocaleString('pt-BR',{timeZone:'America/Manaus'})+'.';}
  if(data.evidence){const received=Object.entries(data.evidence).filter(([,value])=>value).map(([name])=>name);text+=received.length?' Evidências retornadas pelo provedor: '+received.join(', ')+'.':' Fotos ainda não confirmadas na resposta do provedor.';}
  if(data.requested?.document===false||data.requested?.selfie===false)text+=' Atenção: o provedor não ativou todas as fotos solicitadas. Confira o sandbox antes de usar com clientes.';
  if(data.status==='signed'&&!data.signedPdf)text+=' O PDF assinado ainda não está disponível. Atualize o resultado em instantes.';
  message.textContent=text;
  for(const [href,label]of [[data.signUrl,'Abrir para assinar no sandbox'],[data.originalPdf,'Abrir documento de teste'],[data.signedPdf,'Abrir / baixar PDF assinado']])if(href){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.className='btn btn-quiet';a.textContent=label;links.append(a);}
 }
 async function inspect(){if(busy||!current?.reference)return;busy=true;buttons();message.textContent='Consultando o resultado na ZapSign…';try{const data=await api('/api/assinaturas/status?teste=zapsign&referencia='+encodeURIComponent(current.reference));show(data);}catch(error){message.textContent=error.message;}finally{busy=false;buttons();}}
 start.onclick=()=>{if(busy||!confirm(current?.uncertain?'Você já conferiu os documentos no painel sandbox? Um novo teste pode criar outro documento.':'Criar um novo teste? O documento anterior permanece no sandbox.'))return;current=null;save();links.replaceChildren();message.textContent='Preencha seus dados e confirme para criar um novo teste.';buttons();};
 refresh.onclick=inspect;
 form.onsubmit=async event=>{event.preventDefault();if(busy||!active||current||!form.reportValidity())return;
  const name=form.elements.nome.value.trim(),method=form.elements.metodo.value,email=form.elements.email.value.trim(),phone=form.elements.telefone.value.trim(),mail=form.elements.enviar_email.checked;
  if(!confirm('Criar documento fictício no sandbox para '+name+', com código por '+(method==='sms'?'SMS para '+phone:'e-mail para '+email)+', documento e selfie?'+(mail?' O link também será enviado para '+email+'.':' O link será mostrado aqui.')))return;
  busy=true;current={operation:crypto.randomUUID(),uncertain:true};save();buttons();links.replaceChildren();message.textContent='Criando seu teste de assinatura…';
  try{const data=await api('/api/assinaturas/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:'teste_zapsign',nome:name,email,telefone:phone,metodo:method,enviar_email:mail,confirmar_teste:form.elements.confirmar_teste.checked,operacao:current.operation})});current={reference:data.reference,operation:current.operation,uncertain:false};save();show(data);}catch(error){if(!error.uncertain){current=null;save();}message.textContent=error.message;}finally{busy=false;buttons();}
 };
 try{const data=await api('/api/assinaturas/status?teste=zapsign');active=Boolean(data.active);status.textContent=data.message||'Consulte a configuração do sandbox.';buttons();if(current?.reference&&active)await inspect();else if(current)message.textContent='Há uma solicitação anterior sem confirmação. Confira o painel sandbox antes de criar outro teste.';}catch(error){status.textContent=error.message;buttons();}
}
