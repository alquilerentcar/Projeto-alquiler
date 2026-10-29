export const DEFAULT_PHOTO_LIMIT=20;
export const MAX_PHOTO_LIMIT=60;
export function addSubstitutionPhotos(current,files,limit=DEFAULT_PHOTO_LIMIT){
 const result=[...current],keys=new Set(result.map(f=>[f.name,f.size,f.lastModified].join('|')));
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error(file.name+': use JPG, PNG ou WebP de até 10 MB.');
  const key=[file.name,file.size,file.lastModified].join('|');if(keys.has(key))continue;
  if(result.length>=limit)throw Error('O termo aceita até '+limit+' fotos. Remova uma foto antes de adicionar outra.'+(limit<MAX_PHOTO_LIMIT?' Execute fotos_e_historicos.sql no Supabase para liberar até 60.':''));
  keys.add(key);result.push(file);
 }
 return result;
}

// A ordem permanece foto-1.jpg... para preservar as regras do Storage existentes.
export function addPhotosToGroup(groups,group,files,limit=DEFAULT_PHOTO_LIMIT){
 if(!['anterior','posterior'].includes(group))throw Error('Grupo de fotos inválido.');
 const other=group==='anterior'?'posterior':'anterior';
 const added=addSubstitutionPhotos(groups[group]||[],files,limit);
 if(added.length+(groups[other]?.length||0)>limit)throw Error('O limite de '+limit+' fotos é compartilhado pelos dois veículos. Remova uma foto para continuar.');
 const key=f=>[f.name,f.size,f.lastModified].join('|'),otherKeys=new Set((groups[other]||[]).map(key));
 if(added.some(f=>otherKeys.has(key(f))))throw Error('A mesma foto já está no outro veículo. Confira em qual grupo ela pertence.');
 return {...groups,[group]:added};
}
export function photoGroupMetadata(groups){
 const anterior=groups.anterior?.length||0,posterior=groups.posterior?.length||0;
 if(!anterior||!posterior)throw Error('Adicione pelo menos uma foto do carro substituído e uma do carro substituto.');
 return {versao:1,anterior,posterior};
}
export function substitutionPhotoDescriptors(doc){
 const total=Number(doc.fotos),meta=doc.valores?.fotos_grupos;
 if(!Number.isInteger(total)||total<1||total>MAX_PHOTO_LIMIT)throw Error('Quantidade de fotos inválida no termo.');
 let anterior=0;
 if(meta!=null){
  if(meta.versao!==1||!Number.isInteger(meta.anterior)||!Number.isInteger(meta.posterior)||meta.anterior<1||meta.posterior<1||meta.anterior+meta.posterior!==total)throw Error('A identificação das fotos dos veículos está inconsistente. Confira a preparação antes de gerar o termo.');
  anterior=meta.anterior;
 }
 return Array.from({length:total},(_,i)=>{const old=i<anterior,number=old?i+1:i+1-anterior,count=old?anterior:total-anterior;
  return {index:i+1,grupo:old?'anterior':'posterior',placa:doc.snapshot[old?'anterior':'posterior'].placa,title:(old?'Veículo substituído (devolução)':'Veículo substituto (entrega)')+' '+doc.snapshot[old?'anterior':'posterior'].placa+' — foto '+number+' de '+count};
 });
}
