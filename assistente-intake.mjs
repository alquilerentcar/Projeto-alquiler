export const intakeLabels={nome_completo:'Nome completo',cpf:'CPF',data_nascimento:'Data de nascimento',rg:'RG',cnh:'Número da CNH',nacionalidade:'Nacionalidade',profissao:'Profissão',estado_civil:'Estado civil',email:'E-mail',cep:'CEP',endereco:'Endereço',numero:'Número',complemento:'Complemento',bairro:'Bairro',cidade:'Cidade',uf:'UF',nome_pai:'Nome do pai',nome_mae:'Nome da mãe',contato_1_numero:'Telefone principal',contato_1_responsavel:'Responsável pelo telefone',contato_2_numero:'Telefone de emergência',contato_2_responsavel:'Contato de emergência',contato_3_numero:'Telefone adicional',contato_3_responsavel:'Responsável adicional',contato_4_numero:'Outro telefone',contato_4_responsavel:'Outro responsável'};
export const attachmentKinds={cnh:{label:'CNH',column:'foto_cnh_path',folder:'cnh'},residencia:{label:'Comprovante de residência',column:'comprovante_residencia_path',folder:'comprovante'},rg:{label:'RG / identidade',column:'foto_rg_path',folder:'rg'}};
export function mergeIntake(records){
 const fields={};
 for(const field of Object.keys(intakeLabels)){const values=[];for(const record of records){const value=String(record.draft?.[field]||'').trim();if(value&&!values.some(item=>item.value===value))values.push({value,source:record.file.name});}if(values.length)fields[field]=values;}
 return fields;
}
export function intakePayload(draft){
 const data={};for(const key of Object.keys(intakeLabels)){const value=String(draft[key]||'').trim();if(value.length>200)throw Error('Campo muito longo: '+intakeLabels[key]);data[key]=value||null;}
 for(const key of ['cpf','cep',...Object.keys(data).filter(k=>/^contato_\d_numero$/.test(k))])if(data[key])data[key]=data[key].replace(/\D/g,'');
 if(!data.nome_completo)throw Error('Informe o nome completo.');
 if(!data.cpf||data.cpf.length!==11)throw Error('Confira o CPF com 11 dígitos antes de cadastrar.');
 if(data.cep&&data.cep.length!==8)throw Error('Confira o CEP com oito dígitos.');
 for(const key of Object.keys(data).filter(k=>/^contato_\d_numero$/.test(k)))if(data[key]&&![10,11].includes(data[key].length))throw Error('Confira o telefone com DDD.');
 if(data.data_nascimento&&!/^\d{4}-\d{2}-\d{2}$/.test(data.data_nascimento))throw Error('Confira a data de nascimento no formato AAAA-MM-DD.');
 data.tipo_pessoa='PF';return data;
}
export async function saveIntake(db,companyId,draft,records,saved={}){
 const data=intakePayload(draft),kinds=new Set();
 for(const record of records){if(!attachmentKinds[record.kind])throw Error('Identifique cada arquivo como CNH, RG ou comprovante.');if(kinds.has(record.kind))throw Error('Envie um único arquivo por tipo. Junte frente e verso em um PDF.');kinds.add(record.kind);if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(record.file.type)||record.file.size>8*1024*1024)throw Error('Use PDF, JPG, PNG ou WebP de até 8 MB por arquivo.');}
 if(!records.length)throw Error('Envie os documentos antes de salvar.');
 const session=await db.auth.getSession();if(!session.data?.session)throw Error('Sua sessão expirou. Entre novamente.');
 if(window.alquilerContext?.company?.id!==companyId)throw Error('A empresa mudou. Reinicie a leitura na empresa correta.');
 let client;
 if(saved.clientId){const result=await db.from('clientes').select('*').eq('id',saved.clientId).eq('empresa_id',companyId).single();if(result.error)throw result.error;client=result.data;if(client.cpf!==data.cpf)throw Error('Este cadastro já foi salvo. Não altere o CPF ao repetir os anexos.');}
 else{const match=await db.from('clientes').select('*').eq('empresa_id',companyId).eq('cpf',data.cpf).limit(2);if(match.error)throw match.error;if(match.data?.length>1)throw Error('Há mais de um cadastro com este CPF. Resolva a duplicidade em Clientes.');client=match.data?.[0];}
 if(!client){const result=await db.from('clientes').insert({...data,empresa_id:companyId,tipo_cadastro:'Cliente',situacao:'Ativo'}).select().single();if(result.error)throw result.error;client=result.data;saved.created=true;}
 saved.clientId=client.id;
 // Complete missing fields only; existing values and old attachments are preserved.
 const missing=Object.fromEntries(Object.entries(data).filter(([key,value])=>value&&!client[key]));
 if(Object.keys(missing).length){const result=await db.from('clientes').update(missing).eq('id',client.id).eq('empresa_id',companyId).select().single();if(result.error)throw result.error;client=result.data;}
 const skipped=[];
 for(const record of records){const kind=attachmentKinds[record.kind];if(record.savedPath)continue;if(client[kind.column]){skipped.push(kind.label);continue;}
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[record.file.type];const path=`${client.id}/${kind.folder}/${crypto.randomUUID()}.${ext}`;
  const upload=await db.storage.from('documentos-clientes').upload(path,record.file,{contentType:record.file.type,upsert:false});if(upload.error)throw upload.error;
  const result=await db.from('clientes').update({[kind.column]:path}).eq('id',client.id).eq('empresa_id',companyId).select().single();
  if(result.error){try{await db.storage.from('documentos-clientes').remove([path]);}catch{}throw result.error;}
  client=result.data;record.savedPath=path;
 }
 window.bgClearListCache?.();window.dispatchEvent(new CustomEvent('clientes-updated'));
 return {client,created:saved.created,skipped};
}
