export async function classifyVehiclePhoto(file,db,empresa){
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const data=canvas.toDataURL('image/jpeg',.72).split(',')[1],session=await db.auth.getSession();if(session.error||!session.data.session?.access_token)throw Error('Entre novamente para usar o RECRUTA.');
 const response=await fetch('/api/assistente/classificar-foto',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.data.session.access_token,'X-Empresa-Id':empresa},body:JSON.stringify({image:{mimeType:'image/jpeg',data}}),signal:AbortSignal.timeout(55000)});
 let result;try{result=await response.json();}catch{throw Error('O RECRUTA não confirmou a classificação.');}if(!response.ok)throw Error(result.error||'Não foi possível classificar a foto.');return result;
}
