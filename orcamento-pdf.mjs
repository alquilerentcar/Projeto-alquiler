import {companyStationery} from './empresa-branding.js';
import {montarOrcamento,seguro} from './orcamento-core.mjs?v=20261128b';

// Orçamento da manutenção no papel timbrado da empresa (o mesmo arquivo usado nos recibos).
export async function gerarOrcamentoPdf({db,company,orcamento}){
 const {PDFDocument,StandardFonts,rgb}=await import('https://esm.sh/pdf-lib@1.17.1');
 const o=montarOrcamento(orcamento),timbrado=await companyStationery(db,company,PDFDocument),pdf=await PDFDocument.create();
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const azul=rgb(.11,.25,.66),cinza=rgb(.35,.37,.42),claro=rgb(.93,.94,.96),preto=rgb(.09,.1,.12);
 let page,width,height,y;const left=56,right=56;
 const novaPagina=async()=>{[page]=await pdf.copyPages(timbrado,[0]);pdf.addPage(page);({width,height}=page.getSize());y=height-150;};
 await novaPagina();const content=width-left-right;
 const escrever=(t,x,yy,size=9,font=regular,color=preto)=>page.drawText(seguro(t),{x,y:yy,size,font,color});
 // Quebra o texto na largura disponível.
 const quebrar=(t,size,font,max)=>{const out=[];let linha='';for(const w of seguro(t).split(/\s+/)){const n=linha?linha+' '+w:w;if(font.widthOfTextAtSize(n,size)<=max)linha=n;else{if(linha)out.push(linha);linha=w;}}if(linha)out.push(linha);return out.length?out:[''];};
 const garantir=async alt=>{if(y-alt<90)await novaPagina();};

 escrever(o.titulo,left,y,15,bold,azul);y-=24;
 // Bloco em destaque (cliente do orçamento / locatário): nome em negrito e os dados embaixo.
 const bloco=async(rotulo,b)=>{const ls=b.linhas.flatMap(l=>quebrar(l,9,regular,content-24)),ns=quebrar(b.nome,11,bold,content-24),alt=22+ns.length*14+ls.length*12;await garantir(alt+8);
  page.drawRectangle({x:left,y:y-alt+12,width:content,height:alt,color:claro});escrever(rotulo,left+12,y,7.5,bold,azul);y-=13;
  for(const l of ns){escrever(l,left+12,y,11,bold);y-=14;}for(const l of ls){escrever(l,left+12,y,9,regular,cinza);y-=12;}y-=20;};
 if(o.cliente)await bloco('ORÇAMENTO EM NOME DE',o.cliente);
 for(const [k,v] of o.cabecalho.filter(([k])=>!(o.cliente&&['Cliente','Locatário'].includes(k)))){const ls=quebrar(v,9.5,regular,content-90);await garantir(ls.length*13+4);escrever(k,left,y,9.5,bold,cinza);ls.forEach((l,i)=>escrever(l,left+90,y-i*13,9.5));y-=ls.length*13+4;}
 y-=10;
 if(o.locatario){y+=4;await bloco('LOCATÁRIO',o.locatario);}
 // Tabela: tipo, descrição, qtd, unitário, total, natureza, parte do locatário.
 const cols=[{t:'Tipo',w:.11},{t:'Descrição',w:.31},{t:'Qtd',w:.08},{t:'Unitário',w:.12},{t:'Total',w:.12},{t:'Natureza',w:.11},{t:'Locatário',w:.15}].map(c=>({...c,w:c.w*content}));
 const cabecalhoTabela=async()=>{await garantir(24);page.drawRectangle({x:left,y:y-6,width:content,height:20,color:azul});let x=left;for(const c of cols){escrever(c.t,x+4,y,8,bold,rgb(1,1,1));x+=c.w;}y-=22;};
 await cabecalhoTabela();
 for(const [i,l] of o.linhas.entries()){
  const vals=[l.tipo,l.descricao,l.quantidade,l.unitario,l.total,l.natureza,l.locatario],partes=vals.map((v,k)=>quebrar(v,8,regular,cols[k].w-8)),alt=Math.max(...partes.map(p=>p.length))*11+6;
  if(y-alt<90){await novaPagina();await cabecalhoTabela();}
  if(i%2)page.drawRectangle({x:left,y:y-alt+9,width:content,height:alt,color:claro});
  let x=left;partes.forEach((p,k)=>{p.forEach((t,j)=>escrever(t,x+4,y-j*11,8));x+=cols[k].w;});y-=alt;
 }
 if(!o.linhas.length){escrever('Nenhuma peça ou serviço lançado.',left+4,y,9,regular,cinza);y-=16;}
 y-=8;await garantir(o.totais.length*16+40);
 for(const [k,v] of o.totais){const forte=/Total|locatário/.test(k);escrever(k,left+content*.55,y,forte?10:9.5,forte?bold:regular,forte?azul:preto);const w=(forte?bold:regular).widthOfTextAtSize(seguro(v),forte?10:9.5);escrever(v,left+content-w,y,forte?10:9.5,forte?bold:regular,forte?azul:preto);y-=16;}
 y-=6;for(const l of quebrar(o.regra+(o.cobrado?' '+o.cobrado:''),8,regular,content)){await garantir(12);escrever(l,left,y,8,regular,cinza);y-=11;}
 await garantir(70);y-=40;
 // Assinaturas: oficina, locadora dona do carro (quando houver) e locatário.
 const assinaturas=['Responsável pela oficina',...(o.locadora?[o.locadora]:[]),'Locatário / cliente'],gap=content*.06,larg=(content-gap*(assinaturas.length-1))/assinaturas.length;
 assinaturas.forEach((t,i)=>{const x=left+i*(larg+gap);page.drawLine({start:{x,y},end:{x:x+larg,y},thickness:.6,color:cinza});escrever(t,x,y-12,8,regular,cinza);});
 return pdf.save();
}
