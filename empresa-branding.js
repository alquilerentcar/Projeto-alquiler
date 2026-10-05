export const BRANDING_BUCKET='identidade-empresas';
export const DEFAULT_COLOR='#2864da';
export function themeColors(value){
 const primary=/^#[0-9a-f]{6}$/i.test(value||'')?value:DEFAULT_COLOR;
 const channels=primary.slice(1).match(/../g).map(x=>parseInt(x,16)/255);
 const luminance=channels.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 return {primary,foreground:luminance>.179?'#000000':'#ffffff'};
}
export function applyCompanyTheme(company){
 const {primary,foreground}=themeColors(company?.cor_primaria);
 const surface=themeColors(company?.cor_paineis||'#ffffff');
 document.documentElement.style.setProperty('--company-surface',surface.primary);
 document.documentElement.style.setProperty('--company-on-surface',surface.foreground);
 const sidebar=themeColors(company?.cor_sidebar||'#111e32'),background=themeColors(company?.cor_fundo||'#f5f7fb');
 for(const [name,value] of Object.entries({'--company-sidebar':sidebar.primary,'--company-on-sidebar':sidebar.foreground,'--company-background':background.primary,'--company-on-background':background.foreground}))document.documentElement.style.setProperty(name,value);
 document.documentElement.style.setProperty('--company-primary',primary);
 document.documentElement.style.setProperty('--company-on-primary',foreground);
}
export function formatCnpj(value){return String(value||'').replace(/\D/g,'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');}
export async function companyStationery(db,company,PDFDocument){
 if(company.papel_timbrado_path){
  if(!company.papel_timbrado_path.startsWith(company.id+'/'))throw new Error('Papel timbrado inválido. Atualize o arquivo em Empresa.');
  const {data,error}=await db.storage.from(BRANDING_BUCKET).download(company.papel_timbrado_path);
  if(error)throw new Error('Não foi possível carregar o papel timbrado da empresa. Confira o cadastro e tente novamente.');
  return PDFDocument.load(await data.arrayBuffer());
 }
 // Sem arquivo cadastrado: página neutra, nunca o timbrado de outra empresa.
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);
 const safe=value=>String(value||'').replace(/[^\x20-\x7e\xa0-\xff]/g,'');
 page.drawText(safe(company.nome_fantasia||company.razao_social),{x:85,y:797,size:12});
 page.drawText(`CNPJ: ${formatCnpj(company.cnpj)}`,{x:85,y:782,size:9});
 if(/^data:image\/(png|jpeg);base64,/.test(company.logo_url||'')){
  const logo=company.logo_url.startsWith('data:image/png')?await pdf.embedPng(company.logo_url):await pdf.embedJpg(company.logo_url);
  const scale=Math.min(42/logo.width,42/logo.height);page.drawImage(logo,{x:30,y:774,width:logo.width*scale,height:logo.height*scale});
 }
 return pdf;
}
