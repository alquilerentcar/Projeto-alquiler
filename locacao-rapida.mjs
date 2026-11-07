// Cálculos do formulário de locação: datas no formato de datetime-local, sem depender do fuso do computador.
import {firstDailyRule} from './contrato-cobranca.mjs';
const DAY=86400000;
const parts=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value||'');return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]):null;};
const money=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brDate=value=>value.slice(0,10).split('-').reverse().join('/');

export function addContractDays(start,days){const base=parts(start),n=Number(days);if(base==null||!Number.isInteger(n)||n<=0)return '';return new Date(base+n*DAY).toISOString().slice(0,16);}
export function contractDays(start,end){const a=parts(start),b=parts(end);return a==null||b==null||b<=a?null:Math.ceil((b-a)/DAY);}
export function matchesSearch(text,search){const clean=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('pt-BR').trim();return clean(text).includes(clean(search));}

export function rentalSummary({inicio,fim,diaria,caucao,pago,parcelas,parcela}){
 const days=contractDays(inicio,fim),lines=[];
 lines.push(days?`Contrato de ${days} ${days===1?'dia':'dias'}, até ${brDate(fim)}.`:'Contrato sem data final: informe o tempo para calcular o total.');
 if(days&&diaria>0)lines.push(`Diárias no período: ${money(days*diaria)} (${money(diaria)} por dia).`);
 const balance=Math.max(0,caucao-pago);
 if(caucao>0)lines.push(balance>0?`Caução de ${money(caucao)}: ${money(pago)} pagos, saldo de ${money(balance)} em ${parcelas}x de ${money(parcela)}.`:`Caução de ${money(caucao)} paga por inteiro.`);
 if(diaria>0)lines.push(`O cliente paga ${money(diaria+(balance>0?parcela:0))} por dia.`);
 lines.push(firstDailyRule({entrada:pago,dataContrato:'2026-01-01'}).regra==='dia_contrato'?'Caução paga abaixo de R$ 1.000: a primeira diária entra na data do contrato.':'Caução paga de R$ 1.000 ou mais: a primeira diária entra no dia seguinte à entrega.');
 return lines;
}
