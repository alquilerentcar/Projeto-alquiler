const currentPage=location.pathname.split('/').pop()||'dashboard.html'; const page=currentPage.includes('.')?currentPage:currentPage+'.html';
const section=new URLSearchParams(location.search).get('secao')||'';
let cachedCompany={nome_fantasia:'BG SYSTEMS'},cachedUser={nome:''};
// Display-only identity, isolated by the signed-in account and selected company.
try{const session=JSON.parse(localStorage.getItem('sb-xtelzwclrzzlsqjecscl-auth-token')||'null');const account=session?.user?.id,company=sessionStorage.getItem('bgsys:empresa-id');if(account&&company){const user=JSON.parse(sessionStorage.getItem('bgsys:menu-user:'+account+':'+company)||'null');if(typeof user?.nome==='string')cachedUser={nome:user.nome};}}catch{}
if(window.alquilerContext?.user?.nome)cachedUser={nome:window.alquilerContext.user.nome};
try {const selected=sessionStorage.getItem('bgsys:empresa-id'),cached=JSON.parse(sessionStorage.getItem('bgsys:brand:'+selected)||'null');if(page!=='controle.html'&&cached?.id===selected)cachedCompany=cached;}catch{}
function applyBrand(company){
 document.querySelectorAll('.global-company').forEach(n=>n.textContent=company.nome_fantasia||'BG SYSTEMS');
 document.querySelectorAll('.brand-mark').forEach(n=>{const logo=String(company.logo_url||'');n.textContent=logo?'':(company.nome_fantasia||'BG').charAt(0).toUpperCase();n.classList.toggle('has-company-logo',Boolean(logo));n.style.backgroundImage=logo?'url('+JSON.stringify(logo)+')':'';});
 for(const [field,variable,fallback] of [['cor_sidebar','--company-sidebar','#111e32'],['cor_fundo','--company-background','#f5f7fb'],['cor_paineis','--company-surface','#ffffff']]){const value=/^#[0-9a-f]{6}$/i.test(company[field]||'')?company[field]:fallback;document.documentElement.style.setProperty(variable,value);const c=value.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);const lum=c.reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);document.documentElement.style.setProperty(field==='cor_sidebar'?'--company-on-sidebar':field==='cor_paineis'?'--company-on-surface':'--company-on-background',lum>.179?'#000000':'#ffffff');}
 if(/^#[0-9a-f]{6}$/i.test(company.cor_primaria||''))document.documentElement.style.setProperty('--company-primary',company.cor_primaria);
 if(['#000000','#ffffff'].includes(company.on_primary))document.documentElement.style.setProperty('--company-on-primary',company.on_primary);
}
const safe=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cachedLogo="";
const cachedLogoClass=cachedCompany.logo_url?' has-company-logo':'';
const active=href=>page===href?' active':'';
const financeActive=name=>page==='financeiro.html'&&section===name?' active':'';
const groupOpen=pages=>pages.includes(page)?' open':'';
const menuIconPaths={"⌂":"M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7","◉":"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4","▦":"M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z","▣":"M4 16h16l-2-8H6zM4 16v4M20 16v4M7 12h10M7 8l1-4h8l1 4","▤":"M8 3H5v18h14V3h-3M8 3v4h8V3zM8 12h8M8 16h5","▧":"M14 2H4v20h16V8zM14 2v6h6M8 12h8M8 16h8","✎":"m4 16 12-12 4 4-12 12-5 1zM14 6l4 4","R$":"M3 5h18v14H3zM7 9h.01M17 15h.01M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0","⚙":"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2","BG":"M12 3 3 7v6c0 4 9 8 9 8s9-4 9-8V7zM8 12l3 3 5-6"};
const icon=symbol=>'<span class="menu-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(menuIconPaths[symbol]||menuIconPaths['▦'])+'"/></svg></span>';
const menu=`
  <div class="sidebar-brand"><div class="brand-mark${cachedLogoClass}"${cachedLogo}>${cachedCompany.logo_url?'':safe(cachedCompany.nome_fantasia).charAt(0).toUpperCase()}</div><div><strong class="global-company">${safe(cachedCompany.nome_fantasia)}</strong><small>GESTÃO DA EMPRESA</small></div></div>
  <nav class="professional-menu" aria-label="Menu principal"><span class="menu-section-label">VISÃO GERAL</span>
    <a class="menu-link${active('dashboard.html')}" href="dashboard.html">${icon('⌂')}<span>Dashboard</span></a>
    <a class="menu-link${active('notificacoes.html')}" href="notificacoes.html">${icon('◉')}<span>Notificações</span><b class="menu-count">0</b></a>
    <span class="menu-section-label">OPERAÇÃO</span>
    <details${groupOpen(['clientes.html','carros.html','modelos-contrato.html','certificados.html'])}><summary>${icon('▦')}<span>Cadastros</span></summary><div class="menu-children">
      <a class="menu-link${active('clientes.html')}" href="clientes.html">Clientes</a><a class="menu-link${active('carros.html')}" href="carros.html">Veículos</a><a class="menu-link${active('modelos-contrato.html')}" href="modelos-contrato.html">Modelos de documentos</a><a class="menu-link${active('certificados.html')}" href="certificados.html">Certificados digitais</a>
    </div></details>
    <a class="menu-link${active('frota.html')}" href="frota.html">${icon('▣')}<span>Frota e diárias</span></a>
    <a class="menu-link${active('locacoes.html')}" href="locacoes.html">${icon('▤')}<span>Locações</span></a>
    <details${groupOpen(['contratos.html','alteracoes.html','recibos.html','distratos.html'])}><summary>${icon('▧')}<span>Documentos</span></summary><div class="menu-children">
      <a class="menu-link${active('contratos.html')}" href="contratos.html">Contratos / Termos de locação</a><a class="menu-link${active('alteracoes.html')}" href="alteracoes.html">Alterações de veículo</a><a class="menu-link${active('recibos.html')}" href="recibos.html">Recibos</a><a class="menu-link${active('distratos.html')}" href="distratos.html">Distratos</a>
    </div></details>
    <a class="menu-link${active('assinaturas.html')}" href="assinaturas.html">${icon('✎')}<span>Assinaturas</span></a>
    <details${groupOpen(['financeiro.html'])}><summary>${icon('R$')}<span>Financeiro</span></summary><div class="menu-children finance-menu"><a class="menu-link${page==='financeiro.html'&&!section?' active':''}" href="financeiro.html">Entradas do dia</a><a class="menu-link${financeActive('contas-receber')}" href="financeiro.html?secao=contas-receber">Contas a receber</a><a class="menu-link${page==='financeiro.html'&&['recebidos','extrato'].includes(section)?' active':''}" href="financeiro.html?secao=recebidos">Recebimentos</a></div></details>
    <span class="menu-section-label">CONTA E ADMINISTRAÇÃO</span>
    <details hidden data-company-admin${groupOpen(['empresa.html','acessos.html'])}><summary>${icon('⚙')}<span>Administração</span></summary><div class="menu-children"><a class="menu-link${active('empresa.html')}" href="empresa.html">Empresa</a><a class="menu-link${active('acessos.html')}" href="acessos.html">Acessos / Usuários</a></div></details>
    <a hidden data-admin-only class="menu-link${active('controle.html')}" href="controle.html">${icon('BG')}<span>Controle · BG SYSTEMS</span></a>
    <a class="menu-link${active('perfil.html')}" href="perfil.html">${icon('◉')}<span>Meu perfil</span></a>
    <a class="menu-link" href="modulos.html">← Empresas e módulos</a>
  </nav>
  <div class="sidebar-bottom"><span class="online-dot"></span><div class="sidebar-user"><strong class="global-user">${safe(cachedUser.nome)}</strong><small>Conectado</small></div><button class="logout global-logout" type="button">Sair</button></div>`;
document.querySelectorAll('.sidebar').forEach(sidebar=>{sidebar.innerHTML=menu});applyBrand(cachedCompany);

let documentKindClassifier=null;
import('./document-kind.mjs').then(module=>{documentKindClassifier=module.documentKind;if(window.alquilerContext)applyAccess(window.alquilerContext);}).catch(()=>{});
const applyAccess=context=>{
document.querySelectorAll('[data-document-model]').forEach(n=>n.remove());const host=document.querySelector('.professional-menu a[href="contratos.html"]')?.parentElement;
if(host&&page!=='controle.html'&&documentKindClassifier)for(const model of context.documentModels||[]){if(model.tipo==='contrato_locacao'||(documentKindClassifier&&['recibos','alteracoes','distratos'].includes(documentKindClassifier(model))))continue;const link=document.createElement('a');link.dataset.documentModel=model.id;link.className='menu-link';link.textContent=model.nome;link.href='documentos-modelo.html?modelo='+encodeURIComponent(model.id);if(page==='documentos-modelo.html'&&new URLSearchParams(location.search).get('modelo')===model.id){link.classList.add('active');host.parentElement.open=true}host.append(link);}
applyBrand(page==='controle.html'?{nome_fantasia:'BG SYSTEMS',cor_primaria:'#2864da',on_primary:'#ffffff'}:context.company);document.querySelectorAll('.global-user').forEach(n=>n.textContent=context.user.nome);document.querySelectorAll('.professional-menu a[href]').forEach(a=>{const href=a.getAttribute('href');if(href==='controle.html'){a.hidden=!context.developer;return;}if(['empresa.html','acessos.html'].includes(href)){a.hidden=page==='controle.html'||!context.canManageCompany;return;}if(['modulos.html','perfil.html'].includes(href))return;const module='locacao';a.hidden=page==='controle.html'||!context.modules.includes(module);});document.querySelectorAll('.professional-menu .menu-link.active').forEach(a=>a.setAttribute('aria-current','page'));document.querySelectorAll('.professional-menu details').forEach(d=>{d.hidden=![...d.querySelectorAll('a')].some(a=>!a.hidden);});};
window.addEventListener('app-context-ready',event=>applyAccess(event.detail));if(window.alquilerContext)applyAccess(window.alquilerContext);

// Navegação compacta: o menu abre como painel no celular.
const mobileToggle=document.createElement('button');
mobileToggle.type='button';mobileToggle.className='mobile-menu-toggle';mobileToggle.setAttribute('aria-label','☰ Menu');
mobileToggle.innerHTML='<span aria-hidden="true">☰</span><span class="brand-mark mobile-brand-mark" aria-hidden="true">BG</span><span class="mobile-menu-identity"><strong class="global-company">BG SYSTEMS</strong><small class="global-user">'+safe(cachedUser.nome)+'</small></span>';
mobileToggle.setAttribute('aria-expanded','false');mobileToggle.setAttribute('aria-controls','app-sidebar');
const mobileSidebar=document.querySelector('.sidebar');if(mobileSidebar){mobileSidebar.id='app-sidebar';
const veil=document.createElement('button');veil.type='button';veil.className='mobile-menu-veil';veil.setAttribute('aria-label','Fechar menu');
function closeMobile(){document.body.classList.remove('mobile-menu-open');mobileToggle.setAttribute('aria-expanded','false');}
mobileToggle.onclick=()=>{const open=document.body.classList.toggle('mobile-menu-open');mobileToggle.setAttribute('aria-expanded',String(open));};
veil.onclick=closeMobile;document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMobile();});
document.body.prepend(mobileToggle,veil);applyBrand(page==='controle.html'?{nome_fantasia:'BG SYSTEMS'}:window.alquilerContext?.company||cachedCompany);if(window.alquilerContext?.user)document.querySelectorAll('.global-user').forEach(n=>n.textContent=window.alquilerContext.user.nome);mobileSidebar.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMobile));}
