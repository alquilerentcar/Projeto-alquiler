import test from 'node:test';import assert from 'node:assert/strict';import {bytesEtiquetas,textoImpressora} from '../impressora-serial.mjs';

test('texto sem acentos para a impressora de cupom',()=>{assert.equal(textoImpressora('Sensor de combustível · ção'),'Sensor de combustivel ? cao');});

test('comandos da etiqueta: código EAN-13, números embaixo, corte e cópias',()=>{
 const b=bytesEtiquetas([{descricao:'Sensor',codigo:'2000000000015',local:'A1',copias:2}]),h=[...b];
 assert.deepEqual(h.slice(0,2),[0x1b,0x40],'inicia a impressora');
 const ini=h.findIndex((x,i)=>x===0x1d&&h[i+1]===0x6b);assert.deepEqual(h.slice(ini,ini+4),[0x1d,0x6b,67,12],'EAN-13 com 12 dígitos');
 assert.equal(String.fromCharCode(...h.slice(ini+4,ini+16)),'200000000001','a impressora calcula o 13º dígito');
 assert.equal(h.filter((x,i)=>x===0x1b&&h[i+1]===0x6d).length,2,'um corte por cópia');
 assert.ok(String.fromCharCode(...h).includes('Sensor'));assert.ok(String.fromCharCode(...h).includes('A1'));
 assert.throws(()=>bytesEtiquetas([{descricao:'X',codigo:'123'}]),/inválido/);
});
