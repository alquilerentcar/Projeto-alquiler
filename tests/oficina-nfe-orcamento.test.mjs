import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {lerNFe,casarItens} from '../nfe-core.mjs';import {montarOrcamento,resumoSaidas,seguro} from '../orcamento-core.mjs';
const xml=fs.readFileSync(new URL('./fixtures/nfe-ficticia.xml',import.meta.url),'utf8');

test('lê a NF-e: chave, número, fornecedor e itens com código de barras',()=>{
 const n=lerNFe(xml);
 assert.equal(n.chave,'13261111222333000181550010000012341000012345');assert.equal(n.numero,'1234');assert.equal(n.serie,'1');assert.equal(n.emissao,'2026-11-10');
 assert.equal(n.emitente_cnpj,'11222333000181');assert.equal(n.emitente_nome,'AUTOPEÇAS FICTÍCIA & CIA LTDA');assert.equal(n.valor_total,1126);
 assert.equal(n.itens.length,3);
 assert.deepEqual(n.itens[0],{n:1,codigo:'SC-445',ean:'7891234567895',descricao:'SENSOR DE COMBUSTIVEL',ncm:'90262090',unidade:'UN',quantidade:4,valor_unitario:150,valor_total:600});
 assert.equal(n.itens[1].ean,null,'SEM GTIN vira sem código de barras');assert.equal(n.itens[2].descricao,'FILTRO DE AR "PREMIUM"');assert.equal(n.itens[2].quantidade,2.5);
 assert.throws(()=>lerNFe('<html></html>'),/não é o XML de uma NF-e/);
});

test('liga itens da nota às peças: código aprendido do fornecedor, depois código de barras',()=>{
 const n=lerNFe(xml),produtos=[{id:'p-sensor',codigo_barras:'7891234567895'},{id:'p-oleo',codigo_barras:null}];
 const c=casarItens(n.itens,produtos,{'OL-530':'p-oleo'});
 assert.deepEqual(c.map(i=>[i.produto?.id||null,i.como]),[['p-sensor','barras'],['p-oleo','codigo'],[null,'nova']]);
});

const orc={empresa:{razao_social:'TEMPO DA MECANICA LTDA',cnpj:'11222333000181'},rateio:{corretiva:50,preventiva:100},
 manutencao:{numero:7,placa:'QZA3C46',tipo:'corretiva',km:15010,motivo:'Barulho na suspensão',entrada_em:'2026-11-13T12:00:00Z',cobrada_em:null},
 veiculo:{placa:'QZA3C46',marca:'VW',modelo:'TERA',ano:2025,cor:'BRANCO'},responsavel:{nome:'LOCATÁRIO FICTÍCIO'},
 linhas:[{tipo:'peca',descricao:'Sensor de combustível',unidade:'UN',quantidade:1,valor_unitario:150,total:150,natureza:'corretiva',pct_locatario:50,valor_locatario:75},
  {tipo:'servico',descricao:'Carga de gás',categoria:'ar_condicionado',externo:true,fornecedor:'CARECA AR',quantidade:1,valor_unitario:200,total:200,natureza:'preventiva',pct_locatario:100,valor_locatario:200}],
 totais:{pecas:150,servicos:200,geral:350,locatario:275,empresa:75}};

test('orçamento: cabeçalho, linhas com rateio e totais',()=>{
 const o=JSON.parse(JSON.stringify(montarOrcamento(orc)).replace(/ /g,' '));
 assert.deepEqual(o.cabecalho.map(c=>c[0]),['Orçamento','Oficina','Veículo','Manutenção','Motivo','Locatário']);assert.equal(o.cabecalho[0][1],'Nº 00007 · 13/11/2026');assert.equal(o.cabecalho[2][1],'QZA3C46 · VW TERA 2025 · BRANCO');assert.equal(o.cabecalho[5][1],'LOCATÁRIO FICTÍCIO');assert.equal(o.locadora,'');
 assert.equal(o.linhas[0].locatario,'50% · R$ 75,00');assert.equal(o.linhas[1].tipo,'Serviço de fora');assert.equal(o.linhas[1].descricao,'Carga de gás (CARECA AR) · Ar-condicionado');
 assert.deepEqual(o.totais.map(t=>t[0]),['Peças','Serviços','Total da manutenção','Parte do locatário','Parte da empresa']);assert.equal(o.totais[3][1],'R$ 275,00');
 assert.match(o.regra,/Corretiva: 50% locatário e 50% empresa\. Preventiva: 100% locatário/);assert.equal(o.empresa,'TEMPO DA MECANICA LTDA · CNPJ 11.222.333/0001-81');
 const sem=montarOrcamento({...orc,responsavel:null,manutencao:{...orc.manutencao,cliente_externo:'JOÃO'}});assert.equal(sem.totais.length,4);assert.equal(sem.totais[3][0],'Total a pagar pelo cliente');assert.match(sem.regra,/Cliente de fora/);assert.equal(sem.cabecalho.at(-1)[1],'JOÃO (cliente)');
 // Carro da locadora: Alquiler sai como cliente, entre a oficina e o carro, e na parte que ela paga.
 const alq=JSON.parse(JSON.stringify(montarOrcamento({...orc,empresa:{razao_social:'TEMPO DA MECANICA LTDA',nome_fantasia:'Tempo da Mecânica',cnpj:'11222333000181'},locadora:{nome_fantasia:'Alquiler Rent a Car',razao_social:'ALQUILER LTDA',cnpj:'44555666000199'}})).replace(/ /g,' '));
 assert.deepEqual(alq.cabecalho.map(c=>c[0]),['Orçamento','Oficina','Cliente','Veículo','Manutenção','Motivo','Locatário']);
 assert.equal(alq.cabecalho[1][1],'Tempo da Mecânica · TEMPO DA MECANICA LTDA · CNPJ 11.222.333/0001-81');assert.equal(alq.cabecalho[2][1],'Alquiler Rent a Car · ALQUILER LTDA · CNPJ 44.555.666/0001-99');
 assert.equal(alq.locadora,'Alquiler Rent a Car');assert.equal(alq.cliente.nome,'ALQUILER LTDA');assert.deepEqual(alq.cliente.linhas,['Alquiler Rent a Car','CNPJ 44.555.666/0001-99']);
 const alq2=montarOrcamento({...orc,responsavel:{nome:'LOCATÁRIO FICTÍCIO',cpf:'12345678909',telefone:'92999990000'},locadora:{razao_social:'ALQUILER LTDA',cnpj:'44555666000199',endereco:'Av. Um',numero:'10',bairro:'Centro',cidade:'Manaus',uf:'AM',cep:'69000-000',telefone:'9230000000',email:'a@b.c'}});
 assert.deepEqual(alq2.cliente.linhas,['CNPJ 44.555.666/0001-99','Av. Um, 10 · Centro · Manaus/AM · CEP 69000-000','Tel. 9230000000 · a@b.c']);assert.deepEqual(alq2.locatario,{nome:'LOCATÁRIO FICTÍCIO',linhas:['CPF 123.456.789-09','Tel. 92999990000']});
 assert.equal(o.cliente,null,'sem locadora: sem bloco');assert.equal(alq.totais[4][0],'Parte da Alquiler Rent a Car');
 assert.equal(seguro('A — B “x” ok'),'A - B "x" ok');
});

test('histórico de saída: 4 sensores, um em cada carro, resta 1',()=>{
 const movs=[{tipo:'entrada',quantidade:4},{tipo:'saida',quantidade:-1,placa:'XAA1A11'},{tipo:'saida',quantidade:-1,placa:'YBB2B22'},{tipo:'saida',quantidade:-1,placa:'ZCC3C33'}];
 const r=resumoSaidas(movs);assert.equal(r.total,3);assert.deepEqual(r.carros.map(c=>[c.placa,c.quantidade]),[['XAA1A11',1],['YBB2B22',1],['ZCC3C33',1]]);
});

test('NF-e com nItem como tag e protocolo antes da nota (formato de alguns distribuidores)',()=>{
 const xml=`<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><protNFe><infProt><chNFe>13261100000000000000550010000000011000000011</chNFe></infProt></protNFe><NFe><infNFe Id="NFe13261100000000000000550010000000011000000011" versao="4.00">
 <det><nItem>1</nItem><prod><cEAN>7891234567895</cEAN><cProd>A-1</cProd><qCom>3.0000</qCom><xProd>TENSOR FICTICIO</xProd><vUnCom>198.9300</vUnCom><uCom>UN</uCom><vProd>596.79</vProd></prod><infAdProd>x</infAdProd></det>
 <det><nItem>2</nItem><prod><cEAN>SEM GTIN</cEAN><cProd>B-2</cProd><qCom>2.0000</qCom><xProd>CORREIA FICTICIA</xProd><vUnCom>34.1400</vUnCom><uCom>UN</uCom><vProd>68.28</vProd></prod></det>
 <total><ICMSTot><vNF>665.07</vNF></ICMSTot></total><pag><detPag><vPag>665.07</vPag></detPag></pag><ide><nNF>99</nNF><serie>221</serie><dhEmi>2026-11-23T09:52:17-04:00</dhEmi></ide><emit><xNome>DISTRIBUIDORA FICTICIA</xNome><CNPJ>11222333000181</CNPJ></emit></infNFe></NFe></nfeProc>`;
 const n=lerNFe(xml);
 assert.equal(n.itens.length,2);assert.deepEqual(n.itens.map(i=>[i.n,i.codigo,i.ean,i.quantidade,i.valor_unitario]),[[1,'A-1','7891234567895',3,198.93],[2,'B-2',null,2,34.14]]);
 assert.equal(n.numero,'99');assert.equal(n.serie,'221');assert.equal(n.emissao,'2026-11-23');assert.equal(n.valor_total,665.07);assert.equal(n.emitente_cnpj,'11222333000181');
});

test('relatório do estoque: só o que tem saldo, por categoria, com total a custo',async()=>{
 const {montarRelatorioEstoque}=await import('../estoque-pdf.mjs');
 const r=montarRelatorioEstoque([{descricao:'Óleo 5W30',categoria:'fluidos',saldo:4,unidade:'L',custo_medio:30},{descricao:'Bucha',categoria:'pecas',saldo:2,unidade:'UN',custo_medio:0},{descricao:'Filtro',categoria:'pecas',saldo:0,unidade:'UN',custo_medio:20},{descricao:'Amortecedor',categoria:'pecas',saldo:1,unidade:'UN',custo_medio:250}],{pecas:'Peças',fluidos:'Fluidos'});
 assert.deepEqual(r.grupos.map(g=>g.categoria),['Fluidos','Peças']);assert.deepEqual(r.grupos[1].itens.map(i=>i.descricao),['Amortecedor','Bucha']);
 assert.equal(r.itens,3);assert.equal(r.total,370);assert.equal(r.semCusto,1);
});
