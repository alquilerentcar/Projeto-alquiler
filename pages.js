import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, bindLogout } from "./auth-guard.js";

const supabase = createClient(
  "https://xtelzwclrzzlsqjecscl.supabase.co",
  "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3",
  { auth: { persistSession: true, autoRefreshToken: true } },
);
await requireAuth(supabase);
bindLogout(supabase);
const BUCKET = "documentos-clientes";
const $ = (selector) => document.querySelector(selector);
const digits = (value) => (value || "").replace(/\D/g, "");
const clean = (value) => String(value ?? "").trim() || null;
const active = (row) => (row.situacao || "Ativo").toLowerCase() !== "inativo";
const state = { suppliers: [], clients: [], editingSupplier: null, editingDocuments: null };
const documentFields = [
  { column: "foto_rg_path", input: "#doc-file-rg", folder: "rg", types: ["image/jpeg", "image/png", "image/webp"] },
  { column: "foto_cnh_path", input: "#doc-file-cnh", folder: "cnh", types: ["image/jpeg", "image/png", "image/webp"] },
  { column: "comprovante_residencia_path", input: "#doc-file-comprovante", folder: "comprovante", types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
];

let timer;
function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => toast.classList.remove("show"), 5500);
}
function message(error) {
  if (error?.code === "23505") return "Este CNPJ ou ID de origem já está cadastrado.";
  if (error?.status === 403 || error?.code === "42501") return "O Supabase bloqueou o acesso a esta área.";
  return error?.message || "Ocorreu um erro inesperado.";
}
function node(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value ?? "";
  if (className) element.className = className;
  return element;
}
function documentNumber(value) {
  if (!value) return "Não informado";
  if (value.length === 11) return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (value.length === 14) return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return value;
}

async function dashboardPage() {
  try {
    const [clients, suppliers] = await Promise.all([
      supabase.from("clientes").select("id,situacao,foto_rg_path,foto_cnh_path,comprovante_residencia_path").range(0, 999),
      supabase.from("fornecedores").select("id").range(0, 999),
    ]);
    if (clients.error) throw clients.error;
    if (suppliers.error) throw suppliers.error;
    $("#home-client-total").textContent = clients.data.length;
    $("#home-active-total").textContent = clients.data.filter(active).length;
    $("#home-supplier-total").textContent = suppliers.data.length;
    $("#home-document-total").textContent = clients.data.filter((row) => row.foto_rg_path || row.foto_cnh_path || row.comprovante_residencia_path).length;
  } catch (error) { notify(message(error), true); }
}

async function loadSuppliers() {
  $("#supplier-list-count").textContent = "Carregando…";
  const { data, error } = await supabase.from("fornecedores").select("*").order("razao_social").range(0, 999);
  if (error) return notify(message(error), true);
  state.suppliers = data || [];
  renderSuppliers();
}
function renderSuppliers() {
  const search = $("#supplier-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = $("#supplier-status").value;
  const filtered = state.suppliers.filter((row) => {
    if (filter === "ativos" && !active(row)) return false;
    if (filter === "inativos" && active(row)) return false;
    if (!search) return true;
    return [row.razao_social, row.nome_fantasia, row.cnpj, row.email].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(search) || (digits(search) && digits(row.cnpj).includes(digits(search)));
  });
  $("#supplier-total").textContent = state.suppliers.length;
  $("#supplier-active").textContent = state.suppliers.filter(active).length;
  $("#supplier-inactive").textContent = state.suppliers.filter((row) => !active(row)).length;
  $("#supplier-list-count").textContent = `${filtered.length} fornecedor${filtered.length === 1 ? "" : "es"} exibido${filtered.length === 1 ? "" : "s"}`;
  $("#suppliers-empty").classList.toggle("hidden", filtered.length > 0);
  const body = $("#suppliers-body");
  body.replaceChildren();
  for (const row of filtered) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.append(node("div", row.razao_social, "client-name"));
    if (row.nome_fantasia) name.append(node("div", row.nome_fantasia, "client-sub"));
    const status = document.createElement("td");
    status.append(node("span", active(row) ? "Ativo" : "Inativo", `badge ${active(row) ? "active" : "inactive"}`));
    const actions = document.createElement("td");
    const group = node("div", "", "row-actions");
    const edit = node("button", "Editar");
    edit.type = "button";
    edit.addEventListener("click", () => openSupplier(row));
    const retire = node("button", active(row) ? "Retirar" : "Reativar", active(row) ? "danger" : "");
    retire.type = "button";
    retire.addEventListener("click", () => changeSupplierStatus(row));
    group.append(edit, retire);
    actions.append(group);
    tr.append(name, node("td", documentNumber(row.cnpj)), node("td", row.celular || row.telefone || "—"), node("td", row.cidade || "—"), status, actions);
    body.append(tr);
  }
}
const supplierFields = ["razao_social", "nome_fantasia", "cnpj", "inscricao_estadual", "email", "telefone", "celular", "cep", "uf", "endereco", "numero", "complemento", "bairro", "cidade"];
function openSupplier(row = null) {
  state.editingSupplier = row;
  const form = $("#supplier-form");
  form.reset();
  for (const field of supplierFields) form.elements.namedItem(field).value = row?.[field] ?? "";
  $("#supplier-dialog-title").textContent = row ? "Editar fornecedor" : "Novo fornecedor";
  $("#supplier-dialog").showModal();
}
async function saveSupplier(event) {
  event.preventDefault();
  const form = $("#supplier-form");
  const payload = Object.fromEntries(supplierFields.map((field) => [field, clean(form.elements.namedItem(field).value)]));
  payload.razao_social = payload.razao_social?.replace(/\s+/g, " ") || null;
  payload.cnpj = digits(payload.cnpj) || null;
  payload.cep = digits(payload.cep) || null;
  payload.telefone = digits(payload.telefone) || null;
  payload.celular = digits(payload.celular) || null;
  payload.uf = payload.uf?.toUpperCase() || null;
  if (!payload.razao_social) return notify("Informe a razão social.", true);
  if (payload.cnpj && payload.cnpj.length !== 14) return notify("O CNPJ precisa ter 14 dígitos.", true);
  if (payload.cep && payload.cep.length !== 8) return notify("O CEP precisa ter 8 dígitos.", true);
  const button = $("#save-supplier");
  button.disabled = true;
  try {
    const result = state.editingSupplier
      ? await supabase.from("fornecedores").update(payload).eq("id", state.editingSupplier.id)
      : await supabase.from("fornecedores").insert({ ...payload, tipo_cadastro: "Fornecedor", situacao: "Ativo" });
    if (result.error) throw result.error;
    $("#supplier-dialog").close();
    notify("Fornecedor salvo.");
    await loadSuppliers();
  } catch (error) { notify(message(error), true); }
  finally { button.disabled = false; }
}
async function changeSupplierStatus(row) {
  const next = active(row) ? "Inativo" : "Ativo";
  if (!window.confirm(`${next === "Inativo" ? "Retirar" : "Reativar"} este fornecedor? O cadastro será preservado.`)) return;
  const { error } = await supabase.from("fornecedores").update({ situacao: next }).eq("id", row.id);
  if (error) return notify(message(error), true);
  await loadSuppliers();
}
function supplierPage() {
  $("#new-supplier-button").addEventListener("click", () => openSupplier());
  $("#refresh-suppliers").addEventListener("click", loadSuppliers);
  $("#supplier-search").addEventListener("input", renderSuppliers);
  $("#supplier-status").addEventListener("change", renderSuppliers);
  $("#supplier-form").addEventListener("submit", saveSupplier);
  $("#close-supplier-dialog").addEventListener("click", () => $("#supplier-dialog").close());
  $("#cancel-supplier").addEventListener("click", () => $("#supplier-dialog").close());
  loadSuppliers();
}

async function loadDocuments() {
  $("#docs-count").textContent = "Carregando…";
  const { data, error } = await supabase.from("clientes").select("id,nome_completo,cpf,cnpj,tipo_pessoa,foto_rg_path,foto_cnh_path,comprovante_residencia_path").order("nome_completo").range(0, 999);
  if (error) return notify(message(error), true);
  state.clients = data || [];
  renderDocuments();
}
function renderDocuments() {
  const search = $("#docs-search").value.trim().toLocaleLowerCase("pt-BR");
  const filtered = state.clients.filter((row) => !search || [row.nome_completo, row.cpf, row.cnpj].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(search) || (digits(search) && digits(row.cpf || row.cnpj).includes(digits(search))));
  $("#docs-rg").textContent = state.clients.filter((row) => row.foto_rg_path).length;
  $("#docs-cnh").textContent = state.clients.filter((row) => row.foto_cnh_path).length;
  $("#docs-comprovante").textContent = state.clients.filter((row) => row.comprovante_residencia_path).length;
  $("#docs-count").textContent = `${filtered.length} cliente${filtered.length === 1 ? "" : "s"} exibido${filtered.length === 1 ? "" : "s"}`;
  $("#docs-empty").classList.toggle("hidden", filtered.length > 0);
  const body = $("#docs-body");
  body.replaceChildren();
  for (const row of filtered) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.append(node("div", row.nome_completo, "client-name"));
    name.append(node("div", documentNumber(row.cpf || row.cnpj), "client-sub"));
    const actions = document.createElement("td");
    const group = node("div", "", "row-actions");
    const manage = node("button", "Gerenciar");
    manage.type = "button";
    manage.addEventListener("click", () => openDocuments(row));
    group.append(manage);
    actions.append(group);
    tr.append(name, node("td", row.foto_rg_path ? "✓ Enviado" : "Pendente", row.foto_rg_path ? "file-present" : "file-pending"), node("td", row.foto_cnh_path ? "✓ Enviado" : "Pendente", row.foto_cnh_path ? "file-present" : "file-pending"), node("td", row.comprovante_residencia_path ? "✓ Enviado" : "Pendente", row.comprovante_residencia_path ? "file-present" : "file-pending"), actions);
    body.append(tr);
  }
}
function openDocuments(row) {
  state.editingDocuments = row;
  $("#documents-form").reset();
  $("#documents-dialog-title").textContent = row.nome_completo;
  document.querySelectorAll("[data-doc-open]").forEach((button) => button.classList.toggle("hidden", !row[button.dataset.docOpen]));
  $("#documents-dialog").showModal();
}
async function saveDocuments(event) {
  event.preventDefault();
  const row = state.editingDocuments;
  const files = documentFields.map((field) => ({ ...field, file: $(field.input).files[0] })).filter((field) => field.file);
  if (!files.length) return notify("Selecione pelo menos um arquivo.", true);
  for (const { file, types, folder } of files) {
    if (!types.includes(file.type)) return notify(`Formato não aceito para ${folder}.`, true);
    if (file.size > 10 * 1024 * 1024) return notify(`O arquivo de ${folder} excede 10 MB.`, true);
  }
  const button = $("#save-documents");
  button.disabled = true;
  button.textContent = "Enviando…";
  try {
    for (const { column, folder, file } of files) {
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.type];
      const path = `${row.id}/${folder}/${crypto.randomUUID()}.${extension}`;
      const oldPath = row[column];
      const upload = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const update = await supabase.from("clientes").update({ [column]: path }).eq("id", row.id);
      if (update.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw update.error;
      }
      row[column] = path;
      if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    }
    $("#documents-dialog").close();
    notify("Documentos enviados.");
    await loadDocuments();
  } catch (error) { notify(message(error), true); await loadDocuments(); }
  finally { button.disabled = false; button.textContent = "Salvar arquivos"; }
}
async function viewDocument(column) {
  const path = state.editingDocuments?.[column];
  if (!path) return;
  const viewer = window.open("about:blank", "_blank");
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) { viewer?.close(); return notify(message(error), true); }
  const url = URL.createObjectURL(data);
  if (viewer) viewer.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
function documentsPage() {
  $("#refresh-docs").addEventListener("click", loadDocuments);
  $("#docs-search").addEventListener("input", renderDocuments);
  $("#documents-form").addEventListener("submit", saveDocuments);
  $("#close-documents-dialog").addEventListener("click", () => $("#documents-dialog").close());
  $("#cancel-documents").addEventListener("click", () => $("#documents-dialog").close());
  document.querySelectorAll("[data-doc-open]").forEach((button) => button.addEventListener("click", () => viewDocument(button.dataset.docOpen)));
  loadDocuments();
}

const page = document.body.dataset.page;
if (page === "fornecedores") supplierPage();
