import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {firstDailyRule} from '../contrato-cobranca.mjs';import {assertReceiptStationery} from '../recibo-timbrado.mjs';
test('limite é a entrada da caução: abaixo de 1000 no contrato; 1000 ou mais após entrega',()=>{
 for(const entrada of [0,25,500,999.99])assert.deepEqual(firstDailyRule({entrada,dataContrato:'2026-10-30'}),{regra:'dia_contrato',primeira:'2026-10-30'});
 assert.deepEqual(firstDailyRule({entrada:1000,dataContrato:'2026-10-30'}),{regra:'apos_entrega',primeira:null});
 assert.deepEqual(firstDailyRule({entrada:1500,dataContrato:'2026-10-30',entrega:'2026-10-31T03:30:00Z'}),{regra:'apos_entrega',primeira:'2026-10-31'});
 assert.throws(()=>firstDailyRule({entrada:-1,dataContrato:'2026-10-30'}),/entrada/);
});
test('recibo exige o timbrado cadastrado da empresa correta',()=>{
 assert.throws(()=>assertReceiptStationery({id:'a'}),/Cadastre/);assert.throws(()=>assertReceiptStationery({id:'a',papel_timbrado_path:'b/timbrado.pdf'}),/não pertence/);assert(assertReceiptStationery({id:'a',papel_timbrado_path:'a/timbrado.pdf'}));
});
test('arquivamento ativa depois de salvar PDF; falha preserva o PDF e permite retomar',async()=>{
 const source=fs.readFileSync(new URL('../contrato.js',import.meta.url),'utf8'),start=source.indexOf('async function archivePdf('),end=source.indexOf('function downloadPdf(',start);assert(start>=0&&end>start);
 for(const mode of ['legacy','ok','error']){const calls=[],state={rental:{status:'Reservada'}};const context=vm.createContext({Blob,Date,id:'locacao',state,billingPdfReady:mode!=='legacy',activatePdfBilling:async document=>{calls.push(['ativar',document]);if(mode==='error')throw Error('Ocupação conflitante');state.rental.status='Ativa';},db:{storage:{from:()=>({upload:async()=>{calls.push(['upload']);return{};},remove:async()=>({})})},from:()=>({select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:[]}),insert(){calls.push(['documento']);return this;},single:async()=>({data:{id:'pdf-id'}}),update(){calls.push(['status']);return this;},then(resolve){resolve({});}})}});
 vm.runInContext(source.slice(start,end)+';globalThis.run=archivePdf;',context);const call=()=>context.run(new Uint8Array([37,80,68,70]),'teste.pdf');if(mode==='error')await assert.rejects(call,/conflitante/);else await call();assert(state.rental.contrato_gerado_em);assert.equal(calls.filter(x=>x[0]==='ativar').length,mode==='legacy'?0:1);if(mode==='ok')assert.equal(state.rental.status,'Ativa');else assert.equal(state.rental.status,'Reservada');assert.equal(calls[0][0],'upload');
 }
});
