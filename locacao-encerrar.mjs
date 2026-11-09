// Encerramento em um passo: data real da devolução, motivo e situação do veículo.
const manaus=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');

export function openQuickClose({db,company,row,title,onDone}){
 const dialog=document.createElement('dialog');dialog.className='client-dialog';dialog.id='quick-close-dialog';
 dialog.innerHTML='<form class="client-form"><div class="dialog-header"><h2>Encerrar locação</h2><button type="button" class="btn btn-quiet" data-close>Fechar</button></div><div class="dialog-body"><p data-title></p><div class="form-grid"><label><span>Data e hora reais da devolução</span><input type="datetime-local" name="fim" required></label><label><span>Situação do veículo após a devolução</span><select name="situacao"><option>Disponível</option><option>Manutenção</option><option>Revisão</option><option>Indisponível</option></select></label><label class="wide"><span>Motivo</span><textarea name="motivo" rows="3" minlength="3" maxlength="2000" required placeholder="Ex.: fim do contrato, devolução antecipada"></textarea></label></div><p>A locação será encerrada e as diárias param no dia da devolução. Documentos, pagamentos e histórico são preservados.</p><p role="alert" data-error></p></div><div class="dialog-footer"><button type="submit" class="btn btn-primary">Encerrar locação</button></div></form>';
 document.body.append(dialog);
 const form=dialog.querySelector('form'),error=dialog.querySelector('[data-error]'),button=form.querySelector('[type=submit]');let busy=false;
 dialog.querySelector('[data-title]').textContent=title;
 form.elements.fim.value=manaus(Date.now());form.elements.fim.max=form.elements.fim.value;if(row.data_inicio)form.elements.fim.min=manaus(new Date(row.data_inicio).getTime()+60000);
 dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;busy=true;button.disabled=true;error.textContent='Encerrando…';
  try{const {data,error:e}=await db.rpc('locacao_encerrar_rapido',{p_empresa:company,p_locacao:row.id,p_fim:new Date(form.elements.fim.value+':00-04:00').toISOString(),p_motivo:form.elements.motivo.value.trim(),p_situacao:form.elements.situacao.value});if(e)throw e;dialog.close();await onDone(data||{});}
  catch(e){error.textContent=e.code==='PGRST202'||/schema cache|Could not find/i.test(e.message||'')?'Aplique locacao_encerrar_rapido.sql no Supabase para ativar o encerramento rápido.':e.message||'Não foi possível encerrar.';}
  finally{busy=false;button.disabled=false;}
 };
 dialog.showModal();form.elements.motivo.focus();
}

export function closedMessage(result){const n=Number(result?.cobrancas_apos_devolucao)||0;return n?`Locação encerrada. Há ${n} diária(s) gerada(s) depois da data da devolução; confira no Financeiro.`:'Locação encerrada. As diárias param na data da devolução.';}
