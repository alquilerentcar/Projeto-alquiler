// CRLV do veículo, com validade. Vai sozinho para o e-mail do locatário quando a locação/ocupação começa ou o carro é trocado;
// aqui também dá para reenviar. Arquivo privado; o CRLV antigo vai para o arquivo (nada é apagado).
export const TIPOS_DOC={crlv:'CRLV / licenciamento'};
const EXT={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'';
const hojeManaus=()=>new Date(Date.now()-4*3600000).toISOString().slice(0,10);
export function situacaoValidade(validade,hoje=hojeManaus()){if(!validade)return {tom:'cinza',texto:'Sem validade'};const dias=Math.round((Date.parse(validade)-Date.parse(hoje))/86400000);
 if(dias<0)return {tom:'vermelho',texto:'Vencido em '+data(validade)};if(dias<=30)return {tom:'laranja',texto:'Vence em '+data(validade)+' ('+dias+' dia'+(dias===1?'':'s')+')'};return {tom:'verde',texto:'Válido até '+data(validade)};}
const erroSql=e=>/carro_documento|carro_ocupante|Could not find|schema cache|does not exist/i.test(e?.message||'')?'Aplique sql/documentos_veiculos.sql no Supabase para ativar os documentos dos veículos.':(e?.message||String(e));

const CSS=`.docv-dialog{width:min(760px,calc(100vw - 24px))}.docv-lista{display:grid;gap:8px;margin:6px 0 14px}.docv-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--ui-border,#e3e5ea);border-radius:12px;animation:docv-entra .2s ease both}
.docv-item input[type=checkbox]{margin:0}.docv-item strong{display:block;font-size:13.5px}.docv-item small{display:block;color:var(--ui-muted,#64748b);font-size:12px}.docv-acoes{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.docv-sec{border-top:1px solid var(--ui-border,#e3e5ea);padding-top:14px;margin-top:6px}.docv-sec h3{margin:0 0 10px;font-size:14px}.docv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end}
.docv-grid label{display:grid;gap:5px;font-size:12px;font-weight:650}.docv-grid :is(input:not([type=checkbox]),select){min-height:42px;width:100%;box-sizing:border-box;border:1px solid var(--ui-border,#d0d5dd);border-radius:10px;padding:9px 12px;background-color:var(--company-surface,#fff);font:inherit;font-weight:400}.docv-grid input[type=file]{padding:6px 8px}.docv-vazio{padding:14px;text-align:center;color:var(--ui-muted,#64748b);border:1px dashed var(--ui-border,#e3e5ea);border-radius:12px}
.docv-msg{min-height:18px;font-size:12.5px;margin:8px 0 0}.docv-msg.erro{color:#c0362c}.docv-msg.ok{color:#15803d}
@keyframes docv-entra{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}@media(max-width:640px){.docv-item{grid-template-columns:auto 1fr}.docv-acoes{grid-column:1/-1;justify-content:flex-start}}`;

// carro: {id, placa, empresa_id?}. opcoes: {clienteId, motivo, focoEnvio}
export async function abrirDocumentos(db,company,carro,opcoes={}){
 if(!document.getElementById('docv-css')){const st=el('style');st.id='docv-css';st.textContent=CSS;document.head.append(st);}
 const empresa=carro.empresa_id||company.id;
 const dialog=el('dialog',null,'client-dialog docv-dialog'),head=el('div',null,'dialog-header'),body=el('div',null,'dialog-body'),fechar=el('button','Fechar','btn btn-quiet');fechar.type='button';
 head.append(el('h2','CRLV · '+(carro.placa||'veículo')),fechar);dialog.append(head,body);document.body.append(dialog);fechar.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 const msg=el('p',null,'docv-msg'),lista=el('div',null,'docv-lista');const aviso=(t,tipo='')=>{msg.textContent=t;msg.className='docv-msg '+tipo;};
 body.append(el('p','Anexe o CRLV do carro. Quando uma locação ou ocupação começar, ou o carro for trocado, ele vai sozinho para o e-mail do locatário.','section-note'),lista);
 let docs=[];const marcados=new Set();
 async function carregar(){lista.replaceChildren(el('p','Carregando…','section-note'));
  const {data:rows,error}=await db.from('carro_documentos').select('id,tipo,nome,arquivo_path,validade,criado_em').eq('carro_id',carro.id).eq('tipo','crlv').is('arquivado_em',null).order('criado_em',{ascending:false});
  if(error){lista.replaceChildren(el('p',erroSql(error),'docv-msg erro'));return;}docs=rows||[];desenhar();}
 function desenhar(){lista.replaceChildren();if(!docs.length){lista.append(el('div','Nenhum CRLV anexado ainda. Sem ele, o envio automático fica pendente e aparece um aviso.','docv-vazio'));return;}
  if(!marcados.size)docs.filter(d=>d.tipo==='crlv').slice(0,1).forEach(d=>marcados.add(d.id));
  docs.forEach((d,i)=>{const it=el('div',null,'docv-item');it.style.animationDelay=Math.min(i,8)*30+'ms';const cb=el('input');cb.type='checkbox';cb.checked=marcados.has(d.id);cb.setAttribute('aria-label','Enviar '+d.nome);cb.onchange=()=>{cb.checked?marcados.add(d.id):marcados.delete(d.id);};
   const sit=situacaoValidade(d.validade),info=el('div');info.append(el('strong',d.nome),el('small',TIPOS_DOC[d.tipo]||d.tipo));const tag=el('span',sit.texto,'tom tom-'+sit.tom);tag.style.marginTop='4px';info.append(tag);
   const ac=el('div',null,'docv-acoes'),abrir=el('button','Abrir','btn btn-quiet'),val=el('button','Validade','btn btn-quiet'),arq=el('button','Arquivar','btn btn-quiet');[abrir,val,arq].forEach(b=>b.type='button');
   abrir.onclick=async()=>{abrir.disabled=true;try{const r=await db.storage.from('documentos-veiculos').createSignedUrl(d.arquivo_path,300);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener');}catch(e){aviso(erroSql(e),'erro');}finally{abrir.disabled=false;}};
   val.onclick=()=>{const f=el('div',null,'docv-grid'),l=el('label'),inp=el('input');inp.type='date';inp.value=d.validade||'';l.append(el('span','Nova validade'),inp);const ok=el('button','Salvar validade','btn btn-primary');ok.type='button';f.append(l,ok);it.after(f);inp.focus();
    ok.onclick=async()=>{ok.disabled=true;const {error}=await db.rpc('carro_documento_atualizar',{p_empresa:empresa,p_id:d.id,p_validade:inp.value||null,p_arquivar:false});if(error){aviso(erroSql(error),'erro');ok.disabled=false;return;}aviso('Validade atualizada.','ok');await carregar();};};
   arq.onclick=async()=>{if(!confirm('Arquivar '+d.nome+'? Ele sai da lista, mas fica guardado no histórico.'))return;const {error}=await db.rpc('carro_documento_atualizar',{p_empresa:empresa,p_id:d.id,p_validade:d.validade,p_arquivar:true});if(error)return aviso(erroSql(error),'erro');marcados.delete(d.id);aviso('Documento arquivado.','ok');await carregar();};
   ac.append(abrir,val,arq);it.append(cb,info,ac);lista.append(it);});}

 // Anexar documento.
 const up=el('div',null,'docv-sec'),g=el('div',null,'docv-grid');up.append(el('h3','Anexar CRLV'),g);
 const campo=(rotulo,inp)=>{const l=el('label');l.append(el('span',rotulo),inp);g.append(l);return inp;};
 const tipo={value:'crlv',onchange:null};
 const nome=campo('Descrição',el('input'));nome.maxLength=180;const ano=new Date().getFullYear();const sugerir=()=>{if(!nome.dataset.mexeu)nome.value='CRLV '+ano+' · '+(carro.placa||'');};nome.oninput=()=>{nome.dataset.mexeu='1';};sugerir();
 const validade=campo('Validade do licenciamento',el('input'));validade.type='date';
 const arquivo=campo('Arquivo (PDF ou foto, até 10 MB)',el('input'));arquivo.type='file';arquivo.accept='.pdf,image/jpeg,image/png,image/webp';
 const enviarArq=el('button','Anexar CRLV','btn btn-primary');enviarArq.type='button';g.append(enviarArq);
 let pendente=null;
 enviarArq.onclick=async()=>{const f=arquivo.files[0];if(!f||!EXT[f.type]||f.size>10*1024*1024)return aviso('Escolha um PDF ou foto (JPG, PNG, WebP) de até 10 MB.','erro');if(nome.value.trim().length<2)return aviso('Informe a descrição.','erro');
  enviarArq.disabled=true;aviso('Enviando arquivo…');try{if(!pendente||pendente.file!==f){const id=crypto.randomUUID();pendente={id,file:f,path:empresa+'/'+carro.id+'/'+id+'.'+EXT[f.type],enviado:false};}
   if(!pendente.enviado){const r=await db.storage.from('documentos-veiculos').upload(pendente.path,f,{upsert:false,contentType:f.type});if(r.error&&Number(r.error.statusCode)!==409)throw r.error;pendente.enviado=true;}
   const {error}=await db.rpc('carro_documento_registrar',{p_empresa:empresa,p_carro:carro.id,p_id:pendente.id,p_tipo:tipo.value,p_nome:nome.value.trim(),p_path:pendente.path,p_validade:validade.value||null});if(error)throw error;
   const antigos=docs.map(d=>d.id),novo=pendente.id;marcados.clear();marcados.add(novo);pendente=null;arquivo.value='';validade.value='';delete nome.dataset.mexeu;sugerir();
   // Só um CRLV vale por vez: o anterior vai para o arquivo (continua guardado).
   for(const id of antigos){const ant=docs.find(d=>d.id===id);await db.rpc('carro_documento_atualizar',{p_empresa:empresa,p_id:id,p_validade:ant?.validade||null,p_arquivar:true});}
   aviso(antigos.length?'CRLV novo anexado. O anterior foi para o arquivo.':'CRLV anexado.','ok');await carregar();carregarEnvios();}
  catch(e){aviso(erroSql(e)+' Se o arquivo já subiu, clique em Anexar de novo.','erro');}finally{enviarArq.disabled=false;}};

 // Enviar por e-mail ao locatário.
 const env=el('div',null,'docv-sec'),eg=el('div',null,'docv-grid');env.append(el('h3','Reenviar o CRLV por e-mail'),el('p','O envio já é automático na locação, na ocupação e na troca. Use aqui se o locatário pedir de novo.','section-note'),eg);
 const campoE=(rotulo,inp)=>{const l=el('label');l.append(el('span',rotulo),inp);eg.append(l);return inp;};
 const quem=campoE('Locatário',el('select'));quem.add(new Option('Carregando…',''));
 const motivo=campoE('Motivo',el('select'));for(const m of ['Pedido do locatário','Entrega do veículo (locação)','Substituição de veículo','CRLV renovado'])motivo.add(new Option(m,m));if(opcoes.motivo)motivo.value=opcoes.motivo;
 const mandar=el('button','Enviar por e-mail','btn btn-primary');mandar.type='button';eg.append(mandar);const emailInfo=el('small',null,'section-note');env.append(emailInfo);
 const clientes=new Map();
 async function carregarClientes(){quem.replaceChildren(new Option('Escolha o locatário',''));try{
   const atual=await db.rpc('carro_ocupante_atual',{p_empresa:empresa,p_carro:carro.id});const oc=atual.error?null:atual.data;
   const {data:cls}=await db.from('clientes').select('id,nome_completo,email').eq('empresa_id',empresa).order('nome_completo');
   for(const c of cls||[])clientes.set(c.id,c);if(oc?.cliente_id&&!clientes.has(oc.cliente_id))clientes.set(oc.cliente_id,{id:oc.cliente_id,nome_completo:oc.nome,email:oc.email});
   if(oc?.cliente_id){const o=new Option(oc.nome+' (está com o carro)',oc.cliente_id);quem.add(o);}
   for(const c of clientes.values())if(c.id!==oc?.cliente_id)quem.add(new Option(c.nome_completo,c.id));
   quem.value=opcoes.clienteId&&clientes.has(opcoes.clienteId)?opcoes.clienteId:(oc?.cliente_id||'');mostrarEmail();}catch(e){aviso(erroSql(e),'erro');}}
 function mostrarEmail(){const c=clientes.get(quem.value);emailInfo.textContent=!c?'':c.email?'Vai para: '+c.email:'Este locatário não tem e-mail no cadastro. Cadastre o e-mail antes de enviar.';emailInfo.style.color=c&&!c.email?'#c0362c':'';}
 quem.onchange=mostrarEmail;
 mandar.onclick=async()=>{const c=clientes.get(quem.value);if(!c)return aviso('Escolha o locatário.','erro');if(!c.email)return aviso('O locatário não tem e-mail no cadastro.','erro');const ids=[...marcados].filter(id=>docs.some(d=>d.id===id));if(!ids.length)return aviso('Anexe o CRLV antes de enviar.','erro');
  if(!confirm(`Enviar o CRLV do ${carro.placa} para ${c.email}?`))return;mandar.disabled=true;aviso('Enviando e-mail…');
  try{const r=await fetch('/api/email-documentos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({carro_id:carro.id,cliente_id:c.id,documentos:ids,motivo:motivo.value})});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Não foi possível enviar.');
   aviso('E-mail enviado para '+j.email+'.','ok');carregarEnvios();import('./celebrar.mjs?v=20261128').then(m=>m.celebrar('E-mail enviado!','Documentos do '+carro.placa)).catch(()=>{});}catch(e){aviso(e.message,'erro');}finally{mandar.disabled=false;}};

 // Últimos envios (automáticos e manuais).
 const hist=el('div',null,'docv-sec'),histLista=el('div');hist.append(el('h3','Últimos envios'),histLista);
 async function carregarEnvios(){const {data:rows,error}=await db.from('carro_documento_envios').select('email,motivo,enviado_em,cliente_id').eq('carro_id',carro.id).order('enviado_em',{ascending:false}).limit(5);
  histLista.replaceChildren();if(error){histLista.append(el('p','—','section-note'));return;}if(!rows?.length){histLista.append(el('p','Nenhum envio ainda.','section-note'));return;}
  for(const e of rows)histLista.append(el('p',new Date(e.enviado_em).toLocaleString('pt-BR',{timeZone:'America/Manaus',dateStyle:'short',timeStyle:'short'})+' · '+e.email+(e.motivo?' · '+e.motivo:''),'section-note'));}
 body.append(up,env,hist,msg);dialog.showModal();await Promise.all([carregar(),carregarClientes(),carregarEnvios()]);if(opcoes.focoEnvio)env.scrollIntoView({block:'nearest'});
 return dialog;
}
