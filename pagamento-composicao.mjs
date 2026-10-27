export const centavos = value => Math.round(Number(value || 0) * 100);
export function saldoDiaria(row,quando){
 const base=centavos(row.diaria_base??row.diaria),pago=centavos(row.recebido);
 const noPrazo=quando&&row.vencimento&&new Date(quando)<=new Date(row.vencimento);
 const multa=noPrazo&&pago<base?0:centavos(row.multa);
 return Math.max(0,base+multa-pago)/100;
}
export function sugerirComposicao(total,diaria,parcelas,dia){
 let saldo=centavos(total);const principal=Math.min(Math.max(0,saldo),centavos(diaria));saldo-=principal;
 const itens=[];
 // Sugestão apenas; multas e parcelas futuras precisam de escolha explícita.
 for(const p of [...parcelas].sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.numero-b.numero)){
  if(p.categoria!=='caucao'||p.vencimento>dia)continue;
  const valor=Math.min(Math.max(0,saldo),Math.max(0,centavos(p.valor)-centavos(p.recebido)));
  if(valor){itens.push({parcela_id:p.id,valor:valor/100});saldo-=valor;}
 }
 return {diaria:principal/100,itens,semDestino:saldo/100};
}
export function fimCaucao(primeiro,quantidade){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(primeiro||'')||!Number.isInteger(Number(quantidade))||quantidade<1||quantidade>120)return '';
 const d=new Date(primeiro+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(quantidade)-1);return d.toISOString().slice(0,10);
}
