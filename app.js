import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, bindLogout } from "./auth-guard.js";

const SUPABASE_URL = "https://xtelzwclrzzlsqjecscl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3";
const DOCUMENT_BUCKET = "documentos-clientes";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
await requireAuth(supabase);
bindLogout(supabase);

const $ = (selector) => document.querySelector(selector);
const state = { clients: [], editing: null, loading: false };
const fields = [
  "tipo_pessoa", "nome_completo", "nome_fantasia", "cpf", "cnpj",
  "data_nascimento", "rg", "cnh", "nacionalidade", "profissao", "inscricao_estadual", "estado_civil", "email",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
  "nome_pai", "nome_mae",
  ...Array.from({ length: 4 }, (_, index) => [
    `contato_${index + 1}_numero`, `contato_${index + 1}_responsavel`,
  ]).flat(),
];

const documentInputs = [
  { column: "foto_rg_path", input: "#file-rg", folder: "rg", types: ["image/jpeg", "image/png", "image/webp"] },
  { column: "foto_cnh_path", input: "#file-cnh", folder: "cnh", types: ["image/jpeg", "image/png", "image/webp"] },
  { column: "comprovante_residencia_path", input: "#file-comprovante", folder: "comprovante", types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
];

let toastTimer;
function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 5500);
}

function digits(value) { return (value || "").replace(/\D/g, ""); }
function clean(value) { const result = String(value ?? "").trim(); return result || null; }
function isActive(client) { return (client.situacao || "Ativo").toLowerCase() !== "inativo"; }
function formatDocument(client) {
  const value = client.tipo_pessoa === "PJ" ? client.cnpj : client.cpf;
  if (!value) return "Não informado";
  if (value.length === 11) return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (value.length === 14) return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return value;
}
function errorText(error) {
  if (!error) return "Ocorreu um erro inesperado.";
  if (error.code === "23505") return "Este CPF, CNPJ ou ID de origem já está cadastrado.";
  if (error.status === 403 || error.code === "42501") return "O Supabase bloqueou o acesso aos cadastros.";
  return error.message || "Ocorreu um erro inesperado.";
}

async function loadClients() {
  if (state.loading) return;
  state.loading = true;
  $("#list-count").textContent = "Carregando cadastros…";
  try {
    const { data, error } = await supabase.from("clientes").select("*").order("nome_completo", { ascending: true }).range(0, 999);
    if (error) throw error;
    state.clients = data || [];
    render();
  } catch (error) {
    $("#list-count").textContent = "Não foi possível carregar.";
    notify(errorText(error), true);
  } finally {
    state.loading = false;
  }
}

function textNode(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value ?? "";
  if (className) element.className = className;
  return element;
}

function render() {
  const search = $("#search-input").value.trim().toLocaleLowerCase("pt-BR");
  const status = $("#status-filter").value;
  const clients = state.clients.filter((client) => {
    if (status === "ativos" && !isActive(client)) return false;
    if (status === "inativos" && isActive(client)) return false;
    if (!search) return true;
    const searchable = [client.nome_completo, client.nome_fantasia, client.cpf, client.cnpj, client.email].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return searchable.includes(search) || digits(client.cpf || client.cnpj).includes(digits(search) || "␀");
  });

  $("#metric-total").textContent = state.clients.length;
  $("#metric-active").textContent = state.clients.filter(isActive).length;
  $("#metric-inactive").textContent = state.clients.filter((client) => !isActive(client)).length;
  $("#list-count").textContent = `${clients.length} cliente${clients.length === 1 ? "" : "s"} exibido${clients.length === 1 ? "" : "s"}`;
  $("#empty-state").classList.toggle("hidden", clients.length > 0);

  const body = $("#clients-body");
  body.replaceChildren();
  for (const client of clients) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.append(textNode("div", client.nome_completo, "client-name"));
    if (client.email) nameCell.append(textNode("div", client.email, "client-sub"));
    const documentCell = textNode("td", formatDocument(client));
    const contactCell = textNode("td", client.contato_1_numero || client.contato_2_numero || "—");
    const typeCell = textNode("td", client.tipo_pessoa === "PJ" ? "Pessoa jurídica" : "Pessoa física");
    const statusCell = document.createElement("td");
    statusCell.append(textNode("span", isActive(client) ? "Ativo" : "Inativo", `badge ${isActive(client) ? "active" : "inactive"}`));
    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = textNode("button", "Editar");
    edit.type = "button";
    edit.addEventListener("click", () => openClient(client));
    const retire = textNode("button", isActive(client) ? "Retirar" : "Reativar", isActive(client) ? "danger" : "");
    retire.type = "button";
    retire.addEventListener("click", () => changeStatus(client));
    actions.append(edit, retire);
    actionCell.append(actions);
    row.append(nameCell, documentCell, contactCell, typeCell, statusCell, actionCell);
    body.append(row);
  }
}

function refreshPersonType() {
  const isCompany = $("#person-type").value === "PJ";
  document.querySelectorAll(".pf-field").forEach((element) => element.classList.toggle("hidden", isCompany));
  document.querySelectorAll(".pj-field").forEach((element) => element.classList.toggle("hidden", !isCompany));
  $("#name-label").textContent = isCompany ? "Razão social *" : "Nome completo *";
}

function openClient(client = null) {
  state.editing = client;
  const form = $("#client-form");
  form.reset();
  for (const field of fields) {
    const control = form.elements.namedItem(field);
    if (control) control.value = client?.[field] ?? "";
  }
  if (!client) form.elements.namedItem("tipo_pessoa").value = "PF";
  refreshPersonType();
  $("#dialog-title").textContent = client ? "Editar cliente" : "Novo cliente";
  for (const button of document.querySelectorAll("[data-open]")) {
    button.classList.toggle("hidden", !client?.[button.dataset.open]);
  }
  $("#client-dialog").showModal();
}

function getPayload() {
  const form = $("#client-form");
  const payload = {};
  for (const field of fields) payload[field] = clean(form.elements.namedItem(field)?.value);
  payload.tipo_pessoa = payload.tipo_pessoa || "PF";
  payload.nome_completo = payload.nome_completo?.replace(/\s+/g, " ") || null;
  payload.cpf = digits(payload.cpf) || null;
  payload.cnpj = digits(payload.cnpj) || null;
  payload.cep = digits(payload.cep) || null;
  payload.uf = payload.uf?.toUpperCase() || null;
  for (let index = 1; index <= 4; index++) {
    const field = `contato_${index}_numero`;
    payload[field] = digits(payload[field]) || null;
  }
  if (payload.tipo_pessoa === "PF") {
    payload.cnpj = null;
    payload.nome_fantasia = null;
    payload.inscricao_estadual = null;
  } else {
    payload.cpf = null;
    payload.data_nascimento = null;
    payload.rg = null;
    payload.estado_civil = null;
    payload.nome_pai = null;
    payload.nome_mae = null;
  }
  return payload;
}

function validate(payload) {
  if (!payload.nome_completo) return "Informe o nome do cliente ou razão social.";
  if (payload.cpf && payload.cpf.length !== 11) return "O CPF precisa ter 11 dígitos.";
  if (payload.cnpj && payload.cnpj.length !== 14) return "O CNPJ precisa ter 14 dígitos.";
  if (payload.cep && payload.cep.length !== 8) return "O CEP precisa ter 8 dígitos.";
  for (let index = 1; index <= 4; index++) {
    const value = payload[`contato_${index}_numero`];
    if (value && ![10, 11].includes(value.length)) return `O contato ${index} precisa ter DDD e 10 ou 11 dígitos.`;
  }
  return null;
}

async function uploadDocuments(client, files) {
  for (const { column, input, folder, types } of documentInputs) {
    const file = files[input];
    if (!file) continue;
    if (!types.includes(file.type)) throw new Error(`Formato não aceito para ${folder}. Use JPG, PNG, WebP${folder === "comprovante" ? " ou PDF" : ""}.`);
    if (file.size > 10 * 1024 * 1024) throw new Error(`O arquivo de ${folder} excede 10 MB.`);
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.type];
    const path = `${client.id}/${folder}/${crypto.randomUUID()}.${extension}`;
    const oldPath = client[column];
    const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const update = await supabase.from("clientes").update({ [column]: path }).eq("id", client.id).select().single();
    if (update.error) {
      await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
      throw update.error;
    }
    client[column] = path;
    if (oldPath) await supabase.storage.from(DOCUMENT_BUCKET).remove([oldPath]);
  }
}

async function saveClient(event) {
  event.preventDefault();
  const payload = getPayload();
  const problem = validate(payload);
  if (problem) return notify(problem, true);
  const files = Object.fromEntries(documentInputs.map(({ input }) => [input, $(input).files[0]]));
  for (const { input, folder, types } of documentInputs) {
    const file = files[input];
    if (file && !types.includes(file.type)) return notify(`Formato não aceito para ${folder}.`, true);
    if (file && file.size > 10 * 1024 * 1024) return notify(`O arquivo de ${folder} excede 10 MB.`, true);
  }
  const wasNew = !state.editing;
  $("#save-button").disabled = true;
  $("#save-button").textContent = "Salvando…";
  try {
    let result;
    if (state.editing) {
      result = await supabase.from("clientes").update(payload).eq("id", state.editing.id).select().single();
    } else {
      result = await supabase.from("clientes").insert({ ...payload, tipo_cadastro: "Cliente", situacao: "Ativo" }).select().single();
    }
    if (result.error) throw result.error;
    state.editing = result.data;
    try { await uploadDocuments(result.data, files); }
    catch (error) { notify(`Cliente salvo, mas houve erro no documento: ${errorText(error)}`, true); await loadClients(); return; }
    $("#client-dialog").close();
    notify(wasNew ? "Cliente adicionado." : "Cliente atualizado.");
    await loadClients();
  } catch (error) {
    notify(errorText(error), true);
  } finally {
    $("#save-button").disabled = false;
    $("#save-button").textContent = "Salvar cliente";
  }
}

async function changeStatus(client) {
  const next = isActive(client) ? "Inativo" : "Ativo";
  const action = next === "Inativo" ? "retirar este cliente da lista de ativos" : "reativar este cliente";
  if (!window.confirm(`Deseja ${action}? O cadastro e os documentos serão preservados.`)) return;
  const { error } = await supabase.from("clientes").update({ situacao: next }).eq("id", client.id);
  if (error) return notify(errorText(error), true);
  notify(next === "Inativo" ? "Cliente retirado da lista de ativos." : "Cliente reativado.");
  await loadClients();
}

async function openDocument(column) {
  const path = state.editing?.[column];
  if (!path) return;
  const viewer = window.open("about:blank", "_blank");
  try {
    const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).download(path);
    if (error) throw error;
    const objectUrl = URL.createObjectURL(data);
    if (viewer) viewer.location.href = objectUrl;
    else window.location.href = objectUrl;
    setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
  } catch (error) {
    viewer?.close();
    notify(errorText(error), true);
  }
}

async function init() {
  $("#contacts-grid").innerHTML = Array.from({ length: 4 }, (_, index) => {
    const number = index + 1;
    return `<label><span>Contato ${number} · número</span><input name="contato_${number}_numero" inputmode="tel" placeholder="DDD + telefone" /></label><label><span>Contato ${number} · responsável</span><input name="contato_${number}_responsavel" placeholder="Nome completo" /></label>`;
  }).join("");
  $("#refresh-button").addEventListener("click", loadClients);
  $("#new-client-button").addEventListener("click", () => openClient());
  $("#search-input").addEventListener("input", render);
  $("#status-filter").addEventListener("change", render);
  $("#person-type").addEventListener("change", refreshPersonType);
  $("#client-form").addEventListener("submit", saveClient);
  $("#close-dialog").addEventListener("click", () => $("#client-dialog").close());
  $("#cancel-button").addEventListener("click", () => $("#client-dialog").close());
  document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openDocument(button.dataset.open)));
  await loadClients();
  const draftText = sessionStorage.getItem('alquiler-assistente-rascunho-cliente');
  if (draftText) {
    sessionStorage.removeItem('alquiler-assistente-rascunho-cliente');
    try {
      const saved = JSON.parse(draftText);
      const draft = saved.draft || saved;
      const existing = saved.clientId ? state.clients.find(client => client.id === saved.clientId) : null;
      openClient(existing);
      const form = $('#client-form');
      for (const field of fields) {
        const control = form.elements.namedItem(field);
        if (control && typeof draft[field] === 'string' && draft[field]) control.value = draft[field];
      }
      notify(existing ? 'Dados encontrados pela IA aplicados ao cliente existente. Confira antes de salvar.' : 'Rascunho preenchido pela IA. Confira os dados e clique em Salvar cliente.');
    } catch { notify('Não foi possível abrir o rascunho do assistente.', true); }
  }
}

init();
