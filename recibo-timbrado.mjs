export function assertReceiptStationery(company){
 if(!company?.papel_timbrado_path)throw Error('Cadastre o papel timbrado em Administração → Empresa antes de gerar o recibo.');
 if(!company.id||!company.papel_timbrado_path.startsWith(company.id+'/'))throw Error('O papel timbrado do recibo não pertence à empresa selecionada. Confira o cadastro.');
 return true;
}
