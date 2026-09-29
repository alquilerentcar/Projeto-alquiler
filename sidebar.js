const page=location.pathname.split('/').pop()||'dashboard.html';
const section=new URLSearchParams(location.search).get('secao')||'';
let cachedCompany={nome_fantasia:'Alquiler Rent a Car'},cachedUser={nome:'STEPHANO AUGUSTO CHAVES COSTA'};
try{cachedCompany={...cachedCompany,...JSON.parse(localStorage.getItem('bgsys:empresa-cache')||'{}')}}catch{}
try{cachedUser={...cachedUser,...JSON.parse(localStorage.getItem('bgsys:usuario-cache')||'{}')}}catch{}
const safe=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cachedLogo=cachedCompany.logo_url?` style="background-image:url('${String(cachedCompany.logo_url).replace(/'/g,'%27')}')"`:'';
const cachedLogoClass=cachedCompany.logo_url?' has-company-logo':'';
const active=href=>page===href?' active':'';
const financeActive=name=>page==='financeiro.html'&&section===name?' active':'';
const groupOpen=pages=>pages.includes(page)?' open':'';
const icon=(symbol)=>`<span class="menu-symbol" aria-hidden="true">${symbol}</span>`;
const menu=`
  <div class="sidebar-brand"><div class="brand-mark${cachedLogoClass}"${cachedLogo}>${cachedCompany.logo_url?'':safe(cachedCompany.nome_fantasia).charAt(0).toUpperCase()}</div><div><strong class="global-company">${safe(cachedCompany.nome_fantasia)}</strong><small>Módulo Locação</small></div></div>
  <nav class="professional-menu" aria-label="Menu principal">
    <a class="menu-link${active('dashboard.html')}" href="dashboard.html">${icon('⌂')}<span>Dashboard</span></a>
    <a class="menu-link${active('notificacoes.html')}" href="notificacoes.html">${icon('◉')}<span>Notificações</span><b class="menu-count">0</b></a>
    <details${groupOpen(['empresa.html','clientes.html','fornecedores.html','carros.html','modelos-contrato.html','certificados.html'])}><summary>${icon('▦')}<span>Cadastros</span></summary><div class="menu-children">
      <a class="menu-link${active('empresa.html')}" href="empresa.html">Empresa</a><a class="menu-link${active('clientes.html')}" href="clientes.html">Clientes</a><a class="menu-link${active('fornecedores.html')}" href="fornecedores.html">Fornecedores</a><a class="menu-link${active('carros.html')}" href="carros.html">Veículos</a><a class="menu-link${active('modelos-contrato.html')}" href="modelos-contrato.html">Modelos de documentos</a><a class="menu-link${active('certificados.html')}" href="certificados.html">Certificados digitais</a>
    </div></details>
    <details${groupOpen(['locacoes.html','contratos.html','alteracoes.html','recibos.html','distratos.html'])}><summary>${icon('▤')}<span>Locação</span></summary><div class="menu-children">
      <a class="menu-link${active('locacoes.html')}" href="locacoes.html">Locações</a><a class="menu-link${active('contratos.html')}" href="contratos.html">Contratos</a><a class="menu-link${active('alteracoes.html')}" href="alteracoes.html">Alterações de veículo</a><a class="menu-link${active('recibos.html')}" href="recibos.html">Recibos</a><a class="menu-link${active('distratos.html')}" href="distratos.html">Distratos</a>
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
  </nav>
  <div class="sidebar-bottom"><span class="online-dot"></span><div class="sidebar-user"><strong class="global-user">${safe(cachedUser.nome)}</strong><small>Conectado</small></div><button class="logout global-logout" type="button">Sair</button></div>`;
document.querySelectorAll('.sidebar').forEach(sidebar=>{sidebar.innerHTML=menu});
