import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
import {initModelDocuments} from './document-model-records.js';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');await requireAuth(db);bindLogout(db);
const context=window.alquilerContext,params=new URLSearchParams(location.search),modelId=params.get('modelo'),rentalId=params.get('locacao'),$=s=>document.querySelector(s);
try{
 const model=(context.documentModels||[]).find(m=>m.id===modelId);if(!model)throw new Error('Modelo arquivado ou indisponível. Volte a Locação e escolha um modelo publicado.');
 $('#document-template-title').textContent=model.nome;$('#template-note').textContent=`Rascunhos usam a versão ${model.versao}. Documentos emitidos mantêm a versão original.`;
 const [rentals,clients,cars,versions]=await Promise.all([db.from('locacoes').select('id,cliente_id,carro_id,criado_em').order('criado_em',{ascending:false}),db.from('clientes').select('id,nome_completo'),db.from('carros').select('id,placa'),db.from('versoes_modelos_documentos').select('id').eq('empresa_id',context.company.id).eq('modelo_id',modelId)]);
 for(const result of [rentals,clients,cars,versions])if(result.error)throw result.error;
 const label=r=>`${clients.data.find(c=>c.id===r.cliente_id)?.nome_completo||'Cliente'} · ${cars.data.find(c=>c.id===r.carro_id)?.placa||'Veículo'} · ${r.id.slice(0,8)}`;
 $('#rental-picker').replaceChildren(new Option('Selecione uma locação para preparar o documento',''));for(const r of rentals.data)$('#rental-picker').add(new Option(label(r),r.id));
 $('#rental-picker').value=rentalId||'';$('#rental-picker').onchange=e=>{const next=new URL(location.href);next.searchParams.set('locacao',e.target.value);location.href=next.href};
 if(rentalId&&rentals.data.some(r=>r.id===rentalId)){$('#emission-area').hidden=false;await initModelDocuments(db,context,rentalId,modelId)}
 const ids=versions.data.map(v=>v.id);let docs=[];if(ids.length){const result=await db.from('documentos_modelos_emitidos').select('*').eq('empresa_id',context.company.id).in('versao_id',ids).order('criado_em',{ascending:false});if(result.error)throw result.error;docs=result.data}
 const host=$('#all-model-documents');if(!docs.length)host.textContent='Nenhum documento emitido deste modelo.';for(const d of docs){const row=document.createElement('div'),text=document.createElement('span'),a=document.createElement('a');row.className='record-document';text.textContent=`Nº ${d.numero} · ${label(rentals.data.find(r=>r.id===d.locacao_id)||{id:d.locacao_id})}`;a.className='btn btn-quiet';if(d.arquivo_path){const {data,error}=await db.storage.from('documentos-modelos').createSignedUrl(d.arquivo_path,600);if(error)throw error;a.href=data.signedUrl;a.target='_blank';a.rel='noopener';a.textContent='Abrir PDF'}else{a.href=`documentos-modelo.html?modelo=${encodeURIComponent(modelId)}&locacao=${encodeURIComponent(d.locacao_id)}`;a.textContent='Concluir PDF'}row.append(text,a);host.append(row)}
}catch(error){$('#template-note').textContent=error.message||'Não foi possível carregar os documentos.'}
