import {loadAppContext,renderAppContext} from './app-context.js';
import {canOpen,scopeClient} from './access-policy.js';
let resolveAuthenticatedClient;
const authenticatedClientReady=new Promise(resolve=>{resolveAuthenticatedClient=resolve;});
export function getAuthenticatedClient(){return authenticatedClientReady;}
export async function requireAuth(client) {
  const {data,error}=await client.auth.getSession();
  if(error||!data?.session) {location.replace('login.html');await new Promise(()=>{});}
  let context;
  try {context=await loadAppContext(client);} catch(error) {
    const main=document.querySelector('main')||document.body;
    main.replaceChildren();const title=document.createElement('h1'),message=document.createElement('p'),link=document.createElement('a');
    title.textContent='Configuração de acessos pendente';message.textContent=error.message;link.href='login.html';link.textContent='Voltar ao login';main.append(title,message,link);
    await new Promise(()=>{});
  }
  if(context.accessDenied) {await client.auth.signOut();location.replace('login.html');await new Promise(()=>{});}
  window.alquilerContext=context;
  if(!canOpen(context,location.pathname)) {location.replace('modulos.html?acesso=negado');await new Promise(()=>{});}
  scopeClient(client,context.company.id);
  renderAppContext(context);
  window.dispatchEvent(new CustomEvent('app-context-ready',{detail:context}));
  if(!window.bgAuthenticatedFetch) {
    window.bgAuthenticatedFetch=true;const original=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin===location.origin && url.pathname.startsWith('/api/')) {
        const {data}=await client.auth.getSession();const headers=new Headers(input instanceof Request?input.headers:init.headers);
        if(init.headers) new Headers(init.headers).forEach((v,k)=>headers.set(k,v));
        headers.set('Authorization',`Bearer ${data.session?.access_token||''}`);
        headers.set('X-Empresa-Id',window.alquilerContext.company.id||'');
        return original(input,{...init,headers});
      }
      return original(input,init);
    };
  }
  resolveAuthenticatedClient(client);
  return data.session;
}
export function bindLogout(client) {
  document.querySelectorAll('.global-logout').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;try{Object.keys(sessionStorage).filter(k=>k.startsWith('bgsys:brand:')).forEach(k=>sessionStorage.removeItem(k));}catch{}await client.auth.signOut();sessionStorage.removeItem('bgsys:empresa-id');
    localStorage.removeItem('bgsys:empresa-cache');localStorage.removeItem('bgsys:usuario-cache');location.replace('login.html');
  }));
}
