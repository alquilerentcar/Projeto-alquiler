export const TENANT_TABLES = new Set(['frota_periodos','frota_recebimentos','clientes','fornecedores','carros','contratos','locacoes','documentos_locacao','documento_signatarios','documento_eventos','anexos_locacao','vistorias_locacao','certificados_digitais','modelos_contrato','campos_modelo_contrato','contratos_gerados','assinaturas_contrato','pagamentos_locacao','filiais','funcoes_empresa']);
export function pageModule(path) {
  const page=path.split('/').pop().replace(/\.html$/,'');
  if(['perfil','login','modulos','controle','acessos','usuarios','index',''].includes(page)) return null;
  return 'locacao';
}
export function canOpen(context,path) {
  const page=path.split('/').pop().replace(/\.html$/,'');
  if(page==='controle') return context.developer===true;
  if(['acessos','usuarios','empresa'].includes(page)) return Boolean(context.company?.id)&&context.canManageCompany===true;
  const module=pageModule(path);
  return !module || (Boolean(context.company?.id) && context.modules.includes(module));
}
// UI scoping prevents mixing companies for a developer who can support several tenants.
// Database RLS independently validates every request; this is not the security boundary.
export function scopeClient(client,companyId) {
  const original=client.from.bind(client);
  client.from=table=>{
    const builder=original(table);
    if(!TENANT_TABLES.has(table)) return builder;
    return new Proxy(builder,{get(target,prop){
      if(['select','update','delete'].includes(prop)) return (...args)=>target[prop](...args).eq('empresa_id',companyId);
      if(['insert','upsert'].includes(prop)) return (values,...args)=>target[prop](Array.isArray(values)?values.map(v=>({...v,empresa_id:companyId})):{...values,empresa_id:companyId},...args);
      const value=target[prop];return typeof value==='function'?value.bind(target):value;
    }});
  };
}

export function entryDestination(context) {
 if(context.developer)return 'controle.html';
 if(context.companies?.length===1&&context.company?.id&&context.modules?.length===1&&context.modules[0]==='locacao')return 'dashboard.html';
 return 'modulos.html';
}
