// Envio do CRLV pelo Brevo: sem CRLV e sem e-mail não chamam o serviço; com tudo certo, vai o anexo e o resultado é gravado.
const test=require('node:test'),assert=require('node:assert/strict');
test('fila do CRLV',async()=>{
 process.env.BREVO_API_KEY='chave-teste';process.env.EMAIL_REMETENTE='remetente@exemplo.com';
 const crlv=require('../crlv-envio.cjs');assert.equal(crlv.configurado(),true);
 const chamadas=[];global.fetch=async(url,op={})=>{chamadas.push({url,op});if(String(url).includes('/storage/v1/object/'))return {ok:true,arrayBuffer:async()=>new TextEncoder().encode('%PDF-teste').buffer};if(String(url).includes('api.brevo.com'))return {ok:true,text:async()=>'{}'};throw Error('inesperado '+url);};
 const res=[];const itens=[
  {id:'1',empresa_id:'e',placa:'AAA1A11',veiculo:'VW POLO',nome:'SEM CRLV',email:'a@b.c',origem:'locacao',documento:null},
  {id:'2',empresa_id:'e',placa:'BBB2B22',veiculo:'VW POLO',nome:'SEM EMAIL',email:'',origem:'ocupacao',documento:{id:'d2',nome:'CRLV 2026',arquivo_path:'e/c/d2.pdf'}},
  {id:'3',empresa_id:'e',placa:'TSD1D53',veiculo:'CHEV ONIX',nome:'JOÃO <TESTE>',email:' Joao@Exemplo.com ',origem:'substituicao',documento:{id:'d3',nome:'CRLV 2026 · TSD1D53',arquivo_path:'e/c/d3.pdf'}}];
 const n=await crlv.processarFila({supabaseUrl:'https://x.supabase.co',headers:{apikey:'k',Authorization:'Bearer u'},itens,empresas:new Map([['e',{nome_fantasia:'Alquiler Rent a Car',email:'contato@exemplo.com',telefone:'92 3000-0000'}]]),resultado:async(it,ok,motivo,doc)=>res.push([it.id,ok,motivo,doc])});
 assert.equal(n,1);assert.deepEqual(res,[['1',false,'sem_crlv',null],['2',false,'sem_email','d2'],['3',true,null,'d3']]);
 const brevo=chamadas.filter(c=>String(c.url).includes('brevo'));assert.equal(brevo.length,1,'só um e-mail saiu');
 const corpo=JSON.parse(brevo[0].op.body);assert.equal(corpo.to[0].email,'joao@exemplo.com');assert.equal(corpo.sender.name,'Alquiler Rent a Car');assert.equal(corpo.replyTo.email,'contato@exemplo.com');
 assert.match(corpo.subject,/CRLV do veículo TSD1D53/);assert.match(corpo.htmlContent,/Substituição de veículo/);assert.match(corpo.htmlContent,/JOÃO &lt;TESTE&gt;/,'nome escapado');
 assert.equal(corpo.attachment[0].name,'CRLV 2026  TSD1D53.pdf');assert.equal(Buffer.from(corpo.attachment[0].content,'base64').toString(),'%PDF-teste');
 assert.equal(brevo[0].op.headers['api-key'],'chave-teste');
});
