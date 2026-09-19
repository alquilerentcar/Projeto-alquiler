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
    <div class="ai-actions"><label class="ai-file-button">📎 Enviar documento<input class="ai-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden></label></div>
    <form class="ai-form"><input class="ai-input" type="text" maxlength="2000" placeholder="Pergunte sobre os cadastros…" aria-label="Mensagem ao assistente"><button type="submit" aria-label="Enviar mensagem">➤</button></form>
    <small class="ai-footnote">Documentos e consultas são enviados à OpenAI quando você solicita.</small>
  </section>`;
document.body.append(root);
const panel = root.querySelector('.ai-panel');
const launch = root.querySelector('.ai-launch');
const messages = root.querySelector('.ai-messages');
const input = root.querySelector('.ai-input');
const fileInput = root.querySelector('.ai-file');
const sendButton = root.querySelector('.ai-form button');

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
    addMessage('bot', `Encontrei ${populated} campos para ${result.draft.nome_completo}. Revise todos os dados antes de salvar.`, false);
    const action = document.createElement('button'); action.type = 'button'; action.className = 'ai-review'; action.textContent = 'Revisar no cadastro de clientes';
    action.addEventListener('click', () => { sessionStorage.setItem('alquiler-assistente-rascunho-cliente', JSON.stringify(result.draft)); location.href = 'clientes.html?rascunho=ia'; });
    messages.append(action); messages.scrollTop = messages.scrollHeight;
  } catch (error) { pending.remove(); addMessage('bot', error.message, false); }
  finally { fileInput.disabled = false; fileInput.value = ''; }
});
