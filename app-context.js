import {applyCompanyTheme} from './empresa-branding.js';
export const CURRENT_COMPANY={nome_fantasia:'BG SYSTEMS',cnpj:''};
export async function loadAppContext(client) {
  const {data,error}=await client.rpc('acessos_contexto',{p_empresa:sessionStorage.getItem('bgsys:empresa-id')||null});
  if(error||data?.schemaVersion!==2) throw new Error('Não foi possível validar o acesso. Verifique a conexão e aplique etapa1_acessos.sql no Supabase.');
  let documentModels=[];if(data.company?.id){const result=await client.rpc('modelos_documentos_menu',{p_empresa:data.company.id});if(!result.error)documentModels=result.data||[];}
  return {...data,documentModels,company:data.company||{...CURRENT_COMPANY},modules:data.modules||[]};
}
export function renderAppContext(context) {
  const company=location.pathname.replace(/\.html$/,'').endsWith('/controle')?{nome_fantasia:'BG SYSTEMS',cnpj:''}:context.company;
  applyCompanyTheme(company);
  try {
    if(context.company?.id){
      sessionStorage.setItem('bgsys:empresa-id',context.company.id);
      if(!location.pathname.replace(/\.html$/,'').endsWith('/controle'))sessionStorage.setItem('bgsys:brand:'+context.company.id,JSON.stringify({id:company.id,nome_fantasia:company.nome_fantasia,logo_url:company.logo_url||'',cor_primaria:company.cor_primaria||'#2864da',cor_sidebar:company.cor_sidebar||'#111e32',cor_fundo:company.cor_fundo||'#f5f7fb',on_primary:document.documentElement.style.getPropertyValue('--company-on-primary')}));
    }
  }catch{};
  document.querySelectorAll('[data-company-admin]').forEach(node=>{node.hidden=!context.canManageCompany;});
  document.querySelectorAll('[data-admin-only]').forEach(node=>{node.hidden=!context.developer;});
  document.querySelectorAll('[data-module]').forEach(node=>{node.hidden=!context.modules.includes(node.dataset.module);});
  document.querySelectorAll('.global-user').forEach(node=>{node.textContent=context.user.nome;});
  document.querySelectorAll('.global-company').forEach(node=>{node.textContent=company.nome_fantasia;});
  document.querySelectorAll('.brand-mark').forEach(node=>{
    node.textContent=(company.nome_fantasia||'BG').charAt(0).toUpperCase();
    node.classList.toggle('has-company-logo',Boolean(company.logo_url));
    node.style.backgroundImage=company.logo_url?`url("${String(company.logo_url).replace(/"/g,'%22')}")`:'';
    if(company.logo_url) node.textContent='';
  });
  document.documentElement.dataset.companyCnpj=context.company.cnpj||'';
  document.documentElement.dataset.userName=context.user.nome;
}
