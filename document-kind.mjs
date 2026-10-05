export function documentKind(model){
 if(model.tipo==='contrato_locacao')return 'contratos';
 if(model.tipo==='distrato')return 'distratos';
 if(model.tipo==='recibo')return 'recibos';
 if(model.tipo==='alteracao_veiculo')return 'alteracoes';
 const name=String(model.nome||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\bdistratos?\b/.test(name))return 'distratos';
 if(/\brecibos?\b/.test(name))return 'recibos';
 if(/\b(alteracao|troca|substituicao)\b/.test(name)&&/\b(veiculos?|carros?)\b/.test(name))return 'alteracoes';
 return 'outro';
}
