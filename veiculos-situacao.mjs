export function vehicleSituation(car,periods=[],rentals=[],occupations=[],verified=true){
 const period=periods.find(p=>p.carro_id===car.id&&!p.fim),rental=rentals.find(r=>r.carro_id===car.id&&r.status==='Ativa'),occupation=occupations.find(o=>o.ativo!==false&&(o.carro_id===car.id||o.placa===car.placa));
 if(occupation||rental||period?.tipo==='locacao'||car.ocupado_externo)return {status:'Locado',occupation,clientId:occupation?.cliente_id||rental?.cliente_id||period?.cliente_id,person:occupation?.responsavel,source:occupation?'Ocupação informada':rental?'Locação ativa':car.ocupado_externo?'Em uso em outra empresa':'Período da frota',locked:true};
 if(period)return {status:period.tipo==='manutencao'?'Manutenção':'Indisponível',source:period.localizacao||'Período da frota',locked:true};
 if(!verified)return {status:'Situação a confirmar',source:'Não foi possível conferir as ocupações',locked:true};
 return {status:['Disponível','Locado','Manutenção','Revisão','Indisponível','Inativo','Vendido'].includes(car.situacao)?car.situacao:'Situação a confirmar',source:'Cadastro do veículo',locked:false};
}
