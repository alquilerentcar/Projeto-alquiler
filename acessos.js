import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
await requireAuth(db);bindLogout(db);
const control=document.body.dataset.accessView==='controle';
const $=s=>document.querySelector(s),cf=$('#company-form'),uf=$('#user-form');
let state,selected=null,busy=false,dirty=false;
if(!control){$('#new-company').hidden=true;$('.company-list').hidden=true;cf.closest('.panel').hidden=true;$('#open-company').hidden=true;$('#access-content').style.gridTemplateColumns='minmax(0,1fr)';}
const message=text=>{$('#access-message').textContent=text;};
const node=(tag,text,className)=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
async function api(body) {
  const response=await fetch(control?'/api/controle':'/api/acessos',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível concluir a operação.');return data;
}
function licenseStatus(company) {
  if(!company.ativa||!company.licenca_ativa)return 'Suspensa';
  return company.licenca_ate&&company.licenca_ate<new Date().toISOString().slice(0,10)?'Vencida':'Ativa';
}
function licensedCodes(id) {return state.modulos.filter(m=>m.disponivel&&state.licencas.some(l=>l.empresa_id===id&&l.modulo_id===m.id&&l.ativo)).map(m=>m.codigo);}
function checks(target,codes,allowed) {
  const root=$(target);root.replaceChildren();
  for(const m of state.modulos) {const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=m.codigo;input.checked=codes.includes(m.codigo);input.disabled=!m.disponivel||(allowed&&!allowed.includes(m.codigo));label.append(input,node('span',m.nome+(!m.disponivel?' · Em breve':'')));root.append(label);}
}
const checked=target=>[...document.querySelectorAll(target+' input:checked:not(:disabled)')].map(input=>input.value);
function companyList() {
  const q=$('#company-search').value.toLocaleLowerCase('pt-BR').trim();const list=$('#company-list');list.replaceChildren();
  const companies=state.empresas.filter(c=>`${c.nome_fantasia} ${c.razao_social} ${c.cnpj}`.toLocaleLowerCase('pt-BR').includes(q));
  for(const company of companies) {
    const b=node('button','','company-choice');b.type='button';b.setAttribute('aria-current',String(company.id===selected));
    const status=licenseStatus(company);b.append(node('strong',company.nome_fantasia),node('small',company.cnpj),node('span',status,'access-badge'+(status==='Ativa'?'':' blocked')));
    b.onclick=()=>{if(busy)return;if(dirty&&!confirm('Descartar alterações não salvas desta empresa?'))return;selectCompany(company.id);};list.append(b);
  }
  $('#company-empty').hidden=companies.length>0;
}
function selectCompany(id) {
  selected=id;dirty=false;const company=state.empresas.find(c=>c.id===id);cf.reset();
  $('#selected-name').textContent=company?.nome_fantasia||'Nova empresa';$('#selected-cnpj').textContent=company?.cnpj||'Cadastre uma empresa cliente e libere seus módulos.';
  $('#open-company').hidden=!control||!company;$('#new-user').disabled=!company||!state.criacao_contas_configurada;
  for(const key of ['id','nome_fantasia','razao_social','cnpj','email','licenca_ate'])cf.elements[key].value=company?.[key]||'';
  cf.elements.licenca_ativa.value=String(company?.licenca_ativa??true);
  checks('#company-modules',licensedCodes(id));companyList();renderUsers();
}
function renderUsers() {
  const root=$('#access-users');root.replaceChildren();const users=state.usuarios.filter(u=>u.empresa_id===selected);
  for(const user of users) {
    const tr=document.createElement('tr'),identity=node('td',user.nome);identity.append(node('small',user.email||user.usuario));tr.append(identity,node('td',user.administrador?'Administrador da empresa':'Operador'));
    const permitted=state.modulos.filter(m=>state.permissoes.some(p=>p.usuario_empresa_id===user.id&&p.modulo_id===m.id&&p.pode_visualizar));
    tr.append(node('td',permitted.map(m=>m.nome+(licensedCodes(selected).includes(m.codigo)?'':' (sem licença)')).join(', ')||'Nenhum'),node('td',user.ativo?'Ativo':'Suspenso'));
    const td=document.createElement('td'),b=node('button','Editar acesso','btn btn-quiet');b.onclick=()=>openUser(user);td.append(b);const reset=node('button','Redefinir senha','btn btn-quiet'),remove=node('button','Excluir acesso','btn btn-quiet');reset.onclick=()=>resetUser(user);remove.onclick=()=>removeUser(user);const emailButton=node('button','Alterar e-mail','btn btn-quiet');emailButton.onclick=()=>openEmail(user);td.append(emailButton,reset,remove);tr.append(td);root.append(tr);
  }
  if(!users.length){const tr=document.createElement('tr'),td=node('td',selected?'Nenhum usuário cadastrado.':'Salve a empresa para cadastrar usuários.');td.colSpan=5;tr.append(td);root.append(tr);}
}
function openUser(user=null) {
  if(busy)return;uf.reset();$('#user-message').textContent='';$('#user-dialog-title').textContent=user?'Editar acesso':'Novo usuário';
  for(const key of ['id','nome','usuario','email','cargo'])uf.elements[key].value=user?.[key]||'';
  uf.elements.administrador.value=String(user?.administrador??false);uf.elements.ativo.value=String(user?.ativo??true);
  uf.elements.email.readOnly=Boolean(user);uf.elements.password.required=!user;uf.elements.password.disabled=Boolean(user);$('#password-label').hidden=Boolean(user);
  const codes=user?state.modulos.filter(m=>state.permissoes.some(p=>p.usuario_empresa_id===user.id&&p.modulo_id===m.id&&p.pode_visualizar)).map(m=>m.codigo):[];
  checks('#user-modules',codes,licensedCodes(selected));$('#user-dialog').showModal();
}
function lock(value){busy=value;document.querySelectorAll('#company-form button,#new-company,#user-form button,#new-user').forEach(b=>{b.disabled=value;});if(!value)$('#new-user').disabled=!selected||!state.criacao_contas_configurada;}
async function reload(id=selected){state=await api();$('#access-content').hidden=false;$('#setup-notice').hidden=state.criacao_contas_configurada;$('#new-company').disabled=false;selectCompany(id&&state.empresas.some(e=>e.id===id)?id:state.empresas[0]?.id||null);}
cf.addEventListener('input',()=>{dirty=true;});
cf.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;lock(true);message('Salvando empresa e licença…');
  const empresa=Object.fromEntries(new FormData(cf));empresa.licenca_ativa=empresa.licenca_ativa==='true';empresa.id=empresa.id||null;
  try{const id=await api({action:'empresa',empresa,modulos:checked('#company-modules')});dirty=false;try{await reload(id);message('Empresa e licença salvas.');}catch{message('Empresa salva. Atualize a página para recarregar a lista.');}}
  catch(error){message(error.message);}finally{lock(false);}
});
uf.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;lock(true);$('#user-message').textContent='Salvando…';
  const usuario=Object.fromEntries(new FormData(uf)),password=usuario.password;delete usuario.password;
  usuario.empresa_id=selected;usuario.administrador=usuario.administrador==='true';usuario.ativo=usuario.ativo==='true';
  try{await api({action:usuario.id?'usuario_editar':'usuario_criar',usuario,password,modulos:checked('#user-modules')});$('#user-dialog').close();try{await reload();message('Acesso salvo. O usuário entra com e-mail e senha.');}catch{message('Acesso salvo. Atualize a página para recarregar a lista.');}}
  catch(error){$('#user-message').textContent=error.message;}finally{uf.elements.password.value='';lock(false);}
});
$('#new-company').onclick=()=>{if(!control)return;if(dirty&&!confirm('Descartar alterações não salvas?'))return;selectCompany(null);cf.elements.nome_fantasia.focus();};
$('#new-user').onclick=()=>openUser();$('#close-user').onclick=()=>{$('#user-dialog').close();uf.elements.password.value='';};
$('#user-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();else uf.elements.password.value='';});
$('#company-search').oninput=companyList;
$('#open-company').onclick=()=>{sessionStorage.setItem('bgsys:empresa-id',selected);location.href='modulos.html?entrar=1';};
try{await reload();message('');}catch(error){message(error.message);}

async function resetUser(user){if(busy)return;if(!user.email)return message('Este usuário não possui e-mail cadastrado.');if(!confirm('Enviar link de redefinição de senha para '+user.email+'?'))return;lock(true);try{const {error}=await db.auth.resetPasswordForEmail(user.email,{redirectTo:new URL('/redefinir-senha.html',location.origin).href});if(error)throw error;message('Solicitação de redefinição enviada. Peça ao usuário para verificar o e-mail e o spam.');}catch(error){message(error.message);}finally{lock(false);}}
async function removeUser(user){if(busy)return;if(!confirm('Excluir o acesso de '+user.nome+' a esta empresa? A conta de login, o histórico e os acessos a outras empresas serão preservados.'))return;lock(true);try{await api({action:'usuario_excluir',usuario:{id:user.id,empresa_id:selected}});await reload();message('Acesso à empresa excluído. A conta de login foi preservada. Para recuperar o mesmo usuário, solicite a vinculação à BG SYSTEMS.');}catch(error){message(error.message);}finally{lock(false);}}

const emailDialog=document.createElement('dialog');emailDialog.className='access-dialog';
emailDialog.innerHTML='<form id="email-form"><h2>Alterar e-mail de acesso</h2><p id="email-user"></p><p>O novo endereço será usado no login e na recuperação de senha. Confira o endereço com o usuário antes de salvar.</p><label>Novo e-mail<input name="email" type="email" required maxlength="254" autocomplete="off"></label><p id="email-message" role="status"></p><button class="btn btn-primary" type="submit">Salvar e-mail</button> <button class="btn btn-quiet" type="button" id="email-close">Cancelar</button></form>';
document.body.append(emailDialog);let emailUser=null,emailBusy=false;
function openEmail(user){if(busy||emailBusy)return;emailUser=user;emailDialog.querySelector('#email-user').textContent=user.nome+' · '+user.email;emailDialog.querySelector('input').value=user.email||'';emailDialog.querySelector('#email-message').textContent='';emailDialog.showModal();}
emailDialog.querySelector('#email-close').onclick=()=>{if(!emailBusy)emailDialog.close();};
emailDialog.addEventListener('cancel',event=>{if(emailBusy)event.preventDefault();});
emailDialog.querySelector('form').onsubmit=async event=>{event.preventDefault();if(emailBusy||!emailUser)return;const input=emailDialog.querySelector('input'),msg=emailDialog.querySelector('#email-message'),email=input.value.trim().toLowerCase();if(email===String(emailUser.email||'').toLowerCase()){msg.textContent='Informe um e-mail diferente do atual.';return;}emailBusy=true;emailDialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);msg.textContent='Salvando e-mail…';try{await api({action:'usuario_email',usuario:{id:emailUser.id,empresa_id:emailUser.empresa_id},email});emailDialog.close();try{await reload();message('E-mail atualizado. O usuário deve entrar com o novo endereço.');}catch{message('E-mail atualizado. Recarregue a página para atualizar a lista.');}}catch(error){msg.textContent=error.message;}finally{emailBusy=false;emailDialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}};
