const currentPage=location.pathname.split('/').pop()||'dashboard.html'; const page=currentPage.includes('.')?currentPage:currentPage+'.html';
const section=new URLSearchParams(location.search).get('secao')||'';
let cachedCompany={nome_fantasia:'BG SYSTEMS'},cachedUser={nome:'Usuário'};
try {const selected=sessionStorage.getItem('bgsys:empresa-id'),cached=JSON.parse(sessionStorage.getItem('bgsys:brand:'+selected)||'null');if(page!=='controle.html'&&cached?.id===selected)cachedCompany=cached;}catch{}
function applyBrand(company){
 document.querySelectorAll('.global-company').forEach(n=>n.textContent=company.nome_fantasia||'BG SYSTEMS');
 document.querySelectorAll('.brand-mark').forEach(n=>{const logo=String(company.logo_url||'');n.textContent=logo?'':(company.nome_fantasia||'BG').charAt(0).toUpperCase();n.classList.toggle('has-company-logo',Boolean(logo));n.style.backgroundImage=logo?'url('+JSON.stringify(logo)+')':'';});
 for(const [field,variable,fallback] of [['cor_sidebar','--company-sidebar','#111e32'],['cor_fundo','--company-background','#f5f7fb']]){const value=/^#[0-9a-f]{6}$/i.test(company[field]||'')?company[field]:fallback;document.documentElement.style.setProperty(variable,value);const c=value.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);const lum=c.reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);document.documentElement.style.setProperty(field==='cor_sidebar'?'--company-on-sidebar':'--company-on-background',lum>.179?'#000000':'#ffffff');}
 if(/^#[0-9a-f]{6}$/i.test(company.cor_primaria||''))document.documentElement.style.setProperty('--company-primary',company.cor_primaria);
 if(['#000000','#ffffff'].includes(company.on_primary))document.documentElement.style.setProperty('--company-on-primary',company.on_primary);
}
const safe=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cachedLogo="";
const cachedLogoClass=cachedCompany.logo_url?' has-company-logo':'';
const active=href=>page===href?' active':'';
const financeActive=name=>page==='financeiro.html'&&section===name?' active':'';
const groupOpen=pages=>pages.includes(page)?' open':'';
const icon=(symbol)=>`<span class="menu-symbol" aria-hidden="true">${symbol}</span>`;
const menu=`
  <div class="sidebar-brand"><div class="brand-mark${cachedLogoClass}"${cachedLogo}>${cachedCompany.logo_url?'':safe(cachedCompany.nome_fantasia).charAt(0).toUpperCase()}</div><div><strong class="global-company">${safe(cachedCompany.nome_fantasia)}</strong><small>BG SYS</small></div></div>
  <nav class="professional-menu" aria-label="Menu principal">
    <a class="menu-link${active('dashboard.html')}" href="dashboard.html">${icon('⌂')}<span>Dashboard</span></a>
    <a class="menu-link${active('notificacoes.html')}" href="notificacoes.html">${icon('◉')}<span>Notificações</span><b class="menu-count">0</b></a>
    <details${groupOpen(['clientes.html','carros.html','modelos-contrato.html','certificados.html'])}><summary>${icon('▦')}<span>Cadastros</span></summary><div class="menu-children">
      <a class="menu-link${active('clientes.html')}" href="clientes.html">Clientes</a><a class="menu-link${active('carros.html')}" href="carros.html">Veículos</a><a class="menu-link${active('modelos-contrato.html')}" href="modelos-contrato.html">Modelos de documentos</a><a class="menu-link${active('certificados.html')}" href="certificados.html">Certificados digitais</a>
    </div></details>
    <details${groupOpen(['assinaturas.html','locacoes.html','contratos.html','alteracoes.html','recibos.html','distratos.html'])}><summary>${icon('▤')}<span>Locação</span></summary><div class="menu-children">
      <a class="menu-link${active('locacoes.html')}" href="locacoes.html">Locações</a><a class="menu-link${active('contratos.html')}" href="contratos.html">Contratos</a><a class="menu-link${active('assinaturas.html')}" href="assinaturas.html">Assinaturas</a><a class="menu-link${active('alteracoes.html')}" href="alteracoes.html">Alterações de veículo</a><a class="menu-link${active('recibos.html')}" href="recibos.html">Recibos</a><a class="menu-link${active('distratos.html')}" href="distratos.html">Distratos</a>
    </div></details>
    <details${groupOpen(['financeiro.html'])}><summary>${icon('R$')}<span>Financeiro</span></summary><div class="menu-children finance-menu">
      <a class="menu-link${page==='financeiro.html'&&!section?' active':''}" href="financeiro.html">Visão geral</a>
      <a class="menu-link${financeActive('contas-pagar')}" href="financeiro.html?secao=contas-pagar">Contas a pagar</a>
      <a class="menu-link${financeActive('contas-receber')}" href="financeiro.html?secao=contas-receber">Contas a receber</a>
      <a class="menu-link${financeActive('extrato')}" href="financeiro.html?secao=extrato">Extrato</a>
      <a class="menu-link${financeActive('dre')}" href="financeiro.html?secao=dre">DRE gerencial</a>
      <a class="menu-link${financeActive('fluxo-caixa')}" href="financeiro.html?secao=fluxo-caixa">Fluxo de caixa</a>
      <a class="menu-link${financeActive('conciliacao')}" href="financeiro.html?secao=conciliacao">Conciliação</a>
      <a class="menu-link${financeActive('contas-bancarias')}" href="financeiro.html?secao=contas-bancarias">Contas bancárias</a>
      <span class="menu-subtitle">PARÂMETROS</span>
      <a class="menu-link${financeActive('categorias')}" href="financeiro.html?secao=categorias">Categorias</a>
      <a class="menu-link${financeActive('meios-pagamento')}" href="financeiro.html?secao=meios-pagamento">Meios de pagamento</a>
      <a class="menu-link${financeActive('centros-custo')}" href="financeiro.html?secao=centros-custo">Centros de custos</a>
      <a class="menu-link${financeActive('condicoes-pagamento')}" href="financeiro.html?secao=condicoes-pagamento">Condições de pagamento</a>
      <span class="menu-subtitle">ANÁLISES</span>
      <a class="menu-link${financeActive('relatorios')}" href="financeiro.html?secao=relatorios">Relatórios</a>
    </div></details>
    <details hidden data-company-admin${groupOpen(['empresa.html','acessos.html'])}><summary>${icon('⚙')}<span>Administração</span></summary><div class="menu-children"><a class="menu-link${active('empresa.html')}" href="empresa.html">Empresa</a><a class="menu-link${active('acessos.html')}" href="acessos.html">Acessos / Usuários</a></div></details>
    <a hidden data-admin-only class="menu-link${active('controle.html')}" href="controle.html">${icon('BG')}<span>Controle · BG SYSTEMS</span></a>
    <a class="menu-link${active('perfil.html')}" href="perfil.html">${icon('◉')}<span>Meu perfil</span></a>
    <a class="menu-link" href="modulos.html">← Empresas e módulos</a>
  </nav>
  <div class="sidebar-bottom"><span class="online-dot"></span><div class="sidebar-user"><strong class="global-user">${safe(cachedUser.nome)}</strong><small>Conectado</small></div><button class="logout global-logout" type="button">Sair</button></div>`;
document.querySelectorAll('.sidebar').forEach(sidebar=>{sidebar.innerHTML=menu});applyBrand(cachedCompany);

const applyAccess=context=>{
document.querySelectorAll('[data-document-model]').forEach(n=>n.remove());const host=document.querySelector('.professional-menu a[href="locacoes.html"]')?.parentElement;
if(host&&page!=='controle.html')for(const model of context.documentModels||[]){if(model.tipo==='contrato_locacao')continue;const link=document.createElement('a');link.dataset.documentModel=model.id;link.className='menu-link';link.textContent=model.nome;link.href='documentos-modelo.html?modelo='+encodeURIComponent(model.id);if(page==='documentos-modelo.html'&&new URLSearchParams(location.search).get('modelo')===model.id){link.classList.add('active');host.parentElement.open=true}host.append(link);}
applyBrand(page==='controle.html'?{nome_fantasia:'BG SYSTEMS',cor_primaria:'#2864da',on_primary:'#ffffff'}:context.company);document.querySelectorAll('.global-user').forEach(n=>n.textContent=context.user.nome);document.querySelectorAll('.professional-menu a[href]').forEach(a=>{const href=a.getAttribute('href');if(href==='controle.html'){a.hidden=!context.developer;return;}if(['empresa.html','acessos.html'].includes(href)){a.hidden=page==='controle.html'||!context.canManageCompany;return;}if(['modulos.html','perfil.html'].includes(href))return;const module='locacao';a.hidden=page==='controle.html'||!context.modules.includes(module);});document.querySelectorAll('.professional-menu details').forEach(d=>{d.hidden=![...d.querySelectorAll('a')].some(a=>!a.hidden);});};
window.addEventListener('app-context-ready',event=>applyAccess(event.detail));if(window.alquilerContext)applyAccess(window.alquilerContext);
