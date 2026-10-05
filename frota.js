import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
import {money,localDate,fleetStatus,totals} from './frota-core.mjs';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
await requireAuth(db);bindLogout(db);
const $=s=>document.querySelector(s),company=window.alquilerContext.company,form=$('#fleet-form');
let state={carros:[],clientes:[],periodos:[]},legacy=[],action='iniciar',current=null,busy=false,loadGeneration=0;
const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text??'';if(cls)n.className=cls;return n;};
const stamp=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Manaus'}):'Em andamento';
const clientName=id=>state.clientes.find(c=>c.id===id)?.nome||'Cliente não informado';
const localNow=()=>new Date(Date.now()-4*3600000).toISOString().slice(0,16);
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),5000);}
async function rpc(name,args){const {data,error}=await db.rpc(name,{p_empresa:company.id,...args});if(error)throw new Error(error.code==='PGRST202'?'Aplique frota_operacao.sql no Supabase para ativar esta área.':error.message);return data;}
$('#fleet-date').value=localDate();
async function load(){const generation=++loadGeneration;$('#fleet-error').textContent='';$('#fleet-new').disabled=true;try{
 const [panel,old]=await Promise.all([rpc('frota_painel',{}),db.from('locacoes').select('id,carro_id,cliente_id,data_inicio,data_fim,valor_diaria,status').in('status',['Ativa','Encerrada'])]);
 if(old.error)throw new Error(old.error.message);if(generation!==loadGeneration)return;state=panel;legacy=old.data||[];render();await dues();$('#fleet-new').disabled=false;
 }catch(e){$('#fleet-error').textContent=e.message;$('#fleet-dues').replaceChildren();$('#fleet-cards').replaceChildren();$('#fleet-money').replaceChildren();}}
function render(){const q=$('#fleet-search').value.toLocaleLowerCase('pt-BR'),filter=$('#fleet-filter').value,cards=$('#fleet-cards');cards.replaceChildren();const counts={};
 const cars=state.carros.filter(c=>c.empresa_id===company.id||state.periodos.some(p=>p.carro_id===c.id&&!p.fim));
 for(const car of cars){const p=state.periodos.find(p=>p.carro_id===car.id&&!p.fim),old=legacy.find(r=>r.carro_id===car.id&&r.status==='Ativa'),status=fleetStatus(car,p,old),name=p?.cliente_id?clientName(p.cliente_id):old?clientName(old.cliente_id):'';counts[status]=(counts[status]||0)+1;
 if(filter&&filter!==status||!`${car.placa} ${car.modelo} ${name} ${car.proprietario_nome||''}`.toLocaleLowerCase('pt-BR').includes(q))continue;
 const card=node('article','', 'fleet-card'),head=node('div','', 'fleet-card-head');head.append(node('h3',car.placa),node('span',status,'fleet-status'));card.append(head,node('p',`${car.marca||''} ${car.modelo||''}`));
 const person=node('div','', 'fleet-person');person.append(node('span',name?name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join(''):'—','fleet-avatar'),node('strong',name|| (car.ocupado_externo?'Em uso por outra empresa':'Sem locatário atual')));card.append(person);
 card.append(node('p','Proprietário: '+(car.proprietario_nome||'Não informado')),node('p','Empresa do carro: '+car.empresa_nome),node('p','Local: '+(p?.localizacao||car.localizacao||'Não informado')));
 if(p)card.append(node('p','Desde: '+stamp(p.inicio)),node('p','Previsão: '+(p.previsao?stamp(p.previsao):'Não informada')));
 if(p?.tipo==='locacao')card.append(node('strong','Diária: '+money(p.diaria)));
 if(old)card.append(node('p','Locação do fluxo de contratos. Consulte os registros para devolução.'));
 const buttons=node('div','', 'fleet-card-actions');const history=node('button','Linha do tempo','btn btn-quiet');history.onclick=()=>timeline(car);buttons.append(history);
 if(p){if(p.tipo==='locacao'){const swap=node('button','Trocar veículo','btn btn-quiet');swap.onclick=()=>open('trocar',p);buttons.append(swap);}const close=node('button',p.tipo==='locacao'?'Registrar devolução':'Concluir período','btn btn-quiet');close.onclick=()=>open('encerrar',p);buttons.append(close);}
 else if(!old&&!car.ocupado_externo){const add=node('button','Registrar ocupação','btn btn-primary');add.onclick=()=>open('iniciar',null,car.id);buttons.append(add);}
 card.append(buttons);cards.append(card);
 }
 const metrics=$('#fleet-metrics');metrics.replaceChildren();for(const [label,value] of [['Total',cars.length],['Locados',counts.Locado||0],['Disponíveis',counts.Disponível||0],['Manutenção',counts.Manutenção||0]]){const m=node('div','','metric');m.append(node('span',label),node('strong',value));metrics.append(m);}
 if(!cards.children.length)cards.append(node('p','Nenhum veículo encontrado.'));
}
async function dues(){const day=$('#fleet-date').value;if(!day)return;const rows=await rpc('frota_previsto',{p_dia:day});if(day!==$('#fleet-date').value)return;
 const t=totals(rows),metrics=$('#fleet-money');metrics.replaceChildren();for(const [label,val] of [['Previsto',t.previsto],['Recebido registrado',t.recebido],['Saldo a receber',t.saldo]]){const m=node('div','','metric');m.append(node('span',label),node('strong',money(val)));metrics.append(m);}
 const body=$('#fleet-dues');body.replaceChildren();for(const row of rows){const tr=node('tr');for(const v of [row.cliente,row.placa,money(row.diaria),money(row.recebido),money(Number(row.diaria)-Number(row.recebido))])tr.append(node('td',v));const cell=node('td'),btn=node('button','Registrar recebido','btn btn-quiet');btn.disabled=day>localDate()||Number(row.recebido)>=Number(row.diaria);btn.onclick=async()=>{const raw=prompt('Valor recebido para esta diária (R$):',String((Number(row.diaria)-Number(row.recebido)).toFixed(2)).replace('.',','));if(raw===null)return;const value=Number(raw.replace(',','.'));if(!Number.isFinite(value)||value<=0)return notify('Informe um valor positivo.');btn.disabled=true;try{await rpc('frota_receber',{p_grupo:row.grupo_id,p_dia:day,p_valor:value});await dues();notify('Recebimento registrado.');}catch(e){notify(e.message);btn.disabled=false;}};cell.append(btn);tr.append(cell);body.append(tr);}
 if(!rows.length){const tr=node('tr'),cell=node('td','Nenhuma diária registrada para este dia.');cell.colSpan=6;tr.append(cell);body.append(tr);}
 const normal=legacy.filter(r=>r.status==='Ativa'&&localDate(new Date(r.data_inicio))<=day&&(!r.data_fim||localDate(new Date(r.data_fim))>=day));
 $('#fleet-legacy-note').textContent=normal.length?`${normal.length} locação(ões) do fluxo de contratos: previsão adicional de ${money(normal.reduce((sum,r)=>sum+Number(r.valor_diaria||0),0))}. Não incluídas nos recebimentos acima; conferir no Financeiro.`:'';
}
function open(a,p=null,carId=''){action=a;current=p;form.reset();$('#fleet-form-error').textContent='';form.elements.data.value=localNow();$('#fleet-dialog-title').textContent=a==='trocar'?'Trocar veículo':a==='encerrar'?'Concluir período':'Registrar ocupação atual';
 const carSelect=form.elements.carro;carSelect.replaceChildren(new Option('Selecione um veículo',''));for(const car of state.carros){const occupied=state.periodos.some(p=>p.carro_id===car.id&&!p.fim)||legacy.some(r=>r.carro_id===car.id&&r.status==='Ativa')||car.ocupado_externo;if(!occupied)carSelect.add(new Option(`${car.placa} · ${car.modelo||''} · ${car.empresa_nome}`,car.id));}carSelect.value=carId;
 form.elements.cliente.replaceChildren(new Option('Selecione o cliente',''));for(const c of state.clientes)form.elements.cliente.add(new Option(c.nome,c.id));
 for(const name of ['tipo','carro','cliente','diaria','previsao','localizacao','observacoes']){form.elements[name].closest('label').hidden=a==='encerrar';form.elements[name].required=a!=='encerrar'&&name==='carro';}
 form.elements.tipo.closest('label').hidden=a!=='iniciar';form.elements.cliente.closest('label').hidden=a!=='iniciar';
 $('#fleet-maintenance-option').hidden=!company.oficina_habilitada;
 if(p){form.elements.cliente.value=p.cliente_id||'';form.elements.tipo.value=p.tipo;form.elements.diaria.value=p.diaria??'';}
 form.elements.data.min=p?new Date(new Date(p.inicio).getTime()-4*3600000+60000).toISOString().slice(0,16):'';
 $('#fleet-dialog').showModal();typeFields();
}
function typeFields(){const rental=form.elements.tipo.value==='locacao';for(const name of ['cliente','diaria']){form.elements[name].closest('label').hidden=action==='encerrar'||!rental||(name==='cliente'&&action==='trocar');form.elements[name].required=action!=='encerrar'&&rental;}}
form.elements.tipo.onchange=typeFields;
form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#fleet-save').disabled=true;try{const data=Object.fromEntries(new FormData(form));data.acao=action;data.periodo=current?.id;data.data=new Date(data.data+'-04:00').toISOString();data.previsao=data.previsao?new Date(data.previsao+'-04:00').toISOString():null;await rpc('frota_movimentar',{p_dados:data});$('#fleet-dialog').close();notify('Movimentação registrada.');await load();}catch(e){$('#fleet-form-error').textContent=e.message;}finally{busy=false;$('#fleet-save').disabled=false;}};
function timeline(car){$('#fleet-history-title').textContent=car.placa+' · Linha do tempo';const host=$('#fleet-history-content');host.replaceChildren();const periods=state.periodos.filter(p=>p.carro_id===car.id);for(const p of periods){const entry=node('article','','fleet-event');entry.append(node('strong',p.tipo==='locacao'?clientName(p.cliente_id):p.tipo==='manutencao'?'Manutenção':'Indisponível'),node('p',stamp(p.inicio)+' → '+stamp(p.fim)));if(p.diaria!==null)entry.append(node('p','Diária: '+money(p.diaria)));if(p.anterior_id)entry.append(node('p','Entrada por troca de veículo; locação preservada.'));if(p.observacoes)entry.append(node('p',p.observacoes));entry.append(node('small','Registrado em '+stamp(p.criado_em)));host.append(entry);}
 for(const r of legacy.filter(r=>r.carro_id===car.id)){const a=node('a',`${clientName(r.cliente_id)} · ${stamp(r.data_inicio)} · ${r.status}`,'btn btn-quiet');a.href='registros.html?locacao='+encodeURIComponent(r.id);host.append(a);}
 if(!host.children.length)host.append(node('p','Nenhum período registrado.'));$('#fleet-history').showModal();}
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>document.getElementById(button.dataset.close).close();
$('#fleet-new').onclick=()=>open('iniciar');$('#fleet-refresh').onclick=load;$('#fleet-search').oninput=render;$('#fleet-filter').onchange=render;$('#fleet-date').onchange=()=>dues().catch(e=>notify(e.message));await load();
