/* Metadata only: the password and decrypted keys never leave this worker. */
self.window=self; // Forge's browser bundle also runs in a Web Worker.
importScripts('/forge.min.js');
self.onmessage=({data})=>{
 try{
  if(!(data.bytes instanceof ArrayBuffer)||!data.bytes.byteLength||data.bytes.byteLength>10*1024*1024)throw new Error('Arquivo inválido ou maior que 10 MB.');
  const asn1=forge.asn1.fromDer(forge.util.createBuffer(data.bytes)),p12=forge.pkcs12.pkcs12FromAsn1(asn1,false,String(data.password||''));
  const bags=p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]||[];
  const bag=bags.find(b=>b.cert&&!b.cert.getExtension('basicConstraints')?.cA)||bags.find(b=>b.cert);
  if(!bag?.cert)throw new Error('O arquivo não contém um certificado legível.');
  const cert=bag.cert,cn=attributes=>attributes.find(a=>a.shortName==='CN')?.value||'',iso=d=>d.toISOString().slice(0,10);
  self.postMessage({certificate:{titular:cn(cert.subject.attributes),subject:cert.subject.attributes.map(a=>`${a.shortName||a.name}=${a.value}`).join(', '),issuer:cn(cert.issuer.attributes),serial:cert.serialNumber,valido_de:iso(cert.validity.notBefore),valido_ate:iso(cert.validity.notAfter)}});
 }catch(error){const message=/password|mac could not|decrypt|invalid padding/i.test(error.message)?'Senha incorreta ou certificado inválido.':'Não foi possível ler este certificado. Confira o arquivo .pfx/.p12 e a senha.';self.postMessage({error:message});}
};
