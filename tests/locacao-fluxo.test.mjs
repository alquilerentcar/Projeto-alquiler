import test from 'node:test';
import assert from 'node:assert/strict';
import {operationAction,rentalFlow,rentalNextStep,rentalSteps,withFlowFlags} from '../locacao-fluxo.mjs';

const now=new Date('2026-11-05T12:00:00Z').getTime();
const inspection=(tipo,extra={})=>({locacao_id:'r',tipo,data_hora:'2026-11-01T12:00:00Z',responsavel:'ANA',quilometragem:100,combustivel:'Cheio',condicao_geral:'Bom estado',...extra});
const rental=(extra={})=>({id:'r',status:'Reservada',data_inicio:'2026-11-01T12:00:00Z',data_fim:'2026-12-01T12:00:00Z',...extra});
const event=acao=>({locacao_id:'r',acao,criado_em:'2026-11-02T12:00:00Z'});
const state=(steps,key)=>steps.find(step=>step.key===key).state;
const signedAt={assinatura_locadora_em:'2026-11-01T13:00:00Z',assinatura_cliente_em:'2026-11-01T14:00:00Z'};

test('nova locação começa pela vistoria de saída',()=>{
  const row=withFlowFlags(rental());
  const next=rentalNextStep(row,[],{now}),steps=rentalSteps(row,[],[],{now});
  assert.equal(next.kind,'link');assert.equal(next.label,'Preencher vistoria de saída');assert.match(next.url,/^contrato\.html\?locacao=r$/);
  assert.equal(state(steps,'reserva'),'done');assert.equal(state(steps,'vistoria_saida'),'current');assert.equal(state(steps,'contrato'),'pending');
});

test('contrato gerado leva à tela de assinaturas',()=>{
  const row=withFlowFlags(rental({contrato_gerado_em:'2026-11-01T12:30:00Z'}));
  const next=rentalNextStep(row,[inspection('saida')],{now});
  assert.equal(next.label,'Enviar para assinatura');assert.match(next.url,/^assinaturas\.html/);
  assert.equal(state(rentalSteps(row,[inspection('saida')],[],{now}),'assinatura'),'current');
});

test('assinaturas concluídas pedem a confirmação de entrega',()=>{
  const row=withFlowFlags(rental({contrato_gerado_em:'2026-11-01T12:30:00Z',...signedAt}));
  const next=rentalNextStep(row,[inspection('saida')],{now});
  assert.equal(next.kind,'operation');assert.equal(next.operation,'entrega');assert.equal(operationAction(row),'entrega');
});

test('PDF ativado sem assinatura permite entrega, mas sinaliza a assinatura',()=>{
  const events=[event('contrato_pdf')],row=withFlowFlags(rental({status:'Ativa',contrato_gerado_em:'2026-11-01T12:30:00Z'}),events);
  assert.equal(rentalNextStep(row,[inspection('saida')],{now}).operation,'entrega');
  const steps=rentalSteps(row,[inspection('saida')],events,{now});
  assert.equal(state(steps,'assinatura'),'attention');assert.equal(state(steps,'entrega'),'current');
});

test('locação ativa entregue encerra em um passo, sem exigir vistoria de retorno',()=>{
  const events=[event('contrato_pdf'),event('entrega')],row=withFlowFlags(rental({status:'Ativa',contrato_gerado_em:'x',...signedAt}),events);
  for(const list of [[inspection('saida')],[inspection('saida'),inspection('devolucao')]]){const next=rentalNextStep(row,list,{now});assert.equal(next.kind,'operation');assert.equal(next.operation,'encerrar');assert.equal(next.label,'Encerrar locação');}
});

test('prazo vencido e devolução já confirmada também oferecem o encerramento a qualquer usuário',()=>{
  const due=withFlowFlags(rental({status:'Ativa',data_fim:'2026-11-03T12:00:00Z',contrato_gerado_em:'x',...signedAt}),[event('contrato_pdf'),event('entrega')]);
  assert.equal(rentalNextStep(due,[inspection('saida')],{now}).operation,'encerrar');
  const events=[event('contrato_pdf'),event('entrega'),event('devolucao')],returned=withFlowFlags(rental({status:'Ativa',contrato_gerado_em:'x',...signedAt}),events);
  assert.equal(rentalNextStep(returned,[],{now,canManage:false}).operation,'encerrar');
  assert.equal(state(rentalSteps(returned,[],events,{now}),'encerramento'),'current');
});

test('locação antiga ativa, sem PDF vinculado, também encerra em um passo',()=>{
  assert.equal(rentalNextStep(withFlowFlags(rental({status:'Ativa'})),[],{now}).operation,'encerrar');
});

test('locação encerrada ou cancelada não pede novas ações nem cria alerta',()=>{
  for(const status of ['Encerrada','Cancelada']){
    const row=withFlowFlags(rental({status}));
    assert.equal(rentalNextStep(row,[],{now}).url,'registros.html?locacao=r');
    assert.equal(operationAction(row),'');
    const steps=rentalSteps(row,[],[],{now});
    assert.ok(!steps.some(step=>['current','attention'].includes(step.state)));
  }
});

test('falha ao consultar vistorias não oferece ação',()=>{
  const row=withFlowFlags(rental());
  assert.equal(rentalNextStep(row,[],{now,unavailable:true}).kind,'none');
  assert.ok(!rentalSteps(row,[],[],{now,unavailable:true}).some(step=>step.state==='current'));
});
