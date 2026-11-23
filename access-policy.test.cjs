const {test}=require('node:test'),assert=require('node:assert/strict');
test('Financeiro integra Locação e os painéis exigem seus perfis',async()=>{
 const {canOpen}=await import('./access-policy.js');const operator={developer:false,canManageCompany:false,company:{id:'empresa'},modules:['locacao']};
 assert.equal(canOpen(operator,'/financeiro.html'),true);assert.equal(canOpen(operator,'/empresa.html'),false);assert.equal(canOpen(operator,'/controle.html'),false);
 assert.equal(canOpen({...operator,canManageCompany:true},'/acessos.html'),true);assert.equal(canOpen({...operator,developer:true},'/controle.html'),true);
});
test('Oficina é um módulo próprio, separado da Locação',async()=>{
 const {canOpen}=await import('./access-policy.js');const mecanico={developer:false,canManageCompany:false,company:{id:'tempo'},modules:['oficina']};
 for(const p of ['/oficina.html','/oficina','/pdv-estoque.html','/oficina/balcao'])assert.equal(canOpen(mecanico,p),true,p);
 assert.equal(canOpen(mecanico,'/financeiro.html'),false,'só Oficina não abre a Locação');
 assert.equal(canOpen({...mecanico,modules:['locacao']},'/oficina.html'),false,'só Locação não abre a Oficina');
 assert.equal(canOpen({...mecanico,modules:['locacao','oficina']},'/oficina.html'),true);
});
