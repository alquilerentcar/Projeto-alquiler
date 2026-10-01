import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
import {renderPdfPreview,clearPdfPreview} from './pdf-preview.js';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');await requireAuth(db);bindLogout(db);
const $=s=>document.querySelector(s);let rows=[],clients=[],selected=null,documentRow=null,pdfBytes=null,active=false,busy=false,run=0,url='';
const status=r=>r.assinatura_cliente_em&&r.assinatura_locadora_em?'Assinado':r.assinatura_referencia?'Aguardando assinatura':'Pronto para envio';
function message(text){$('#signature-message').textContent=text;}
function buttons(){ $('#signature-send').disabled=busy||!active||!pdfBytes||!selected||Boolean(selected.assinatura_referencia);$('#signature-select').disabled=busy;$('#signature-refresh').disabled=busy;}
async function load(){
 const [rentals,people,provider]=await Promise.all([db.from('locacoes').select('*').order('criado_em',{ascending:false}),db.from('clientes').select('id,nome_completo,email'),fetch('/api/assinaturas/status').then(r=>{if(!r.ok)throw new Error('Falha ao consultar integração.');return r.json();}).catch(()=>({active:false}))]);
 if(rentals.error||people.error)throw rentals.error||people.error;
 rows=(rentals.data||[]).filter(r=>r.contrato_gerado_em);clients=people.data||[];active=Boolean(provider.active);
 $('#signature-provider').textContent=active?`Autentique configurada${provider.sandbox?' · ambiente de testes':''}.`:'Envio indisponível: configure a integração Autentique no servidor.';
 const pick=$('#signature-select'),previous=pick.value||new URLSearchParams(location.search).get('locacao');pick.replaceChildren(new Option('Selecione um contrato definitivo',''));
 for(const row of rows){const client=clients.find(c=>c.id===row.cliente_id);pick.add(new Option(`${client?.nome_completo||'Cliente'} · ${status(row)} · ${row.id.slice(0,8)}`,row.id));}
 pick.value=rows.some(r=>r.id===previous)?previous:'';
 message(!rows.length?'Nenhum PDF definitivo disponível. Prepare o contrato e gere o PDF em Contratos.':previous&&!pick.value?'Este contrato não possui PDF definitivo atual. Conclua o rascunho antes do envio.':'Selecione um contrato para visualizar o PDF e acompanhar o envio.');
 await select();
}
async function select(){
 const token=++run;selected=rows.find(r=>r.id===$('#signature-select').value)||null;documentRow=null;pdfBytes=null;buttons();clearPdfPreview($('#signature-pdf'));$('#signature-pdf').replaceChildren();$('#signature-open').hidden=true;if(url){URL.revokeObjectURL(url);url='';}
 if(!selected){$('#signature-details').textContent='';return;}
 const row=selected,client=clients.find(c=>c.id===row.cliente_id);$('#signature-details').textContent=`${status(row)} · Destinatário: ${client?.email||'e-mail não cadastrado'}.`;
 const {data,error}=await db.from('documentos_locacao').select('*').eq('locacao_id',row.id).eq('tipo','contrato_locacao').order('versao',{ascending:false}).limit(1).maybeSingle();
 if(error)throw error;if(!data?.arquivo_original_path)throw new Error('PDF não encontrado nos registros.');
 const downloaded=await db.storage.from('documentos-contratuais').download(data.arquivo_original_path);if(downloaded.error)throw downloaded.error;const bytes=new Uint8Array(await downloaded.data.arrayBuffer());if(token!==run)return;
 documentRow=data;pdfBytes=bytes;url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));$('#signature-open').href=url;$('#signature-open').hidden=false;
 message(`PDF definitivo · versão ${data.versao}. O envio utiliza este arquivo, incluindo checklist e imagens. Edição e substituição ficam em Contratos, conforme as permissões.`);
 await renderPdfPreview($('#signature-pdf'),bytes);buttons();
}
$('#signature-select').onchange=()=>select().catch(e=>message(e.message));$('#signature-refresh').onclick=()=>load().catch(e=>message(e.message));
$('#signature-send').onclick=async()=>{
 if(busy||!selected||!pdfBytes||selected.assinatura_referencia||!active)return;
 const row=selected,client=clients.find(c=>c.id===row.cliente_id);if(!client?.email)return message('Cadastre o e-mail do locatário antes do envio.');
 if(!confirm(`Enviar este PDF definitivo para ${client.email}?`))return;
 busy=true;buttons();let sent=false;
 try{
 const fresh=await db.from('locacoes').select('*').eq('id',row.id).single();if(fresh.error)throw fresh.error;
 if(!fresh.data.contrato_gerado_em||fresh.data.contrato_gerado_em!==row.contrato_gerado_em||fresh.data.assinatura_referencia)throw new Error('O contrato mudou ou já foi enviado. Atualize antes de continuar.');
 let binary='';for(let i=0;i<pdfBytes.length;i+=32768)binary+=String.fromCharCode(...pdfBytes.subarray(i,i+32768));
 message('Enviando o PDF definitivo ('+(pdfBytes.length/1048576).toFixed(1)+' MB). Aguarde a confirmação da Autentique…');const response=await fetch('/api/assinaturas/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfBase64:btoa(binary),clientName:client.nome_completo,clientEmail:client.email,documentName:documentRow.nome||'Contrato de locação'})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Falha no envio.');
 if(!result.id)throw new Error('O provedor não retornou a referência do envio. Confira o painel da Autentique antes de tentar novamente.');
 sent=true;row.assinatura_referencia=result.id;
 const signature=(result.signatures||[]).find(s=>String(s.email).toLowerCase()===client.email.toLowerCase());
 const update=await db.from('locacoes').update({assinatura_referencia:result.id,assinatura_provedor:'autentique',status_assinatura:'Aguardando assinaturas',documento_assinado_url:signature?.link?.short_link||null}).eq('id',row.id);if(update.error)throw new Error(`Enviado à Autentique (${result.id}), mas houve falha ao salvar o acompanhamento. Não reenvie; confira o envio no provedor.`);
 $('#signature-details').textContent=`Aguardando assinatura · Destinatário: ${client.email}.`;message('PDF enviado. Aguardando as assinaturas.');
 }catch(e){message(e instanceof TypeError?'Conexão interrompida. O envio pode ter sido recebido; confira o painel da Autentique antes de reenviar.':e.message);if(sent)$('#signature-details').textContent='Envio realizado · acompanhamento precisa ser conferido.';}finally{busy=false;buttons();}
};
window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);clearPdfPreview($('#signature-pdf'));});
load().catch(e=>message(e.message));
