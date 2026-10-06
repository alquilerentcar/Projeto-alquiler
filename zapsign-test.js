'use strict';
function status(env=process.env){return {provider:'zapsign',sandbox:true,active:Boolean(env.ZAPSIGN_API_TOKEN)&&env.VERCEL_ENV!=='production',configured:Boolean(env.ZAPSIGN_API_TOKEN)};}
async function createTest({env=process.env,fetchImpl=fetch}={}){
 if(!status(env).active)throw Object.assign(new Error('Configure ZAPSIGN_API_TOKEN em Preview e abra a implantação de prévia. Este teste não está habilitado em produção.'),{status:503});
 let response;try{response=await fetchImpl('https://sandbox.api.zapsign.com.br/api/v1/docs/',{method:'POST',headers:{Authorization:'Bearer '+env.ZAPSIGN_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({name:'BG SYSTEMS - TESTE SEM VALIDADE JURIDICA',markdown_text:'# Documento fictício de teste\n\nTeste de integração BG SYSTEMS. Não contém dados de clientes e não representa um contrato.',lang:'pt-br',disable_signer_emails:true,signers:[{name:'Signatário de teste',send_automatic_email:false,send_automatic_whatsapp:false}]}),signal:AbortSignal.timeout(40000)});}catch{throw Object.assign(new Error('A ZapSign não confirmou a solicitação. Confira os documentos no sandbox antes de repetir: o documento pode ter sido criado.'),{status:504});}
 if(!response.ok)throw Object.assign(new Error([401,403].includes(response.status)?'A ZapSign recusou o token ou a permissão. Confira se o token é do sandbox.':response.status===429?'Limite de solicitações atingido. Aguarde antes de tentar novamente.':'A ZapSign não confirmou a criação. Confira o sandbox antes de repetir.'),{status:502});
 let result;try{result=await response.json();}catch{throw Object.assign(new Error('Resposta inesperada. Confira os documentos no sandbox antes de repetir.'),{status:502});}
 const link=result.signers?.[0]?.sign_url;let url;try{url=new URL(link);}catch{};
 if(typeof result.token!=='string'||!url||url.protocol!=='https:'||!['sandbox.app.zapsign.com.br','sandbox.zapsign.com.br'].includes(url.hostname))throw Object.assign(new Error('Resposta sem referência ou link de teste válido. Confira o sandbox antes de repetir.'),{status:502});
 return {provider:'zapsign',sandbox:true,reference:result.token,signUrl:url.href,status:result.status};
}
module.exports={status,createTest};
