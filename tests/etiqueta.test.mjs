import test from 'node:test';import assert from 'node:assert/strict';import {digitoEAN13,ean13Valido,modulosEAN13,svgEAN13,paginaEtiquetas} from '../etiqueta-core.mjs';

test('dígito verificador e validação do EAN-13',()=>{
 assert.equal(digitoEAN13('400638133393'),1);assert.equal(digitoEAN13('789123456789'),5);assert.equal(digitoEAN13('200000000001'),5);
 assert.ok(ean13Valido('4006381333931'));assert.ok(!ean13Valido('4006381333932'));assert.ok(!ean13Valido('123'));
});

test('barras do EAN-13: 95 módulos com as guardas no lugar',()=>{
 const m=modulosEAN13('4006381333931');assert.equal(m.length,95);assert.equal(m.slice(0,3),'101');assert.equal(m.slice(45,50),'01010');assert.equal(m.slice(-3),'101');
 // Primeiro dígito 4 = paridade LGLLGG: o 2º dígito (0) usa L, o 3º (0) usa G.
 assert.equal(m.slice(3,10),'0001101');assert.equal(m.slice(10,17),'0100111');
 assert.throws(()=>modulosEAN13('4006381333932'),/inválido/);
});

test('etiqueta em SVG e página de impressão com cópias',()=>{
 const svg=svgEAN13('2000000000015');assert.match(svg,/^<svg/);assert.match(svg,/aria-label="Código de barras 2000000000015"/);assert.equal((svg.match(/<rect x=/g)||[]).length,(modulosEAN13('2000000000015').match(/1/g)).length);
 const html=paginaEtiquetas([{descricao:'Sensor <combustível>',codigo:'2000000000015',copias:3,local:'A1'}],{empresa:'TEMPO'});
 assert.equal((html.match(/class="etq"/g)||[]).length,3);assert.match(html,/Sensor &lt;combustível&gt;/);assert.match(html,/@page\{size:80mm 40mm;margin:0\}/,'padrão: bobina de 80 mm');
 const b58=paginaEtiquetas([{descricao:'X',codigo:'2000000000015'}],{formato:'bobina58'});assert.match(b58,/size:58mm 34mm/);
 const a4=paginaEtiquetas([{descricao:'X',codigo:'2000000000015'}],{formato:'a4'});assert.match(a4,/size:A4/);
});
