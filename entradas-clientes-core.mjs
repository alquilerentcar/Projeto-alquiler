const cents=v=>Math.round((Number(v)||0)*100);
export function agruparEntradas(diarias,parcelas,contratos,dia){
 const groups=new Map();
 function get(id,nome,key){const k=id||key;if(!groups.has(k))groups.set(k,{key:k,id,nome:nome||'Locatário não identificado',diarias:[],parcelas:[],contratos:[],base:0,multa:0,caucao:0,extras:0,recebido:0,saldo:0});return groups.get(k);}
 for(const r of diarias){const g=get(r.cliente_id,r.cliente,'grupo:'+r.grupo_id);g.diarias.push(r);g.base+=cents(r.diaria_base??r.diaria);g.multa+=cents(r.multa);g.recebido+=cents(r.recebido);g.saldo+=Math.max(0,cents(r.diaria)-cents(r.recebido));}
 for(const p of parcelas){if(p.vencimento!==dia||!p.cliente_id)continue;const g=get(p.cliente_id,p.nome_completo);g.parcelas.push(p);g[p.categoria==='caucao'?'caucao':'extras']+=cents(p.valor);g.recebido+=cents(p.recebido);g.saldo+=Math.max(0,cents(p.valor)-cents(p.recebido));}
 for(const c of contratos){if(!c.cliente_id)continue;let g=groups.get(c.cliente_id);if(!g&&c.status==='Ativa'&&Number(c.valor_caucao)>0)g=get(c.cliente_id,c.nome_cliente);if(g)g.contratos.push(c);}
 return [...groups.values()].map(g=>({...g,total:g.base+g.multa+g.caucao+g.extras,status:g.saldo===0?(g.base+g.multa+g.caucao+g.extras>0?'Pago':'Sem cobrança no dia'):g.multa>0?'Em atraso':g.recebido>0?'Parcial':'Pendente'})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}
