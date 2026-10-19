const fail=(status,message)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function deleteDraft(body,{empresa,rpc,url,serviceKey,requestFetch=fetch}){
 if(!body||typeof body!=='object'||Array.isArray(body))throw fail(400,'Confira os dados da exclusão.');
 if(!uuid(empresa)||!uuid(body.locacao)||!uuid(body.operacao)||!Number.isInteger(body.revisao)||body.revisao<0||body.confirmacao!=='EXCLUIR '+body.locacao)throw fail(400,'Confira a confirmação da locação selecionada.');
 if(!serviceKey)throw fail(503,'A exclusão precisa da configuração de contas no servidor.');
 const audit=await rpc('locacao_excluir_rascunho',{p_empresa:empresa,p_locacao:body.locacao,p_revisao:body.revisao,p_operacao:body.operacao,p_confirmacao:body.confirmacao});
 const files=Array.isArray(audit.arquivos_pendentes)?audit.arquivos_pendentes:[];
 const groups=new Map(),pending=[];
 for(const item of files){if(!['documentos-locacao','documentos-contratuais'].includes(item.bucket)||typeof item.path!=='string'||!item.path.startsWith(body.locacao+'/'))throw fail(500,'Rascunho excluído, mas os anexos exigem conferência antes da limpeza.');if(!groups.has(item.bucket))groups.set(item.bucket,[]);groups.get(item.bucket).push(item);}
 for(const [bucket,items] of groups)for(let i=0;i<items.length;i+=100){const batch=items.slice(i,i+100);try{const result=await requestFetch(url+'/storage/v1/object/'+bucket,{method:'DELETE',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({prefixes:batch.map(x=>x.path)}),signal:AbortSignal.timeout(10000)});if(!result.ok)pending.push(...batch);}catch{pending.push(...batch);}}
 let annotationFailed=false;try{await rpc('locacao_exclusao_limpeza',{p_empresa:empresa,p_operacao:body.operacao,p_pendentes:pending});}catch{annotationFailed=true;}
 return {ok:true,limpeza_pendente:pending.length>0||annotationFailed,message:pending.length||annotationFailed?'Rascunho excluído. Há limpeza de anexos pendente de conclusão.':'Rascunho e anexos excluídos definitivamente.'};
}
async function callDraftRpc(request,name,body,{url,key,requestFetch=fetch}){
 const authorization=request.headers.authorization||'';
 if(!authorization.startsWith('Bearer '))throw fail(401,'Entre novamente no sistema.');
 if(!['locacao_excluir_rascunho','locacao_exclusao_limpeza'].includes(name))throw fail(400,'Operação inválida.');
 let response;try{response=await requestFetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw fail(503,'Não foi possível concluir a solicitação. Tente novamente.');}
 // A função de confirmação retorna void: PostgREST responde 204 após salvar.
 if(response.status===204&&name==='locacao_exclusao_limpeza')return null;
 let result;try{result=await response.json();}catch{throw fail(503,'O banco não confirmou a operação. Tente novamente.');}
 if(!response.ok){if(['42P01','42702','42703'].includes(result.code))throw fail(503,'A estrutura do banco precisa de uma correção. Execute corrigir_substituicao_e_rascunhos.sql no Supabase como postgres.');if(result.code==='PGRST202')throw fail(503,'Execute locacoes_rascunhos.sql no Supabase para ativar a exclusão.');if(result.code==='23503')throw fail(409,'Há registros vinculados que impedem a exclusão deste rascunho.');throw fail(response.status===401?401:result.code==='42501'?403:409,result.message||'Não foi possível excluir o rascunho.');}
 return result;
}
module.exports={deleteDraft,callDraftRpc};
