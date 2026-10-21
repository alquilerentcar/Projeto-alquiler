const SOURCES={periods:'frota_periodos',rentals:'locacoes',imported:'frota_levantamento',swaps:'frota_substituicoes',closures:'frota_ocupacoes_encerradas',changes:'frota_locatario_eventos',mileage:'frota_km',statuses:'frota_situacao_eventos',operations:'locacao_eventos',documents:'documentos_locacao',modelDocuments:'documentos_modelos_emitidos',receipts:'frota_recebimentos',bills:'frota_cobrancas',importedReceipts:'financeiro_recebimentos_importados'};
// Históricos consultam metadados. Conteúdo dos contratos, fotos e dados de importação
// são carregados apenas nas telas específicas que precisam deles.
export const HISTORY_COLUMNS={
 rentals:'id,cliente_id,carro_id,data_inicio,status,contrato_gerado_em',
 imported:'id,carro_id,cliente_id,responsavel,inicio,ativo',
 swaps:'id,confirmado_em,origem_tipo,origem_id,cliente_id,anterior_id,posterior_id,data_troca,valores,ocupacao:snapshot->ocupacao',
 documents:'id,locacao_id,nome,status,versao,arquivo_assinado_path,arquivo_original_path,gerado_em,criado_em',
 modelDocuments:'id,locacao_id,nome,arquivo_path,criado_em',
 bills:'id,grupo_id,competencia,carro_id,cliente_id',
 importedReceipts:'id,cliente_id,carro_id,data_recebimento,valor,composicao_status',
 cars:'id,placa,modelo,situacao,observacoes'
};
export async function historyRows(db,company,table,columns='*'){
 const rows=[];for(let offset=0;;offset+=500){const {data,error}=await db.from(table).select(columns).eq('empresa_id',company).order('id').range(offset,offset+499);if(error)throw Object.assign(Error(error.message),{code:error.code,table});rows.push(...data);if(data.length<500)return rows;}
}
export async function loadHistoryData(db,company){
 const warnings=[],result={};const jobs=await Promise.allSettled(Object.entries(SOURCES).map(async([key,table])=>[key,await historyRows(db,company,table,HISTORY_COLUMNS[key]||'*')]));
 for(let i=0;i<jobs.length;i++){const job=jobs[i],key=Object.keys(SOURCES)[i];if(job.status==='fulfilled')result[job.value[0]]=job.value[1];else{result[key]=[];warnings.push('Não foi possível consultar '+SOURCES[key]+': '+job.reason.message);}}
 result.swaps=result.swaps.map(({ocupacao,...swap})=>({...swap,snapshot:{ocupacao}}));
 const metadata=await Promise.all([historyRows(db,company,'clientes','id,nome_completo'),historyRows(db,company,'carros',HISTORY_COLUMNS.cars),historyRows(db,company,'fornecedores','id,nome_fantasia,razao_social,categoria_fornecedor,situacao')]);
 Object.assign(result,{clients:metadata[0],cars:metadata[1],suppliers:metadata[2],warnings});
 return result;
}
