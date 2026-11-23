// Código de barras EAN-13 desenhado em SVG e página de etiquetas para imprimir.
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const PARIDADE=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

export function digitoEAN13(base12){
 const d=String(base12);if(!/^\d{12}$/.test(d))throw Error('Base do EAN-13 deve ter 12 dígitos.');
 const soma=[...d].reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0);return (10-soma%10)%10;
}
export const ean13Valido=c=>/^\d{13}$/.test(String(c))&&digitoEAN13(String(c).slice(0,12))===Number(String(c)[12]);

// 95 módulos: guarda, 6 dígitos à esquerda, guarda central, 6 à direita, guarda.
export function modulosEAN13(codigo){
 const c=String(codigo);if(!ean13Valido(c))throw Error('Código EAN-13 inválido: '+c);
 const p=PARIDADE[Number(c[0])];let m='101';
 for(let i=1;i<=6;i++)m+=(p[i-1]==='L'?L:G)[Number(c[i])];
 m+='01010';for(let i=7;i<=12;i++)m+=R[Number(c[i])];return m+'101';
}

export function svgEAN13(codigo,{modulo=2,altura=60}={}){
 const m=modulosEAN13(codigo),q=9*modulo,w=m.length*modulo+2*q,h=altura+16,guarda=new Set([0,1,2,45,46,47,48,49,92,93,94]);
 let barras='';for(let i=0;i<m.length;i++)if(m[i]==='1')barras+=`<rect x="${q+i*modulo}" y="0" width="${modulo}" height="${guarda.has(i)?altura+6:altura}"/>`;
 const c=String(codigo),t=(x,s)=>`<text x="${x}" y="${altura+15}" font-family="Arial,sans-serif" font-size="${modulo*6}" text-anchor="middle">${s}</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Código de barras ${c}"><rect width="${w}" height="${h}" fill="#fff"/><g fill="#000">${barras}</g>`
  +t(q/2,c[0])+t(q+(3+21)*modulo,c.slice(1,7))+t(q+(50+21)*modulo,c.slice(7))+'</svg>';
}

const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
// Página para imprimir. Bobina (impressora de cupom térmica 80 ou 58 mm): uma etiqueta por "página",
// que a impressora solta e corta; A4: etiquetas de 50 × 30 mm em grade.
export const FORMATOS={bobina80:{nome:'Impressora de cupom · bobina 80 mm (Bematech MP-4200 TH e similares)',largura:80,altura:40,codigo:60},bobina58:{nome:'Impressora de cupom · bobina 58 mm',largura:58,altura:34,codigo:44},a4:{nome:'Folha A4 · etiquetas 50 × 30 mm',largura:50,altura:30,codigo:44}};
export function paginaEtiquetas(itens,{empresa='',formato='bobina80'}={}){
 const f=FORMATOS[formato]||FORMATOS.bobina80,bobina=formato!=='a4';
 const etiquetas=itens.flatMap(i=>Array.from({length:Math.max(1,Math.min(200,Number(i.copias)||1))},()=>
  `<div class="etq"><div class="nome">${esc(i.descricao)}</div>${svgEAN13(i.codigo)}${i.local?`<div class="local">Local: ${esc(i.local)}</div>`:''}</div>`)).join('');
 const css=bobina
  ?`@page{size:${f.largura}mm ${f.altura}mm;margin:0}.grade{display:block}.etq{width:${f.largura}mm;height:${f.altura}mm;padding:2mm 3mm;break-after:page;page-break-after:always}.etq:last-child{break-after:auto;page-break-after:auto}.nome{font-size:${formato==='bobina58'?9:11}pt}`
  :`@page{size:A4;margin:8mm}.grade{display:grid;grid-template-columns:repeat(auto-fill,50mm);gap:2mm}.etq{width:50mm;height:30mm;padding:1.5mm 2mm;border:0.2mm dashed #999}.nome{font-size:8pt}@media print{.etq{border-color:transparent}}`;
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiquetas${empresa?' · '+esc(empresa):''}</title><style>
body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}
.etq{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;break-inside:avoid}
.etq svg{width:${f.codigo}mm;height:auto}.nome{font-weight:bold;text-align:center;line-height:1.1;max-height:2.3em;overflow:hidden;margin-bottom:1mm}.local{font-size:7pt;margin-top:0.5mm}
${css}</style></head><body><div class="grade">${etiquetas}</div></body></html>`;
}
