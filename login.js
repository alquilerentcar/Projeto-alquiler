import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const db = createClient('https://xtelzwclrzzlsqjecscl.supabase.co', 'sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
const AUTHORIZED_EMAIL = 'alquilerentcar@gmail.com';
const COMPANY_CNPJ = '54135275000161';
const COMPANY_USER = 'saugusto';
const form = document.querySelector('#system-login-form');
const message = document.querySelector('#login-message');
const button = document.querySelector('#system-login-button');
const requested = new URLSearchParams(location.search).get('next') || 'modulos.html';
const allowed = ['modulos.html','dashboard.html','notificacoes.html','empresa.html','clientes.html','fornecedores.html','carros.html','modelos-contrato.html','certificados.html','locacoes.html','contratos.html','alteracoes.html','recibos.html','distratos.html','financeiro.html'];
const next = allowed.includes(requested) ? requested : 'modulos.html';
const rememberedCompany = localStorage.getItem('bgsys:empresa-cnpj');
if (rememberedCompany) form.elements.cnpj.value = rememberedCompany;
const { data } = await db.auth.getSession();
if (data?.session?.user?.email?.toLowerCase() === AUTHORIZED_EMAIL) location.replace(next);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const cnpj = form.elements.cnpj.value.replace(/\D/g, '');
  const usuario = form.elements.usuario.value.trim().toLowerCase();
  if (cnpj !== COMPANY_CNPJ || usuario !== COMPANY_USER) { message.textContent = 'Empresa ou usuário não encontrado.'; return; }
  button.disabled = true; button.textContent = 'Entrando…'; message.textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: AUTHORIZED_EMAIL, password: form.elements.password.value });
  form.elements.password.value = '';
  if (error) { message.textContent = 'E-mail ou senha incorretos.'; button.disabled = false; button.textContent = 'Entrar'; return; }
  if (document.querySelector('#remember-company').checked) localStorage.setItem('bgsys:empresa-cnpj', cnpj);
  else localStorage.removeItem('bgsys:empresa-cnpj');
  location.replace(next);
});
