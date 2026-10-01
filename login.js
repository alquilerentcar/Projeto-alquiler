import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {entryDestination} from './access-policy.js';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
const form=document.querySelector('#system-login-form'),message=document.querySelector('#login-message'),button=document.querySelector('#system-login-button');
form.addEventListener('submit',async event=>{
 event.preventDefault();if(button.disabled)return;button.disabled=true;message.textContent='Entrando…';
 try {
  const usuario=form.elements.usuario.value.trim().toLowerCase();
  let error;
  if(usuario.includes('@'))({error}=await db.auth.signInWithPassword({email:usuario,password:form.elements.password.value}));
  else {const response=await fetch('/api/login/usuario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario,password:form.elements.password.value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Usuário ou senha incorretos.');({error}=await db.auth.setSession(result));}
  if(error)throw new Error('E-mail/usuário ou senha incorretos.');
  sessionStorage.removeItem('bgsys:empresa-id');
  const {data:context,error:contextError}=await db.rpc('acessos_contexto',{p_empresa:null});
  if(contextError||context?.schemaVersion!==2)throw new Error('Atualização pendente: aplique etapa1_acessos.sql no Supabase.');
  if(context.accessDenied)throw new Error('Esta conta não possui vínculo ativo com uma empresa.');
  if(context.company?.id&&context.companies.length===1)sessionStorage.setItem('bgsys:empresa-id',context.company.id);
  localStorage.removeItem('bgsys:empresa-cache');localStorage.removeItem('bgsys:usuario-cache');localStorage.removeItem('bgsys:empresa-cnpj');
  location.replace(entryDestination(context));
 }catch(error){await db.auth.signOut();message.textContent=error.message||'Não foi possível entrar. Tente novamente.';}
 finally{form.elements.password.value='';button.disabled=false;}
});

const forgot=document.createElement('a');forgot.className='btn btn-quiet';forgot.textContent='Esqueci minha senha';forgot.href='esqueci-senha.html';form.append(forgot);
