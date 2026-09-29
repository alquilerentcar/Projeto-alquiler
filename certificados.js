import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, bindLogout } from "./auth-guard.js";

const db = createClient("https://xtelzwclrzzlsqjecscl.supabase.co", "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3");
const session = await requireAuth(db);
bindLogout(db);
const BUCKET = "certificados-digitais";
const $ = (selector) => document.querySelector(selector);
const state = { rows: [], editing: null, loading: false };
const fields = ["titular", "tipo", "identificador", "emissor", "numero_serie", "valido_de", "valido_ate", "finalidade", "observacoes"];
let toastTimer;

function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 5500);
}
function errorText(error) {
  if (error?.code === "23505") return "Este certificado já está cadastrado.";
  if (error?.status === 403 || error?.code === "42501") return "Esta conta não tem acesso aos certificados.";
  return error?.message || "Não foi possível concluir a operação.";
}
function element(tag, value, className) {
  const item = document.createElement(tag);
  item.textContent = value ?? "";
  if (className) item.className = className;
  return item;
}
function todayISO() { return new Date().toLocaleDateString("sv-SE"); }
function daysUntil(date) {
  const start = new Date(`${todayISO()}T12:00:00`);
  const end = new Date(`${date}T12:00:00`);
  return Math.round((end - start) / 86400000);
}
function status(row) {
  const days = daysUntil(row.valido_ate);
  if (days < 0) return "vencidos";
  if (days <= 30) return "proximos";
  return "validos";
}
function dateBR(value) { return value ? value.split("-").reverse().join("/") : "—"; }
function dateISO(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function attributeValue(attributes, shortName) {
  return attributes.find((item) => item.shortName === shortName)?.value || "";
}
function certificateIdentifier(commonName) {
  const match = String(commonName).match(/(?:^|:)(\d{11}|\d{14})(?::|$)/);
  return match?.[1] || "";
}
function certificateName(commonName) {
  return String(commonName).replace(/:(\d{11}|\d{14})(?::.*)?$/, "").trim();
}
async function readCertificate() {
  const file = $("#certificate-file").files[0];
  const passwordInput = $("#certificate-read-password");
  const button = $("#read-certificate");
  const status = $("#certificate-read-status");
  if (!file) return notify("Selecione o arquivo .pfx ou .p12.", true);
  if (!/\.(pfx|p12)$/i.test(file.name) || file.size > 10 * 1024 * 1024) return notify("O arquivo precisa ser .pfx ou .p12 e ter até 10 MB.", true);
  button.disabled = true;
  status.textContent = "Lendo…";
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Falha ao ler o arquivo.")); reader.readAsDataURL(file); });
    const response = await fetch("/api/certificados/ler", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: String(dataUrl).split(",")[1], password: passwordInput.value }) });
    const certificate = await response.json();
    if (!response.ok) throw new Error(certificate.error || "Não foi possível abrir o certificado.");
    const form = $("#certificate-form");
    const commonName = certificate.titular || String(certificate.subject || "").match(/CN=([^,]+)/i)?.[1] || "";
    const values = {
      titular: certificateName(commonName),
      identificador: certificateIdentifier(`${commonName}:${certificate.subject || ""}`),
      emissor: certificate.issuer || "",
      numero_serie: String(certificate.serial || "").toUpperCase().match(/.{1,2}/g)?.join(":") || "",
      valido_de: certificate.valido_de || "",
      valido_ate: certificate.valido_ate || "",
    };
    for (const [field, value] of Object.entries(values)) if (value) form.elements.namedItem(field).value = value;
    status.textContent = "Informações preenchidas.";
    notify("Certificado lido. Confira as informações antes de salvar.");
  } catch (error) {
    status.textContent = "Não foi possível ler.";
    notify(errorText(error), true);
  } finally {
    passwordInput.value = "";
    button.disabled = false;
  }
}

function showApp(email) {
  $("#certificate-user").textContent = window.alquilerContext?.user?.nome || email;
  loadCertificates();
}

async function loadCertificates() {
  if (state.loading) return;
  state.loading = true;
  $("#certificate-count").textContent = "Carregando…";
  const { data, error } = await db.from("certificados_digitais").select("*").order("valido_ate").range(0, 999);
  state.loading = false;
  if (error) {
    $("#certificate-count").textContent = "Falha ao carregar";
    return notify(errorText(error), true);
  }
  state.rows = data || [];
  render();
}
function render() {
  const search = $("#certificate-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = $("#certificate-filter").value;
  const rows = state.rows.filter((row) =>
    (filter === "todos" || status(row) === filter || (filter === "validos" && status(row) === "proximos")) &&
    [row.titular, row.identificador, row.emissor, row.numero_serie].join(" ").toLocaleLowerCase("pt-BR").includes(search)
  );
  $("#certificate-total").textContent = state.rows.length;
  $("#certificate-soon").textContent = state.rows.filter((row) => status(row) === "proximos").length;
  $("#certificate-expired").textContent = state.rows.filter((row) => status(row) === "vencidos").length;
  $("#certificate-count").textContent = `${rows.length} de ${state.rows.length} certificados`;
  const body = $("#certificates-body");
  body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    const name = element("td", row.titular, "client-name");
    const type = element("td", row.tipo);
    const identifier = element("td", row.identificador || "—");
    const validity = element("td", dateBR(row.valido_ate));
    const file = element("td", row.arquivo_path ? "A1 armazenado" : "—", row.arquivo_path ? "file-present" : "file-pending");
    const actions = document.createElement("td");
    actions.className = "actions-head";
    const edit = element("button", "Editar", "btn btn-quiet");
    edit.type = "button";
    edit.addEventListener("click", () => openCertificate(row));
    actions.append(edit);
    tr.append(name, type, identifier, validity, file, actions);
    body.append(tr);
  }
  $("#certificates-empty").classList.toggle("hidden", rows.length > 0);
}

function toggleFile() {
  const isA1 = $("#certificate-form").elements.namedItem("tipo").value === "A1";
  $("#certificate-file-section").classList.toggle("hidden", !isA1);
  $("#certificate-file").required = isA1 && !state.editing?.arquivo_path;
}
function openCertificate(row = null) {
  state.editing = row;
  const form = $("#certificate-form");
  form.reset();
  $("#certificate-read-status").textContent = "";
  $("#certificate-dialog-title").textContent = row ? "Editar certificado" : "Novo certificado";
  for (const field of fields) form.elements.namedItem(field).value = row?.[field] ?? "";
  if (!row) form.elements.namedItem("tipo").value = "A1";
  form.elements.namedItem("tipo").disabled = Boolean(row);
  $("#download-certificate").classList.toggle("hidden", !row?.arquivo_path);
  $("#delete-certificate").classList.toggle("hidden", !row);
  toggleFile();
  $("#certificate-dialog").showModal();
}
async function saveCertificate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {};
  for (const field of fields) payload[field] = form.elements.namedItem(field).value.trim() || null;
  if (!payload.titular || !payload.tipo || !payload.valido_ate) return notify("Preencha titular, tipo e validade.", true);
  if (payload.valido_de && payload.valido_de > payload.valido_ate) return notify("A validade inicial deve ser anterior à final.", true);
  if (payload.identificador && ![11, 14].includes(payload.identificador.replace(/\D/g, "").length)) return notify("Informe um CPF ou CNPJ válido em tamanho.", true);
  const file = $("#certificate-file").files[0];
  if (payload.tipo === "A1" && !file && !state.editing?.arquivo_path) return notify("Envie o arquivo A1 (.pfx ou .p12).", true);
  if (file && (!/\.(pfx|p12)$/i.test(file.name) || file.size > 10 * 1024 * 1024)) return notify("O arquivo precisa ser .pfx ou .p12 e ter até 10 MB.", true);
  const button = $("#save-certificate");
  button.disabled = true;
  let newPath = null;
  try {
    if (file) {
      const extension = file.name.toLowerCase().endsWith(".p12") ? "p12" : "pfx";
      newPath = `${crypto.randomUUID()}.${extension}`;
      const upload = await db.storage.from(BUCKET).upload(newPath, file, { contentType: "application/x-pkcs12", upsert: false });
      if (upload.error) throw upload.error;
      payload.arquivo_path = newPath;
    }
    const query = state.editing
      ? db.from("certificados_digitais").update({ ...payload, atualizado_em: new Date().toISOString() }).eq("id", state.editing.id)
      : db.from("certificados_digitais").insert(payload);
    const { error } = await query;
    if (error) throw error;
    if (newPath && state.editing?.arquivo_path) await db.storage.from(BUCKET).remove([state.editing.arquivo_path]);
    $("#certificate-dialog").close();
    notify("Certificado salvo.");
    await loadCertificates();
  } catch (error) {
    if (newPath) await db.storage.from(BUCKET).remove([newPath]);
    notify(errorText(error), true);
  } finally {
    button.disabled = false;
  }
}
async function downloadCertificate() {
  const path = state.editing?.arquivo_path;
  if (!path) return;
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error) return notify(errorText(error), true);
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `certificado.${path.endsWith(".p12") ? "p12" : "pfx"}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

async function deleteCertificate() {
  const row = state.editing;
  if (!row) return;
  if (!window.confirm(`Excluir o certificado de ${row.titular}? Esta ação não poderá ser desfeita.`)) return;
  const button = $("#delete-certificate");
  button.disabled = true;
  try {
    const { error } = await db.from("certificados_digitais").delete().eq("id", row.id);
    if (error) throw error;
    let fileWarning = false;
    if (row.arquivo_path) {
      const removal = await db.storage.from(BUCKET).remove([row.arquivo_path]);
      fileWarning = Boolean(removal.error);
    }
    $("#certificate-dialog").close();
    state.editing = null;
    notify(fileWarning ? "Cadastro excluído, mas o arquivo precisa ser removido manualmente." : "Certificado excluído.", fileWarning);
    await loadCertificates();
  } catch (error) {
    notify(errorText(error), true);
  } finally {
    button.disabled = false;
  }
}

async function init() {
  $("#new-certificate").addEventListener("click", () => openCertificate());
  $("#refresh-certificates").addEventListener("click", loadCertificates);
  $("#certificate-search").addEventListener("input", render);
  $("#certificate-filter").addEventListener("change", render);
  $("#certificate-form").addEventListener("submit", saveCertificate);
  $("#certificate-form").elements.namedItem("tipo").addEventListener("change", toggleFile);
  $("#read-certificate").addEventListener("click", readCertificate);
  $("#close-certificate-dialog").addEventListener("click", () => $("#certificate-dialog").close());
  $("#cancel-certificate").addEventListener("click", () => $("#certificate-dialog").close());
  $("#download-certificate").addEventListener("click", downloadCertificate);
  $("#delete-certificate").addEventListener("click", deleteCertificate);
  showApp(session.user.email);
}
init();
