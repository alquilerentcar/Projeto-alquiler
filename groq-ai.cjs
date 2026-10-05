const allowed=['image/jpeg','image/png','image/webp'];
async function groq(prompt,{schema=null,inlineData=null}={},requestFetch=fetch){
 const key=process.env.GROQ_API_KEY;
 if(!key)throw Object.assign(new Error('Configure GROQ_API_KEY no servidor.'),{status:503});
 const parts=[{type:'text',text:prompt+(schema?' Responda somente um objeto JSON usando estes campos e tipos: '+JSON.stringify(schema):'')}];
 for(const image of inlineData?(Array.isArray(inlineData)?inlineData:[inlineData]):[]){
  if(!allowed.includes(image.mimeType))throw Object.assign(new Error('Converta o PDF em imagens antes de enviar à Groq.'),{status:400});
  parts.push({type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data}`}});
 }
 if(parts.length>4)throw Object.assign(new Error('Envie no máximo três páginas por documento.'),{status:400});
 let response;
 try{response=await requestFetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.GROQ_MODEL||'qwen/qwen3.8-27b',messages:[{role:'user',content:parts}],max_completion_tokens:4096,...(schema?{response_format:{type:'json_object'}}:{})}),signal:AbortSignal.timeout(45000)});}catch(error){throw Object.assign(new Error(['TimeoutError','AbortError'].includes(error.name)?'A IA demorou para responder. Tente novamente.':'Não foi possível conectar à IA.'),{status:504});}
 const result=await response.json();
 if(!response.ok)throw Object.assign(new Error(response.status===429?'Limite gratuito da IA atingido. Aguarde antes de tentar novamente.':response.status===401?'Chave Groq inválida. Confira a configuração no servidor.':'A Groq não conseguiu processar o pedido. Confira o modelo e a disponibilidade no painel.'),{status:response.status===429?429:502});
 const text=result.choices?.[0]?.message?.content;
 if(!text)throw Object.assign(new Error('A IA não retornou dados. Tente uma imagem mais nítida.'),{status:502});
 if(schema)try{const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw Error();}catch{throw Object.assign(new Error('A IA retornou dados inválidos. Tente novamente.'),{status:502});}
 return text;
}
module.exports={groq};
