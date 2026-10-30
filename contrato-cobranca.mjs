export function firstDailyRule({entrada,dataContrato,entrega=null}){
 const paid=Number(entrada);if(!Number.isFinite(paid)||paid<0)throw Error('Confira a entrada da caução.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dataContrato||''))throw Error('Informe a data do contrato antes de gerar o PDF.');
 if(Math.round(paid*100)<100000)return {regra:'dia_contrato',primeira:dataContrato};
 if(!entrega)return {regra:'apos_entrega',primeira:null};
 const date=new Date(entrega);if(!Number.isFinite(date.getTime()))throw Error('Informe a data real da entrega.');
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 return {regra:'apos_entrega',primeira:new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10)};
}
export function describeDailyRule(data){const r=firstDailyRule(data);return r.primeira?'Primeira diária: '+r.primeira.split('-').reverse().join('/')+' (entrada da caução abaixo de R$ 1.000). Serão geradas cobranças a partir dessa data, sem presumir pagamentos anteriores.':'Primeira diária: dia seguinte à entrega real do veículo. Confirme a entrega em Gerenciar etapas para iniciar as cobranças.';}
