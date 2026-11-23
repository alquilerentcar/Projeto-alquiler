// Orçamento da manutenção: textos e totais usados na tela e no PDF em papel timbrado.
export const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const qtd=v=>(Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'';
const cnpj=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===14?d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'):d;};
export const NATUREZA={corretiva:'Corretiva',preventiva:'Preventiva'};
export const CATEGORIAS={mecanica:'Mecânica',eletrica:'Elétrica',ar_condicionado:'Ar-condicionado',suspensao:'Suspensão',motor:'Motor',lavagem:'Lavagem',higienizacao:'Higienização',lanternagem:'Lanternagem',pintura:'Pintura',polimento:'Polimento'};
// O PDF usa fontes padrão: troca caracteres que elas não desenham.
export const seguro=t=>String(t??'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e\xa0-\xff]/g,'');

export function montarOrcamento(o){
 const m=o.manutencao,v=o.veiculo,r=o.responsavel;
 const cabecalho=[
  ['Orçamento','Nº '+String(m.numero).padStart(5,'0')+' · '+data(m.entrada_em)],
  ['Veículo',[m.placa,v?[v.marca,v.modelo,v.ano].filter(Boolean).join(' '):m.veiculo,v?.cor].filter(Boolean).join(' · ')],
  ['Locatário',r?r.nome:(m.cliente_externo?m.cliente_externo+' (cliente)':'Sem locatário · custo da empresa')],
  ['Tipo',NATUREZA[m.tipo]+(m.km?' · KM '+Number(m.km).toLocaleString('pt-BR'):'')],
  ['Motivo',m.motivo]];
 const linhas=o.linhas.map(l=>({
  tipo:l.tipo==='peca'?'Peça':'Serviço'+(l.externo?' de fora':''),
  descricao:l.descricao+(l.tipo==='servico'&&l.externo&&l.fornecedor?' ('+l.fornecedor+')':'')+(l.tipo==='servico'&&l.categoria?' · '+(CATEGORIAS[l.categoria]||l.categoria):''),
  quantidade:qtd(l.quantidade)+' '+(l.tipo==='peca'?l.unidade:'').trim(),
  unitario:brl(l.valor_unitario),total:brl(l.total),natureza:NATUREZA[l.natureza]||l.natureza,
  locatario:r?Number(l.pct_locatario).toLocaleString('pt-BR')+'% · '+brl(l.valor_locatario):'—'}));
 const t=o.totais,regra=`Corretiva: ${o.rateio.corretiva}% locatário e ${100-o.rateio.corretiva}% empresa. Preventiva: ${o.rateio.preventiva?o.rateio.preventiva+'% locatário e '+(100-o.rateio.preventiva)+'% empresa':'100% empresa'}.`;
 const totais=[['Peças',brl(t.pecas)],['Serviços',brl(t.servicos)],['Total da manutenção',brl(t.geral)]];
 if(r)totais.push(['Parte do locatário',brl(t.locatario)],['Parte da empresa',brl(t.empresa)]);
 else if(m.cliente_externo)totais.push(['Total a pagar pelo cliente',brl(t.geral)]);
 return {titulo:'ORÇAMENTO DE MANUTENÇÃO',empresa:[o.empresa?.razao_social||o.empresa?.nome_fantasia,o.empresa?.cnpj?'CNPJ '+cnpj(o.empresa.cnpj):''].filter(Boolean).join(' · '),
  cabecalho,linhas,totais,regra:r?regra:m.cliente_externo?'Cliente de fora: o valor total fica por conta do cliente.':'Sem locatário responsável: o custo fica com a empresa.',cobrado:m.cobrada_em?'Parte do locatário lançada no financeiro em '+data(m.cobrada_em)+'.':''};
}

// Resumo das saídas de uma peça: em quais carros foi usada e quanto em cada um.
export function resumoSaidas(movimentos){
 const saidas=movimentos.filter(x=>x.tipo==='saida'),porPlaca=new Map();
 for(const x of saidas){const k=x.placa||'—',g=porPlaca.get(k)||{placa:k,quantidade:0,usos:[]};g.quantidade+=-Number(x.quantidade);g.usos.push(x);porPlaca.set(k,g);}
 return {total:saidas.reduce((s,x)=>s-Number(x.quantidade),0),carros:[...porPlaca.values()].sort((a,b)=>b.quantidade-a.quantidade||a.placa.localeCompare(b.placa))};
}
