import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient("https://xtelzwclrzzlsqjecscl.supabase.co", "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3");
const $ = (selector) => document.querySelector(selector);
const page = document.body.dataset.page;
const state = { cars: [], contracts: [], clients: [], editing: null };
let toastTimer;

function toast(text, error = false) {
  const box = $("#toast");
  box.textContent = text;
  box.classList.toggle("error", error);
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 5000);
}
function errorText(error) {
  if (error?.code === "23505") return "Este número ou placa já está cadastrado.";
  if (error?.code === "42501" || error?.status === 403) return "O Supabase bloqueou o acesso a esses dados.";
  return error?.message || "Ocorreu um erro.";
}
function el(tag, value, className) {
  const item = document.createElement(tag);
  item.textContent = value ?? "";
  if (className) item.className = className;
  return item;
}
function td(value) { return el("td", value ?? "—"); }
function money(value) { return value == null ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function date(value) { return value ? value.split("-").reverse().join("/") : "—"; }
function value(form, name) { return form.elements.namedItem(name).value.trim(); }
function nullable(form, name) { return value(form, name) || null; }
function rowButton(row, callback) {
  const cell = document.createElement("td");
  const button = el("button", "Editar", "btn btn-quiet");
  button.type = "button";
  button.addEventListener("click", () => callback(row));
  cell.append(button);
  return cell;
}
async function loadCars() {
  $("#cars-count").textContent = "Carregando…";
  const { data, error } = await db.from("carros").select("*").order("placa").range(0, 999);
  if (error) { $("#cars-count").textContent = "Falha ao carregar"; return toast(errorText(error), true); }
  state.cars = data || [];
  renderCars();
}
function renderCars() {
  const search = $("#cars-search").value.trim().toLocaleLowerCase("pt-BR");
  const status = $("#cars-status").value;
  const rows = state.cars.filter((row) => (status === "todos" || row.situacao === status) && [row.placa, row.marca, row.modelo].join(" ").toLocaleLowerCase("pt-BR").includes(search));
  $("#cars-total").textContent = state.cars.length;
  $("#cars-available").textContent = state.cars.filter((r) => r.situacao === "Disponível").length;
  $("#cars-rented").textContent = state.cars.filter((r) => r.situacao === "Locado").length;
  $("#cars-maintenance").textContent = state.cars.filter((r) => r.situacao === "Manutenção").length;
  $("#cars-count").textContent = `${rows.length} de ${state.cars.length} carros`;
  const body = $("#cars-body"); body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(td(row.placa), td([row.marca, row.modelo].filter(Boolean).join(" ") || "—"), td(row.ano), td(money(row.valor_diaria)), td(row.situacao), rowButton(row, openCar));
    body.append(tr);
  }
  $("#cars-empty").classList.toggle("hidden", rows.length > 0);
}
function openCar(row = null) {
  state.editing = row?.id || null;
  const form = $("#car-form"); form.reset();
  $("#car-dialog-title").textContent = row ? "Editar carro" : "Novo carro";
  if (row) for (const field of ["placa", "situacao", "marca", "modelo", "ano", "cor", "renavam", "chassi", "valor_diaria", "observacoes"]) form.elements.namedItem(field).value = row[field] ?? "";
  $("#car-dialog").showModal();
}
async function saveCar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const placa = value(form, "placa").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return toast("Informe uma placa válida com 7 caracteres.", true);
  const payload = { placa, situacao: value(form, "situacao"), marca: nullable(form, "marca"), modelo: nullable(form, "modelo"), ano: nullable(form, "ano") ? Number(value(form, "ano")) : null, cor: nullable(form, "cor"), renavam: nullable(form, "renavam"), chassi: nullable(form, "chassi"), valor_diaria: nullable(form, "valor_diaria") ? Number(value(form, "valor_diaria")) : null, observacoes: nullable(form, "observacoes") };
  const button = $("#save-car"); button.disabled = true;
  const query = state.editing ? db.from("carros").update(payload).eq("id", state.editing) : db.from("carros").insert(payload);
  const { error } = await query;
  button.disabled = false;
  if (error) return toast(errorText(error), true);
  $("#car-dialog").close(); toast("Carro salvo."); await loadCars();
}

async function loadContracts() {
  $("#contracts-count").textContent = "Carregando…";
  const [contracts, clients, cars] = await Promise.all([
    db.from("contratos").select("*").order("criado_em", { ascending: false }).range(0, 999),
    db.from("clientes").select("id,nome_completo,situacao").order("nome_completo").range(0, 999),
    db.from("carros").select("id,placa,marca,modelo,situacao,valor_diaria").order("placa").range(0, 999),
  ]);
  const error = contracts.error || clients.error || cars.error;
  if (error) { $("#contracts-count").textContent = "Falha ao carregar"; return toast(errorText(error), true); }
  state.contracts = contracts.data || []; state.clients = clients.data || []; state.cars = cars.data || [];
  renderContracts();
}
function clientName(id) { return state.clients.find((row) => row.id === id)?.nome_completo || "Cliente indisponível"; }
function carName(id) { const row = state.cars.find((item) => item.id === id); return row ? `${row.placa} · ${[row.marca, row.modelo].filter(Boolean).join(" ")}` : "Carro indisponível"; }
function renderContracts() {
  const search = $("#contracts-search").value.trim().toLocaleLowerCase("pt-BR");
  const status = $("#contracts-status").value;
  const rows = state.contracts.filter((row) => (status === "todos" || row.situacao === status) && [row.numero, clientName(row.cliente_id), carName(row.carro_id)].join(" ").toLocaleLowerCase("pt-BR").includes(search));
  $("#contracts-total").textContent = state.contracts.length;
  $("#contracts-active").textContent = state.contracts.filter((r) => r.situacao === "Ativo").length;
  $("#contracts-draft").textContent = state.contracts.filter((r) => r.situacao === "Rascunho").length;
  $("#contracts-closed").textContent = state.contracts.filter((r) => r.situacao === "Encerrado").length;
  $("#contracts-count").textContent = `${rows.length} de ${state.contracts.length} contratos`;
  const body = $("#contracts-body"); body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(td(row.numero), td(clientName(row.cliente_id)), td(carName(row.carro_id)), td(`${date(row.data_inicio)} a ${date(row.data_fim)}`), td(row.situacao), rowButton(row, openContract));
    body.append(tr);
  }
  $("#contracts-empty").classList.toggle("hidden", rows.length > 0);
}
function fillSelect(selector, rows, label, selected) {
  const select = $(selector); select.replaceChildren(new Option("Selecione", ""));
  for (const row of rows) select.add(new Option(label(row), row.id));
  select.value = selected || "";
}
function openContract(row = null) {
  state.editing = row?.id || null;
  const form = $("#contract-form"); form.reset();
  $("#contract-dialog-title").textContent = row ? "Editar contrato" : "Novo contrato";
  fillSelect("#contract-client", state.clients.filter((item) => item.situacao !== "Inativo" || item.id === row?.cliente_id), (item) => item.nome_completo, row?.cliente_id);
  fillSelect("#contract-car", state.cars.filter((item) => item.situacao !== "Inativo" || item.id === row?.carro_id), (item) => `${item.placa} · ${[item.marca, item.modelo].filter(Boolean).join(" ")}`, row?.carro_id);
  if (row) for (const field of ["numero", "situacao", "data_inicio", "data_fim", "valor_diaria", "observacoes"]) form.elements.namedItem(field).value = row[field] ?? "";
  $("#contract-dialog").showModal();
}
async function saveContract(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const numero = value(form, "numero");
  const cliente_id = value(form, "cliente_id");
  const carro_id = value(form, "carro_id");
  const data_inicio = value(form, "data_inicio");
  const data_fim = nullable(form, "data_fim");
  if (!numero || !cliente_id || !carro_id || !data_inicio) return toast("Preencha número, cliente, carro e início.", true);
  if (data_fim && data_fim < data_inicio) return toast("A data final deve ser igual ou posterior ao início.", true);
  const payload = { numero, cliente_id, carro_id, data_inicio, data_fim, situacao: value(form, "situacao"), valor_diaria: nullable(form, "valor_diaria") ? Number(value(form, "valor_diaria")) : null, observacoes: nullable(form, "observacoes") };
  const button = $("#save-contract"); button.disabled = true;
  const query = state.editing ? db.from("contratos").update(payload).eq("id", state.editing) : db.from("contratos").insert(payload);
  const { error } = await query;
  button.disabled = false;
  if (error) return toast(errorText(error), true);
  $("#contract-dialog").close(); toast("Contrato salvo."); await loadContracts();
}

{
  if (page === "carros") {
    $("#new-car-button").addEventListener("click", () => openCar());
    $("#refresh-cars").addEventListener("click", loadCars);
    $("#cars-search").addEventListener("input", renderCars);
    $("#cars-status").addEventListener("change", renderCars);
    $("#car-form").addEventListener("submit", saveCar);
    for (const id of ["#close-car-dialog", "#cancel-car"]) $(id).addEventListener("click", () => $("#car-dialog").close());
    loadCars();
  } else if (page === "contratos") {
    $("#new-contract-button").addEventListener("click", () => openContract());
    $("#refresh-contracts").addEventListener("click", loadContracts);
    $("#contracts-search").addEventListener("input", renderContracts);
    $("#contracts-status").addEventListener("change", renderContracts);
    $("#contract-form").addEventListener("submit", saveContract);
    for (const id of ["#close-contract-dialog", "#cancel-contract"]) $(id).addEventListener("click", () => $("#contract-dialog").close());
    loadContracts();
  }
}
