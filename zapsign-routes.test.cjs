const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
process.env.ZAPSIGN_SANDBOX_API_TOKEN='chave-ficticia-teste';
const handler=require('./server.js');
test('test routes require module and developer, reuse Vercel functions and never call production signing',async()=>{
 const original=global.fetch;let developer=true,providerCalls=0,moduleAllowed=true;
 const company='10000000-0000-4000-8000-000000000001',reference='10000000-0000-4000-8000-000000000099';
 global.fetch=async(url,opts)=>{const u=String(url);if(u.includes('/rest/v1/rpc/'))return {ok:true,json:async()=>u.endsWith('/acesso_modulo')?moduleAllowed:developer};assert(u.startsWith('https://sandbox.api.zapsign.com.br/api/v1/docs/'));providerCalls++;const payload=opts.body?JSON.parse(opts.body):null;return {ok:true,json:async()=>({name:'GRUPO VERT - TESTE DE ASSINATURA - SEM VALIDADE JURIDICA',external_id:payload?.external_id||'vert-sandbox:'+company+':op',token:reference,status:'pending',signers:[{sign_url:'https://sandbox.app.zapsign.com.br/verificar/'+reference}]})};};
 async function call(url,method='GET',body={},auth='Bearer sessao-ficticia'){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.url=url;req.method=method;req.headers={'x-empresa-id':company,authorization:auth};let status,data,headers;
  await handler(req,{writeHead(code,h){status=code;headers=h;},end(text){data=JSON.parse(text);}});return {status,data,headers};
 }
 try{
  assert.equal((await call('/api/assinaturas/status?teste=zapsign','GET',{},'')).status,401);
  developer=false;assert.equal((await call('/api/assinaturas/status?teste=zapsign')).status,403);
  const body={tipo:'teste_zapsign',nome:'Pessoa Fictícia',email:'teste@example.com',metodo:'email',confirmar_teste:true,operacao:'10000000-0000-4000-8000-000000000011'};
  assert.equal((await call('/api/assinaturas/enviar','POST',body)).status,403);assert.equal(providerCalls,0);
  developer=true;const state=await call('/api/assinaturas/status?teste=zapsign');assert.equal(state.data.provider,'zapsign');assert.equal(state.headers['Cache-Control'],'no-store');
  const created=await call('/api/assinaturas/enviar','POST',body);assert.equal(created.status,200);assert.equal(created.data.reference,reference);
  assert.equal((await call('/api/assinaturas/status?teste=zapsign&referencia='+reference)).status,200);assert.equal(providerCalls,2);
  moduleAllowed=false;assert.equal((await call('/api/assinaturas/enviar','POST',body)).status,403);assert.equal(providerCalls,2);
 }finally{global.fetch=original;}
});
