export const onlyDigits=value=>String(value??'').replace(/\D/g,'');
export const normalizeCnpj=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const upperName=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR');
export function formatCpf(value){const s=onlyDigits(value);return s.length===11?s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):s;}
export function formatCnpj(value){const s=normalizeCnpj(value);return s.length===14?s.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/,'$1.$2.$3/$4-$5'):s;}
export function validCpf(value){const s=onlyDigits(value);if(!/^\d{11}$/.test(s)||/^(\d)\1{10}$/.test(s))return false;for(const n of [9,10]){let sum=0;for(let i=0;i<n;i++)sum+=Number(s[i])*(n+1-i);const check=(sum*10)%11%10;if(check!==Number(s[n]))return false;}return true;}
export function validCnpj(value){const s=normalizeCnpj(value);if(!/^[A-Z0-9]{12}\d{2}$/.test(s)||/^(\d)\1{13}$/.test(s))return false;for(const n of [12,13]){let sum=0;for(let i=0;i<n;i++)sum+=(s.charCodeAt(i)-48)*((n-1-i)%8+2);const rest=sum%11,check=rest<2?0:11-rest;if(check!==Number(s[n]))return false;}return true;}
export function normalizePhone(value){let s=onlyDigits(value);if([12,13].includes(s.length)&&s.startsWith('55'))s=s.slice(2);return s;}
export function validPhone(value){const s=normalizePhone(value);return /^[1-9]\d(?:[2-9]\d{7}|9\d{8})$/.test(s);}
export function formatPhone(value){const s=normalizePhone(value);return s.length===11?s.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3'):s.length===10?s.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3'):s;}
export const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value??'').trim());
export function verifyDraft(input){const draft={...input},warnings=[];for(const key of ['nome_completo','nome_fantasia','nome_pai','nome_mae',...Array.from({length:4},(_,i)=>'contato_'+(i+1)+'_responsavel')])if(draft[key])draft[key]=upperName(draft[key]);
 if(draft.cpf){if(!validCpf(draft.cpf)){draft.cpf='';warnings.push('CPF lido com dígitos inválidos. Confira no documento; nenhum número foi adivinhado.');}else draft.cpf=onlyDigits(draft.cpf);}
 if(draft.cnpj){if(!validCnpj(draft.cnpj)){draft.cnpj='';warnings.push('Confira o CNPJ no documento.');}else draft.cnpj=normalizeCnpj(draft.cnpj);}
 if(draft.cep){if(onlyDigits(draft.cep).length!==8||/[A-Z]/i.test(draft.cep)){draft.cep='';warnings.push('CEP ilegível ou incompleto. Confira os oito dígitos; letras não foram trocadas por números.');}else draft.cep=onlyDigits(draft.cep);}
 if(draft.cnh){const value=onlyDigits(draft.cnh);if(value.length!==11){draft.cnh='';warnings.push('Confira o número de registro da CNH com 11 dígitos. Não confundir com CPF ou RG.');}else draft.cnh=value;}
 if(draft.email){draft.email=draft.email.trim().toLowerCase();if(!validEmail(draft.email)){draft.email='';warnings.push('Confira o e-mail lido.');}}
 for(const key of Object.keys(draft).filter(k=>/^contato_\d_numero$/.test(k))){if(!draft[key])continue;const number=normalizePhone(draft[key]);if(!validPhone(number)){draft[key]='';warnings.push('Confira '+key+': telefone incompleto ou fora do formato brasileiro.');}else draft[key]=number;}
 return {draft,warnings};
}
