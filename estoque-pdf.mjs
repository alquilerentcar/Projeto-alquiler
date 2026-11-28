import {companyStationery} from './empresa-branding.js';
import {brl,qtd,seguro} from './orcamento-core.mjs?v=20261128b';

// Linhas do relatório: só o que tem saldo, agrupado por categoria, com subtotal e total a custo.
export function montarRelatorioEstoque(produtos,categorias){
 const grupos=new Map();
 for(const p of produtos){if(!(Number(p.saldo)>0))continue;const k=p.categoria||'pecas',g=grupos.get(k)||{categoria:categorias[k]||k,itens:[],valor:0};
  const valor=Number(p.saldo)*Number(p.custo_medio||0);g.itens.push({descricao:p.descricao+(p.marca?' · '+p.marca:''),codigo:p.codigo_barras||p.codigo_interno||'—',local:p.localizacao||'—',estoque:qtd(p.saldo)+' '+(p.unidade||''),custo:brl(p.custo_medio),valor:brl(valor),semCusto:!Number(p.custo_medio)});g.valor+=valor;grupos.set(k,g);}
 const lista=[...grupos.values()].sort((a,b)=>a.categoria.localeCompare(b.categoria,'pt-BR'));for(const g of lista)g.itens.sort((a,b)=>a.descricao.localeCompare(b.descricao,'pt-BR'));
 return {grupos:lista,itens:lista.reduce((s,g)=>s+g.itens.length,0),total:lista.reduce((s,g)=>s+g.valor,0),semCusto:lista.reduce((s,g)=>s+g.itens.filter(i=>i.semCusto).length,0)};
}

// Relatório do que há no estoque, no papel timbrado da empresa.
export async function gerarEstoquePdf({db,company,produtos,categorias,filtro}){
 const {PDFDocument,StandardFonts,rgb}=await import('https://esm.sh/pdf-lib@1.17.1');
 const r=montarRelatorioEstoque(produtos,categorias),timbrado=await companyStationery(db,company,PDFDocument),pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const azul=rgb(.11,.25,.66),cinza=rgb(.35,.37,.42),claro=rgb(.93,.94,.96),preto=rgb(.09,.1,.12);
 let page,width,height,y;const left=48,right=48;
 const novaPagina=async()=>{[page]=await pdf.copyPages(timbrado,[0]);pdf.addPage(page);({width,height}=page.getSize());y=height-150;};
 await novaPagina();const content=width-left-right;
 const escrever=(t,x,yy,size=9,font=regular,color=preto)=>page.drawText(seguro(t),{x,y:yy,size,font,color});
 const quebrar=(t,size,font,max)=>{const out=[];let linha='';for(const w of seguro(t).split(/\s+/)){const n=linha?linha+' '+w:w;if(font.widthOfTextAtSize(n,size)<=max)linha=n;else{if(linha)out.push(linha);linha=w;}}if(linha)out.push(linha);return out.length?out:[''];};
 const direita=(t,x,w,yy,size,font=regular,color=preto)=>escrever(t,x+w-4-font.widthOfTextAtSize(seguro(t),size),yy,size,font,color);
 const agora=new Date().toLocaleString('pt-BR',{timeZone:'America/Manaus',dateStyle:'short',timeStyle:'short'});
 escrever('RELATÓRIO DO ESTOQUE',left,y,15,bold,azul);y-=16;
 escrever(`Emitido em ${agora} · ${r.itens} item(ns) com saldo · ${filtro||'Todos os itens'}`,left,y,8.5,regular,cinza);y-=22;
 const cols=[{t:'Item',w:.34},{t:'Código',w:.16},{t:'Local',w:.12},{t:'Em estoque',w:.12,d:1},{t:'Custo médio',w:.12,d:1},{t:'Valor',w:.14,d:1}].map(c=>({...c,w:c.w*content}));
 const cabecalhoTabela=async()=>{if(y<120)await novaPagina();page.drawRectangle({x:left,y:y-6,width:content,height:20,color:azul});let x=left;for(const c of cols){if(c.d)direita(c.t,x,c.w,y,8,bold,rgb(1,1,1));else escrever(c.t,x+4,y,8,bold,rgb(1,1,1));x+=c.w;}y-=22;};
 for(const g of r.grupos){
  if(y<140)await novaPagina();
  escrever(g.categoria,left,y,10.5,bold,azul);y-=22;await cabecalhoTabela();
  for(const [i,it] of g.itens.entries()){
   const vals=[it.descricao,it.codigo,it.local,it.estoque,it.custo+(it.semCusto?' *':''),it.valor],partes=vals.map((v,k)=>quebrar(v,8,regular,cols[k].w-8)),alt=Math.max(...partes.map(p=>p.length))*11+6;
   if(y-alt<90){await novaPagina();await cabecalhoTabela();}
   if(i%2)page.drawRectangle({x:left,y:y-alt+9,width:content,height:alt,color:claro});
   let x=left;partes.forEach((p,k)=>{p.forEach((t,j)=>cols[k].d?direita(t,x,cols[k].w,y-j*11,8):escrever(t,x+4,y-j*11,8));x+=cols[k].w;});y-=alt;
  }
  direita('Subtotal '+g.categoria+': '+brl(g.valor),left,content,y-2,9,bold);y-=22;
 }
 if(!r.grupos.length){escrever('Nenhum item com saldo em estoque.',left,y,9,regular,cinza);y-=16;}
 if(y<110)await novaPagina();
 y-=4;page.drawLine({start:{x:left,y:y+12},end:{x:left+content,y:y+12},thickness:.6,color:cinza});
 direita('Total em estoque (a custo): '+brl(r.total),left,content,y-2,11,bold,azul);y-=18;
 if(r.semCusto){escrever(`* ${r.semCusto} item(ns) sem custo cadastrado: não entram no valor total.`,left,y,8,regular,cinza);y-=12;}
 return pdf.save();
}
