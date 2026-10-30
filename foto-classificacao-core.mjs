export const PHOTO_CATEGORIES={frente:'Frente do veículo',traseira:'Traseira do veículo',lateral_direita:'Lateral direita',lateral_esquerda:'Lateral esquerda',painel:'Painel, hodômetro e combustível',interior_dianteiro:'Interior e bancos dianteiros',interior_traseiro:'Bancos traseiros',pneu_roda:'Pneus, rodas e calotas',motor:'Motor',porta_malas:'Porta-malas',estepe_ferramentas:'Estepe e ferramentas',avaria:'Avaria identificada',documento_vistoria:'Ordem de serviço ou documento da vistoria',outro:'Outra foto'};
export function normalizePhotoClassification(raw){
 const confident=raw?.confianca==='alta',valid=Object.hasOwn(PHOTO_CATEGORIES,raw?.categoria);
 return {categoria:confident&&valid?raw.categoria:'outro',descricao:confident&&valid&&typeof raw.descricao==='string'?raw.descricao.replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'').trim().slice(0,120):'',confianca:confident&&valid?'alta':'baixa'};
}
