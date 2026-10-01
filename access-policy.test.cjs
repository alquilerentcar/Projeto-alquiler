const {test}=require('node:test'),assert=require('node:assert/strict');
test('Financeiro integra Locação e os painéis exigem seus perfis',async()=>{
 const {canOpen}=await import('./access-policy.js');const operator={developer:false,canManageCompany:false,company:{id:'empresa'},modules:['locacao']};
 assert.equal(canOpen(operator,'/financeiro.html'),true);assert.equal(canOpen(operator,'/empresa.html'),false);assert.equal(canOpen(operator,'/controle.html'),false);
 assert.equal(canOpen({...operator,canManageCompany:true},'/acessos.html'),true);assert.equal(canOpen({...operator,developer:true},'/controle.html'),true);
});
