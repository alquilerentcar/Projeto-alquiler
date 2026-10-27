// Runs in the document head, before content is painted. No permissions are cached.
(function(){
 const root=document.documentElement,colors={cor_primaria:['--company-primary','--company-on-primary','#2864da'],cor_sidebar:['--company-sidebar','--company-on-sidebar','#111e32'],cor_fundo:['--company-background','--company-on-background','#f5f7fb'],cor_paineis:['--company-surface','--company-on-surface','#ffffff']};
 function apply(c){for(const [key,[bg,fg,fallback]]of Object.entries(colors)){const value=/^#[0-9a-f]{6}$/i.test(c?.[key]||'')?c[key]:fallback;const lum=value.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);root.style.setProperty(bg,value);root.style.setProperty(fg,lum>.179?'#000000':'#ffffff');}}
 try{const id=sessionStorage.getItem('bgsys:empresa-id'),cached=JSON.parse(sessionStorage.getItem('bgsys:brand:'+id)||'null');if(cached?.id===id&&!location.pathname.replace(/\.html$/,'').endsWith('/controle'))apply(cached);}catch{}
 const style=document.createElement('style');style.textContent='html,body{background:var(--company-background,#f5f7fb)}html[data-shell-embedded] body{padding-top:0!important}html[data-shell-embedded] .sidebar,html[data-shell-embedded] .mobile-menu-toggle,html[data-shell-embedded] .mobile-menu-veil{display:none!important}html[data-shell-embedded] .app-shell{display:block!important;min-height:100dvh}html[data-shell-embedded] .main{margin:0!important;padding-top:24px!important}';document.head.append(style);
 const names=['dashboard','clientes','carros','fornecedores','modelos-contrato','certificados','frota','locacoes','contratos','contrato','assinaturas','registros','alteracoes','substituicao','recibos','distratos','documentos-modelo','financeiro','notificacoes','empresa','acessos','controle','perfil','historico','relatorios','locatario'];const leaf=location.pathname.split('/').pop().replace(/\.html$/,'');
 try{if(parent!==window&&parent.__grupoShell){root.dataset.shellEmbedded='true';if(['login','modulos','esqueci-senha','redefinir-senha'].includes(leaf)){parent.location.replace(location.pathname+location.search);return;}window.addEventListener('app-context-ready',e=>parent.bgShellContext?.(e.detail));new MutationObserver(()=>{for(const [bg,fg]of Object.values(colors))for(const name of [bg,fg]){const value=root.style.getPropertyValue(name);if(/^#[0-9a-f]{6}$/i.test(value))parent.document.documentElement.style.setProperty(name,value);}}).observe(root,{attributes:true,attributeFilter:['style']});document.addEventListener('click',e=>{if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const a=e.target.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;const url=new URL(a.href,location.href),key=url.pathname.split('/').pop().replace(/\.html$/,'');if(url.origin===location.origin&&names.includes(key)){e.preventDefault();parent.bgShellNavigate?.(url.href);}else if(url.origin===location.origin&&['login','modulos'].includes(key)){e.preventDefault();parent.location.assign(url.href);}});}
 else if(!window.__grupoShell&&names.includes(leaf)&&!new URLSearchParams(location.search).has('standalone')){const destination=location.pathname+location.search+location.hash;let interacted=false;const touch=()=>{interacted=true;};document.addEventListener('pointerdown',touch,{once:true,passive:true});document.addEventListener('keydown',touch,{once:true});fetch('/app',{method:'HEAD',cache:'no-store'}).then(response=>{if(response.ok&&(response.headers.get('Content-Type')||'').includes('text/html')&&!interacted)location.replace('/app?rota='+encodeURIComponent(destination));}).catch(()=>{});}
 }catch{}
})();

// Shared browser identity and canonical URLs. Existing bookmarks remain valid.
(function(){
 const pages={historico:'/historico',frota:'/locacao/frota',login:'/login',modulos:'/modulos',perfil:'/conta/perfil','esqueci-senha':'/conta/esqueci-senha','redefinir-senha':'/conta/redefinir-senha',controle:'/controle',acessos:'/administracao/acessos',empresa:'/administracao/empresa',dashboard:'/locacao/dashboard',clientes:'/cadastros/clientes',carros:'/cadastros/carros',fornecedores:'/cadastros/fornecedores','modelos-contrato':'/cadastros/modelos-contrato',certificados:'/cadastros/certificados',locacoes:'/locacao/locacoes',contratos:'/locacao/contratos',contrato:'/locacao/contrato',assinaturas:'/locacao/assinaturas',registros:'/locacao/registros',alteracoes:'/locacao/alteracoes',recibos:'/locacao/recibos',distratos:'/locacao/distratos','documentos-modelo':'/locacao/documentos-modelo',financeiro:'/financeiro',notificacoes:'/notificacoes'};
 const name=location.pathname.split('/').pop().replace(/\.html$/,'');
 if(pages[name]&&location.pathname!==pages[name])history.replaceState(null,'',pages[name]+location.search+location.hash);
 function identity(context){const company=location.pathname.replace(/\.html$/,'').endsWith('/controle')?'Grupo Alquiler':context?.company?.nome_fantasia;document.title=(company||'Grupo Alquiler')+' · Sistema de gestão';}
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

(function(){
 const prefix='bgsys:list:',inflight=new Map();let revision=0,channel=null;try{if(typeof BroadcastChannel==='function')channel=new BroadcastChannel('grupo-alquiler-cache-v1');}catch{}
 function clear(broadcast=true){window.dispatchEvent(new CustomEvent('bg-cache-invalidated'));revision++;inflight.clear();try{Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).forEach(k=>sessionStorage.removeItem(k));}catch{}if(broadcast)try{channel?.postMessage({type:'invalidate'});}catch{}}
 if(channel)channel.onmessage=e=>{if(e.data?.type==='invalidate')clear(false);};window.addEventListener('pagehide',event=>{if(!event.persisted)channel?.close();});
 window.bgClearListCache=()=>clear();
 window.bgLoadList=async(name,query,force=false)=>{const user=window.bgCacheIdentity,company=window.alquilerContext?.company?.id,key=user&&company?prefix+user+':'+company+':'+name:null;if(!key)return query();if(!force){try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&Array.isArray(saved.data)&&Date.now()-saved.time<60000)return {data:saved.data,error:null};}catch{}if(inflight.has(key))return inflight.get(key);}else{revision++;inflight.delete(key);}const version=revision;const task=Promise.resolve().then(query).then(result=>{if(version===revision&&!result.error&&Array.isArray(result.data))try{sessionStorage.setItem(key,JSON.stringify({time:Date.now(),data:result.data}));}catch{}return result;}).finally(()=>{if(inflight.get(key)===task)inflight.delete(key);});inflight.set(key,task);return task;};
 let pending=0,initial=true,indicator;function paint(){if(indicator)indicator.hidden=!initial&&!pending;}
 document.addEventListener('DOMContentLoaded',()=>{indicator=document.createElement('div');indicator.className='bg-loading-indicator';indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');indicator.textContent='Carregando…';document.body.append(indicator);paint();});window.addEventListener('load',()=>{initial=false;paint();});window.addEventListener('pageshow',()=>{initial=false;paint();});
 const reads=new Set(['acessos_contexto','modelos_documentos_menu','modelos_documentos_publicados','modelo_contrato_vigente','frota_painel','cliente_debitos_painel','financeiro_baixa_disponivel','substituicao_configuracao','substituicao_limite_fotos']);const original=window.fetch.bind(window);window.bgPerformance=[];
 window.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href),method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase(),database=url.hostname.endsWith('.supabase.co')&&url.pathname.startsWith('/rest/v1/'),api=url.origin===location.origin&&url.pathname.startsWith('/api/'),readRpc=database&&url.pathname.startsWith('/rest/v1/rpc/')&&reads.has(url.pathname.split('/').pop());const mutation=!['GET','HEAD'].includes(method)&&(database||api)&&!readRpc;if(mutation)clear();const track=(database||api)&&!url.pathname.startsWith('/api/assistente/');if(track)pending++;paint();const start=performance.now();try{const result=await original(input,init);if(mutation&&result.ok)clear();if(database||api){window.bgPerformance.push({operation:url.pathname,method,durationMs:Math.round(performance.now()-start),status:result.status});if(window.bgPerformance.length>100)window.bgPerformance.shift();}return result;}finally{if(track)pending--;paint();}};
})();


// Reveal only the password currently typed in this field.
(function(){
 const processed=new WeakSet();
 function decorate(root=document){
  for(const input of root.querySelectorAll('input[type="password"]')){
   if(processed.has(input))continue;processed.add(input);
   const button=document.createElement('button');button.type='button';button.className='password-visibility';button.textContent='Mostrar senha';button.setAttribute('aria-pressed','false');
   if(!input.id)input.id='password-field-'+crypto.randomUUID();button.setAttribute('aria-controls',input.id);
   button.addEventListener('click',event=>{event.preventDefault();const reveal=input.type==='password';input.type=reveal?'text':'password';button.textContent=reveal?'Ocultar senha':'Mostrar senha';button.setAttribute('aria-pressed',String(reveal));});
   input.insertAdjacentElement('afterend',button);
   input.form?.addEventListener('reset',()=>{input.type='password';button.textContent='Mostrar senha';button.setAttribute('aria-pressed','false');});
  }
 }
 document.addEventListener('DOMContentLoaded',()=>{decorate();new MutationObserver(()=>decorate()).observe(document.body,{childList:true,subtree:true});});
})();
