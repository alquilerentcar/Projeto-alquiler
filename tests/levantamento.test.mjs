import test from 'node:test';import assert from 'node:assert/strict';import {lerValor,lerData,linhaDoSistema,gerarCSV,lerCSV,validarLinha,COLUNAS} from '../levantamento-core.mjs';

const sis={grupo_id:'g1',cliente_id:'c1',nome:'ANA; "SOUZA"',placa:'AAA1111',diaria:210,abertas_qtd:3,abertas_valor:465.3,ultima_paga:'2026-11-08',caucao_total:1500,caucao_pago:400,caucao_saldo:1100,caucao_parcela:11,caucao_parcelada:false};

test('valores e datas no formato brasileiro',()=>{
 assert.equal(lerValor('1.234,56'),1234.56);assert.equal(lerValor('R$ 1.234,56'),1234.56);assert.equal(lerValor('1234.5'),1234.5);assert.equal(lerValor('1.500'),1500);assert.equal(lerValor('210'),210);
 assert.equal(lerValor(''),null);assert.ok(Number.isNaN(lerValor('dez')));assert.ok(Number.isNaN(lerValor('-5')));assert.ok(Number.isNaN(lerValor('1,234')));
 assert.equal(lerData('5/1/2027'),'2027-01-05');assert.equal(lerData('2026-12-01'),'2026-12-01');assert.equal(lerData(''),null);assert.equal(lerData('31/02/2026'),undefined);
});

test('planilha sai pré-preenchida e volta igual, com ; e aspas no nome',()=>{
 const linha=linhaDoSistema(sis);assert.equal(linha.caucao_saldo,'1100,00');assert.equal(linha.caucao_parcela,'11,00');assert.equal(linha.ultima_paga,'08/11/2026');assert.equal(linha.caucao_situacao,'Sem parcelas');
 linha.atraso='420,00';linha.extras='150';linha.extras_descricao='Avaria; para-choque';
 const csv=gerarCSV([linha]);assert.ok(csv.startsWith('﻿'));assert.ok(csv.split('\r\n')[0].includes(COLUNAS[0][1]));
 const [volta]=lerCSV(csv);assert.equal(volta.codigo,'g1');assert.equal(volta.locatario,'ANA; "SOUZA"');assert.equal(volta.extras_descricao,'Avaria; para-choque');assert.equal(volta.atraso,'420,00');
 assert.throws(()=>lerCSV('a;b\n1;2'),/Código/);
});

test('validação da linha antes de enviar',()=>{
 const l=linhaDoSistema(sis);l.atraso='420,00';l.caucao_inicio='01/12/2026';
 let v=validarLinha(l,sis);assert.deepEqual(v.erros,[]);assert.deepEqual(v.envio,{grupo_id:'g1',atraso:420,caucao_saldo:1100,caucao_parcela:11,caucao_inicio:'2026-12-01',extras:0,extras_descricao:null,observacao:null});
 l.caucao_parcela='';l.extras='50';v=validarLinha(l,sis);assert.ok(v.erros.some(e=>/parcela diária/.test(e)));assert.ok(v.erros.some(e=>/descreva/.test(e)));
 v=validarLinha(linhaDoSistema({...sis,caucao_parcelada:true}),{...sis,caucao_parcelada:true});assert.deepEqual(v.erros,[],'caução parcelada não vem sugerida');
 const comCaucao={...linhaDoSistema(sis)};v=validarLinha(comCaucao,{...sis,caucao_parcelada:true});assert.ok(v.erros.some(e=>/já parcelada/.test(e)));
 v=validarLinha({...linhaDoSistema(sis),atraso:'10'},{...sis,cliente_id:null});assert.ok(v.erros.some(e=>/sem locatário/.test(e)));
 v=validarLinha(linhaDoSistema(sis),null);assert.ok(v.erros.some(e=>/código/.test(e)));
 v=validarLinha({...linhaDoSistema(sis),caucao_saldo:''},sis);assert.equal(v.envio.caucao_parcela,0,'sem caução não manda parcela');
});
