// Shared browser identity and canonical URLs. Existing bookmarks remain valid.
(function(){
 const pages={frota:'/locacao/frota',login:'/login',modulos:'/modulos',perfil:'/conta/perfil','esqueci-senha':'/conta/esqueci-senha','redefinir-senha':'/conta/redefinir-senha',controle:'/controle',acessos:'/administracao/acessos',empresa:'/administracao/empresa',dashboard:'/locacao/dashboard',clientes:'/cadastros/clientes',carros:'/cadastros/carros',fornecedores:'/cadastros/fornecedores','modelos-contrato':'/cadastros/modelos-contrato',certificados:'/cadastros/certificados',locacoes:'/locacao/locacoes',contratos:'/locacao/contratos',contrato:'/locacao/contrato',assinaturas:'/locacao/assinaturas',registros:'/locacao/registros',alteracoes:'/locacao/alteracoes',recibos:'/locacao/recibos',distratos:'/locacao/distratos','documentos-modelo':'/locacao/documentos-modelo',financeiro:'/financeiro',notificacoes:'/notificacoes'};
 const name=location.pathname.split('/').pop().replace(/\.html$/,'');
 if(pages[name]&&location.pathname!==pages[name])history.replaceState(null,'',pages[name]+location.search+location.hash);
 function identity(context){const company=name==='controle'?'BG SYSTEMS':context?.company?.nome_fantasia;document.title=(company||'BG SYSTEMS')+' · Sistema de gestão';}
 try{const selected=sessionStorage.getItem('bgsys:empresa-id');identity({company:JSON.parse(sessionStorage.getItem('bgsys:brand:'+selected)||'null')});}catch{identity();}
 window.addEventListener('app-context-ready',event=>identity(event.detail));
 // Search fields must not act as credential fields. Preserve login autocomplete.
 const guarded=new WeakSet(),prefix='busca-'+Math.random().toString(36).slice(2);
 let counter=0;
 function protectSearch(input){
  if(guarded.has(input))return;guarded.add(input);
  input.autocomplete='off';input.name=prefix+'-'+(++counter);input.readOnly=true;
  input.spellcheck=false;input.setAttribute('autocapitalize','off');input.setAttribute('autocorrect','off');
  input.setAttribute('data-lpignore','true');input.setAttribute('data-1p-ignore','true');input.setAttribute('data-bwignore','true');input.dataset.searchGuard='true';
  const clear=()=>{if(input.value){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}};
  clear();
  const unlock=event=>{if(event.isTrusted)input.readOnly=false;};
  input.addEventListener('pointerdown',unlock);input.addEventListener('touchstart',unlock,{passive:true});input.addEventListener('keydown',unlock);
  input.closest('label')?.addEventListener('pointerdown',unlock);
  input.addEventListener('blur',()=>{input.readOnly=true;});
  const autofilled=()=>{try{return input.matches(':autofill')||input.matches(':-webkit-autofill');}catch{return false;}};
  input.addEventListener('input',()=>{if(autofilled())clear();},true);
  input.addEventListener('change',()=>{if(autofilled())clear();},true);
  input.addEventListener('animationstart',event=>{if(event.animationName==='bg-search-autofill'){clear();input.readOnly=true;}});
 }
 function protectSearches(root=document){if(root.matches?.('input[type="search"]'))protectSearch(root);root.querySelectorAll?.('input[type="search"]').forEach(protectSearch);}
 document.addEventListener('DOMContentLoaded',()=>{protectSearches();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)protectSearches(node);}).observe(document.body,{childList:true,subtree:true});});
 window.addEventListener('pageshow',event=>{if(!event.persisted)return;document.querySelectorAll('input[type="search"]').forEach(input=>{if(input.value){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}input.readOnly=true;});});
 document.addEventListener('DOMContentLoaded',()=>{if(window.alquilerContext)identity(window.alquilerContext);else try{const selected=sessionStorage.getItem('bgsys:empresa-id');identity({company:JSON.parse(sessionStorage.getItem('bgsys:brand:'+selected)||'null')});}catch{identity();}document.querySelectorAll('input[type="search"]').forEach(input=>{input.autocomplete='off';input.setAttribute('data-lpignore','true');input.setAttribute('data-1p-ignore','true');input.setAttribute('autocapitalize','off');});});
})();

// Short-lived list cache, scoped to the authenticated account and company.
(function(){
 const prefix='bgsys:list:';
 window.bgClearListCache=()=>{try{Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).forEach(k=>sessionStorage.removeItem(k));}catch{}};
 window.bgLoadList=async(name,query,force=false)=>{
  const company=window.alquilerContext?.company?.id,user=window.bgCacheIdentity;
  const key=user&&company?prefix+user+':'+company+':'+name:null;
  if(key&&!force)try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.data)&&Date.now()-saved.time<60000)return {data:saved.data,error:null};}catch{}
  if(key)try{sessionStorage.removeItem(key);}catch{}
  const result=await query();
  if(key&&!result.error&&Array.isArray(result.data))try{sessionStorage.setItem(key,JSON.stringify({time:Date.now(),data:result.data}));}catch{}
  return result;
 };
 let pending=0,initial=true,indicator;
 function paint(){if(indicator)indicator.hidden=!initial&&!pending;}
 document.addEventListener('DOMContentLoaded',()=>{
  indicator=document.createElement('div');indicator.className='bg-loading-indicator';indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');indicator.textContent='Carregando…';document.body.append(indicator);paint();
 });
 window.addEventListener('load',()=>{initial=false;paint();});
 window.addEventListener('pageshow',()=>{initial=false;paint();});
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const database=url.hostname.endsWith('.supabase.co')&&url.pathname.startsWith('/rest/v1/');
  const api=url.origin===location.origin&&url.pathname.startsWith('/api/');
  if(!['GET','HEAD'].includes(method)&&(database||api))window.bgClearListCache();
  pending++;paint();
  try{return await original(input,init);}finally{pending--;paint();}
 };
})();
