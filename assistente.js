import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
const page = document.body.dataset.page || location.pathname.replace(/\W/g, '');
const key = 'alquiler-assistente-historico';
let history = [];
try { history = JSON.parse(sessionStorage.getItem(key) || '[]'); if (!Array.isArray(history)) history = []; } catch { history = []; }

const root = document.createElement('div');
root.className = 'ai-root';
root.innerHTML = `<button class="ai-launch" type="button" aria-label="Abrir assistente" aria-expanded="false">✦ <span>Assistente IA</span></button>
  <section class="ai-panel" aria-label="Assistente IA" hidden>
    <header class="ai-header"><div><strong>Assistente IA</strong><small>Alquiler Rent Car</small></div><button class="ai-close" type="button" aria-label="Fechar">×</button></header>
    <div class="ai-messages" role="log" aria-live="polite"></div>
    <div class="ai-setup" hidden><strong>Ativar Gemini</strong><span>Cole sua chave da API. Ela ficará somente na memória deste servidor local.</span><div><input class="ai-key" type="password" autocomplete="off" placeholder="Chave do Gemini"><button class="ai-key-save" type="button">Ativar</button></div></div>
    <div class="ai-actions"><label class="ai-file-button">📎 Enviar documento<input class="ai-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></label></div>
    <form class="ai-form"><input class="ai-input" type="text" maxlength="2000" placeholder="Pergunte sobre os cadastros…" aria-label="Mensagem ao assistente"><button type="submit" aria-label="Enviar mensagem">➤</button></form>
    <small class="ai-footnote">Documentos e consultas são enviados ao Gemini quando você solicita.</small>
  </section>`;
document.body.append(root);
const panel = root.querySelector('.ai-panel');
const launch = root.querySelector('.ai-launch');
const messages = root.querySelector('.ai-messages');
const input = root.querySelector('.ai-input');
const fileInput = root.querySelector('.ai-file');
const sendButton = root.querySelector('.ai-form button');
const setup = root.querySelector('.ai-setup');
const keyInput = root.querySelector('.ai-key');
const keyButton = root.querySelector('.ai-key-save');

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
else addMessage('bot', 'Olá! Posso ajudar com os cadastros, buscar um cliente ou ler um documento para preparar um novo cadastro.');

function toggle(open) { panel.hidden = !open; launch.setAttribute('aria-expanded', String(open)); sessionStorage.setItem('alquiler-assistente-aberto', String(open)); if (open) input.focus(); }
launch.addEventListener('click', () => toggle(panel.hidden));
root.querySelector('.ai-close').addEventListener('click', () => toggle(false));
if (sessionStorage.getItem('alquiler-assistente-aberto') === 'true') toggle(true);

async function post(url, data) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a solicitação.');
  return result;
}

async function refreshStatus() {
  try {
    const response = await fetch('/api/assistente/status');
    const status = await response.json();
    setup.hidden = Boolean(status.active);
    input.disabled = sendButton.disabled = !status.active;
  } catch { setup.hidden = false; }
}
keyButton.addEventListener('click', async () => {
  const value = keyInput.value.trim();
  if (!value) return addMessage('bot', 'Cole a chave do Gemini.', false);
  keyButton.disabled = true; keyButton.textContent = 'Ativando…';
  try {
    await post('/api/assistente/configurar', {key: value});
    keyInput.value = ''; setup.hidden = true; input.disabled = sendButton.disabled = false;
    addMessage('bot', 'Gemini ativado. Já posso responder e ler documentos.', false); input.focus();
  } catch (error) { addMessage('bot', error.message, false); }
  finally { keyButton.disabled = false; keyButton.textContent = 'Ativar'; }
});
refreshStatus();

root.querySelector('.ai-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = input.value.trim(); if (!message) return;
  const prior = history.slice(-8);
  addMessage('user', message); input.value = ''; input.disabled = sendButton.disabled = true;
  const pending = addMessage('bot', 'Pensando…', false);
  try { const result = await post('/api/assistente/conversar', {message, history: prior, page}); pending.remove(); addMessage('bot', result.reply || 'Não consegui formular uma resposta.'); }
  catch (error) { pending.remove(); addMessage('bot', error.message, false); }
  finally { input.disabled = sendButton.disabled = false; input.focus(); }
});

function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Falha ao ler o arquivo.')); reader.readAsDataURL(file); }); }
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]; if (!file) return;
  if (file.size > 8 * 1024 * 1024) { addMessage('bot', 'Escolha um arquivo de até 8 MB.', false); fileInput.value = ''; return; }
  addMessage('user', `Ler documento: ${file.name}`);
  const pending = addMessage('bot', 'Lendo o documento…', false);
  fileInput.disabled = true;
  try {
    const dataUrl = await fileAsDataUrl(file);
    const result = await post('/api/assistente/extrair', {filename: file.name, mime: file.type, dataUrl});
    pending.remove();
    if (!result.draft?.nome_completo) { addMessage('bot', 'Não encontrei o nome completo. Tente outro documento ou cadastre manualmente.', false); return; }
    const populated = Object.entries(result.draft).filter(([, value]) => value).length;
    const cpf=String(result.draft.cpf||'').replace(/\D/g,'');
    let query=db.from('clientes').select('*').limit(1);
    query=cpf?query.eq('cpf',cpf):query.ilike('nome_completo',result.draft.nome_completo);
    const {data:matches,error:matchError}=await query;
    if(matchError) throw matchError;
    const existing=matches?.[0]||null;
    const labels={cpf:'CPF',data_nascimento:'data de nascimento',rg:'RG',cnh:'CNH',nacionalidade:'nacionalidade',profissao:'profissão',estado_civil:'estado civil',email:'e-mail',cep:'CEP',endereco:'endereço',numero:'número do endereço',bairro:'bairro',cidade:'cidade',uf:'UF',nome_pai:'nome do pai',nome_mae:'nome da mãe',contato_1_numero:'telefone principal',contato_1_responsavel:'responsável pelo telefone principal',contato_2_numero:'telefone de emergência 1',contato_2_responsavel:'responsável de emergência 1',contato_3_numero:'telefone de emergência 2',contato_3_responsavel:'responsável de emergência 2',contato_4_numero:'telefone de emergência 3',contato_4_responsavel:'responsável de emergência 3',foto_rg_path:'foto do RG',foto_cnh_path:'foto da CNH',comprovante_residencia_path:'comprovante de residência'};
    const fields=Object.keys(labels);
    if(existing){
      const canComplete=fields.filter(field=>!existing[field]&&result.draft[field]);
      const stillMissing=fields.filter(field=>!existing[field]&&!result.draft[field]);
      const lines=[`Cadastro localizado: ${existing.nome_completo}.`,`A CNH forneceu ${populated} campos.`];
      lines.push(canComplete.length?`Pode completar agora: ${canComplete.map(field=>labels[field]).join(', ')}.`:'A CNH não trouxe novos campos para completar.');
      lines.push(stillMissing.length?`Ainda faltam: ${stillMissing.map(field=>labels[field]).join(', ')}.`:'O cadastro obrigatório está completo.');
      addMessage('bot',lines.join('\n'),false);
    }else addMessage('bot',`Não encontrei esse cliente no banco. A CNH forneceu ${populated} campos para um novo cadastro.`,false);
    const action = document.createElement('button'); action.type = 'button'; action.className = 'ai-review'; action.textContent = 'Revisar no cadastro de clientes';
    action.addEventListener('click', () => { sessionStorage.setItem('alquiler-assistente-rascunho-cliente', JSON.stringify({draft:result.draft,clientId:existing?.id||null})); location.href = 'clientes.html?rascunho=ia'; });
    messages.append(action); messages.scrollTop = messages.scrollHeight;
  } catch (error) { pending.remove(); addMessage('bot', error.message, false); }
  finally { fileInput.disabled = false; fileInput.value = ''; }
});
