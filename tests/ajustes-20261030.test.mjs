import test from 'node:test';import assert from 'node:assert/strict';
import {paymentState,matchesPayment,matchesVehicle} from '../relatorios-filtros.mjs';
import {rentalVehicleState,selectableRentalCars,prepareRentalVehicle} from '../locacao-veiculos.mjs';
import {normalizePhotoClassification} from '../foto-classificacao-core.mjs';
import classifier from '../foto-classificacao.cjs';
test('pagos, não pagos e parciais seguem o saldo e não confundem cobrança a definir',()=>{
 const paid={confirmed:true,diaria:145,recebido:145},partial={...paid,recebido:25},unpaid={...paid,recebido:0},undefinedBill={...unpaid,confirmed:false};
 assert.equal(paymentState(paid),'Pago');assert.equal(paymentState(partial),'Parcial');assert(matchesPayment(partial,'nao-pagos'));assert(matchesPayment(unpaid,'nao-pagos'));assert(!matchesPayment(undefinedBill,'nao-pagos'));assert(matchesPayment(undefinedBill,'a-definir'));assert(!matchesPayment(paid,'parciais'));
 assert.equal(paymentState({...paid,diaria:160.95,recebido:145}),'Parcial');
});
test('filtros da frota distinguem ocupado, livre, manutenção e disponível',()=>{
 const row=s=>['placa','','','',s];assert(matchesVehicle(row('Locado'),'ocupados'));assert(!matchesVehicle(row('Manutenção'),'disponiveis'));assert(matchesVehicle(row('Manutenção'),'nao-ocupados'));assert(matchesVehicle(row('Disponível'),'disponiveis'));assert(!matchesVehicle(row('Vendido'),'nao-ocupados'));
});
test('nova locação exclui ocupados, vendidos, revisão, inativos e carros de outra empresa',()=>{
 const cars=[{id:'a',empresa_id:'e',situacao:'Disponível'},{id:'b',empresa_id:'e',situacao:'Manutenção'},{id:'c',empresa_id:'e',situacao:'Disponível'},{id:'d',empresa_id:'e',situacao:'Vendido'},{id:'f',empresa_id:'other',situacao:'Disponível'},{id:'g',empresa_id:'e',situacao:'Revisão'}];
 const inventory={periodos:[{carro_id:'c',tipo:'locacao',fim:null}]};assert.deepEqual(selectableRentalCars(cars,inventory,'e').map(c=>c.id),['a','b']);assert.equal(rentalVehicleState(cars[2],inventory),'Locado');
});
function dbMock({status='Manutenção',periods=[],error=null}={}){const calls=[];return {calls,from(table){const chain={select(){return this;},eq(){return this;},single(){return Promise.resolve({data:{id:'a',placa:'TEST123',empresa_id:'e',situacao:status}});},then(resolve){resolve({data:[]});}};return chain;},async rpc(name,args){calls.push({name,args});return name==='frota_painel'?{data:{periodos:periods}}:{data:'Disponível',error};}};}
test('liberação da manutenção exige confirmação, respeita bloqueio e revalida ocupação',async()=>{
 let db=dbMock();assert.equal(await prepareRentalVehicle(db,'e','a',()=>false),null);assert.equal(db.calls.filter(c=>c.name==='frota_definir_situacao').length,0);
 db=dbMock();assert.equal((await prepareRentalVehicle(db,'e','a',()=>true)).situacao,'Disponível');assert.equal(db.calls.filter(c=>c.name==='frota_definir_situacao').length,1);
 db=dbMock({error:{message:'Período de manutenção aberto'}});await assert.rejects(()=>prepareRentalVehicle(db,'e','a',()=>true),/conclua-a/);
 db=dbMock({status:'Disponível',periods:[{carro_id:'a',tipo:'locacao',fim:null}]});await assert.rejects(()=>prepareRentalVehicle(db,'e','a',()=>true),/já não está disponível/);
});
test('IA só aceita categorias conhecidas com alta confiança e imagem local reduzida',async()=>{
 assert.equal(normalizePhotoClassification({categoria:'frente',confianca:'baixa'}).categoria,'outro');assert.equal(normalizePhotoClassification({categoria:'qualquer',confianca:'alta'}).categoria,'outro');
 const image={mimeType:'image/jpeg',data:'/9j/AA=='};const result=await classifier.classifyPhoto({image},async()=>JSON.stringify({categoria:'frente',descricao:'Parte frontal',confianca:'alta'}));assert.equal(result.categoria,'frente');await assert.rejects(()=>classifier.classifyPhoto({image:{mimeType:'text/plain',data:'texto'}},()=>{throw Error('não chamar');}),/JPEG/);await assert.rejects(()=>classifier.classifyPhoto({image},async()=>'<html>'),/inválida/);
});
