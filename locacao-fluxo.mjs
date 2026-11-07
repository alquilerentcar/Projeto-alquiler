// Regras únicas das etapas: a lista de Locações e a página da locação leem daqui.
const completeInspection=v=>Boolean(v&&v.data_hora&&v.responsavel&&v.quilometragem!=null&&v.combustivel&&v.condicao_geral);

export function withFlowFlags(row,events=[]){
  const has=action=>events.some(e=>e.locacao_id===row.id&&e.acao===action);
  return {...row,__delivered:has('entrega'),__returned:has('devolucao'),__pdfActivated:has('contrato_pdf')};
}

export function rentalFlow(row, inspections, unavailable=false, now=Date.now()) {
  const contract='contrato.html?locacao='+encodeURIComponent(row.id), records='registros.html?locacao='+encodeURIComponent(row.id);
  const result=(stage,note,action,url=contract)=>({stage,note,action,url});
  if(row.status==='Cancelada')return result('Cancelada','Locação cancelada.','Ver registros',records);
  if(row.status==='Encerrada')return result('Encerrada','Confira os documentos e valores registrados.','Ver registros',records);
  if(row.__pdfActivated&&!row.__delivered)return result('Confirmar entrega','PDF vinculado ao plano de diárias. Confira assinaturas e confirme a entrega física.','Ver contrato');
  if(row.__returned)return result('Conferir encerramento','Devolução confirmada. Encerre a locação para liberar o veículo.','Ver registros',records);
  if(unavailable)return result('Verificar dados','Não foi possível consultar as vistorias. Atualize para tentar novamente.','Conferir vistoria');
  const own=inspections.filter(v=>v.locacao_id===row.id), departure=own.find(v=>v.tipo==='saida'), returned=own.find(v=>v.tipo==='devolucao');
  const due=row.status==='Ativa'&&row.data_fim&&new Date(row.data_fim).getTime()<=now;
  if(due)return completeInspection(returned)?result('Conferir encerramento','Vistoria de retorno preenchida. Confira valores, caução e documentos antes de encerrar.','Ver registros',records):result('Devolução prevista','Prazo previsto atingido. Confirme a devolução e preencha a vistoria de retorno.','Preparar devolução');
  if(row.__delivered)return result('Em andamento','Entrega confirmada. Acompanhe a locação e registre a devolução quando ocorrer.','Ver registros',records);
  if(!completeInspection(departure))return result('Preparar entrega','Preencha responsável, data, km, combustível e condição geral na vistoria de saída. Confira checklist e fotos.','Preencher vistoria');
  if(!row.contrato_gerado_em)return result('Gerar contrato','Vistoria preenchida. Revise o modelo, checklist e imagens antes de gerar o PDF.','Preparar contrato');
  const signed=Boolean(row.assinatura_locadora_em&&row.assinatura_cliente_em);
  if(!signed)return result('Acompanhar assinatura',row.assinatura_referencia?'Enviado. Aguardando confirmação das assinaturas.':'PDF definitivo pronto para envio. Envie o documento salvo para assinatura.',row.assinatura_referencia?'Conferir assinatura':'Enviar para assinatura','assinaturas.html?locacao='+encodeURIComponent(row.id));
  if(row.status==='Reservada')return result('Confirmar entrega','Assinaturas registradas. Confirme a entrega do veículo antes de iniciar a locação.','Ver registros',records);
  return result('Em andamento','Acompanhe documentos, valores registrados e a data prevista de devolução.','Ver registros',records);
}

// Mesma ordem aceita pela função locacao_confirmar_etapa no banco.
export function operationAction(row){
  if(row.status==='Reservada'||(row.status==='Ativa'&&row.__pdfActivated&&!row.__delivered))return 'entrega';
  if(row.status==='Ativa')return row.__returned?'encerramento':'devolucao';
  return '';
}

export function rentalNextStep(row,inspections,{unavailable=false,now=Date.now(),canManage=false}={}){
  const flow=rentalFlow(row,inspections,unavailable,now),contract=flow.url.startsWith('contrato')?flow.url:'contrato.html?locacao='+encodeURIComponent(row.id);
  const link=(label,url)=>({kind:'link',stage:flow.stage,note:flow.note,label,url});
  const operation=(name,label)=>({kind:'operation',stage:flow.stage,note:flow.note,operation:name,label});
  if(['Cancelada','Encerrada'].includes(flow.stage))return link('Ver documentos e valores',flow.url);
  if(flow.stage==='Verificar dados')return {kind:'none',stage:flow.stage,note:flow.note,label:''};
  const close={...operation('encerrar','Encerrar locação'),note:'Quando o veículo voltar, encerre informando a data da devolução. As diárias param nesse dia.'};
  // Locação ativa antiga, sem o PDF do fluxo novo, também encerra direto.
  if(row.status==='Ativa'&&!row.__pdfActivated)return {...close,stage:flow.stage==='Preparar entrega'||flow.stage==='Gerar contrato'?'Em andamento':flow.stage};
  if(flow.stage==='Preparar entrega')return link('Preencher vistoria de saída',flow.url);
  if(flow.stage==='Gerar contrato')return link('Gerar contrato',flow.url);
  if(flow.stage==='Acompanhar assinatura')return link(flow.action,flow.url);
  if(flow.stage==='Confirmar entrega')return operation('entrega','Confirmar entrega');
  // Locação ativa encerra em um passo: data da devolução, motivo e situação do veículo.
  return {...operation('encerrar','Encerrar locação'),note:'Quando o veículo voltar, encerre informando a data da devolução. As diárias param nesse dia.'};
}

const STEP_BY_STAGE={'Preparar entrega':'vistoria_saida','Gerar contrato':'contrato','Acompanhar assinatura':'assinatura','Confirmar entrega':'entrega','Em andamento':'devolucao','Devolução prevista':'devolucao'};

export function rentalSteps(row,inspections,events=[],{unavailable=false,now=Date.now()}={}){
  const own=events.filter(e=>e.locacao_id===row.id),when=action=>own.find(e=>e.acao===action)?.criado_em||null;
  const departure=inspections.find(v=>v.locacao_id===row.id&&v.tipo==='saida');
  const signed=Boolean(row.assinatura_locadora_em&&row.assinatura_cliente_em);
  const steps=[
    {key:'reserva',title:'Reserva',done:true,date:row.criado_em||null},
    {key:'vistoria_saida',title:'Vistoria de saída',done:completeInspection(departure),date:departure?.data_hora||null},
    {key:'contrato',title:'Contrato',done:Boolean(row.contrato_gerado_em||row.__pdfActivated),date:row.contrato_gerado_em||when('contrato_pdf')},
    {key:'assinatura',title:'Assinatura',done:signed,date:signed?[row.assinatura_locadora_em,row.assinatura_cliente_em].sort().at(-1):null,hint:row.assinatura_referencia?'Enviado. Aguardando as assinaturas.':'Assinaturas ainda não registradas.'},
    {key:'entrega',title:'Entrega do veículo',done:Boolean(row.__delivered),date:when('entrega')},
    {key:'devolucao',title:'Devolução',done:Boolean(row.__returned),date:when('devolucao')},
    {key:'encerramento',title:'Encerramento',done:row.status==='Encerrada',date:when('encerramento')},
  ];
  const finished=['Encerrada','Cancelada'].includes(row.status),flow=rentalFlow(row,inspections,unavailable,now);
  const currentKey=finished?null:flow.stage==='Conferir encerramento'?(row.__returned?'encerramento':'devolucao'):STEP_BY_STAGE[flow.stage]||null;
  const current=steps.findIndex(step=>step.key===currentKey);
  return steps.map((step,index)=>({...step,state:step.done?'done':finished?'skipped':index===current?'current':current>=0&&index<current?'attention':'pending'}));
}
