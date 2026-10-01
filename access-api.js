const BASE = 'https://xtelzwclrzzlsqjecscl.supabase.co';
const PUBLIC_KEY = 'sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3';
const fail = (status, message) => Object.assign(new Error(message), {status});
async function call(path, authorization, body, key=PUBLIC_KEY, method='POST') {
  const response=await fetch(BASE+path,{method,headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok) {
    if(data?.code==='PGRST202'&&path.includes('perfil_email_alvo'))throw fail(503,'Aplique perfil_usuarios.sql no SQL Editor do Supabase para ativar a alteração de e-mail.');
    if(data?.code==='PGRST202'||data?.code==='42P01') throw fail(503,path.includes('acessos_excluir_usuario')?'Aplique usuarios_manutencao.sql no SQL Editor do Supabase para ativar a exclusão de acessos.':'Aplique etapa1_acessos.sql no SQL Editor do Supabase para atualizar os acessos.');
    if(data?.code==='42501'||response.status===403) throw fail(403,'Você não tem permissão para gerenciar esses acessos.');
    if(response.status===401) throw fail(401,'Sessão inválida. Entre novamente.');
    if(data?.code==='23505'||data?.error_code==='email_exists') throw fail(409,'Já existe uma empresa, usuário ou e-mail com esses dados.');
    if(data?.code==='P0001') throw fail(400,data.message);
    throw fail(502,'Não foi possível concluir a operação no Supabase. Confira a configuração e tente novamente.');
  }
  return data;
}
async function verify(req,control,empresa) {
  const token=req.headers.authorization||'';
  if(!token.startsWith('Bearer ')) throw fail(401,'Entre no sistema novamente.');
  // The RPC uses the caller JWT and checks the platform role in the database.
  const allowed=await call('/rest/v1/rpc/'+(control?'acesso_desenvolvedor':'acesso_gerenciar_usuarios'),token,control?{}:{p_empresa:empresa});
  if(!allowed) throw fail(403,'Você não tem permissão para gerenciar esses acessos.');
  return token;
}
module.exports=async function accessApi(req,body={}) {
  if(!['GET','POST'].includes(req.method)) throw fail(405,'Método não permitido.');
  body=body??{};
  if(typeof body!=='object'||Array.isArray(body))throw fail(400,'Dados inválidos.');
  const control=new URL(req.url||'/api/acessos','http://localhost').pathname==='/api/controle';
  const empresa=req.headers['x-empresa-id']||null;
  if(!control&&!empresa)throw fail(400,'Selecione uma empresa.');
  const token=await verify(req,control,empresa);
  if(body.action==='empresa'&&!control)throw fail(403,'Licenças são administradas exclusivamente no Controle da BG SYSTEMS.');
  if(body.action?.startsWith('usuario_')&&!control&&body.usuario?.empresa_id!==empresa)throw fail(403,'Usuário fora da empresa selecionada.');
  if(req.method==='GET') return {...await call('/rest/v1/rpc/'+(control?'acessos_painel':'acessos_empresa_painel'),token,control?{}:{p_empresa:empresa}),criacao_contas_configurada:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)};
  if(body.action==='empresa') return call('/rest/v1/rpc/acessos_salvar_empresa',token,{p_dados:body.empresa,p_modulos:body.modulos});
  if(body.action==='usuario_email') {
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!key)throw fail(503,'Configure SUPABASE_SERVICE_ROLE_KEY no servidor para alterar o e-mail.');
    const email=String(body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw fail(400,'Informe um e-mail válido.');
    const target=await call('/rest/v1/rpc/perfil_email_alvo',token,{p_empresa:body.usuario?.empresa_id,p_usuario:body.usuario?.id});
    if(typeof target!=='string'||!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(target))throw fail(502,'Não foi possível validar a conta de destino.');
    await call('/auth/v1/admin/users/'+encodeURIComponent(target),'Bearer '+key,{email,email_confirm:true},key,'PUT');
    return {ok:true};
  }
  if(body.action==='usuario_excluir') return call('/rest/v1/rpc/acessos_excluir_usuario',token,{p_empresa:body.usuario?.empresa_id,p_usuario:body.usuario?.id});
  if(body.action==='usuario_editar') return call('/rest/v1/rpc/acessos_salvar_usuario',token,{p_dados:body.usuario,p_modulos:body.modulos});
  if(body.action!=='usuario_criar') throw fail(400,'Operação desconhecida.');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw fail(503,'Configure SUPABASE_SERVICE_ROLE_KEY no arquivo .env do servidor para criar contas. A edição de acessos existentes permanece disponível.');
  const user=body.usuario||{},email=String(user.email||'').trim().toLowerCase(),password=String(body.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>128) throw fail(400,'Informe um e-mail válido e uma senha de 12 a 128 caracteres.');
  // Validate the company and grants before creating an Auth account. The save RPC repeats validation.
  await call('/rest/v1/rpc/acessos_validar_usuario',token,{p_dados:user,p_modulos:body.modulos});
  const created=await call('/auth/v1/admin/users',`Bearer ${key}`,{email,password,email_confirm:true,user_metadata:{name:user.nome}},key);
  try {
    return await call('/rest/v1/rpc/acessos_salvar_usuario',token,{p_dados:{...user,id:null,auth_user_id:created.id,email},p_modulos:body.modulos});
  } catch(error) {
    try { await call('/auth/v1/admin/users/'+encodeURIComponent(created.id),`Bearer ${key}`,undefined,key,'DELETE'); }
    catch { throw fail(502,'O perfil não foi salvo e a conta ficou pendente. Revise a conta no Supabase antes de repetir.'); }
    throw error;
  }
};
