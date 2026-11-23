// Oficina: lista de peças de uma entrada ou saída, quantidades e situação do estoque.

// "1,5" ou "1.5" → 1.5. Vazio ou inválido → NaN.
export function lerQuantidade(texto){
 const s=String(texto??'').trim().replace(/\s/g,'');if(!s)return NaN;
 const n=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;
 return /^\d+(\.\d{1,3})?$/.test(n)?Number(n):NaN;
}
export const lerValor=t=>{const s=String(t??'').replace(/R\$|\s/g,'');if(!s)return null;const n=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;return /^\d+(\.\d{1,4})?$/.test(n)?Number(n):NaN;};

// O leitor de código de barras digita o código e aperta Enter: tira espaços e caracteres de controle.
export const normalizarCodigo=t=>String(t??'').replace(/[\u0000-\u001f]/g,'').trim();

// Ler a mesma peça de novo soma 1 na quantidade, em vez de repetir a linha.
export function adicionarItem(itens,produto,quantidade=1){
 const atual=itens.find(i=>i.produto.id===produto.id);
 if(atual){atual.quantidade=Math.round((atual.quantidade+quantidade)*1000)/1000;return itens;}
 itens.push({produto,quantidade,custo:null,natureza:null});return itens;
}

export function situacaoEstoque(p){const s=Number(p.saldo)||0,m=Number(p.estoque_minimo)||0;return s<=0?'Sem estoque':s<m?'Abaixo do mínimo':'Normal';}

// Confere a lista antes de enviar. Na saída, nenhuma peça pode passar do saldo.
export function conferirItens(itens,{saida=false}={}){
 const erros=[];
 if(!itens.length)erros.push('Leia ou escolha pelo menos uma peça.');
 for(const i of itens){
  if(!(i.quantidade>0))erros.push(`Quantidade inválida em ${i.produto.descricao}.`);
  else if(saida&&i.quantidade>Number(i.produto.saldo))erros.push(`Estoque insuficiente de ${i.produto.descricao}: tem ${fmtQtd(i.produto.saldo)}, pediu ${fmtQtd(i.quantidade)}.`);
  if(!saida&&i.custo!=null&&Number.isNaN(i.custo))erros.push(`Custo inválido em ${i.produto.descricao}.`);
 }
 return erros;
}
export const fmtQtd=v=>(Number(v)||0).toLocaleString('pt-BR',{maximumFractionDigits:3});

export function itensEntrada(itens){return itens.map(i=>({produto_id:i.produto.id,quantidade:i.quantidade,custo_unitario:i.custo==null?null:i.custo}));}
export function itensSaida(itens,naturezaPadrao){return itens.map(i=>({produto_id:i.produto.id,quantidade:i.quantidade,natureza:i.natureza||naturezaPadrao}));}

export const STATUS={aberta:'Aberta',aguardando_pecas:'Aguardando peças',concluida:'Concluída',cancelada:'Cancelada'};
export const rotuloManutencao=m=>`#${m.numero} · ${m.placa}${m.veiculo?' · '+m.veiculo:''} · ${m.tipo==='preventiva'?'Preventiva':m.tipo==='avaria'?'Batida / avaria':'Corretiva'}`;

// Entrada por embalagem: 2 caixas de 20 por R$ 12,00 a caixa → 40 unidades a R$ 0,60 cada.
export function converterEntrada({quantidade,porEmbalagem=false,fator=1,custo=null}){
 const f=porEmbalagem?Math.max(1,Number(fator)||1):1,q=Number(quantidade)||0;
 const unidades=Math.round(q*f*1000)/1000,custoUnit=custo==null||Number.isNaN(custo)?null:Math.round((Number(custo)/f)*10000)/10000;
 return {quantidade:unidades,custo_unitario:custoUnit,embalagens:porEmbalagem?q:null,custo_embalagem:porEmbalagem&&custo!=null&&!Number.isNaN(custo)?Number(custo):null};
}
export const SITUACOES_SAIDA={manutencao:'Manutenção de carro',revenda:'Venda (revenda)',uso_consumo:'Uso e consumo',obra:'Construção em andamento',perda:'Perda / avaria',devolucao:'Devolução ao fornecedor'};
