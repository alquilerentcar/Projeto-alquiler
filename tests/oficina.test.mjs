import test from 'node:test';import assert from 'node:assert/strict';import {lerQuantidade,lerValor,normalizarCodigo,adicionarItem,situacaoEstoque,conferirItens,itensEntrada,itensSaida,rotuloManutencao} from '../oficina-core.mjs';

test('quantidades e valores no formato brasileiro',()=>{
 assert.equal(lerQuantidade('2'),2);assert.equal(lerQuantidade('1,5'),1.5);assert.equal(lerQuantidade('0.25'),0.25);assert.ok(Number.isNaN(lerQuantidade('')));assert.ok(Number.isNaN(lerQuantidade('-1')));assert.ok(Number.isNaN(lerQuantidade('abc')));
 assert.equal(lerValor('R$ 1.234,50'),1234.5);assert.equal(lerValor(''),null);assert.ok(Number.isNaN(lerValor('x')));
 assert.equal(normalizarCodigo(' 7891234567895\r\n'),'7891234567895');
});

test('ler a mesma peça duas vezes soma a quantidade',()=>{
 const filtro={id:'f',descricao:'Filtro',saldo:3},oleo={id:'o',descricao:'Óleo',saldo:4};
 const itens=[];adicionarItem(itens,filtro);adicionarItem(itens,oleo,2);adicionarItem(itens,filtro);
 assert.equal(itens.length,2);assert.equal(itens[0].quantidade,2);
 assert.deepEqual(conferirItens(itens,{saida:true}),[]);
 itens[1].quantidade=5;assert.match(conferirItens(itens,{saida:true})[0],/Estoque insuficiente de Óleo: tem 4, pediu 5/);
 assert.deepEqual(conferirItens(itens),[],'na entrada não importa o saldo');
 assert.match(conferirItens([])[0],/pelo menos uma/);
 itens[0].custo=20;assert.deepEqual(itensEntrada(itens),[{produto_id:'f',quantidade:2,custo_unitario:20},{produto_id:'o',quantidade:5,custo_unitario:null}]);
 itens[1].natureza='preventiva';assert.deepEqual(itensSaida(itens,'corretiva').map(i=>i.natureza),['corretiva','preventiva']);
});

test('situação do estoque e nome da manutenção',()=>{
 assert.equal(situacaoEstoque({saldo:0,estoque_minimo:2}),'Sem estoque');assert.equal(situacaoEstoque({saldo:1,estoque_minimo:2}),'Abaixo do mínimo');assert.equal(situacaoEstoque({saldo:5,estoque_minimo:2}),'Normal');
 assert.equal(rotuloManutencao({numero:3,placa:'QZA3C46',veiculo:'VW TERA',tipo:'preventiva'}),'#3 · QZA3C46 · VW TERA · Preventiva');
});
