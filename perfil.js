import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
await requireAuth(db);bindLogout(db);
const c=window.alquilerContext,form=document.querySelector('#password-form'),message=document.querySelector('#profile-message'),button=form.querySelector('button');
const {data,error}=await db.auth.getUser();
if(error||!data.user){button.disabled=true;message.textContent='Não foi possível consultar sua conta. Entre novamente.';}
else {
 for(const [label,value] of [['Nome',c.user.nome],['E-mail de acesso',data.user.email],['Identificação',c.user.usuario||'—'],['Empresa selecionada',c.company?.id?c.company.nome_fantasia:'Nenhuma empresa selecionada'],['Perfil',c.developer?'Desenvolvedor · BG SYSTEMS':c.user.administrador?'Administrador':'Operador'],['Módulos da empresa selecionada',c.modules.join(', ')||'Nenhum']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;document.querySelector('#profile-data').append(dt,dd);}
 form.onsubmit=async event=>{event.preventDefault();if(button.disabled)return;const password=form.elements.password.value;
  if(password.length<12||password.length>128||password!==form.elements.confirmation.value){message.textContent='Use de 12 a 128 caracteres e confirme a mesma senha.';return;}
  if(password===form.elements.current.value){message.textContent='Escolha uma senha diferente da atual.';return;}
  button.disabled=true;message.textContent='Verificando e atualizando sua senha…';
  try{const login=await db.auth.signInWithPassword({email:data.user.email,password:form.elements.current.value});if(login.error)throw new Error('Senha atual incorreta ou autenticação indisponível.');if(login.data.user?.id!==data.user.id){await db.auth.signOut();throw new Error('A conta mudou. Entre novamente.');}const result=await db.auth.updateUser({password});if(result.error)throw result.error;form.reset();await db.auth.signOut();location.replace('login.html');}
  catch(error){message.textContent=error.message;button.disabled=false;form.elements.current.value='';}
 };
}
