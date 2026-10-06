import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, bindLogout } from "./auth-guard.js";

const db = createClient("https://xtelzwclrzzlsqjecscl.supabase.co", "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3");
await requireAuth(db);
bindLogout(db);
const $ = (selector) => document.querySelector(selector);
const page = document.body.dataset.page;
const state = { cars: [], editing: null };
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
async function loadCars(force = true) {
  $("#cars-count").textContent = "Carregando…";
  const { data, error } = await window.bgLoadList("carros", () => db.from("carros").select("*").order("placa").range(0, 999), force);
  if (error) { $("#cars-count").textContent = "Falha ao carregar"; return toast(errorText(error), true); }
  state.cars = data || [];
  renderCars();
}
function renderCars() {
  const search = $("#cars-search").value.trim().toLocaleLowerCase("pt-BR");
  const status = $("#cars-status").value;
  const rows = state.cars.filter((row) => (status === "todos" || row.situacao === status) && [row.placa, row.marca, row.modelo, row.proprietario_nome].join(" ").toLocaleLowerCase("pt-BR").includes(search));
  $("#cars-total").textContent = state.cars.length;
  $("#cars-available").textContent = state.cars.filter((r) => r.situacao === "Disponível").length;
  $("#cars-rented").textContent = state.cars.filter((r) => r.situacao === "Locado").length;
  $("#cars-maintenance").textContent = state.cars.filter((r) => r.situacao === "Manutenção").length;
  $("#cars-count").textContent = `${rows.length} de ${state.cars.length} carros`;
  const body = $("#cars-body"); body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(td(row.placa), td([row.marca, row.modelo].filter(Boolean).join(" ") || "—"), td(row.ano), td(row.proprietario_nome), td(money(row.valor_diaria)), td(money(row.caucao)), td(row.situacao), rowButton(row, openCar));
    body.append(tr);
  }
  $("#cars-empty").classList.toggle("hidden", rows.length > 0);
}
function openCar(row = null) {
  state.editing = row?.id || null;
  const form = $("#car-form"); form.reset();
  $("#car-dialog-title").textContent = row ? "Editar carro" : "Novo carro";
  if (row) for (const field of ["proprietario_nome", "proprietario_documento", "localizacao", "placa", "situacao", "marca", "modelo", "ano", "cor", "renavam", "chassi", "valor_diaria", "caucao", "observacoes"]) form.elements.namedItem(field).value = row[field] ?? "";
  $("#car-dialog").showModal();
}
async function saveCar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const placa = value(form, "placa").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return toast("Informe uma placa válida com 7 caracteres.", true);
  const payload = { proprietario_nome: nullable(form, "proprietario_nome"), proprietario_documento: nullable(form, "proprietario_documento"), localizacao: nullable(form, "localizacao"), placa, situacao: value(form, "situacao"), marca: nullable(form, "marca"), modelo: nullable(form, "modelo"), ano: nullable(form, "ano") ? Number(value(form, "ano")) : null, cor: nullable(form, "cor"), renavam: nullable(form, "renavam"), chassi: nullable(form, "chassi"), valor_diaria: nullable(form, "valor_diaria") ? Number(value(form, "valor_diaria")) : null, caucao: nullable(form, "caucao") ? Number(value(form, "caucao")) : null, observacoes: nullable(form, "observacoes") };
  const button = $("#save-car"); button.disabled = true;
  const query = state.editing ? db.from("carros").update(payload).eq("id", state.editing) : db.from("carros").insert(payload);
  const { error } = await query;
  button.disabled = false;
  if (error) return toast(errorText(error), true);
  $("#car-dialog").close(); toast("Carro salvo."); await loadCars();
}


{
  if (page === "carros") {
    $("#new-car-button").addEventListener("click", () => openCar());
    $("#refresh-cars").addEventListener("click", loadCars);
    $("#cars-search").addEventListener("input", renderCars);
    $("#cars-status").addEventListener("change", renderCars);
    $("#car-form").addEventListener("submit", saveCar);
    for (const id of ["#close-car-dialog", "#cancel-car"]) $(id).addEventListener("click", () => $("#car-dialog").close());
    loadCars(false);
  }
}
