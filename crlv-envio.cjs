// Envio do CRLV por e-mail (Brevo). Usado pelo envio manual, pela fila automática (sessão do usuário) e pela rotina diária (chave de serviço).
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emailValido=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e||'').trim());
const MOTIVO={locacao:'Entrega do veículo (locação)',ocupacao:'Entrega do veículo',substituicao:'Substituição de veículo'};

function configurado(){return Boolean(process.env.BREVO_API_KEY&&process.env.EMAIL_REMETENTE);}

// headers: {apikey, Authorization} de quem está pedindo (usuário ou serviço).
async function baixar(supabaseUrl,headers,path){
 const r=await fetch(supabaseUrl+'/storage/v1/object/documentos-veiculos/'+path.split('/').map(encodeURIComponent).join('/'),{headers,signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Object.assign(new Error('Não foi possível ler o arquivo do CRLV.'),{status:502});return Buffer.from(await r.arrayBuffer());}

async function enviar({para,nome,assunto,html,anexos,remetenteNome,responderPara}){
 const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':process.env.BREVO_API_KEY,'Content-Type':'application/json',accept:'application/json'},signal:AbortSignal.timeout(30000),
  body:JSON.stringify({sender:{email:process.env.EMAIL_REMETENTE,name:remetenteNome||'Grupo Alquiler'},to:[{email:para,name:nome}],...(responderPara&&emailValido(responderPara)?{replyTo:{email:responderPara}}:{}),subject:assunto,htmlContent:html,attachment:anexos})});
 if(!r.ok){const t=await r.text().catch(()=>'');console.error('brevo',r.status,t.slice(0,300));throw Object.assign(new Error('O serviço de e-mail recusou o envio. Confira o remetente cadastrado no Brevo.'),{status:502});}}

function corpo({nome,veiculo,motivo,documentos,empresa}){
 return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#17243b;line-height:1.5"><p>Olá, ${esc(nome)}.</p><p>Segue em anexo a documentação do veículo <b>${esc(veiculo)}</b>${motivo?' ('+esc(motivo)+')':''}:</p><ul>${documentos.map(d=>'<li>'+esc(d)+'</li>').join('')}</ul><p>Mantenha o documento do veículo (CRLV) sempre disponível durante o uso. Em caso de dúvida, responda este e-mail${empresa?.telefone?' ou ligue '+esc(empresa.telefone):''}.</p><p>Atenciosamente,<br>${esc(empresa?.nome_fantasia||empresa?.razao_social||'Grupo Alquiler')}</p></div>`;}
const nomeArquivo=(nome,path,padrao)=>(String(nome||'').replace(/[^\w .-]+/g,'').trim()||padrao)+'.'+String(path).split('.').pop();

// Processa a fila: itens vêm de crlv_fila_pendentes(_todas). resultado(item, ok, motivo, documento) grava no banco.
async function processarFila({supabaseUrl,headers,itens,empresas,resultado}){
 let enviados=0;
 for(const it of itens.slice(0,20)){
  try{
   if(!it.documento){await resultado(it,false,'sem_crlv',null);continue;}
   if(!emailValido(it.email)){await resultado(it,false,'sem_email',it.documento.id);continue;}
   const buf=await baixar(supabaseUrl,headers,it.documento.arquivo_path),emp=empresas.get(it.empresa_id)||null,veiculo=[it.placa,it.veiculo].filter(Boolean).join(' · ');
   await enviar({para:String(it.email).trim().toLowerCase(),nome:it.nome,assunto:`CRLV do veículo ${it.placa} · ${emp?.nome_fantasia||'Grupo Alquiler'}`,html:corpo({nome:it.nome,veiculo,motivo:MOTIVO[it.origem],documentos:[it.documento.nome],empresa:emp}),
    anexos:[{name:nomeArquivo(it.documento.nome,it.documento.arquivo_path,'CRLV'),content:buf.toString('base64')}],remetenteNome:emp?.nome_fantasia||emp?.razao_social,responderPara:emp?.email});
   await resultado(it,true,null,it.documento.id);enviados++;
  }catch(e){await resultado(it,false,String(e.message||'falha').slice(0,200),it.documento?.id||null).catch(()=>{});}
 }
 return enviados;
}
module.exports={configurado,baixar,enviar,corpo,nomeArquivo,processarFila,emailValido};
