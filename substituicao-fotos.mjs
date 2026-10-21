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
