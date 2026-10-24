import {vehicleMileage} from './relatorios-frota.mjs';
import {vehicleSituation} from './veiculos-situacao.mjs';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, bindLogout } from "./auth-guard.js";

const db = createClient("https://xtelzwclrzzlsqjecscl.supabase.co", "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3");
await requireAuth(db);
bindLogout(db);
const $ = (selector) => document.querySelector(selector);
const page = document.body.dataset.page;
const state = { cars: [], editing: null, periods: [], rentals: [], occupations: [], clients: [], verified:false,readings:[],kmError:false };
const company=window.alquilerContext.company;
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
  button.type = "button"; if(row.empresa_id && row.empresa_id !== company.id){button.disabled=true;button.title="Edite o cadastro na empresa proprietária do veículo.";}
  button.addEventListener("click", () => callback(row));
  const history=el('a','Histórico completo','btn btn-quiet');history.href='/historico?carro='+encodeURIComponent(row.id);const fleet=el('a','Ver frota','btn btn-quiet');fleet.href='/frota?placa='+encodeURIComponent(row.placa);cell.append(button,history,fleet);
  return cell;
}
const situation=row=>vehicleSituation(row,state.periods,state.rentals,state.occupations,state.verified);
async function loadCars(force = true) {
 $('#cars-count').textContent='Conferindo veículos e ocupações…';const generation=state.generation=(state.generation||0)+1;
 const results=await Promise.allSettled([window.bgLoadList('carros',()=>db.from('carros').select('*').order('placa').range(0,999),force),db.rpc('frota_painel',{p_empresa:company.id}),db.from('locacoes').select('carro_id,cliente_id,status').eq('empresa_id',company.id).eq('status','Ativa'),db.from('frota_levantamento').select('*').eq('empresa_id',company.id).eq('ativo',true),db.from('frota_km').select('carro_id,km,leitura_em').eq('empresa_id',company.id)]);
 if(generation!==state.generation)return;
 const unwrap=r=>r.status==='fulfilled'?r.value:{error:{message:r.reason?.message||'Falha de conexão'}};const [catalog,panel,rentals,occupations,km]=results.map(unwrap);
 if(catalog.error){$('#cars-count').textContent='Falha ao carregar';return toast(errorText(catalog.error),true);}
 state.readings=km.data||[];state.kmError=!!km.error;state.periods=panel.data?.periodos||[];state.clients=panel.data?.clientes||[];state.rentals=rentals.data||[];state.occupations=occupations.data||[];state.verified=![panel,rentals,occupations].some(r=>r.error);
 const cars=new Map((catalog.data||[]).map(c=>[c.id,c]));for(const car of panel.data?.carros||[]){if(cars.has(car.id)||state.periods.some(p=>p.carro_id===car.id&&!p.fim)||state.rentals.some(r=>r.carro_id===car.id)||state.occupations.some(r=>r.carro_id===car.id))cars.set(car.id,car);}
 state.cars=[...cars.values()].sort((a,b)=>a.placa.localeCompare(b.placa));renderCars();
 $('#cars-availability-note').textContent=state.verified?'Disponíveis: veículos marcados como disponíveis, sem locatário, locação ativa ou período de manutenção/indisponibilidade.':'Não foi possível conferir todas as ocupações. A disponibilidade não está confirmada. '+[panel,rentals,occupations].filter(r=>r.error).map(r=>r.error.message).join(' · ');
}
function renderCars() {
  const search = $("#cars-search").value.trim().toLocaleLowerCase("pt-BR");
  const status = $("#cars-status").value;
  const rows = state.cars.filter((row) => (status === "todos" || situation(row).status === status) && [row.placa, row.marca, row.modelo, row.proprietario_nome, situation(row).person, state.clients.find(c=>c.id===situation(row).clientId)?.nome].join(" ").toLocaleLowerCase("pt-BR").includes(search));
  $("#cars-total").textContent = state.cars.length;
  $("#cars-available").textContent = state.cars.filter((r) => situation(r).status === "Disponível").length;
  $("#cars-rented").textContent = state.cars.filter((r) => situation(r).status === "Locado").length;
  $("#cars-maintenance").textContent = state.cars.filter((r) => situation(r).status === "Manutenção").length;
  if(!state.verified)$("#cars-available").textContent="—"; $("#cars-count").textContent = `${rows.length} de ${state.cars.length} carros`;
  const body = $("#cars-body"); body.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement("tr"),reading=vehicleMileage(row,state.readings,state.occupations);
    tr.append(td(row.placa), td([row.marca, row.modelo].filter(Boolean).join(" ") || "—"), td(row.ano), td(reading.km==null?(state.kmError?'Consulta indisponível':'Não informado'):Number(reading.km).toLocaleString('pt-BR')+' km'),td(reading.date?new Date(reading.date).toLocaleDateString('pt-BR',{timeZone:'America/Manaus'}):'Data não informada'),td(row.proprietario_nome), td(money(row.valor_diaria)), td(money(row.caucao)), td(state.clients.find(c=>c.id===situation(row).clientId)?.nome||situation(row).person||'—'), td(situation(row).status), rowButton(row, openCar));
    body.append(tr);
  }
  $("#cars-empty").classList.toggle("hidden", rows.length > 0);
}
function openCar(row = null) {
  state.editing = row?.id || null;
  const form = $("#car-form"); form.reset();
  $("#car-dialog-title").textContent = row ? "Editar carro" : "Novo carro";
  if (row) for (const field of ["proprietario_nome", "proprietario_documento", "localizacao", "placa", "situacao", "marca", "modelo", "ano", "cor", "renavam", "chassi", "valor_diaria", "caucao", "observacoes"]) form.elements.namedItem(field).value = row[field] ?? "";
  const selected=form.elements.namedItem('situacao');selected.disabled=!!row&&situation(row).locked;const note=$('#car-operation-note');note.textContent=selected.disabled?'Situação atual: '+situation(row).status+'. Altere a ocupação na Frota ou encerre a locação; editar o cadastro não libera este veículo.':'';updateDescriptionArea(row?situation(row).status:form.elements.namedItem('situacao').value);$('#car-dialog').showModal();
}
async function saveCar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const placa = value(form, "placa").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa)) return toast("Informe uma placa válida com 7 caracteres.", true);
  const payload = { proprietario_nome: nullable(form, "proprietario_nome"), proprietario_documento: nullable(form, "proprietario_documento"), localizacao: nullable(form, "localizacao"), placa, situacao: value(form, "situacao"), marca: nullable(form, "marca"), modelo: nullable(form, "modelo"), ano: nullable(form, "ano") ? Number(value(form, "ano")) : null, cor: nullable(form, "cor"), renavam: nullable(form, "renavam"), chassi: nullable(form, "chassi"), valor_diaria: nullable(form, "valor_diaria") ? Number(value(form, "valor_diaria")) : null, caucao: nullable(form, "caucao") ? Number(value(form, "caucao")) : null, observacoes: nullable(form, "observacoes") };
  if(state.editing&&form.elements.namedItem('situacao').disabled)delete payload.situacao;else payload.situacao_confirmada_em=new Date().toISOString();const button = $('#save-car');button.disabled = true;
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
    $('#cars-search').value=new URLSearchParams(location.search).get('placa')||'';loadCars(false);
  }
}

function updateDescriptionArea(status){const maintenance=['Manutenção','Revisão'].includes(status);$('#car-description-title').textContent=maintenance?(status==='Revisão'?'Descrição da revisão':'Descrição da manutenção'):'Observações do veículo';$('#car-description-label').textContent=maintenance?'Problema, diagnóstico e serviços necessários':'Observações';$('#car-description-help').textContent=maintenance?'Registre o problema identificado, o que será feito e as orientações da oficina. A descrição será exibida na Frota e no histórico do carro.':'Informações adicionais do veículo.';}
$('#car-form').elements.namedItem('situacao').addEventListener('change',e=>updateDescriptionArea(e.target.value));

window.addEventListener('bg-page-resume',()=>loadCars(false));
