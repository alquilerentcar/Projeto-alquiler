// Agrupa por locatário tudo o que está em aberto: o que já venceu (até hoje) e o que ainda vai vencer.
const cents=v=>Math.round((Number(v)||0)*100);
const TIPOS={diaria:'diarias',caucao:'caucao'};

// Mais antigo primeiro; no mesmo dia, a diária antes da caução e dos extras.
export const ordemItens=(a,b)=>a.vencimento.localeCompare(b.vencimento)||(a.tipo==='diaria'?0:1)-(b.tipo==='diaria'?0:1);

export function agruparContas({diarias=[],parcelas=[],hoje}){
 const groups=new Map();
 const get=(id,nome,key)=>{const k=id||key;if(!groups.has(k))groups.set(k,{key:k,id:id||null,nome:nome||'Locatário não identificado',placas:new Set(),itens:[],vencido:{diarias:0,caucao:0,extras:0},aVencer:0,proximo:null});return groups.get(k);};
 const add=(g,item)=>{const saldo=cents(item.valor)-cents(item.recebido);if(saldo<=0)return;g.itens.push({...item,saldo});
  if(item.vencimento<=hoje)g.vencido[TIPOS[item.tipo]||'extras']+=saldo;
  else{g.aVencer+=saldo;if(!g.proximo||item.vencimento<g.proximo)g.proximo=item.vencimento;}};
 for(const d of diarias){const g=get(d.cliente_id,d.nome,'grupo:'+d.grupo_id);if(d.placa)g.placas.add(d.placa);add(g,{tipo:'diaria',grupo_id:d.grupo_id,descricao:'Diária'+(d.placa?' · '+d.placa:'')+(Number(d.multa)>0?' com multa':''),vencimento:d.vencimento,valor:d.valor,recebido:d.recebido});}
 for(const p of parcelas){const g=get(p.cliente_id,p.nome,'debito:'+p.debito_id);add(g,{tipo:p.categoria,descricao:p.descricao+' · parcela '+p.numero,vencimento:p.vencimento,valor:p.valor,recebido:p.recebido,parcela_id:p.parcela_id});}
 return [...groups.values()].filter(g=>g.itens.length).map(g=>{const vencido=g.vencido.diarias+g.vencido.caucao+g.vencido.extras;
  return {...g,placas:[...g.placas],vencidoTotal:vencido,total:vencido+g.aVencer,itens:g.itens.sort(ordemItens),situacao:vencido>0?'Vencido':'A vencer'};})
  .sort((a,b)=>b.vencidoTotal-a.vencidoTotal||a.nome.localeCompare(b.nome,'pt-BR'));
}

export function totaisContas(grupos){return grupos.reduce((t,g)=>({vencido:t.vencido+g.vencidoTotal,aVencer:t.aVencer+g.aVencer,caucao:t.caucao+g.vencido.caucao}),{vencido:0,aVencer:0,caucao:0});}

// Distribui o valor recebido (em centavos) do item mais antigo para o mais novo.
export function distribuirPagamento(itens,total){let resto=Math.max(0,Math.round(total)||0);return itens.map(i=>{const v=Math.min(i.saldo,resto);resto-=v;return v;});}
