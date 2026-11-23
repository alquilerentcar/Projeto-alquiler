// Impressora de cupom (Bematech MP-4200 TH e compatíveis) ligada no USB como porta COM:
// o navegador envia os comandos direto pela porta (Web Serial), sem driver do Windows.
// A própria impressora desenha o código de barras EAN-13 e corta o papel.
import {ean13Valido} from './etiqueta-core.mjs?v=20261118b';

const ESC=0x1b,GS=0x1d,LF=0x0a;
// A impressora usa página de código de 1 byte: tira acentos e símbolos fora do ASCII.
export const textoImpressora=t=>String(t??'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\x20-\x7e]/g,'?');

// Bytes de uma etiqueta: nome em destaque, código de barras com os números embaixo, local e corte.
export function bytesEtiquetas(itens,{largura=42}={}){
 const out=[],texto=t=>{for(const ch of textoImpressora(t))out.push(ch.charCodeAt(0));};
 out.push(ESC,0x40);// inicia
 for(const i of itens){
  if(!ean13Valido(i.codigo))throw Error('Código de barras inválido para impressão: '+i.codigo);
  const copias=Math.max(1,Math.min(200,Number(i.copias)||1));
  for(let c=0;c<copias;c++){
   out.push(ESC,0x61,1);// centralizado
   out.push(ESC,0x45,1);texto(String(i.descricao||'').slice(0,largura*2));out.push(LF);out.push(ESC,0x45,0);
   out.push(GS,0x68,80);// altura das barras
   out.push(GS,0x77,3);// largura das barras
   out.push(GS,0x48,2);// números abaixo do código
   out.push(GS,0x66,0);// fonte dos números
   out.push(GS,0x6b,67,12);texto(String(i.codigo).slice(0,12));// EAN-13: a impressora calcula o dígito final
   out.push(LF);
   if(i.local){texto(String(i.local).slice(0,largura));out.push(LF);}
   out.push(ESC,0x64,3);// avança 3 linhas
   out.push(ESC,0x6d);// corte parcial
  }
 }
 return Uint8Array.from(out);
}

export const serialSuportado=()=>typeof navigator!=='undefined'&&'serial' in navigator;
let porta=null;
// Porta já autorizada antes (não pergunta de novo).
export async function portaAutorizada(){if(!serialSuportado())return null;const ps=await navigator.serial.getPorts();return ps[0]||null;}
// Precisa de um clique do usuário: o navegador mostra a lista de portas para escolher a impressora.
export async function conectarImpressora(){if(!serialSuportado())throw Error('Este navegador não fala com a porta USB. Use o Google Chrome ou o Microsoft Edge.');porta=await navigator.serial.requestPort();return porta;}
export async function imprimirSerial(itens){
 porta=porta||await portaAutorizada();
 if(!porta)throw Error('Conecte a impressora primeiro (botão "Conectar impressora USB").');
 const bytes=bytesEtiquetas(itens);
 if(!porta.writable)await porta.open({baudRate:115200,flowControl:'hardware'});
 const w=porta.writable.getWriter();
 try{await w.write(bytes);}finally{w.releaseLock();}
 return bytes.length;
}
export async function desconectarImpressora(){try{if(porta?.writable)await porta.close();}catch{}porta=null;}
