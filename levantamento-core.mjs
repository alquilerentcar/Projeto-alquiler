// Levantamento dos locatários: planilha (CSV para Excel) e validação das linhas antes de enviar.

// Colunas da planilha. "sistema" = vem preenchido; "preencher" = a equipe completa.
export const COLUNAS=[
 ['codigo','Código (não alterar)','sistema'],
 ['locatario','Locatário','sistema'],
 ['placa','Placa','sistema'],
 ['diaria','Diária (R$)','sistema'],
 ['abertas_qtd','Diárias em aberto no sistema','sistema'],
 ['abertas_valor','Valor em aberto no sistema (R$)','sistema'],
 ['ultima_paga','Última diária paga no sistema','sistema'],
 ['caucao_total','Caução total (R$)','sistema'],
 ['caucao_pago','Caução paga na saída (R$)','sistema'],
 ['caucao_situacao','Caução no sistema','sistema'],
 ['atraso','PREENCHER · Diárias que ele ainda deve até o corte (R$)','preencher'],
 ['caucao_saldo','PREENCHER · Saldo da caução que falta pagar (R$)','preencher'],
 ['caucao_parcela','PREENCHER · Parcela diária da caução (R$)','preencher'],
 ['caucao_inicio','PREENCHER · Primeira parcela da caução (dd/mm/aaaa)','preencher'],
 ['extras','PREENCHER · Extras em aberto: multa, avaria, acordo (R$)','preencher'],
 ['extras_descricao','PREENCHER · Descrição dos extras','preencher'],
 ['observacao','Observação','preencher']
];

const br=v=>v==null||v===''?'':Number(v).toFixed(2).replace('.',',');
const brData=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'';

// "1.234,56", "1234,56", "1234.56", "R$ 1.234,56" → 1234.56. Vazio → null. Inválido → NaN.
export function lerValor(texto){
 let s=String(texto??'').replace(/R\$|\s/g,'');if(!s)return null;
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 if(!/^\d+(\.\d{1,2})?$/.test(s))return NaN;
 return Number(s);
}
// "dd/mm/aaaa" ou "aaaa-mm-dd" → "aaaa-mm-dd". Vazio → null. Inválido → undefined.
export function lerData(texto){
 const s=String(texto??'').trim();if(!s)return null;
 let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),iso=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:/^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;
 if(!iso)return undefined;const d=new Date(iso+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===iso?iso:undefined;
}

export function situacaoCaucao(x){return x.caucao_parcelada?'Já parcelada':Number(x.caucao_saldo)>0?'Sem parcelas':'Sem saldo';}

// Uma linha da planilha a partir da lista do sistema, com sugestões que a equipe confere.
export function linhaDoSistema(x){
 return {codigo:x.grupo_id,locatario:x.nome||'',placa:x.placa||'',diaria:br(x.diaria),abertas_qtd:String(x.abertas_qtd??0),abertas_valor:br(x.abertas_valor),
  ultima_paga:brData(x.ultima_paga),caucao_total:br(x.caucao_total),caucao_pago:br(x.caucao_pago),caucao_situacao:situacaoCaucao(x),
  atraso:'',caucao_saldo:!x.caucao_parcelada&&Number(x.caucao_saldo)>0?br(x.caucao_saldo):'',caucao_parcela:!x.caucao_parcelada&&Number(x.caucao_parcela)>0?br(x.caucao_parcela):'',
  caucao_inicio:'',extras:'',extras_descricao:'',observacao:''};
}

const celula=v=>{const s=String(v??'');return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
export function gerarCSV(linhas){
 return '﻿'+[COLUNAS.map(c=>celula(c[1])).join(';'),...linhas.map(l=>COLUNAS.map(c=>celula(l[c[0]])).join(';'))].join('\r\n')+'\r\n';
}

// Lê CSV com ";" (Excel em português) ou ",", com aspas.
export function lerCSV(texto){
 const t=String(texto||'').replace(/^﻿/,''),primeira=t.split(/\r?\n/)[0]||'',sep=(primeira.match(/;/g)||[]).length>=(primeira.match(/,/g)||[]).length?';':',';
 const linhas=[];let linha=[],campo='',aspas=false;
 for(let i=0;i<t.length;i++){const ch=t[i];
  if(aspas){if(ch==='"'){if(t[i+1]==='"'){campo+='"';i++;}else aspas=false;}else campo+=ch;continue;}
  if(ch==='"')aspas=true;else if(ch===sep){linha.push(campo);campo='';}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;linha.push(campo);campo='';if(linha.some(c=>c.trim()))linhas.push(linha);linha=[];}
  else campo+=ch;}
 linha.push(campo);if(linha.some(c=>c.trim()))linhas.push(linha);
 if(!linhas.length)return [];
 const cab=linhas[0].map(h=>h.trim()),idx=COLUNAS.map(c=>cab.indexOf(c[1]));
 if(idx[0]<0)throw Error('A planilha não tem a coluna "'+COLUNAS[0][1]+'". Use a planilha baixada por esta tela.');
 return linhas.slice(1).map(cols=>Object.fromEntries(COLUNAS.map((c,k)=>[c[0],idx[k]<0?'':(cols[idx[k]]??'').trim()])));
}

// Confere uma linha preenchida e monta o que vai para o banco. Linha sem nada preenchido só quita as diárias antigas.
export function validarLinha(l,sistema){
 const erros=[],num=k=>{const v=lerValor(l[k]);if(Number.isNaN(v))erros.push('valor inválido em "'+COLUNAS.find(c=>c[0]===k)[1].replace('PREENCHER · ','')+'"');return v||0;};
 const atraso=num('atraso'),caucao=num('caucao_saldo'),parcela=num('caucao_parcela'),extras=num('extras'),inicio=lerData(l.caucao_inicio);
 if(!sistema)erros.push('código não encontrado na lista do sistema');
 if(inicio===undefined)erros.push('data da primeira parcela inválida');
 if(caucao>0&&parcela<=0)erros.push('informe a parcela diária da caução');
 if(caucao>0&&sistema?.caucao_parcelada)erros.push('caução já parcelada no sistema: deixe em branco');
 if((atraso>0||caucao>0||extras>0)&&sistema&&!sistema.cliente_id)erros.push('sem locatário vinculado na Frota');
 if(extras>0&&!String(l.extras_descricao||'').trim())erros.push('descreva os extras');
 if(sistema?.levantado_em)erros.push('já levantada em '+brData(sistema.levantado_em));
 return {erros,envio:{grupo_id:l.codigo,atraso,caucao_saldo:caucao,caucao_parcela:caucao>0?parcela:0,caucao_inicio:inicio||null,extras,extras_descricao:String(l.extras_descricao||'').trim()||null,observacao:String(l.observacao||'').trim()||null}};
}
