const labels={
 'nome completo':'nome_completo','nome do cliente':'nome_completo','cpf':'cpf','data de nascimento':'data_nascimento','nascimento':'data_nascimento','cnh':'cnh','nacionalidade':'nacionalidade','profissao':'profissao','rg':'rg','estado civil':'estado_civil','e-mail':'email','email':'email','cep':'cep','uf':'uf','endereco':'endereco','numero':'numero','complemento':'complemento','bairro':'bairro','cidade':'cidade','nome do pai':'nome_pai','nome da mae':'nome_mae'
};
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const labelPattern='Nome completo|Nome do cliente|Nome do pai|Nome da m[aã]e|Data de nascimento|Nascimento|Estado civil|Nacionalidade|Profiss[aã]o|Complemento|Endere[cç]o|Bairro|Cidade|N[uú]mero|E-?mail|CPF|CNH|CEP|UF|RG|Contato\\s*[1-4]\\s*[·.-]?\\s*(?:n[uú]mero|respons[aá]vel)';
export function cleanClientDraft(input={}){
 const draft={},warnings=[];
 for(const [key,value] of Object.entries(input)){if(typeof value!=='string')continue;let text=value.trim();if(/^(?:n[aã]o (?:informad[oa]|especificad[oa])\b.*|n[aã]o consta|ausente|n\/?a|null|—|-)$/i.test(text))text='';draft[key]=text.slice(0,200);}
 if(draft.estado_civil&&(/\b(?:ou|esposa|esposo|indica|menciona)\b|\//i.test(draft.estado_civil))){draft.estado_civil='';warnings.push('Estado civil contraditório: confirme antes de preencher.');}
 if(draft.estado_civil)draft.estado_civil=draft.estado_civil.replace(/\s*\((?:conforme|segundo|de acordo)\b[\s\S]*$/i,'').trim();
 if(draft.data_nascimento){let date=draft.data_nascimento;const m=date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m)date=`${m[3]}-${m[2]}-${m[1]}`;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date){draft.data_nascimento='';warnings.push('Confira a data de nascimento.');}else draft.data_nascimento=date;}
 for(const key of ['cpf','cep',...Object.keys(draft).filter(k=>/^contato_\d_numero$/.test(k))])if(draft[key]){const values=draft[key].split(/\s*(?:\(\s*ou\b|\bou\b)\s*/i).map(value=>{let digits=value.replace(/\D/g,'');if(/^contato_/.test(key)&&[12,13].includes(digits.length)&&digits.startsWith('55'))digits=digits.slice(2);return digits;});if(new Set(values).size>1){draft[key]='';warnings.push('Números diferentes para '+key+'. Confira antes de salvar.');}else draft[key]=values[0];}
 return {draft,warnings};
}
export function parseClientText(message){
 const text=String(message||'').slice(0,12000),matches=[...text.matchAll(new RegExp('('+labelPattern+')\\s*:', 'gi'))];
 if(matches.length<2)return null;
 const values={},conflicts=new Set();
 for(let i=0;i<matches.length;i++){
  const label=fold(matches[i][1]).replace(/\s+/g,' ').trim(),contact=label.match(/^contato\s*([1-4])\s*[·.-]?\s*(numero|responsavel)$/);
  const key=contact?`contato_${contact[1]}_${contact[2]}`:labels[label];if(!key)continue;
  const value=text.slice(matches[i].index+matches[i][0].length,matches[i+1]?.index??text.length)
   .replace(/\s*\b(?:cadastre|cadastrar|salve|salvar|quero que|preciso que)\b[\s\S]*$/i,'')
   .replace(/(?:Endere[cç]o|Fam[ií]lia|Contatos?(?:\s+de Emerg[eê]ncia)?\s*\/?\s*Refer[eê]ncias?)\s*$/i,'').trim();
  if(key in values&&values[key]!==value)conflicts.add(key);else values[key]=value;
 }
 if(!values.nome_completo||!values.cpf)return null;
 const result=cleanClientDraft(values);for(const key of conflicts){result.draft[key]='';result.warnings.push('Valores diferentes para '+key+'. Confira o campo.');}
 return result;
}
