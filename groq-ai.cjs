const allowed=['image/jpeg','image/png','image/webp'];
async function groq(prompt,{schema=null,inlineData=null,maxOutputTokens=1536}={},requestFetch=fetch){
 const key=process.env.GROQ_API_KEY;
 if(!key)throw Object.assign(new Error('Configure GROQ_API_KEY no servidor.'),{status:503});
 const parts=[{type:'text',text:prompt+(schema?' Responda somente um objeto JSON usando estes campos e tipos: '+JSON.stringify(schema):'')}];
 for(const image of inlineData?(Array.isArray(inlineData)?inlineData:[inlineData]):[]){
  if(!allowed.includes(image.mimeType))throw Object.assign(new Error('Converta o PDF em imagens antes de enviar à Groq.'),{status:400});
  parts.push({type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data}`}});
 }
 if(parts.length>4)throw Object.assign(new Error('Envie no máximo três páginas por documento.'),{status:400});
 let response;
 try{response=await requestFetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.GROQ_MODEL||'qwen/qwen3.8-27b',messages:[{role:'user',content:parts}],max_completion_tokens:Math.min(4096,Math.max(128,Math.trunc(Number(maxOutputTokens)||1536))),...((process.env.GROQ_MODEL||'qwen/qwen3.8-27b').startsWith('qwen/')?{reasoning_effort:'none'}:{}),...(schema?{response_format:{type:'json_object'}}:{})}),signal:AbortSignal.timeout(45000)});}catch(error){throw Object.assign(new Error(['TimeoutError','AbortError'].includes(error.name)?'A IA demorou para responder. Tente novamente.':'Não foi possível conectar à IA.'),{status:504});}
 const result=await response.json();
 if(!response.ok){
  if(response.status===429){const header=response.headers?.get?.('retry-after');let seconds=Number(header);if(!header||!Number.isFinite(seconds)){seconds=header?Math.ceil((Date.parse(header)-Date.now())/1000):NaN;}const match=String(result.error?.message||'').match(/try again in\s+([0-9.]+)s/i);if(!Number.isFinite(seconds)&&match)seconds=Math.ceil(Number(match[1]));seconds=Number.isFinite(seconds)&&seconds>0?Math.min(86400,Math.ceil(seconds)):null;const message='A Groq limitou as requisições do RECRUTA. '+(seconds?'Tente novamente em '+seconds+' segundos.':'O provedor não informou o tempo de liberação. Aguarde antes de tentar novamente.');throw Object.assign(new Error(message),{status:429,retryAfterSeconds:seconds});}
  throw Object.assign(new Error(response.status===401?'Chave Groq inválida. Confira a configuração no servidor.':'A Groq não conseguiu processar o pedido. Confira o modelo e a disponibilidade no painel.'),{status:502});
 }

 const text=result.choices?.[0]?.message?.content;
 if(!text)throw Object.assign(new Error('A IA não retornou dados. Tente uma imagem mais nítida.'),{status:502});
 if(schema)try{const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw Error();}catch{throw Object.assign(new Error('A IA retornou dados inválidos. Tente novamente.'),{status:502});}
 return text;
}
module.exports={groq};
