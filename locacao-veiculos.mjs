export function rentalVehicleState(car,{periodos=[],ocupacoes=[],locacoes=[]}={}){
 if(['Vendido','Inativo'].includes(car.situacao))return car.situacao;
 if(locacoes.some(r=>r.carro_id===car.id&&r.status==='Ativa')||ocupacoes.some(o=>o.carro_id===car.id&&o.ativo)||car.ocupado_externo)return 'Locado';
 const period=periodos.find(p=>p.carro_id===car.id&&!p.fim);
 return period?period.tipo==='locacao'?'Locado':period.tipo==='manutencao'?'Manutenção':'Indisponível':car.situacao;
}
export function selectableRentalCars(cars,inventory,company){return cars.filter(c=>c.empresa_id===company&&['Disponível','Manutenção'].includes(rentalVehicleState(c,inventory)));}
export async function prepareRentalVehicle(db,company,id,ask=confirm){
 const results=await Promise.all([db.from('carros').select('*').eq('empresa_id',company).eq('id',id).single(),db.rpc('frota_painel',{p_empresa:company}),db.from('frota_levantamento').select('carro_id,ativo').eq('empresa_id',company).eq('ativo',true),db.from('locacoes').select('carro_id,status').eq('empresa_id',company).eq('status','Ativa')]);
 for(const r of results)if(r.error)throw Error('Não foi possível conferir a disponibilidade: '+r.error.message);
 const car=results[0].data;if(!car)throw Error('Veículo não encontrado nesta empresa.');
 const inventory={periodos:results[1].data?.periodos||[],ocupacoes:results[2].data||[],locacoes:results[3].data||[]},status=rentalVehicleState(car,inventory);
 if(!['Disponível','Manutenção'].includes(status))throw Error('Este veículo já não está disponível para uma nova locação. Atualize a lista.');
 if(status==='Manutenção'){
  if(!ask(`O veículo ${car.placa} está em manutenção. Deseja deixá-lo disponível para locação?`))return null;
  const r=await db.rpc('frota_definir_situacao',{p_empresa:company,p_carro:car.id,p_situacao:'Disponível',p_descricao:'Liberado da manutenção para locação, após confirmação do usuário.'});
  if(r.error)throw Error('Não foi possível liberar o veículo. Se há manutenção em aberto, conclua-a na Frota primeiro. '+r.error.message);
  car.situacao='Disponível';
 }
 return car;
}
