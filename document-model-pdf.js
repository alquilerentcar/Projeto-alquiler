import {PDFDocument,StandardFonts,rgb} from 'https://esm.sh/pdf-lib@1.17.1';
import {companyStationery,addStationeryPage} from './empresa-branding.js?v=20261019-pdf-size';
import {plainBlocks} from './rich-document.js';
export async function modelPdf(db,company,text,documentNumber=null,formatacao=null,photos=[],options={}){
 const stationery=await companyStationery(db,company,PDFDocument),pdf=await PDFDocument.create();
 const families=options.fontFamily==='Helvetica'?[StandardFonts.Helvetica,StandardFonts.HelveticaBold,StandardFonts.HelveticaOblique,StandardFonts.HelveticaBoldOblique]:[StandardFonts.TimesRoman,StandardFonts.TimesRomanBold,StandardFonts.TimesRomanItalic,StandardFonts.TimesRomanBoldItalic];
 const fonts=await Promise.all(families.map(f=>pdf.embedFont(f))),bottom=Number(options.bottom)||57,gap=Number.isFinite(options.paragraphGap)?options.paragraphGap:12;
 const blocks=Array.isArray(formatacao)&&formatacao.length?formatacao:plainBlocks(text);let page,y,width,height,number=0;
 async function addPage(){page=await addStationeryPage(pdf,stationery);({width,height}=page.getSize());y=height-120;number++;page.drawText(`Página ${number}`,{x:width-90,y:35,size:8,font:fonts[0],color:rgb(.35,.35,.35)});if(documentNumber!==null)page.drawText(`Documento ${documentNumber}`,{x:85,y:35,size:8,font:fonts[0]})}
 await addPage();
 for(const b of blocks){if(!(b.runs||[]).some(r=>String(r.text||'').trim()))continue;if(options.fontFamily==='Helvetica'&&/^(CLÁUSULA|VEÍCULO )/.test(b.runs.map(r=>r.text||'').join(''))&&y<bottom+65)await addPage();const glyphs=[];for(const r of b.runs||[]){const size=Math.min(24,Math.max(8,Number(r.size)||12)),font=fonts[(r.bold?1:0)+(r.italic?2:0)];for(const char of String(r.text||'').replace(/\r/g,'').replace(/\t/g,' ')){try{glyphs.push({char,font,size,underline:!!r.underline,width:char==='\n'?0:font.widthOfTextAtSize(char,size)})}catch{throw new Error('O texto contém símbolos não suportados pelo PDF. Remova emojis ou caracteres especiais.')}}}
  const maxWidth=width-142,lines=[];let line=[],used=0;
  for(const g of glyphs){if(g.char==='\n'){lines.push(line);line=[];used=0;continue}if(used+g.width>maxWidth&&line.length){let space=line.map(x=>x.char).lastIndexOf(' ');if(space>0){lines.push(line.slice(0,space));line=line.slice(space+1)}else{lines.push(line);line=[]}used=line.reduce((s,x)=>s+x.width,0)}line.push(g);used+=g.width}lines.push(line);
  for(let i=0;i<lines.length;i++){const chars=lines[i];while(chars.at(-1)?.char===' ')chars.pop();const heightLine=Math.max(12,...chars.map(g=>g.size))*1.2;if(y-heightLine<bottom)await addPage();const w=chars.reduce((s,g)=>s+g.width,0),spaces=chars.filter(g=>g.char===' ').length;let x=85+(b.align==='center'?(maxWidth-w)/2:b.align==='right'?maxWidth-w:0);const extra=b.align==='justify'&&i<lines.length-1&&spaces?(maxWidth-w)/spaces:0;
   for(const g of chars){page.drawText(g.char,{x,y,size:g.size,font:g.font});if(g.underline)page.drawLine({start:{x,y:y-2},end:{x:x+g.width,y:y-2},thickness:.5});x+=g.width+(g.char===' '?extra:0)}y-=heightLine;
  }y-=gap;
 }
 for(const photo of photos){
  await addPage();page.drawText(photo.title||'Veículo substituto',{x:85,y,size:11,font:fonts[1]});y-=24;if(photo.subtitle){page.drawText(String(photo.subtitle).slice(0,70),{x:85,y,size:10,font:fonts[0]});y-=18;}
  const optimized=await preparePdfImage(photo.blob),bytes=new Uint8Array(await optimized.arrayBuffer()),image=await pdf.embedJpg(bytes);
  const maxWidth=width-142,maxHeight=y-70,scale=Math.min(maxWidth/image.width,maxHeight/image.height);
  const w=image.width*scale,h=image.height*scale;page.drawImage(image,{x:85+(maxWidth-w)/2,y:y-h,width:w,height:h});
 }
 return pdf.save();
}
export async function preparePdfImage(blob,maxEdge=1600,quality=.82){
 const bitmap=await createImageBitmap(blob);
 try{
  const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
  if(scale===1&&blob.type==='image/jpeg'&&blob.size<500000)return blob;
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const result=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível preparar a foto para o PDF.')),'image/jpeg',quality));
  return scale===1&&blob.type==='image/jpeg'&&result.size>=blob.size?blob:result;
 }finally{bitmap.close();}
}
