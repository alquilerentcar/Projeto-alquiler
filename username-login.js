const crypto=require('node:crypto');
const BASE='https://xtelzwclrzzlsqjecscl.supabase.co';
const PUBLIC_KEY='sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3';
const GENERIC='Usuário ou senha incorretos.';
const BLOCKED='Muitas tentativas. Aguarde 15 minutos e tente de novo.';
const attempts=new Map();
const fail=(status,message)=>Object.assign(new Error(message),{status});
// Reserva: contador na memória, usado só se o banco não responder.
function memoryLimit(key,max){const now=Date.now();if(attempts.size>10000)for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);if(attempts.size>10000)return false;let row=attempts.get(key);if(!row||row.until<now){row={count:0,until:now+15*60*1000};attempts.set(key,row);}return ++row.count<=max;}
// Na Vercel o IP real vem no cabeçalho preenchido pela própria Vercel.
function clientIp(req){const h=req.headers||{};return String(h['x-real-ip']||String(h['x-forwarded-for']||'').split(',')[0]||req.socket?.remoteAddress||'unknown').trim().slice(0,64);}
// Nunca guarda o IP nem o usuário em claro: só um código embaralhado.
const hashKey=(key,secret)=>crypto.createHmac('sha256',secret).update(key).digest('hex');
module.exports=async function usernameLogin(req,body){
 if(req.method!=='POST')throw fail(405,'Método não permitido.');
 const username=String(body?.usuario||'').trim().toUpperCase(),password=String(body?.password||'');
 if(!/^[A-Z0-9._-]{3,40}$/.test(username)||!password||password.length>128)throw fail(401,GENERIC);
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw fail(503,'Não foi possível entrar agora. Tente novamente.');
 async function call(url,options={}){const response=await fetch(BASE+url,{...options,signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null);return {response,data};}
 const admin={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 const ip=clientIp(req),ipKey=hashKey('ip:'+ip,key),userKey=hashKey('user:'+username,key);
 async function within(chave,max,memo){
  try{const r=await call('/rest/v1/rpc/login_tentativa_registrar',{method:'POST',headers:admin,body:JSON.stringify({p_chave:chave,p_max:max})});if(r.response.ok&&typeof r.data==='boolean')return r.data;}catch{}
  return memoryLimit(memo,max);
 }
 // 100 tentativas por IP e 10 por usuário a cada 15 minutos (o usuário conta de qualquer IP).
 if(!await within(ipKey,100,'ip:'+ip)||!await within(userKey,10,'user:'+username))throw fail(429,BLOCKED);
 try {
  const url=new URL(BASE+'/rest/v1/usuarios_empresa');url.searchParams.set('select','auth_user_id');url.searchParams.set('usuario','eq.'+username);url.searchParams.set('ativo','eq.true');
  const profiles=await call(url.pathname+url.search,{headers:{apikey:key,Authorization:'Bearer '+key}});
  if(!profiles.response.ok||!Array.isArray(profiles.data))throw fail(503,'Não foi possível entrar agora. Tente novamente.');
  const ids=[...new Set(profiles.data.map(p=>p.auth_user_id))];
  if(ids.length!==1)throw fail(401,GENERIC);
  const account=await call('/auth/v1/admin/users/'+encodeURIComponent(ids[0]),{headers:{apikey:key,Authorization:'Bearer '+key}});
  if(!account.response.ok||!account.data?.email)throw fail(401,GENERIC);
  const login=await call('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:account.data.email,password})});
  if(!login.response.ok||!login.data?.access_token)throw fail(401,GENERIC);
  await call('/rest/v1/rpc/login_tentativa_limpar',{method:'POST',headers:admin,body:JSON.stringify({p_chave:userKey})}).catch(()=>{});attempts.delete('user:'+username);
  return {access_token:login.data.access_token,refresh_token:login.data.refresh_token};
 }catch(error){if(error.status)throw error;throw fail(503,'Não foi possível entrar agora. Tente novamente.');}
};
