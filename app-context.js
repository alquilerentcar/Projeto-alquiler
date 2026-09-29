export const CURRENT_COMPANY = {
  cnpj: '54135275000161',
  razao_social: 'ALQUILER RENT A CAR LTDA',
  nome_fantasia: 'Alquiler Rent a Car'
};

export async function loadAppContext(client, session) {
  let cachedCompany = {};
  try { cachedCompany = JSON.parse(localStorage.getItem('bgsys:empresa-cache') || '{}'); } catch {}
  const fallback = {
    company: { ...CURRENT_COMPANY, ...cachedCompany },
    user: {
      nome: session?.user?.user_metadata?.name || 'STEPHANO AUGUSTO CHAVES COSTA',
      usuario: 'SAUGUSTO',
      administrador: String(session?.user?.email||'').toLowerCase()==='alquilerentcar@gmail.com',
      email: session?.user?.email || ''
    },
    modules: ['locacao']
  };
  if (!session?.user) return fallback;
  try {
    const { data:profile, error } = await client
      .from('usuarios_empresa')
      .select('id,empresa_id,nome,usuario,cargo,administrador')
      .eq('auth_user_id', session.user.id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();
    if (error || !profile?.empresa_id) return fallback;
    const {data:fullCompany}=await client.from('empresas').select('id,cnpj,razao_social,nome_fantasia,email,telefone,endereco,logo_url,papel_timbrado_nome,papel_timbrado_path').eq('id',profile.empresa_id).maybeSingle();
    const context = {
      company: fullCompany||fallback.company,
      user: { nome: profile.nome, usuario: profile.usuario, cargo: profile.cargo, administrador: profile.administrador, email: session.user.email },
      modules: ['locacao']
    };
    localStorage.setItem('bgsys:empresa-cache', JSON.stringify(context.company));
    return context;
  } catch {
    return fallback;
  }
}

export function renderAppContext(context) {
  try {
    localStorage.setItem('bgsys:empresa-cache', JSON.stringify(context.company || {}));
    localStorage.setItem('bgsys:usuario-cache', JSON.stringify(context.user || {}));
  } catch {}
  document.querySelectorAll('.global-user').forEach(node => { node.textContent = context.user.nome; });
  document.querySelectorAll('.global-company').forEach(node => { node.textContent = context.company.nome_fantasia; });
  document.querySelectorAll('.brand-mark').forEach(node => {
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', `Logo de ${context.company.nome_fantasia}`);
    if (context.company.logo_url) {
      node.textContent = '';
      node.classList.add('has-company-logo');
      node.style.backgroundImage = `url("${String(context.company.logo_url).replace(/"/g, '%22')}")`;
    } else {
      node.textContent = (context.company.nome_fantasia || 'Empresa').trim().charAt(0).toUpperCase();
      node.classList.remove('has-company-logo');
      node.style.backgroundImage = '';
    }
  });
  document.documentElement.dataset.companyCnpj = context.company.cnpj;
  document.documentElement.dataset.userName = context.user.nome;
}
