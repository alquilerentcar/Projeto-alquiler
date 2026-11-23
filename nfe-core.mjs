// Leitura do XML da NF-e (o arquivo que o fornecedor envia) para dar entrada no estoque.
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
const texto=v=>v==null?null:v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x?[0-9a-f]+|\w+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):ENT[e]??m).trim();
// Primeira ocorrência de <tag>…</tag> (com ou sem prefixo de namespace) dentro de um trecho.
function tag(xml,nome){const m=String(xml||'').match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));return m?m[1]:null;}
const num=v=>{const n=Number(String(v??'').trim());return Number.isFinite(n)?n:null;};

export function lerNFe(xml){
 const s=String(xml||'');
 if(!/<(?:\w+:)?infNFe[\s>]/.test(s))throw Error('Este arquivo não é o XML de uma NF-e. Use o arquivo .xml que o fornecedor enviou.');
 const inf=s.match(/<(?:\w+:)?infNFe[^>]*\sId="(?:NFe)?(\d{44})"/),ch=texto(tag(s,'chNFe'));
 const ide=tag(s,'ide'),emit=tag(s,'emit'),total=tag(tag(s,'total'),'ICMSTot');
 // nItem pode vir como atributo (<det nItem="1">) ou, em alguns emissores, como tag dentro do item (<det><nItem>1</nItem>).
 const itens=[...s.matchAll(/<(?:\w+:)?det(\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?det>/g)].map(([,attr,det],k)=>{
  const n=(attr||'').match(/nItem="(\d+)"/)?.[1]||texto(tag(det,'nItem'))||String(k+1);
  const p=tag(det,'prod'),ean=texto(tag(p,'cEAN'))||texto(tag(p,'cEANTrib'));
  return {n:Number(n),codigo:texto(tag(p,'cProd')),ean:ean&&/^\d{8,14}$/.test(ean)?ean:null,descricao:texto(tag(p,'xProd')),ncm:texto(tag(p,'NCM')),
   unidade:(texto(tag(p,'uCom'))||'UN').toUpperCase().slice(0,6),quantidade:num(texto(tag(p,'qCom'))),valor_unitario:num(texto(tag(p,'vUnCom'))),valor_total:num(texto(tag(p,'vProd')))};
 });
 if(!itens.length)throw Error('A nota não tem itens.');
 const emissao=(texto(tag(ide,'dhEmi'))||texto(tag(ide,'dEmi'))||'').slice(0,10);
 return {chave:inf?.[1]||(ch&&/^\d{44}$/.test(ch)?ch:null),numero:texto(tag(ide,'nNF')),serie:texto(tag(ide,'serie')),emissao:/^\d{4}-\d{2}-\d{2}$/.test(emissao)?emissao:null,
  emitente_cnpj:(texto(tag(emit,'CNPJ'))||texto(tag(emit,'CPF'))||'').replace(/\D/g,''),emitente_nome:texto(tag(emit,'xNome')),valor_total:num(texto(tag(total,'vNF'))),
  valor_produtos:num(texto(tag(total,'vProd'))),frete:num(texto(tag(total,'vFrete'))),desconto:num(texto(tag(total,'vDesc'))),natureza_operacao:texto(tag(ide,'natOp')),itens};
}

// Liga cada item da nota a uma peça do estoque: primeiro pelo código já aprendido deste fornecedor, depois pelo código de barras.
export function casarItens(itens,produtos,codigos={}){
 return itens.map(i=>{const porCodigo=i.codigo&&codigos[i.codigo]?produtos.find(p=>p.id===codigos[i.codigo]):null;
  const porBarras=!porCodigo&&i.ean?produtos.find(p=>p.codigo_barras===i.ean):null;
  const produto=porCodigo||porBarras||null;return {...i,produto,como:porCodigo?'codigo':porBarras?'barras':'nova'};});
}
