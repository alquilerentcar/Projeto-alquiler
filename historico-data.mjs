const SOURCES={periods:'frota_periodos',rentals:'locacoes',imported:'frota_levantamento',swaps:'frota_substituicoes',closures:'frota_ocupacoes_encerradas',changes:'frota_locatario_eventos',mileage:'frota_km',statuses:'frota_situacao_eventos',operations:'locacao_eventos',documents:'documentos_locacao',modelDocuments:'documentos_modelos_emitidos',receipts:'frota_recebimentos',bills:'frota_cobrancas',importedReceipts:'financeiro_recebimentos_importados'};
export async function historyRows(db,company,table,columns='*'){
 const rows=[];for(let offset=0;;offset+=500){const {data,error}=await db.from(table).select(columns).eq('empresa_id',company).order('id').range(offset,offset+499);if(error)throw Object.assign(Error(error.message),{code:error.code,table});rows.push(...data);if(data.length<500)return rows;}
}
export async function loadHistoryData(db,company){
 const warnings=[],result={};const jobs=await Promise.allSettled(Object.entries(SOURCES).map(async([key,table])=>[key,await historyRows(db,company,table)]));
 for(let i=0;i<jobs.length;i++){const job=jobs[i],key=Object.keys(SOURCES)[i];if(job.status==='fulfilled')result[job.value[0]]=job.value[1];else{result[key]=[];warnings.push('Não foi possível consultar '+SOURCES[key]+': '+job.reason.message);}}
 const metadata=await Promise.all([historyRows(db,company,'clientes','id,nome_completo'),historyRows(db,company,'carros'),historyRows(db,company,'fornecedores','id,nome_fantasia,razao_social,categoria_fornecedor,situacao')]);
 Object.assign(result,{clients:metadata[0],cars:metadata[1],suppliers:metadata[2],warnings});
 return result;
}
