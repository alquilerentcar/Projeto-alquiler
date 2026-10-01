const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
let chromium;try{({chromium}=require('./test-tools/node_modules/playwright'));}catch{({chromium}=require('../acessos-stage/test-tools/node_modules/playwright'));}
const handler=require('./server.js');
const company={id:'b',nome_fantasia:'Locadora B',razao_social:'LOCADORA B LTDA',cnpj:'12345678000190',ativa:true,licenca_ativa:true};
const admin={schemaVersion:2,developer:false,canManageCompany:true,company,companies:[company],modules:['locacao'],user:{nome:'Administrador B',administrador:true}};
const panel={empresas:[company],modulos:[{id:'loc',codigo:'locacao',nome:'Locação',disponivel:true}],licencas:[{empresa_id:'b',modulo_id:'loc',ativo:true}],usuarios:[{id:'op',empresa_id:'b',nome:'Operador',email:'op@example.com',usuario:'OPERADOR',ativo:true,administrador:false}],permissoes:[{usuario_empresa_id:'op',modulo_id:'loc',pode_visualizar:true}],criacao_contas_configurada:true};
test('browser: login without CNPJ, tenant admin, protected pages and BG control',{timeout:240000},async()=>{
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function pageFor(context){
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:`export const createClient=()=>({auth:{signInWithPassword:async()=>({}),getSession:async()=>({data:{session:{access_token:'test'}}}),signOut:async()=>({})},rpc:async()=>({data:${JSON.stringify(context)}}),from:()=>({})});`}));
   return page;
  }
  const login=await pageFor(admin);await login.route('**/dashboard.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Locação</h1>'}));
  await login.goto(base+'/login.html');assert.equal(await login.locator('[name=cnpj]').count(),0);
  await login.locator('[name=usuario]').fill('admin@example.com');await login.locator('[name=password]').fill('senha-teste-12345');await login.locator('#system-login-button').click();await login.waitForURL('**/dashboard.html');await login.close();
  const page=await pageFor(admin),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/acessos',route=>{if(route.request().method()==='GET')return route.fulfill({json:panel});writes.push(route.request().postDataJSON());return route.fulfill({json:'user'});});
  await page.goto(base+'/acessos.html');await page.getByRole('heading',{name:'Usuários desta empresa'}).waitFor();
  assert.equal(await page.locator('#new-company').isVisible(),false);assert.equal(await page.locator('#company-form').isVisible(),false);
  assert.equal(await page.locator('.professional-menu a[href="empresa.html"]').isVisible(),true);
  assert.equal(await page.locator('.professional-menu a[href="controle.html"]').isVisible(),false);
  await page.screenshot({path:__dirname+'/etapa1-admin.png',fullPage:true});
  await page.locator('#new-user').click();await page.locator('#user-form [name=nome]').fill('Pessoa Nova');await page.locator('#user-form [name=usuario]').fill('PESSOA');await page.locator('#user-form [name=email]').fill('pessoa@example.com');await page.locator('#user-form [name=password]').fill('senha-teste-12345');await page.locator('#user-modules input[value=locacao]').check();await page.locator('#user-form button[type=submit]').click();await page.getByText('Acesso salvo. O usuário entra com e-mail e senha.',{exact:true}).waitFor();assert.equal(writes[0].usuario.empresa_id,'b');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:__dirname+'/etapa1-admin-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
  const operator=await pageFor({...admin,canManageCompany:false,user:{nome:'Operador',administrador:false}});await operator.goto(base+'/empresa.html');await operator.waitForURL('**/modulos.html?acesso=negado');assert.equal(await operator.locator('[data-admin-only]').isVisible(),false);assert.equal(await operator.getByRole('heading',{name:'Locação',exact:true}).isVisible(),true);await operator.close();
  const dev=await pageFor({...admin,developer:true,canManageCompany:true,company,companies:[company,{id:'a',nome_fantasia:'Alquiler'}],modules:['locacao'],user:{nome:'Desenvolvedor',administrador:true}});
  await dev.route('**/api/controle',route=>route.fulfill({json:panel}));await dev.goto(base+'/controle.html');await dev.getByRole('heading',{name:'Controle',exact:true}).waitFor();await dev.locator('#new-company:enabled').waitFor();assert.equal(await dev.locator('.global-company').textContent(),'BG SYSTEMS');assert.equal(await dev.locator('#new-company').isVisible(),true);assert.equal(await dev.locator('#company-form').isVisible(),true);assert.equal(await dev.locator('.professional-menu a[href="dashboard.html"]').isVisible(),false);assert.equal(await dev.locator('.professional-menu a[href="empresa.html"]').isVisible(),false);await dev.screenshot({path:__dirname+'/etapa1-controle.png',fullPage:true});await dev.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
