const string=value=>value==null?'':String(value).trim();
const components=['numero','complemento','bairro','cidade','uf','cep'];
export const ADDRESS_FIELDS=['empresa_logradouro','empresa_endereco_completo',...components.map(k=>'empresa_'+k),'logradouro','endereco_completo',...components,'locatario_logradouro','locatario_endereco','locatario_endereco_completo',...components.map(k=>'locatario_'+k)];
export function addressParts(record={}){
 const result={logradouro:string(record.endereco)};for(const k of components)result[k]=string(record[k]);
 result.endereco=[result.logradouro,...components.filter(k=>k!=='cep').map(k=>result[k])].filter(Boolean).join(', ');
 result.endereco_completo=[result.endereco,result.cep&&'CEP '+result.cep].filter(Boolean).join(', ');return result;
}
export function companyAddressValues(company={}){const parts=addressParts(company);return Object.fromEntries(Object.entries(parts).map(([k,v])=>['empresa_'+k,k==='endereco'?parts.endereco_completo:v]));}
export function clientAddressValues(client={}){const parts=addressParts(client);return {...parts,...Object.fromEntries(Object.entries(parts).map(([k,v])=>['locatario_'+k,v]))};}
