const BASE='https://xtelzwclrzzlsqjecscl.supabase.co';
const PUBLIC_KEY='sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3';
const attempts=new Map();
const fail=(status,message)=>Object.assign(new Error(message),{status});
function limit(key,max){const now=Date.now();if(attempts.size>10000)for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);if(attempts.size>10000)throw fail(429,'Aguarde alguns minutos antes de tentar novamente.');let row=attempts.get(key);if(!row||row.until<now){row={count:0,until:now+15*60*1000};attempts.set(key,row);}if(++row.count>max)throw fail(429,'Muitas tentativas. Aguarde 15 minutos ou entre pelo e-mail.');}
module.exports=async function usernameLogin(req,body){
 if(req.method!=='POST')throw fail(405,'Método não permitido.');
 const username=String(body?.usuario||'').trim().toUpperCase(),password=String(body?.password||'');
 if(!/^[A-Z0-9._-]{3,40}$/.test(username)||!password||password.length>128)throw fail(401,'Usuário ou senha incorretos.');
 const ip=req.socket?.remoteAddress||'unknown';limit('ip:'+ip,100);limit('user:'+ip+':'+username,10);
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw fail(503,'O login por usuário precisa da configuração de contas no servidor. Entre pelo e-mail.');
 async function call(url,options={}){const response=await fetch(BASE+url,{...options,signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null);return {response,data};}
 try {
  const url=new URL(BASE+'/rest/v1/usuarios_empresa');url.searchParams.set('select','auth_user_id');url.searchParams.set('usuario','eq.'+username);url.searchParams.set('ativo','eq.true');
  const profiles=await call(url.pathname+url.search,{headers:{apikey:key,Authorization:'Bearer '+key}});
  if(!profiles.response.ok||!Array.isArray(profiles.data))throw fail(503,'Não foi possível consultar o acesso. Tente novamente.');
  const ids=[...new Set(profiles.data.map(p=>p.auth_user_id))];
  if(ids.length!==1)throw fail(401,'Usuário ou senha incorretos. Se sua identificação existir em mais de uma conta, entre pelo e-mail.');
  const account=await call('/auth/v1/admin/users/'+encodeURIComponent(ids[0]),{headers:{apikey:key,Authorization:'Bearer '+key}});
  if(!account.response.ok||!account.data?.email)throw fail(401,'Usuário ou senha incorretos.');
  const login=await call('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:account.data.email,password})});
  if(!login.response.ok||!login.data?.access_token)throw fail(401,'Usuário ou senha incorretos.');
  return {access_token:login.data.access_token,refresh_token:login.data.refresh_token};
 }catch(error){if(error.status)throw error;throw fail(503,'Não foi possível entrar agora. Tente novamente.');}
};
