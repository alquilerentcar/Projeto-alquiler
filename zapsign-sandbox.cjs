'use strict';
const BASE='https://sandbox.api.zapsign.com.br/api/v1/docs/';
const TITLE='GRUPO VERT - TESTE DE ASSINATURA - SEM VALIDADE JURIDICA';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail=(status,message,uncertain=false)=>Object.assign(new Error(message),{status,uncertain});
function token(env){return env.ZAPSIGN_SANDBOX_API_TOKEN||((env.VERCEL_ENV!=='production'||env.ZAPSIGN_SANDBOX==='true')?env.ZAPSIGN_API_TOKEN:'')||'';}
function status(env=process.env){return {provider:'zapsign',sandbox:true,active:Boolean(token(env)),configured:Boolean(env.ZAPSIGN_SANDBOX_API_TOKEN||env.ZAPSIGN_API_TOKEN),message:token(env)?'ZapSign sandbox configurado. Documento de teste sem validade jurídica.':'Configure ZAPSIGN_SANDBOX_API_TOKEN com o token do sandbox no servidor. Na Vercel, vincule ao projeto e faça redeploy.'};}
function ready(env){if(!status(env).active)throw fail(503,status(env).message);}
function signLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['sandbox.app.zapsign.com.br','sandbox.zapsign.com.br'].includes(u.hostname)&&u.pathname.startsWith('/verificar/')?u.href:null;}catch{return null;}}
function pdfLink(value){try{const u=new URL(value),h=u.hostname;return u.protocol==='https:'&&!u.username&&!u.password&&(h==='zapsign.s3.amazonaws.com'||h.endsWith('.zapsign.com.br')||h.endsWith('.amazonaws.com')||h.endsWith('.cloudfront.net'))?u.href:null;}catch{return null;}}
function buildPayload(body,scope){
 if(!body||typeof body!=='object'||Array.isArray(body)||!uuid(scope))throw fail(400,'Confira o teste e a empresa selecionada.');
 const name=typeof body.nome==='string'?body.nome.trim():'',email=typeof body.email==='string'?body.email.trim():'',method=body.metodo;
 if(name.length<3||name.length>120||/[\r\n<>]/.test(name))throw fail(400,'Informe seu nome para o teste.');
 if(!['email','sms'].includes(method))throw fail(400,'Escolha código por e-mail ou SMS.');
 if((method==='email'||body.enviar_email===true||email)&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))throw fail(400,'Informe um e-mail válido.');
 let phone=typeof body.telefone==='string'?body.telefone.replace(/\D/g,''):'';if(phone.startsWith('55')&&[12,13].includes(phone.length))phone=phone.slice(2);
 if((method==='sms'||phone)&&!/^\d{10,11}$/.test(phone))throw fail(400,'Informe seu celular com DDD para receber o código por SMS.');
 if(body.confirmar_teste!==true)throw fail(400,'Confirme que o teste será feito com seus próprios dados.');
 if(!uuid(body.operacao))throw fail(400,'Atualize a página antes de criar o teste.');
 const signer={name,email,auth_mode:method==='email'?'assinaturaTela-tokenEmail':'assinaturaTela-tokenSms',lock_name:true,lock_email:Boolean(email),lock_phone:Boolean(phone),require_document_photo:true,require_selfie_photo:true,send_automatic_email:body.enviar_email===true,send_automatic_whatsapp:false,send_automatic_whatsapp_signed_file:false};
 if(phone)Object.assign(signer,{phone_country:'55',phone_number:phone});
 return {name:TITLE,markdown_text:'# TESTE DE ASSINATURA — GRUPO VERT\n\nDocumento fictício para testar assinatura na tela, código de confirmação, fotos do documento de identificação e selfie.\n\nSEM VALIDADE JURÍDICA. Não representa contrato de locação, dívida, transferência ou autorização comercial. Não altera locações, ocupações ou pagamentos.\n\nAssino exclusivamente para testar a integração de assinatura eletrônica.',lang:'pt-br',external_id:'vert-sandbox:'+scope+':'+body.operacao,disable_signer_emails:false,signers:[signer]};
}
async function request(url,{env,fetchImpl,body}){
 let response;try{response=await fetchImpl(url,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+token(env),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body?35000:15000)});}catch{throw fail(504,body?'A ZapSign não confirmou a criação. O teste pode ter sido criado. Confira o sandbox antes de repetir.':'Não foi possível consultar o teste. Tente atualizar o resultado; não crie outro documento.',Boolean(body));}
 if(!response.ok)throw fail([401,403].includes(response.status)?503:response.status===429?429:502,[401,403].includes(response.status)?'A ZapSign recusou a chave. Confira se o token pertence ao sandbox.':response.status===429?'A ZapSign limitou as solicitações. Aguarde antes de atualizar.':response.status===400?'A ZapSign recusou os dados ou o método de autenticação. Confira o e-mail, o telefone e os recursos habilitados no sandbox.':'A ZapSign não confirmou a operação. Confira o painel antes de repetir.',Boolean(body)&&response.status>=500);
 try{return await response.json();}catch{throw fail(502,'Resposta inesperada da ZapSign. Confira o sandbox antes de repetir.',Boolean(body));}
}
function resultView(result){const s=result.signers?.[0]||{};return {provider:'zapsign',sandbox:true,reference:result.token,status:result.status||'pending',signerStatus:s.status||'new',signedAt:s.signed_at||null,signUrl:signLink(s.sign_url),signedPdf:result.status==='signed'?pdfLink(result.signed_file):null,originalPdf:pdfLink(result.original_file),evidence:{frente:Boolean(s.document_photo_url),verso:Boolean(s.document_verse_photo_url),selfie:Boolean(s.selfie_photo_url||s.selfie_photo_url2)},requested:{document:typeof s.require_document_photo==='boolean'?s.require_document_photo:null,selfie:typeof s.require_selfie_photo==='boolean'?s.require_selfie_photo:null,method:s.auth_mode||null}};}
// Local duplicate-click protection is not provider-level idempotency.
// Uncertain outcomes must be checked in the sandbox before a new operation.
const requests=new Map();
async function createTest({env=process.env,fetchImpl=fetch,body,scope}={}){
 ready(env);const payload=buildPayload(body,scope),key=payload.external_id;
 const existing=requests.get(key);if(existing&&existing.until>Date.now()){
  if(existing.fingerprint!==JSON.stringify(payload))throw fail(409,'Este teste já foi solicitado com outros dados. Confira o resultado antes de criar outro.');
  return existing.promise;
 }
 for(const [k,v]of requests)if(v.until<Date.now())requests.delete(k);
 if(requests.size>=200)throw fail(429,'Há muitos testes em andamento. Aguarde antes de criar outro.');
 const promise=(async()=>{const result=await request(BASE,{env,fetchImpl,body:payload}),view=resultView(result);if(!uuid(view.reference)||!view.signUrl)throw fail(502,'Resposta sem referência ou link de teste válido. Confira o sandbox antes de repetir.',true);return view;})();
 requests.set(key,{until:Date.now()+20*60000,promise,fingerprint:JSON.stringify(payload)});return promise;
}
async function inspectTest(reference,{env=process.env,fetchImpl=fetch,scope}={}){
 ready(env);if(!uuid(reference)||!uuid(scope))throw fail(400,'Confira a referência do teste.');
 const result=await request(BASE+encodeURIComponent(reference)+'/',{env,fetchImpl});
 if(result.token!==reference||result.name!==TITLE||!String(result.external_id||'').startsWith('vert-sandbox:'+scope+':'))throw fail(403,'Este documento não pertence aos testes desta empresa.');
 return resultView(result);
}
module.exports={status,createTest,inspectTest,buildPayload};
