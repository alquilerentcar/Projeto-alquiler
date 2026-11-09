import test from 'node:test';import assert from 'node:assert/strict';import {localDate,localDateTime} from '../frota-core.mjs';

// 05/11 às 21:30 em Manaus já é 06/11 em UTC: contrato, recibo e vistoria devem mostrar 05/11.
const lateNight=new Date('2026-11-06T01:30:00Z');
test('dia de Manaus depois das 20h não avança para o dia seguinte',()=>{assert.equal(localDate(lateNight),'2026-11-05');assert.equal(localDate(new Date('2026-11-06T03:59:00Z')),'2026-11-05');assert.equal(localDate(new Date('2026-11-06T04:00:00Z')),'2026-11-06');});
test('campo de data e hora usa o horário de Manaus, qualquer que seja o fuso do computador',()=>{assert.equal(localDateTime(lateNight),'2026-11-05T21:30');assert.equal(localDateTime(new Date('2026-01-01T03:05:00Z')),'2025-12-31T23:05');});
test('salvar o valor do campo com -04:00 volta ao mesmo instante',()=>{assert.equal(new Date(localDateTime(lateNight)+':00-04:00').toISOString(),lateNight.toISOString());});
