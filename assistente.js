import {showAction} from './assistente-actions.mjs';
import {intakeLabels,attachmentKinds,mergeIntake,saveIntake} from './assistente-intake.mjs';
import {getAuthenticatedClient} from './auth-guard.js';
const db=await getAuthenticatedClient();
const page = document.body.dataset.page || location.pathname.replace(/\W/g, '');
const {data:identity,error:identityError}=await db.auth.getSession();
if(identityError||!identity?.session?.user?.id)throw new Error('Entre novamente para usar o assistente.');
const conversationScope=identity.session.user.id+':'+(window.alquilerContext.company?.id||'plataforma');
const key='alquiler-assistente-historico:v2:'+conversationScope;
const openKey='alquiler-assistente-aberto:v2:'+conversationScope;
// Old histories had no account owner and cannot be safely assigned to this user.
try{Object.keys(sessionStorage).filter(k=>k.startsWith('alquiler-assistente-historico:')&&!k.startsWith('alquiler-assistente-historico:v2:')).forEach(k=>sessionStorage.removeItem(k));sessionStorage.removeItem('alquiler-assistente-aberto');}catch{}
db.auth.onAuthStateChange((event,session)=>{if(!session||session.user.id!==identity.session.user.id){document.querySelector('.ai-root')?.remove();try{sessionStorage.removeItem(key);sessionStorage.removeItem(openKey);}catch{}}});
let history = [];
try { history = JSON.parse(sessionStorage.getItem(key) || '[]'); if (!Array.isArray(history)) history = []; } catch { history = []; }

const root = document.createElement('div');
root.className = 'ai-root';
root.innerHTML = `<button class="ai-launch" type="button" aria-label="Abrir assistente" aria-controls="ai-floating-panel" aria-expanded="false">✦ <span>RECRUTA</span></button>
  <section id="ai-floating-panel" class="ai-panel" aria-label="RECRUTA" hidden>
    <header class="ai-header"><div><strong>RECRUTA</strong><small class="ai-company">Empresa</small></div><button class="ai-close" type="button" aria-label="Fechar">×</button></header>
    <div class="ai-messages" role="log" aria-live="polite"></div>
    <div class="ai-setup" hidden><strong>Assistente indisponível</strong><span>A integração precisa ser configurada pelo administrador do sistema.</span></div>
    <div class="ai-actions"><label class="ai-file-button">📎 Anexar documentos<input class="ai-file" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" hidden></label></div>
    <form class="ai-form"><input class="ai-input" type="text" maxlength="2000" placeholder="Pergunte sobre os cadastros…" aria-label="Mensagem ao assistente"><button type="submit" aria-label="Enviar mensagem">➤</button></form>
    <small class="ai-footnote">Documentos e consultas são enviados ao Gemini quando você solicita.</small>
  </section>`;
document.body.append(root);
root.querySelector('.ai-company').textContent=window.alquilerContext.company?.nome_fantasia||'BG SYSTEMS · Selecione uma empresa';
const panel = root.querySelector('.ai-panel');
const launch = root.querySelector('.ai-launch');
const messages = root.querySelector('.ai-messages');
const input = root.querySelector('.ai-input');
const fileInput = root.querySelector('.ai-file');
const sendButton = root.querySelector('.ai-form button');
const setup = root.querySelector('.ai-setup');

function saveHistory() { sessionStorage.setItem(key, JSON.stringify(history.slice(-12))); }
function addMessage(role, content, persist = true) {
  const node = document.createElement('div');
  node.className = `ai-message ai-${role}`;
  node.textContent = content;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  if (persist) { history.push({role: role === 'user' ? 'user' : 'assistant', content}); history = history.slice(-12); saveHistory(); }
  return node;
}
if (history.length) history.forEach(item => addMessage(item.role === 'user' ? 'user' : 'bot', item.content, false));
else addMessage('bot', 'Olá! Posso buscar clientes e cadastrar com os documentos anexados. Envie CNH e comprovante juntos, confira os dados e peça para cadastrar.');

function toggle(open) { panel.hidden = !open; launch.setAttribute('aria-expanded', String(open)); sessionStorage.setItem(openKey, String(open)); if (open) input.focus(); }
launch.addEventListener('click', () => toggle(panel.hidden));
root.querySelector('.ai-close').addEventListener('click', () => {toggle(false);launch.focus();});
root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){toggle(false);launch.focus();}});
if (sessionStorage.getItem(openKey) === 'true') toggle(true);

async function post(url, data) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a solicitação.');
  return result;
}

let aiProvider='gemini';
async function refreshStatus() {
  try {
    const response = await fetch('/api/assistente/status');
    const status = await response.json();
    aiProvider=status.provider||'gemini';
    const assistantName=String(status.name||'RECRUTA').trim().slice(0,60)||'RECRUTA';
    launch.querySelector('span').textContent=assistantName;
    launch.setAttribute('aria-label','Abrir '+assistantName);
    panel.setAttribute('aria-label',assistantName);
    root.querySelector('.ai-header strong').textContent=assistantName;
    setup.hidden = Boolean(status.active);
    setup.querySelector('strong').textContent='Assistente indisponível';
    setup.querySelector('span').textContent='A integração central precisa ser configurada pela BG SYSTEMS. Você não precisa informar uma chave.';
    root.querySelector('.ai-footnote').textContent='Documentos são enviados à '+(aiProvider==='groq'?'Groq':'Gemini')+' quando você solicita.';
    input.disabled = sendButton.disabled = !status.active;
  } catch { setup.hidden = false; }
}
refreshStatus();

root.querySelector('.ai-form').addEventListener('submit', async event => {
  event.preventDefault();
  if(!window.alquilerContext.company?.id){addMessage('bot','Selecione uma empresa na aba Módulos antes de consultar ou cadastrar dados.',false);return;}
  const message = input.value.trim(); if (!message&&!queuedFiles.length) return;
  if(queuedFiles.length){if(intakeBusy)return;addMessage('user',(message||'Ler os documentos anexados')+'\nAnexos: '+queuedFiles.map(file=>file.name).join(', '));input.value='';await readQueuedFiles(message);return;}
  const command=message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!/contrato|loca[cç][aã]o|ve[ií]culo|carro|modelo|documento|recibo|distrato|termo/i.test(message)&&/^(?:(?:pode|quero|vamos|por favor)\s+)?(?:cadastrar|cadastre|salvar|salve|criar|crie)\b/.test(command)){
    addMessage('user',message);input.value='';await commitIntake();return;
  }
  const prior = history.slice(-8);
  addMessage('user', message); input.value = ''; input.disabled = sendButton.disabled = true;
  const pending = addMessage('bot', 'Pensando…', false);
  try { const result = await post('/api/assistente/conversar', {message, history: prior, page}); pending.remove(); addMessage('bot', result.reply || 'Não consegui formular uma resposta.'); if(result.action)await showAction({action:result.action,db,context:window.alquilerContext,host:messages,notify:text=>addMessage('bot',text),userId:identity.session.user.id}); }
  catch (error) { pending.remove(); addMessage('bot', error.message, false); }
  finally { input.disabled = sendButton.disabled = false; input.focus(); }
});

let intakeRecords=[],intakeReview=null,intakeSaved={},intakeBusy=false,queuedFiles=[];
const queuedHost=document.createElement('div');queuedHost.className='ai-pending-attachments';root.querySelector('.ai-actions').append(queuedHost);
function renderQueuedFiles(){queuedHost.replaceChildren();for(const file of queuedFiles){const row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');name.textContent=file.name;remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remover anexo '+file.name);remove.disabled=intakeBusy;remove.onclick=()=>{queuedFiles=queuedFiles.filter(item=>item!==file);renderQueuedFiles();};row.append(name,remove);queuedHost.append(row);}if(queuedFiles.length){const note=document.createElement('small');note.textContent='Prontos para enviar. Escreva sua orientação e clique em Enviar.';queuedHost.append(note);}}
const intakeCompany=window.alquilerContext.company?.id||'plataforma';
function intakeReadReview(){const draft={};for(const field of Object.keys(intakeLabels)){const control=intakeReview?.querySelector(`[name="${field}"]`);if(control)draft[field]=control.value;}return draft;}
function showIntakeReview(){
 const edited=intakeReview?intakeReadReview():{};intakeReview?.remove();
 const fields=mergeIntake(intakeRecords),form=document.createElement('form');form.className='ai-intake';form.noValidate=true;
 const title=document.createElement('strong');title.textContent='Confira os dados e os anexos';form.append(title);
 const info=document.createElement('p');info.textContent='Empresa: '+window.alquilerContext.company.nome_fantasia+'. Originais ficam em armazenamento privado. Campos ausentes podem ser preenchidos abaixo.';form.append(info);
 for(const record of intakeRecords){const box=document.createElement('div');box.className='ai-intake-file';const name=document.createElement('strong');name.textContent=record.file.name;const select=document.createElement('select');select.setAttribute('aria-label','Tipo do arquivo '+record.file.name);select.add(new Option('Escolha o tipo de documento',''));for(const [kind,value] of Object.entries(attachmentKinds))select.add(new Option(value.label,kind));select.value=record.kind||'';select.onchange=()=>{record.kind=select.value;};box.append(name,select);const summary=document.createElement('small');summary.textContent=Object.entries(record.draft||{}).filter(([,v])=>v).map(([key,value])=>(intakeLabels[key]||key)+': '+value).join(' · ')||'Leitura indisponível: preencha os campos manualmente.';box.append(summary);const remove=document.createElement('button');remove.type='button';remove.textContent='Remover arquivo';remove.onclick=()=>{intakeRecords=intakeRecords.filter(item=>item!==record);showIntakeReview();};box.append(remove);form.append(box);}
 for(const field of new Set(['nome_completo','cpf','cnh','data_nascimento','email','contato_1_numero','cep','endereco','numero','bairro','cidade','uf',...Object.keys(fields)])){
  const label=document.createElement('label'),caption=document.createElement('span');caption.textContent=intakeLabels[field];const control=document.createElement('input');control.name=field;control.maxLength=200;control.autocomplete='off';control.value=fields[field]?.length>1?'':(edited[field]||fields[field]?.[0]?.value||'');label.append(caption,control);
  if(fields[field]?.length>1){const warning=document.createElement('small');warning.textContent='Valores diferentes nos documentos. Escolha ou corrija:';const select=document.createElement('select');select.add(new Option('Escolher dado',''));for(const item of fields[field])select.add(new Option(item.value+' — '+item.source,item.value));select.onchange=()=>{control.value=select.value;};label.append(warning,select);control.dataset.conflict='true';}
  form.append(label);
 }
 const submit=document.createElement('button');submit.type='submit';submit.className='ai-review';submit.textContent=intakeSaved.clientId?'Concluir anexos pendentes':'Cadastrar e anexar documentos';form.append(submit);
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Descartar documentos desta leitura';cancel.onclick=()=>{intakeRecords=[];intakeSaved={};form.remove();intakeReview=null;};form.append(cancel);
 form.addEventListener('submit',event=>{event.preventDefault();commitIntake();});intakeReview=form;messages.append(form);messages.scrollTop=messages.scrollHeight;
}
async function commitIntake(){
 if(queuedFiles.length)return addMessage('bot','Você tem arquivos ainda não enviados. Envie a mensagem com os anexos antes de concluir o cadastro.',false);
 if(intakeBusy)return addMessage('bot','Aguarde a leitura ou gravação em andamento.',false);
 if(!intakeRecords.length)return addMessage('bot','Envie a CNH e o comprovante pelo botão Anexar documentos. Vou mostrar os dados para conferência e cadastrar com os anexos.',false);
 const draft=intakeReadReview();
 for(const control of intakeReview.querySelectorAll('input[data-conflict]'))if(!control.value.trim())return addMessage('bot','Confira os valores diferentes antes de cadastrar: '+intakeLabels[control.name]+'.',false);
 intakeBusy=true;fileInput.disabled=true;intakeReview.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
 const progress=addMessage('bot','Salvando o cadastro e os documentos originais…',false);
 try{
  const result=await saveIntake(db,intakeCompany,draft,intakeRecords,intakeSaved);progress.remove();
  addMessage('bot',(result.created?'Cliente cadastrado':'Cadastro existente localizado e campos vazios completados')+': '+result.client.nome_completo+'. Documentos vinculados ao cadastro.'+(result.skipped.length?' Anexos anteriores preservados: '+result.skipped.join(', ')+'. Os arquivos novos desses tipos não foram substituídos.':''),false);
  const link=document.createElement('a');link.href='/cadastros/clientes';link.textContent='Ver cadastro em Clientes';link.className='ai-review';messages.append(link);
  intakeRecords=[];intakeSaved={};intakeReview.remove();intakeReview=null;
 }catch(error){progress.remove();addMessage('bot',(intakeSaved.clientId?'O cadastro já foi salvo. Parte dos anexos pode estar vinculada. Corrija o problema e clique em Concluir anexos pendentes; não será criado outro cliente. ':'Não foi possível cadastrar. ')+(error.message||'Falha na gravação.'),false);if(intakeReview){intakeReview.querySelectorAll('input,select,button').forEach(control=>control.disabled=false);if(intakeSaved.clientId)intakeReview.querySelector('button[type=submit]').textContent='Concluir anexos pendentes';}}
 finally{intakeBusy=false;fileInput.disabled=false;}
}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Falha ao ler o arquivo.'));reader.readAsDataURL(file);});}
async function intakeExtraction(file,instruction=''){
 const dataUrl=await fileAsDataUrl(file);let images;
 if(aiProvider==='groq'&&file.type==='application/pdf'){
  const {getDocument,GlobalWorkerOptions}=await import('./pdfjs/pdf.mjs');GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.mjs',import.meta.url).href;
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true});
  try{const pdf=await task.promise;if(pdf.numPages>3)throw Error('Envie um PDF de até três páginas para leitura. O original pode ser anexado com preenchimento manual.');images=[];
   for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1600/Math.max(base.width,base.height))}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;images.push(canvas.toDataURL('image/jpeg',.85));canvas.width=canvas.height=0;}
  }finally{await task.destroy();}
 }
 return post('/api/assistente/extrair',{instruction,filename:file.name,mime:images?'image/jpeg':file.type,dataUrl:images?images[0]:dataUrl,...(images?{images}:{})});
}
fileInput.addEventListener('change',()=>{
 const files=Array.from(fileInput.files);fileInput.value='';if(!files.length||intakeBusy)return;
 if(intakeRecords.length+queuedFiles.length+files.length>3)return addMessage('bot','Envie até três arquivos por cadastro: CNH, RG e comprovante.',false);
 if(files.some(file=>!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024))return addMessage('bot','Use PDF, JPG, PNG ou WebP de até 8 MB por arquivo.',false);
 queuedFiles.push(...files);renderQueuedFiles();input.focus();
});
async function readQueuedFiles(instruction){
 const files=queuedFiles;queuedFiles=[];intakeBusy=true;fileInput.disabled=true;input.disabled=sendButton.disabled=true;renderQueuedFiles();
 if(intakeReview)intakeReview.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
 const progress=addMessage('bot','Lendo '+files.length+' documento(s)…',false);
 try{for(const file of files){const record={file,draft:{},kind:''};intakeRecords.push(record);try{const result=await intakeExtraction(file,instruction);record.draft=result.draft||{};record.kind=attachmentKinds[result.documentType]?result.documentType:'';}catch(error){addMessage('bot',file.name+': '+error.message,false);}}progress.remove();showIntakeReview();addMessage('bot','Confira os dados acima. Você pode clicar em Cadastrar e anexar documentos ou escrever “pode cadastrar”. Os arquivos só serão salvos ao concluir.',false);}
 finally{intakeBusy=false;fileInput.disabled=false;input.disabled=sendButton.disabled=false;input.focus();}
}
