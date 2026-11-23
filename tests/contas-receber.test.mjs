import test from 'node:test';import assert from 'node:assert/strict';import {agruparContas,totaisContas,distribuirPagamento} from '../contas-receber-core.mjs';

const hoje='2026-11-09';
const diarias=[{grupo_id:'g1',cliente_id:'ana',nome:'ANA',placa:'AAA1111',vencimento:'2026-11-08',valor:161.95,multa:16.95,recebido:0},{grupo_id:'g1',cliente_id:'ana',nome:'ANA',placa:'AAA1111',vencimento:hoje,valor:145,multa:0,recebido:45}];
const parcelas=[{parcela_id:'p1',debito_id:'d1',cliente_id:'ana',nome:'ANA',categoria:'caucao',descricao:'Caução da locação · AAA1111',numero:1,vencimento:hoje,valor:11,recebido:0},{parcela_id:'p2',debito_id:'d1',cliente_id:'ana',nome:'ANA',categoria:'caucao',descricao:'Caução da locação · AAA1111',numero:2,vencimento:'2026-11-10',valor:11,recebido:0},{parcela_id:'p3',debito_id:'d2',cliente_id:'bia',nome:'BIA',categoria:'multa',descricao:'Multa de trânsito',numero:1,vencimento:'2026-11-20',valor:90,recebido:0}];

test('separa diária, caução e extras vencidos do que ainda vai vencer',()=>{
 const [ana,bia]=agruparContas({diarias,parcelas,hoje});
 assert.equal(ana.nome,'ANA');assert.equal(ana.vencido.diarias,16195+10000);assert.equal(ana.vencido.caucao,1100);assert.equal(ana.aVencer,1100);assert.equal(ana.proximo,'2026-11-10');assert.equal(ana.situacao,'Vencido');assert.deepEqual(ana.placas,['AAA1111']);
 assert.equal(bia.vencidoTotal,0);assert.equal(bia.aVencer,9000);assert.equal(bia.situacao,'A vencer');
 assert.deepEqual(totaisContas([ana,bia]),{vencido:16195+10000+1100,aVencer:1100+9000,caucao:1100});
});
test('itens quitados somem e ocupação sem locatário fica separada pelo grupo',()=>{
 const grupos=agruparContas({diarias:[{grupo_id:'g9',cliente_id:null,nome:'OCUPAÇÃO IMPORTADA',vencimento:hoje,valor:100,recebido:100},{grupo_id:'g8',cliente_id:null,nome:'SEM CADASTRO',vencimento:hoje,valor:100,recebido:0}],parcelas:[],hoje});
 assert.equal(grupos.length,1);assert.equal(grupos[0].key,'grupo:g8');assert.equal(grupos[0].id,null);
});
test('pagamento quita do mais antigo, diária antes da caução no mesmo dia',()=>{
 const [ana]=agruparContas({diarias,parcelas,hoje});
 assert.deepEqual(ana.itens.map(i=>i.tipo+':'+i.vencimento),['diaria:2026-11-08','diaria:2026-11-09','caucao:2026-11-09','caucao:2026-11-10']);
 assert.equal(ana.itens[0].grupo_id,'g1');
 assert.deepEqual(distribuirPagamento(ana.itens,20000),[16195,3805,0,0]);
 assert.deepEqual(distribuirPagamento(ana.itens,99999),[16195,10000,1100,1100]);
 assert.deepEqual(distribuirPagamento(ana.itens,-5),[0,0,0,0]);
});
