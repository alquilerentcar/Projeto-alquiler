const parties='LOCADORA: {{ empresa_razao_social }}, inscrita no CNPJ nº {{ empresa_cnpj }}, com endereço em {{ empresa_endereco }}, e-mail {{ empresa_email }} e telefone {{ empresa_telefone }}.\n\nLOCATÁRIO: {{ nome_locatario }}, CPF {{ cpf }}, RG {{ rg }}, residente em {{ endereco }}, e-mail {{ email }} e telefone {{ telefone }}.';
const signatures='{{ cidade_documento }}, {{ data_documento }}.\n\n________________________________\n{{ empresa_razao_social }}\nLOCADORA\n\n________________________________\n{{ nome_locatario }}\nLOCATÁRIO';
export const TERM_STARTERS={
 substituicao:{nome:'Termo de substituição de veículo',conteudo:'TERMO DE SUBSTITUIÇÃO DE VEÍCULO\n\n'+parties+'\n\n1. DA SUBSTITUIÇÃO\n\nAs partes registram a substituição do veículo {{ veiculo_anterior }} pelo veículo {{ veiculo_posterior }} na locação iniciada em {{ data_inicio }}, com troca em {{ data_troca }}.\n\nVeículo anterior: {{ dados_veiculo_anterior }}.\nVeículo substituto: {{ dados_veiculo_posterior }}.\n\n2. DO MOTIVO DA TROCA\n\n{{ motivo_alteracao }}\n\n3. DA VISTORIA E ENTREGA\n\nQuilometragem do veículo devolvido: {{ quilometragem_anterior }} km.\nQuilometragem do veículo substituto: {{ quilometragem_posterior }} km.\nCondições registradas na vistoria: {{ condicoes_vistoria }}\n\n4. DAS CONDIÇÕES FINANCEIRAS\n\n{{ condicoes_financeiras }}\n\n5. DA CONTINUIDADE DA LOCAÇÃO\n\nAs demais condições do contrato permanecem vigentes, observadas as alterações expressamente descritas neste termo.\n\n'+signatures},
 distrato:{nome:'Distrato do contrato de locação',conteudo:'DISTRATO DO CONTRATO DE LOCAÇÃO DE VEÍCULO\n\n'+parties+'\n\n1. DO ENCERRAMENTO\n\nAs partes registram o encerramento da locação iniciada em {{ data_inicio }} em {{ data_encerramento }}, pelo motivo: {{ motivo_encerramento }}.\n\nVeículos utilizados durante a locação: {{ carros_usados }}.\n\n2. DA DEVOLUÇÃO E VISTORIA\n\n{{ condicoes_devolucao }}\n\n3. DO ACERTO FINANCEIRO\n\n{{ resumo_financeiro }}\n\nCondições do pagamento e valores pendentes: {{ condicoes_financeiras }}\n\n4. DA CAUÇÃO\n\n{{ condicoes_restituicao_caucao }}\n\n5. DAS RESPONSABILIDADES PENDENTES\n\n{{ responsabilidades_pendentes }}\n\n'+signatures},
 encerramento:{nome:'Termo de encerramento por período de utilização',conteudo:'TERMO DE ENCERRAMENTO DO CONTRATO DE LOCAÇÃO DE VEÍCULO\n\n'+parties+'\n\nAs partes registram o encerramento da locação iniciada em {{ data_inicio }}.\n\n1. DO PERÍODO DE UTILIZAÇÃO\n\nO veículo permaneceu com o LOCATÁRIO de {{ inicio_utilizacao }} até {{ data_encerramento }}, correspondendo a {{ dias_utilizados }} dias de utilização apurados.\n\nVeículos utilizados: {{ carros_usados }}.\n\n2. DA DEVOLUÇÃO DO VEÍCULO\n\n{{ condicoes_devolucao }}\n\n3. DO RESUMO FINANCEIRO\n\n{{ resumo_financeiro }}\n\nPagamento e eventuais isenções expressamente acordados: {{ condicoes_financeiras }}\n\n4. DA DEVOLUÇÃO DA CAUÇÃO\n\n{{ condicoes_restituicao_caucao }}\n\n5. DAS RESPONSABILIDADES APÓS O ENCERRAMENTO\n\n{{ responsabilidades_pendentes }}\n\n'+signatures}
};
export function termBlocks(text){if(/^(TERMO ADITIVO DE SUBSTITUIÇÃO|TERMO DE ALTERAÇÃO DO VEÍCULO)/.test(String(text)))return substitutionBlocks(text);return String(text).split('\n').map((line,index)=>({align:index===0?'center':'justify',runs:/^(LOCADORA|LOCATÁRIO):/.test(line)?[{text:line.slice(0,line.indexOf(':')+1),bold:true,size:12},{text:line.slice(line.indexOf(':')+1),size:12}]:[{text:line,bold:index===0||/^\d+\./.test(line),size:12}]}));}

// Modelo baseado na estrutura fornecida pelo usuário; nunca contém dados reais.
export const SUBSTITUTION_FIELDS=['nacionalidade','estado_civil','profissao','rg','locatario_endereco_completo','empresa_endereco_completo','anterior_modelo','anterior_placa','anterior_renavam','anterior_ano','anterior_cor','anterior_chassi','posterior_modelo','posterior_placa','posterior_renavam','posterior_ano','posterior_cor','posterior_chassi','posterior_combustivel','cidade_documento','data_documento'];
const substitutionText=`TERMO DE ALTERAÇÃO DO VEÍCULO

LOCADORA: {{ empresa_razao_social }}, pessoa jurídica de direito privado, inscrita no CNPJ {{ empresa_cnpj }}, com sede em {{ empresa_endereco_completo }}, doravante denominada LOCADORA.

LOCATÁRIO: {{ nome_locatario }}, {{ nacionalidade }}, {{ estado_civil }}, {{ profissao }}, inscrito(a) no RG nº {{ rg }} e CPF nº {{ cpf }}, CNH nº {{ cnh }}, e-mail {{ email }}, residente e domiciliado(a) em {{ locatario_endereco_completo }}, telefone {{ telefone }}, contatos de referência: {{ contato_emergencia }}, doravante denominado(a) LOCATÁRIO.

CLÁUSULA PRIMEIRA - DO OBJETO
O presente termo aditivo tem por objeto formalizar a devolução/recolhimento do veículo {{ veiculo_placa }}, que em {{ data_alteracao }} será substituído pelo veículo {{ nova_placa }}, pelo motivo: {{ motivo_alteracao }}, mantendo-se a continuidade da locação contratada.

CLÁUSULA SEGUNDA - DOS VEÍCULOS ENVOLVIDOS
VEÍCULO DEVOLVIDO / RECOLHIDO:
Marca/Modelo: {{ anterior_modelo }}
Placa: {{ anterior_placa }}
Renavam: {{ anterior_renavam }}
Ano/Modelo: {{ anterior_ano }}
Cor: {{ anterior_cor }}
Chassi: {{ anterior_chassi }}

VEÍCULO ENTREGUE (SUBSTITUTO):
Marca/Modelo: {{ posterior_modelo }}
Placa: {{ posterior_placa }}
Renavam: {{ posterior_renavam }}
Ano/Modelo: {{ posterior_ano }}
Cor: {{ posterior_cor }}
Chassi: {{ posterior_chassi }}
Combustível: {{ posterior_combustivel }}

CLÁUSULA TERCEIRA - DA RATIFICAÇÃO CONTRATUAL
Aplicam-se ao veículo substituto {{ nova_placa }} todas as cláusulas, condições, obrigações, valores de diárias, regras sobre manutenção, franquias e responsabilidade sobre infrações de trânsito estipuladas no CONTRATO DE LOCAÇÃO DE VEÍCULO principal. Permanecem inalteradas e plenamente válidas todas as demais disposições contratuais originais.
As demais condições do contrato permanecem vigentes.

{{ cidade_documento }}, {{ data_documento }}.

________________________________
{{ empresa_razao_social }} - LOCADORA

________________________________
{{ nome_locatario }} - LOCATÁRIO`;
TERM_STARTERS.substituicao={nome:'Termo de alteração do veículo',conteudo:substitutionText};
export function substitutionValues(company,person,previous,next,at){
 const address=r=>[r.endereco,r.numero,r.complemento,r.bairro,r.cidade,r.uf,r.cep?'CEP '+r.cep:''].filter(x=>String(x||'').trim()).join(', ');
 const values={nacionalidade:person.nacionalidade,estado_civil:person.estado_civil,profissao:person.profissao,rg:person.rg,cnh:person.cnh,email:person.email,telefone:person.contato_1_numero,contato_emergencia:[2,3,4].map(i=>[person['contato_'+i+'_responsavel'],person['contato_'+i+'_numero']].filter(Boolean).join(' - ')).filter(Boolean).join('; '),locatario_endereco_completo:address(person),empresa_endereco_completo:address(company),cidade_documento:[company.cidade,company.uf].filter(Boolean).join('/'),data_documento:at?new Date(at).toLocaleDateString('pt-BR',{timeZone:'America/Manaus',day:'2-digit',month:'long',year:'numeric'}):''};
 for(const [prefix,car] of [['anterior',previous],['posterior',next]])Object.assign(values,{[prefix+'_modelo']:[car?.marca,car?.modelo].filter(Boolean).join(' / '),[prefix+'_placa']:car?.placa,[prefix+'_renavam']:car?.renavam,[prefix+'_ano']:car?.ano_fabricacao&&car?.ano_modelo?car.ano_fabricacao+'/'+car.ano_modelo:car?.ano_modelo||car?.ano,[prefix+'_cor']:car?.cor,[prefix+'_chassi']:car?.chassi,[prefix+'_combustivel']:car?.combustivel});
 return Object.fromEntries(Object.entries(values).filter(([,v])=>v!=null&&String(v).trim()));
}
export function substitutionBlocks(text){return String(text).split('\n').map((line,index)=>{const heading=/^(CLÁUSULA|VEÍCULO )/.test(line),base=index===0||heading||/ - (LOCADORA|LOCATÁRIO)/.test(line),runs=[];let pos=0;for(const match of line.matchAll(/LOCADORA:|LOCATÁRIO:|\{\{\s*(?:veiculo_placa|nova_placa|motivo_alteracao)\s*\}\}/g)){if(match.index>pos)runs.push({text:line.slice(pos,match.index),bold:base,size:11});runs.push({text:match[0],bold:true,size:11});pos=match.index+match[0].length;}if(pos<line.length||!runs.length)runs.push({text:line.slice(pos),bold:base,size:11});return {align:index===0?'center':heading?'left':'justify',runs};});}
