export function money(value){return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
export function localDate(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function fleetStatus(car,period,legacy){
 if(period)return period.tipo==='locacao'?'Locado':period.tipo==='manutencao'?'Manutenção':'Indisponível';
 if(legacy||car.ocupado_externo)return 'Locado';
 return car.situacao==='Disponível'?'Disponível':car.situacao==='Manutenção'?'Manutenção':car.situacao==='Inativo'?'Indisponível':'Situação a confirmar';
}
export function totals(rows){return rows.reduce((s,r)=>({previsto:s.previsto+Number(r.diaria),recebido:s.recebido+Number(r.recebido),saldo:s.saldo+Math.max(0,Number(r.diaria)-Number(r.recebido))}),{previsto:0,recebido:0,saldo:0});}
