// Contas a receber no navegador, com banco simulado: nada chega ao Supabase real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');const {chromium}=require('playwright');
const qa=path.join(root,'tmp','qa');fs.mkdirSync(qa,{recursive:true});
const seed=mode=>{
 window.calls=[];
 const hoje='2026-11-09';
 const painel={hoje,diarias:[{grupo_id:'g1',cliente_id:'ana',nome:'ANA <b>SOUZA</b>',placa:'AAA1111',vencimento:'2026-11-08',valor:161.95,multa:16.95,recebido:0}],parcelas:[{parcela_id:'p1',debito_id:'d1',cliente_id:'ana',nome:'ANA <b>SOUZA</b>',categoria:'caucao',descricao:'Caução da locação · AAA1111',numero:1,vencimento:hoje,valor:11,recebido:0},{parcela_id:'p2',debito_id:'d2',cliente_id:'bia',nome:'BIA LIMA',categoria:'multa',descricao:'Multa de trânsito',numero:1,vencimento:'2026-11-20',valor:90,recebido:0}]};
 const pendentes=[{locacao_id:'l9',cliente_id:'caio',nome:'CAIO ANTIGO',placa:'CCC3333',saldo:600,valor_parcela_caucao:20,primeira_sugerida:'2026-11-01',caucao_manual:false}];
 const extrato={cobrancas:[{tipo:'diaria',descricao:'AAA1111',vencimento:'2026-11-08',valor:161.95,multa:16.95,recebido:0},{tipo:'caucao',descricao:'Caução da locação · AAA1111 · parcela 1',vencimento:hoje,valor:11,recebido:0}],pagamentos:[{tipo:'diaria',descricao:'AAA1111',referencia:'2026-11-07',valor:145,recebido_em:'2026-11-07T15:00:00Z'}]};
 const q=()=>{const b={select(){return b},eq(){return b},in(){return b},order(){return b},gte(){return b},lt(){return b},lte(){return b},range(){return b},limit(){return b},single(){return Promise.resolve({data:null})},maybeSingle(){return Promise.resolve({data:null})},then(r){r({data:[],error:null})}};return b;};
 window.db={from:q,storage:{from:()=>({})},async rpc(name,args){window.calls.push({name,args});
  if(mode==='sem-sql'&&['contas_receber_painel','caucao_pendentes'].includes(name))return {data:null,error:{code:'PGRST202',message:'Could not find the function'}};
  if(name==='contas_receber_painel')return {data:painel,error:null};
  if(name==='caucao_pendentes')return {data:window.calls.some(c=>c.name==='locacao_caucao_parcelar')?[]:pendentes,error:null};
  if(name==='locatario_extrato')return {data:extrato,error:null};
  if(name==='locacao_caucao_parcelar')return {data:'novo',error:null};
  if(name==='locatario_receber')return mode==='sem-baixa'?{data:null,error:{code:'PGRST202',message:'Could not find the function'}}:{data:[],error:null};
  return {data:name==='frota_painel'?{clientes:[],carros:[],periodos:[]}:[],error:null};}};
};
const routes=page=>page.route('https://qa.test/**',route=>{
 const f=new URL(route.request().url()).pathname.slice(1);
 if(f==='financeiro'){const html=fs.readFileSync(root+'/financeiro.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('financeiro.js')?s:'');return route.fulfill({contentType:'text/html',body:html});}
 if(f==='auth-guard.js')return route.fulfill({contentType:'text/javascript',body:'export async function requireAuth(){};export function bindLogout(){};'});
 const file=f.split('?')[0];
 if(file&&fs.existsSync(root+'/'+file)&&!file.includes('..'))return route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(root+'/'+file,'utf8').replace(/import \{createClient\} from ['"]https:\/\/esm.sh\/@supabase\/supabase-js@2['"];?/,'const createClient=()=>window.db;')});
 return route.fulfill({body:''});
});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 try{
  const open=async(mode='',admin=true,viewport={width:1280,height:900})=>{const context=await browser.newContext({viewport}),page=await context.newPage();page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
   await page.addInitScript(a=>{window.alquilerContext={company:{id:'e'},canManageCompany:a,user:{nome:'TESTE'},modules:['locacao']};},admin);await page.addInitScript(seed,mode);await routes(page);
   await page.goto('https://qa.test/financeiro?secao=contas-receber');await page.locator('.flow-note').filter({hasText:/locatário|Aplique|Não foi/}).first().waitFor();return page;};

  let page=await open();
  assert.equal(await page.locator('#finance-title').innerText(),'Contas a receber');
  assert.ok(await page.locator('#finance-dues-view').isHidden(),'lista do dia escondida');
  const rows=page.locator('table tbody tr');
  const ana=rows.filter({hasText:'ANA <b>SOUZA</b>'});assert.equal(await ana.count(),1,'nome aparece como texto');
  const cells=await ana.locator('td').allInnerTexts();
  assert.match(cells[1],/161,95/);assert.match(cells[2],/11,00/);assert.match(cells[4],/172,95/);
  const bia=await rows.filter({hasText:'BIA LIMA'}).locator('td').allInnerTexts();assert.match(bia[4],/0,00/);assert.match(bia[5],/90,00/);assert.equal(bia[6],'20/11/2026');
  assert.match(await page.locator('.metric').first().innerText(),/172,95/);
  await page.locator('select[aria-label="Situação"]').selectOption('A vencer');assert.equal(await rows.filter({hasText:'ANA'}).count(),0);await page.locator('select[aria-label="Situação"]').selectOption('');
  // Histórico do locatário.
  await ana.locator('button.entradas-nome').click();await page.locator('#contas-historico[open]').waitFor();await page.locator('#contas-historico h3').first().waitFor();
  const history=await page.locator('#contas-historico').innerText();assert.match(history,/Cobranças/);assert.match(history,/Caução/);assert.match(history,/Pagamentos/);assert.match(history,/145,00/);
  assert.equal((await page.evaluate(()=>window.calls.find(c=>c.name==='locatario_extrato'))).args.p_cliente,'ana');
  await page.screenshot({path:path.join(qa,'contas-receber-historico.png')});
  await page.locator('#contas-historico .dialog-header button').click();
  // Baixa por locatário: o valor vencido já vem distribuído do mais antigo para o mais novo.
  await ana.locator('button',{hasText:'Receber'}).click();const pay=page.locator('#contas-receber-baixa[open]');await pay.waitFor();
  assert.equal(await pay.locator('input[type=number]').first().inputValue(),'172.95');
  assert.equal(await pay.getByLabel('Pagar Diária de 08/11/2026').inputValue(),'161.95');assert.equal(await pay.getByLabel('Pagar Caução de 09/11/2026').inputValue(),'11.00');
  await pay.locator('input[type=number]').first().fill('100');assert.equal(await pay.getByLabel('Pagar Diária de 08/11/2026').inputValue(),'100.00');assert.equal(await pay.getByLabel('Pagar Caução de 09/11/2026').inputValue(),'0.00');
  await pay.getByLabel('Pagar Caução de 09/11/2026').fill('5');await pay.locator('button[type=submit]').click();assert.match(await pay.locator('.finance-entry-error').innerText(),/inteiro/);
  await pay.getByLabel('Pagar Diária de 08/11/2026').fill('95');await page.screenshot({path:path.join(qa,'contas-receber-baixa.png')});await pay.locator('button[type=submit]').click();await pay.waitFor({state:'hidden'});
  const baixa=await page.evaluate(()=>window.calls.find(c=>c.name==='locatario_receber').args);
  assert.equal(baixa.p_cliente,'ana');assert.equal(baixa.p_total,100);assert.deepEqual(baixa.p_itens,[{tipo:'diaria',grupo_id:'g1',dia:'2026-11-08',valor:95},{tipo:'parcela',parcela_id:'p1',valor:5}]);
  assert.match(await page.locator('.flow-note').first().innerText(),/registrado/);
  // Locação antiga com caução sem parcelas.
  const pend=page.locator('section.panel',{hasText:'Caução sem parcelas'});assert.ok(await pend.isVisible());
  page.once('dialog',d=>d.accept());await pend.locator('button',{hasText:'Parcelar caução'}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.name==='locacao_caucao_parcelar'));
  const call=await page.evaluate(()=>window.calls.find(c=>c.name==='locacao_caucao_parcelar'));assert.equal(call.args.p_locacao,'l9');assert.equal(call.args.p_primeiro,'2026-11-01');
  await pend.waitFor({state:'hidden'});
  await page.screenshot({path:path.join(qa,'contas-receber.png'),fullPage:true});
  assert.deepEqual(page.errors,[]);

  page=await open('',false);assert.equal(await page.locator('section.panel',{hasText:'Caução sem parcelas'}).locator('button',{hasText:'Parcelar caução'}).count(),0,'só o administrador parcela');
  page=await open('sem-sql');assert.match(await page.locator('.flow-note').first().innerText(),/caucao_automatica_contas_receber\.sql/);assert.deepEqual(page.errors,[]);
  page=await open('sem-baixa');await page.locator('table tbody tr',{hasText:'BIA LIMA'}).locator('button',{hasText:'Receber'}).click();await page.locator('#contas-receber-baixa button[type=submit]').click();assert.match(await page.locator('#contas-receber-baixa .finance-entry-error').innerText(),/contas_receber_baixa\.sql/);
  page=await open('',true,{width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'sem rolagem lateral no celular');
  console.log('contas-receber.browser ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
