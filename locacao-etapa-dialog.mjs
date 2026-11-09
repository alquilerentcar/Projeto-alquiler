import {operationAction} from './locacao-fluxo.mjs';

const markup=`<form id="operation-form" class="client-form"><div class="dialog-header"><h2 id="operation-title">Etapas</h2><button id="operation-close" type="button" class="icon-button" aria-label="Fechar">×</button></div><div class="dialog-body"><label data-operation="entrega"><span>Data e hora reais da entrega (Manaus)</span><input type="datetime-local" name="data_entrega"></label><p id="operation-guidance"></p><p><a id="operation-inspection" class="btn btn-quiet">Abrir contrato e vistoria</a> <a id="operation-records" class="btn btn-quiet">Ver documentos e valores</a></p><h3>Histórico de confirmações</h3><div id="operation-history"></div><div class="form-grid"><label class="wide" data-operation="entrega devolucao"><input type="checkbox" name="vistoria_conferida"> Conferi o checklist e os registros fotográficos da vistoria correspondente.</label><label class="wide" data-operation="entrega"><input type="checkbox" name="assinatura_conferida"> Verifiquei as assinaturas do contrato e confirmo a entrega do veículo. Esta é uma conferência manual.</label><label class="wide" data-operation="encerramento"><input type="checkbox" name="financeiro_conferido"> Conferi os valores finais e pagamentos; não há pendências que impeçam o encerramento.</label><label class="wide" data-operation="encerramento"><input type="checkbox" name="caucao_conferida"> Conferi e registrei abaixo a destinação da caução.</label><label class="wide"><span>Observações da confirmação (no encerramento, descreva os valores e a destinação da caução)</span><textarea name="observacoes" minlength="5" maxlength="2000" required rows="4"></textarea></label></div><p id="operation-error" role="alert"></p></div><div class="dialog-footer"><button id="operation-confirm" type="submit" class="btn btn-primary">Confirmar</button></div></form>`;
const labels={contrato_pdf:'PDF definitivo gerado · locação e plano de diárias vinculados',assinatura_envio:'Contrato enviado para assinatura · ocupação iniciada',entrega:'Entrega confirmada',devolucao:'Devolução confirmada',encerramento:'Encerramento confirmado'};
const localNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');

export function createOperationDialog({db,title,date,onDone}){
  const dialog=document.createElement('dialog');dialog.id='operation-dialog';dialog.className='client-dialog';dialog.innerHTML=markup;document.body.append(dialog);
  const $=s=>dialog.querySelector(s),form=$('#operation-form');let operating=null;
  $('#operation-close').onclick=()=>dialog.close();
  function open(row,events){
    operating=row;form.reset();form.elements.data_entrega.value=localNow();
    $('#operation-title').textContent=title(row);
    const history=$('#operation-history');history.replaceChildren();
    for(const event of events){const item=document.createElement('p');item.textContent=labels[event.acao]+' · '+date(event.criado_em)+' · '+(event.dados?.observacoes||'')+' · Responsável (ID): '+event.usuario_id;history.append(item);}
    if(!events.length)history.textContent='Nenhuma confirmação registrada neste fluxo. O status anterior da locação foi preservado.';
    const action=operationAction(row);
    form.dataset.action=action;
    for(const field of form.querySelectorAll('[data-operation]')){const visible=field.dataset.operation.split(' ').includes(action);field.hidden=!visible;for(const input of field.querySelectorAll('input')){input.disabled=!visible;input.required=visible;}}
    const admin=Boolean(window.alquilerContext?.canManageCompany),allowed=action&&(action!=='encerramento'||admin);
    $('#operation-confirm').hidden=!allowed;form.elements.observacoes.disabled=!allowed;
    $('#operation-confirm').textContent={entrega:'Confirmar entrega',devolucao:'Confirmar devolução',encerramento:'Encerrar locação'}[action]||'Confirmar';
    $('#operation-guidance').textContent=action==='entrega'?'Preencha a vistoria de saída, gere o PDF e confira as assinaturas antes de confirmar a entrega física.':action==='devolucao'?'No contrato, selecione a vistoria Devolução, preencha os dados e salve. Confirme aqui quando o veículo tiver sido devolvido. A locação ficará ativa até o encerramento.':action==='encerramento'?(admin?'Confira os valores finais, pagamentos e destinação da caução. Esta declaração não registra pagamentos nem gera distrato automaticamente.':'O administrador deve conferir os valores e encerrar esta locação.'):'Esta locação não possui novas ações disponíveis.';
    const inspection=$('#operation-inspection');inspection.textContent=row.contrato_gerado_em?'Ver PDF definitivo e assinatura':'Editar contrato e vistoria';inspection.href=(row.contrato_gerado_em?'assinaturas.html?locacao=':'contrato.html?locacao=')+encodeURIComponent(row.id);$('#operation-records').href='registros.html?locacao='+encodeURIComponent(row.id);
    $('#operation-error').textContent='';let subsequent=$('#operation-subsequent');if(!subsequent){subsequent=document.createElement('a');subsequent.id='operation-subsequent';subsequent.className='btn btn-quiet';subsequent.textContent='Registrar vistoria posterior';inspection.parentElement.append(subsequent);}subsequent.hidden=!(row.contrato_gerado_em&&row.status==='Ativa');subsequent.href='contrato.html?locacao='+encodeURIComponent(row.id);dialog.showModal();
  }
  form.onsubmit=async event=>{
    event.preventDefault();const button=$('#operation-confirm');if(!form.reportValidity())return;button.disabled=true;$('#operation-error').textContent='';
    try{const data={observacoes:form.elements.observacoes.value.trim()};if(form.dataset.action==='entrega'&&form.elements.data_entrega.value)data.data_entrega=new Date(form.elements.data_entrega.value+':00-04:00').toISOString();for(const name of ['vistoria_conferida','assinatura_conferida','financeiro_conferido','caucao_conferida'])data[name]=!form.elements[name].disabled&&form.elements[name].checked;
    const {error}=await db.rpc('locacao_confirmar_etapa',{p_empresa:window.alquilerContext.company.id,p_locacao:operating.id,p_acao:form.dataset.action,p_dados:data});
    if(error)throw error;dialog.close();await onDone();
    }catch(error){$('#operation-error').textContent=error.message||'Não foi possível confirmar a etapa.';}finally{button.disabled=false;}
  };
  return {open,form};
}
