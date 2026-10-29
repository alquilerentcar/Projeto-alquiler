import {requireAuth,bindLogout} from './auth-guard.js';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {fieldsIn} from './document-model-core.js';
import {addPhotosToGroup,photoGroupMetadata,substitutionPhotoDescriptors,DEFAULT_PHOTO_LIMIT,MAX_PHOTO_LIMIT} from './substituicao-fotos.mjs?v=20261029-grupos';
import {fillBlocks} from './rich-document.js';
import {modelPdf} from './document-model-pdf.js?v=20261019-pdf-size';
import {TERM_STARTERS,substitutionValues,substitutionBlocks} from './termos-locacao.mjs?v=20261019-modelo-solicitado';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
await requireAuth(db);bindLogout(db);
const context=window.alquilerContext,$=s=>document.querySelector(s),form=$('#swap-form'),status=$('#swap-status');
const localMoment=()=>new Date(Date.now()-4*3600000).toISOString().slice(0,16);
form.elements.data.value=localMoment();
let cars=[],clients=[],occupations=[],versions=[],prepared=null,busy=false,photos=[];
const node=(tag,text,cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
let selectedPhotos={anterior:[],posterior:[]},photoLimit=DEFAULT_PHOTO_LIMIT;
const photoCount=node('p','Nenhuma foto selecionada.'),photoSections={},previewUrls=[];
for(const [group,name] of [['anterior','fotos_anterior'],['posterior','fotos']]){
 const input=form.elements[name],section=input.closest('section'),heading=section.querySelector('h3'),list=node('div','','swap-photo-list');
 input.required=false;input.closest('label').after(list);photoSections[group]={input,section,heading,list};
 input.onchange=()=>{if(busy||prepared)return;try{selectedPhotos=addPhotosToGroup(selectedPhotos,group,[...input.files],photoLimit);renderPhotos();status.textContent='Fotos adicionadas ao veículo '+(group==='anterior'?'substituído.':'substituto.');}catch(error){status.textContent=error.message;}finally{input.value='';}};
}
photoSections.posterior.section.after(photoCount);
function renderPhotos(){
 for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls.length=0;
 const current=selected(),old=car(current?.carro_id),next=car(form.elements.substituto.value);
 const total=selectedPhotos.anterior.length+selectedPhotos.posterior.length;photoCount.textContent=total+' de '+photoLimit+' fotos no total dos dois veículos. Adicione mais em outra seleção, se precisar.';
 for(const [group,info]of Object.entries(photoSections)){
  const vehicle=group==='anterior'?old:next;info.heading.textContent=(group==='anterior'?'Carro substituído / devolvido':'Carro substituto / entregue')+(vehicle?' · '+vehicle.placa:'');info.list.replaceChildren();
  for(const [index,file]of selectedPhotos[group].entries()){
   const row=node('div','','swap-photo-item'),image=document.createElement('img'),url=URL.createObjectURL(file);previewUrls.push(url);image.src=url;image.alt='Foto '+(index+1)+' do '+(group==='anterior'?'carro substituído':'carro substituto');
   const text=node('span',file.name+' · '+(file.size/1048576).toFixed(1)+' MB'),remove=node('button','Remover','btn btn-quiet');remove.type='button';remove.disabled=busy||Boolean(prepared);remove.onclick=()=>{if(busy||prepared)return;selectedPhotos[group].splice(index,1);renderPhotos();};row.append(image,text,remove);info.list.append(row);
  }
 }
}
window.addEventListener('pagehide',()=>{for(const url of previewUrls)URL.revokeObjectURL(url);});
const automatic=new Set(['tipo_substituicao','previsao_retorno','situacao_anterior','diaria_substituto','empresa_razao_social','empresa_cnpj','empresa_endereco','nome_locatario','cpf','cnh','endereco','veiculo_anterior','veiculo_placa','carro_anterior','veiculo_posterior','nova_placa','carro_posterior','dados_veiculo_anterior','dados_veiculo_posterior','data_troca','data_alteracao']);
const car=id=>cars.find(c=>c.id===id),client=id=>clients.find(c=>c.id===id),label=id=>{const c=car(id);return c?`${c.placa} · ${c.modelo||''}`:'Veículo não cadastrado';};
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw new Error(error.code==='42702'?'Há uma ambiguidade na função do banco. Execute corrigir_substituicao_periodos.sql no Supabase como postgres.':(error.message||'Não foi possível concluir a operação.')+(error.code?' (código '+error.code+')':''));return data;}
function selected(){return occupations.find(o=>o.key===form.elements.ocupacao.value);}
function renderFields(){
 const host=$('#swap-fields');host.replaceChildren();const version=versions.find(v=>v.id===form.elements.modelo.value),occupation=selected();
 const old=car(occupation?.carro_id),next=car(form.elements.substituto.value);
 const defaults=substitutionValues(context.company,client(occupation?.cliente_id)||{},old||{},next||{},form.elements.data.value?form.elements.data.value+'-04:00':null);
 $('#swap-current').textContent=occupation?`Ocupação atual: ${client(occupation.cliente_id)?.nome_completo||occupation.responsavel} — ${label(occupation.carro_id)}`:'Escolha o locatário na ocupação atual.';
 $('#swap-vehicle-note').textContent=next?`Substituto: ${label(next.id)}. Confira a diária e a situação do carro anterior.`:'';
 renderPhotos();if(!version)return;
 for(const key of new Set([...fieldsIn(version.conteudo),'motivo_alteracao','quilometragem_posterior'])){
  if(defaults[key]||automatic.has(key)||key==='data_inicio'&&(occupation?.inicio||occupation?.data_inicio))continue;
  const title=node('label',''),span=node('span',key.replaceAll('_',' ')),input=document.createElement(/motivo|condicoes/.test(key)?'textarea':'input');
  input.name=key;input.required=true;input.maxLength=4000;if(input.tagName==='TEXTAREA')input.rows=3;
  if(/quilometragem/.test(key)){input.type='number';input.min='0';input.step='1';}
  title.append(span,input);host.append(title);
 }
}
function renderOccupations(){
 const term=String($('#swap-search').value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const current=form.elements.ocupacao.value;form.elements.ocupacao.replaceChildren(new Option('Selecione uma ocupação atual',''));
 for(const o of occupations){const text=`${client(o.cliente_id)?.nome_completo||o.responsavel||'Cliente sem vínculo'} · ${label(o.carro_id)}`;
  if(!term||text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term))form.elements.ocupacao.add(new Option(text,o.key));}
 form.elements.ocupacao.value=current;
}
async function load(){
 const {data:capability,error:capabilityError}=await db.rpc('substituicao_configuracao',{p_empresa:context.company.id});
 if(capabilityError||capability!==2)throw new Error('Execute ativar_substituicoes_e_rascunhos.sql no Supabase como postgres antes de registrar a troca.');
 const limit=await db.rpc('substituicao_limite_fotos',{p_empresa:context.company.id});photoLimit=!limit.error&&Number.isInteger(limit.data)?Math.min(MAX_PHOTO_LIMIT,Math.max(1,limit.data)):DEFAULT_PHOTO_LIMIT;renderPhotos();
 const [panel,imported,rentals,c,models]=await Promise.all([
  rpc('frota_painel',{p_empresa:context.company.id}),db.from('frota_levantamento').select('*').eq('empresa_id',context.company.id).eq('ativo',true),
  db.from('locacoes').select('id,cliente_id,carro_id,data_inicio,valor_diaria').eq('empresa_id',context.company.id).eq('status','Ativa'),
  db.from('clientes').select('id,nome_completo,cpf,rg,cnh,email,contato_1_numero,contato_2_numero,contato_2_responsavel,contato_3_numero,contato_3_responsavel,contato_4_numero,contato_4_responsavel,nacionalidade,estado_civil,profissao,endereco,numero,complemento,bairro,cidade,uf,cep').eq('empresa_id',context.company.id),rpc('modelos_documentos_publicados',{p_empresa:context.company.id})]);
 for(const r of [imported,rentals,c])if(r.error)throw r.error;
 cars=panel.carros||[];clients=c.data;versions=models.filter(v=>/substitui|altera/i.test(v.nome));
 occupations=(panel.periodos||[]).filter(p=>!p.fim&&p.tipo==='locacao').map(o=>({...o,key:'periodo:'+o.id,tipo:'periodo'}));
 for(const o of rentals.data)if(!occupations.some(p=>p.carro_id===o.carro_id))occupations.push({...o,key:'locacao:'+o.id,tipo:'locacao'});
 for(const o of imported.data)if(!occupations.some(p=>p.carro_id===o.carro_id))occupations.push({...o,key:'levantamento:'+o.id,tipo:'levantamento'});
 const occupied=new Set([...(panel.periodos||[]).filter(p=>!p.fim).map(p=>p.carro_id),...rentals.data.map(p=>p.carro_id),...imported.data.map(p=>p.carro_id)]);
 form.elements.substituto.replaceChildren(new Option('Selecione um veículo disponível',''));
 for(const c of cars)if(c.situacao==='Disponível'&&!c.ocupado_externo&&!occupied.has(c.id))form.elements.substituto.add(new Option(label(c.id),c.id));
 form.elements.modelo.replaceChildren(new Option('Selecione um modelo publicado',''));for(const v of versions)form.elements.modelo.add(new Option(`${v.nome} · v${v.versao}`,v.id));
 if(versions.length===1)form.elements.modelo.value=versions[0].id;
 if(!versions.length)status.textContent='Publique um modelo de substituição em Modelos de documentos para gerar o termo.';
 previousOccupation='';previousSubstitute='';renderOccupations();const params=new URLSearchParams(location.search),plate=params.get('placa'),person=params.get('cliente'),docId=params.get('termo');const match=occupations.find(o=>person?o.cliente_id===person:plate&&car(o.carro_id)?.placa===plate);if(match)form.elements.ocupacao.value=match.key;previousOccupation=form.elements.ocupacao.value;previousSubstitute=form.elements.substituto.value;renderFields();await list(person,docId);
}
async function compress(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error(file.name+': use JPG, PNG ou WebP de até 10 MB.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
 canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível preparar a foto.')),'image/jpeg',.82));
}
async function upload(path,blob,type){const {error}=await db.storage.from('substituicoes-frota').upload(path,blob,{contentType:type,upsert:false});if(error&&!/already exists|Duplicate/i.test(error.message||'')&&String(error.statusCode)!=='409')throw error;}
async function download(path){const {data,error}=await db.storage.from('substituicoes-frota').download(path);if(error)throw error;return data;}
async function finish(doc,local=[]){
 const root=`${doc.empresa_id}/${doc.id}`;if(doc.valores.conversao_sem_troca_fisica&&!local.length){local=[];for(let i=1;i<=doc.fotos;i++)local.push(await download(doc.empresa_id+'/'+doc.valores.termo_temporario_id+'/foto-'+i+'.jpg'));}
 for(const [i,blob]of local.entries())await upload(`${root}/foto-${i+1}.jpg`,blob,'image/jpeg');
 const images=[];for(const photo of substitutionPhotoDescriptors(doc))images.push({blob:await download(`${root}/foto-${photo.index}.jpg`),title:photo.title});
 const blocks=doc.snapshot.modelo.formatacao?.length?fillBlocks(doc.snapshot.modelo.formatacao,doc.valores):null;
 if(blocks&&doc.snapshot.complemento){const at=doc.snapshot.modelo.formatacao.findIndex(b=>(b.runs||[]).some(r=>String(r.text||'').includes('{{ cidade_documento }}')));blocks.splice(at<0?blocks.length:at,0,{align:'justify',runs:[{text:doc.snapshot.complemento,size:11}]});}
 const bytes=await modelPdf(db,doc.snapshot.empresa,doc.texto,null,blocks,images,{fontFamily:'Helvetica',paragraphGap:7,bottom:110});
 await upload(`${root}/termo.pdf`,new Blob([bytes],{type:'application/pdf'}),'application/pdf');
 await rpc('substituicao_confirmar',{p_id:doc.id});await openPdf(doc);
}
async function openPdf(doc){const {data,error}=await db.storage.from('substituicoes-frota').createSignedUrl(`${doc.empresa_id}/${doc.id}/termo.pdf`,600);if(error)throw error;const a=$('#swap-pdf');a.href=data.signedUrl;a.hidden=false;a.className='btn btn-primary';a.textContent='Abrir / baixar termo com fotos';a.focus();let frame=$('#swap-preview');if(!frame){frame=document.createElement('iframe');frame.id='swap-preview';frame.title='Termo de substituição com papel timbrado e fotos';frame.style.cssText='width:100%;height:75vh;border:1px solid #dce3ef;margin-top:16px';form.after(frame);}frame.src=data.signedUrl;frame.scrollIntoView?.({behavior:'smooth',block:'start'});}
async function list(person,docId){
 let query=db.from('frota_substituicoes').select('*').eq('empresa_id',context.company.id);if(person)query=query.eq('cliente_id',person);if(docId)query=query.eq('id',docId);
 const {data,error}=await query.order('criado_em',{ascending:false}).limit(100);if(error)throw error;
 const host=$('#swap-history');host.replaceChildren();if(!data.length)host.append(node('p','Nenhuma substituição registrada.'));
 for(const doc of data){const row=node('div','','record-document'),description=node('div',`${doc.snapshot.cliente.nome_completo} · ${doc.snapshot.anterior.placa} → ${doc.snapshot.posterior.placa} · ${new Date(doc.data_troca).toLocaleString('pt-BR',{timeZone:'America/Manaus'})} · ${doc.valores.tipo_substituicao==='temporaria'?'Temporária':doc.valores.tipo_substituicao==='permanente'?'Permanente':'Tipo não informado'} · ${doc.confirmado_em?'Confirmada':'Preparação pendente'}`),button=node('button',doc.confirmado_em?'Abrir termo em PDF':'Concluir troca','btn btn-quiet');button.type='button';
 if(doc.valores.previsao_retorno)description.append(node('p','Retorno previsto: '+new Date(doc.valores.previsao_retorno).toLocaleString('pt-BR',{timeZone:'America/Manaus'})+' · Não retorna automaticamente.'));
  button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{if(doc.confirmado_em)await openPdf(doc);else{if(!confirm('Confirmar esta troca já preparada e atualizar a ocupação?'))return;await finish(doc);await load();status.textContent='Troca confirmada; histórico e ocupação atualizados.'}}catch(e){status.textContent=e.message+' Se faltam fotos da preparação, retome o envio na mesma tela em que iniciou.'}finally{busy=false;button.disabled=false}};if(doc.valores.permanente_confirmada_id)description.append(node('p','Convertida em permanente: '+doc.valores.permanente_confirmada_id));
 if(doc.confirmado_em&&doc.valores.tipo_substituicao==='temporaria'&&!doc.valores.permanente_confirmada_id){const convert=node('button','Tornar permanente','btn btn-quiet');convert.type='button';convert.onclick=async()=>{if(busy)return;const date=prompt('Data e hora reais da decisão (Manaus), no formato AAAA-MM-DDTHH:mm:',localMoment());if(!date)return;const moment=new Date(date+'-04:00');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)||!Number.isFinite(moment.getTime())||moment.getTime()>Date.now()){status.textContent='Informe uma data válida, que não esteja no futuro.';return;}if(!confirm('Gerar um novo aditivo permanente para o veículo que já está com o locatário? O termo temporário, as fotos originais e a diária atual serão preservados. Não haverá outra troca física.'))return;busy=true;convert.disabled=true;try{const prepared=await rpc('substituicao_permanente_preparar',{p_empresa:context.company.id,p_temporaria:doc.id,p_id:crypto.randomUUID(),p_data:moment.toISOString()});status.textContent='Gerando o aditivo permanente com as fotos da entrega temporária…';const originals=[];for(let i=1;i<=doc.fotos;i++)originals.push(await download(doc.empresa_id+'/'+doc.id+'/foto-'+i+'.jpg'));await finish(prepared,originals);await load();status.textContent='Substituição tornada permanente. Veículo atual e diária mantidos; ambos os termos preservados.';}catch(e){status.textContent=e.message+' Se foi criada uma preparação, conclua pelo histórico; não é preciso registrar outra troca.';}finally{busy=false;convert.disabled=false;}};row.append(convert);}row.append(description,button);host.append(row);}
}
$('#swap-search').oninput=renderOccupations;
if(context.canManageCompany){const standard=node('button','Usar modelo padrão conforme referência','btn btn-quiet');standard.type='button';form.elements.modelo.closest('label').append(standard);standard.onclick=async()=>{if(busy)return;busy=true;standard.disabled=true;try{const starter=TERM_STARTERS.substituicao;let version=versions.find(v=>v.conteudo===starter.conteudo);if(!version){const saved=await rpc('modelo_documento_salvar_editor',{p_empresa:context.company.id,p_id:null,p_revisao:null,p_nome:starter.nome,p_conteudo:starter.conteudo,p_publicar:true,p_arquivado:false,p_formatacao:substitutionBlocks(starter.conteudo),p_tipo:'outro'});versions=(await rpc('modelos_documentos_publicados',{p_empresa:context.company.id})).filter(v=>/substitui|altera/i.test(v.nome));version=versions.find(v=>v.modelo_id===saved.id)||versions.find(v=>v.conteudo===starter.conteudo);form.elements.modelo.replaceChildren(new Option('Selecione um modelo publicado',''));for(const v of versions)form.elements.modelo.add(new Option(`${v.nome} · v${v.versao}`,v.id));}if(!version)throw Error('Não foi possível selecionar o modelo. Atualize a página.');form.elements.modelo.value=version.id;renderFields();status.textContent='Modelo padrão selecionado. Confira os campos que faltam no cadastro antes de gerar.';}catch(e){status.textContent=e.message;}finally{busy=false;standard.disabled=false;}};}
let previousOccupation='',previousSubstitute='';
for(const name of ['ocupacao','substituto','modelo'])form.elements[name].onchange=()=>{
 const group=name==='ocupacao'?'anterior':name==='substituto'?'posterior':null,previous=name==='ocupacao'?previousOccupation:previousSubstitute;
 if(group&&form.elements[name].value!==previous&&selectedPhotos[group].length){
  if(!confirm('Ao mudar o veículo, as fotos desse grupo serão removidas da seleção. Continuar?')){form.elements[name].value=previous;return;}
  selectedPhotos[group]=[];
 }
 if(name==='ocupacao')previousOccupation=form.elements[name].value;if(name==='substituto')previousSubstitute=form.elements[name].value;
 renderFields();if(name==='substituto')form.elements.diaria_substituto.value=car(form.elements.substituto.value)?.valor_diaria??'';
};
function typeFields(){const temporary=form.elements.tipo_substituicao.value==='temporaria';form.elements.previsao_retorno.closest('label').hidden=!temporary;form.elements.previsao_retorno.required=temporary;}
form.elements.tipo_substituicao.onchange=typeFields;typeFields();
form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const button=$('#swap-confirm');button.disabled=true;
 try{
  if(!prepared){
   const moment=new Date(form.elements.data.value+'-04:00');
   if(!form.elements.data.value||!Number.isFinite(moment.getTime()))throw new Error('Informe a data e a hora reais da troca, no horário de Manaus.');
   if(moment.getTime()>Date.now())throw new Error('A data e a hora da troca ainda estão no futuro. Informe quando a entrega realmente aconteceu, no horário de Manaus. Agora: '+new Date().toLocaleString('pt-BR',{timeZone:'America/Manaus'})+'.');
   if(form.elements.tipo_substituicao.value==='temporaria'){const returnAt=new Date(form.elements.previsao_retorno.value+'-04:00');if(!form.elements.previsao_retorno.value||!Number.isFinite(returnAt.getTime())||returnAt<=moment)throw new Error('Informe uma previsão de retorno posterior à data da troca.');}
   const groups=photoGroupMetadata(selectedPhotos),files=[...selectedPhotos.anterior,...selectedPhotos.posterior];if(files.length>photoLimit)throw new Error('O limite compartilhado é de '+photoLimit+' fotos.');
   if(!confirm('Gerar o termo com as fotos e confirmar a troca '+(form.elements.tipo_substituicao.value==='temporaria'?'temporária':'permanente')+'? A ocupação passará ao substituto. Situação do anterior: '+form.elements.situacao_anterior.value+'.'))return;
   status.textContent='Preparando as fotos da devolução e da entrega…';photos=[];for(const [index,file]of files.entries()){status.textContent='Preparando foto '+(index+1)+' de '+files.length+'…';photos.push(await compress(file));}
   const o=selected();if(!o?.cliente_id||!o?.carro_id)throw new Error('Vincule cliente e veículo no cadastro da ocupação antes de trocar.');
   const values={...substitutionValues(context.company,client(o.cliente_id)||{},car(o.carro_id)||{},car(form.elements.substituto.value)||{},moment.toISOString()),...Object.fromEntries([...$('#swap-fields').querySelectorAll('[name]')].map(el=>[el.name,el.value]))};
   Object.assign(values,{fotos_grupos:groups,tipo_substituicao:form.elements.tipo_substituicao.value,previsao_retorno:form.elements.tipo_substituicao.value==='temporaria'?new Date(form.elements.previsao_retorno.value+'-04:00').toISOString():null,situacao_anterior:form.elements.situacao_anterior.value,diaria_substituto:form.elements.diaria_substituto.value});
   if(JSON.stringify(values).length>45000)throw new Error('Os textos da troca ficaram extensos demais. Reduza as observações antes de enviar.');
   prepared=await rpc('substituicao_preparar',{p_empresa:context.company.id,p_id:crypto.randomUUID(),p_origem:o.tipo,p_ocupacao:o.id,p_carro:form.elements.substituto.value,p_data:new Date(form.elements.data.value+'-04:00').toISOString(),p_versao:form.elements.modelo.value,p_valores:values,p_fotos:photos.length});
   for(const el of form.elements)if(el!==button)el.disabled=true;
  }
  status.textContent='Gerando o PDF com papel timbrado e fotos. A frota será atualizada após o envio completo…';
  await finish(prepared,photos);prepared=null;photos=[];selectedPhotos={anterior:[],posterior:[]};renderPhotos();form.reset();for(const el of form.elements)el.disabled=false;
  form.elements.data.value=localMoment();await load();typeFields();window.bgClearListCache?.();status.textContent='Termo gerado com fotos e salvo no histórico do locatário. Ocupação, diária e situação dos veículos atualizadas.';
 }catch(error){status.textContent=error.message+(prepared?' Preparação preservada. Consulte o histórico ou clique novamente para retomar; o reenvio não duplica a troca.':'');}
 finally{busy=false;button.disabled=false;}
};
load().catch(error=>{status.textContent=/does not exist|schema cache|Could not find/i.test(error.message||'')?'Aplique substituicao_frota.sql no SQL Editor para ativar a confirmação das trocas.':error.message;});
