// Tela do levantamento com banco simulado: nada chega ao Supabase real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');const {chromium}=require('playwright');
const qa=path.join(root,'tmp','qa');fs.mkdirSync(qa,{recursive:true});
const seed=mode=>{
 window.calls=[];
 const lista=[{grupo_id:'g1',cliente_id:'ana',nome:'ANA SOUZA',placa:'AAA1111',diaria:210,em_andamento:true,abertas_qtd:3,abertas_valor:630,ultima_paga:'2026-11-08',caucao_total:1500,caucao_pago:400,caucao_saldo:1100,caucao_parcela:11,caucao_parcelada:false,levantado_em:null},
  {grupo_id:'g2',cliente_id:'bia',nome:'BIA LIMA',placa:'BBB2222',diaria:145,em_andamento:true,abertas_qtd:2,abertas_valor:290,ultima_paga:null,caucao_total:1000,caucao_pago:1000,caucao_saldo:0,caucao_parcela:null,caucao_parcelada:true,levantado_em:null},
  {grupo_id:'g3',cliente_id:'caio',nome:'CAIO FEITO',placa:'CCC3333',diaria:145,em_andamento:true,abertas_qtd:0,abertas_valor:0,ultima_paga:'2026-11-11',caucao_total:0,caucao_pago:0,caucao_saldo:0,caucao_parcela:null,caucao_parcelada:false,levantado_em:'2026-11-01'}];
 const q=()=>{const b={select(){return b},eq(){return b},in(){return b},order(){return b},gte(){return b},lt(){return b},lte(){return b},range(){return b},limit(){return b},single(){return Promise.resolve({data:null})},maybeSingle(){return Promise.resolve({data:null})},then(r){r({data:[],error:null})}};return b;};
 window.db={from:q,storage:{from:()=>({})},async rpc(name,args){window.calls.push({name,args});
  if(mode==='sem-sql'&&name==='levantamento_locatarios')return {data:null,error:{code:'PGRST202',message:'Could not find the function'}};
  if(name==='levantamento_locatarios')return {data:window.calls.some(c=>c.name==='levantamento_aplicar')?lista.map(x=>x.grupo_id==='g3'?x:{...x,levantado_em:args.p_corte}):lista,error:null};
  if(name==='levantamento_aplicar')return {data:args.p_linhas.map(l=>({grupo_id:l.grupo_id,diarias_quitadas:2})),error:null};
  return {data:[],error:null};}};
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
  const open=async(mode='',admin=true)=>{const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage();page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
   await page.addInitScript(a=>{window.alquilerContext={company:{id:'e'},canManageCompany:a,user:{nome:'TESTE'},modules:['locacao']};},admin);await page.addInitScript(seed,mode);await routes(page);
   await page.goto('https://qa.test/financeiro?secao=levantamento');await page.locator('#levantamento p').first().waitFor();return page;};

  let page=await open();await page.locator('#levantamento tbody tr').first().waitFor();
  assert.equal(await page.locator('#finance-title').innerText(),'Levantamento dos locatários');
  const rows=page.locator('#levantamento tbody tr');assert.equal(await rows.count(),3);
  const aplicar=page.locator('#levantamento button',{hasText:'Aplicar levantamento'});assert.ok(await aplicar.isDisabled(),'nada marcado, nada a aplicar');
  // Caução sugerida da locação sem parcelas; caução bloqueada onde já está parcelada; linha já levantada travada.
  assert.equal(await page.getByLabel('Saldo da caução (R$) · AAA1111').inputValue(),'1100,00');
  assert.ok(await page.getByLabel('Saldo da caução (R$) · BBB2222').isDisabled());assert.ok(await page.getByLabel('Incluir CCC3333').isDisabled());
  // Digitar marca a linha; extras sem descrição bloqueiam.
  await page.getByLabel('Ainda deve de diárias (R$) · AAA1111').fill('420,00');assert.ok(await page.getByLabel('Incluir AAA1111').isChecked());
  await page.getByLabel('Extras (R$) · AAA1111').fill('150');assert.match(await rows.first().innerText(),/descreva os extras/);assert.ok(await aplicar.isDisabled());
  await page.getByLabel('Descrição dos extras · AAA1111').fill('Avaria');assert.ok(!(await aplicar.isDisabled()));
  assert.match(await page.locator('#levantamento section.panel').last().innerText(),/630,00[\s\S]*420,00[\s\S]*1\.100,00[\s\S]*150,00/);
  // Planilha: baixa com o que foi digitado e volta preenchida.
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#levantamento button',{hasText:'Baixar planilha'}).click()]);
  let csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,/Código \(não alterar\)/);assert.match(csv,/ANA SOUZA;AAA1111;210,00/);assert.match(csv,/420,00/);
  csv=csv.split('\r\n').map(l=>l.startsWith('g2;')?l.replace(/;;;;;;;$/,';90,00;;;;;;Em dia até o corte? não'):l).join('\r\n');
  const tmp=path.join(qa,'levantamento-preenchido.csv');fs.writeFileSync(tmp,csv);
  await page.locator('#levantamento input[type=file]').setInputFiles(tmp);
  await page.waitForFunction(()=>document.querySelector('[aria-label="Ainda deve de diárias (R$) · BBB2222"]').value==='90,00');
  assert.ok(await page.getByLabel('Incluir BBB2222').isChecked());assert.match(await page.locator('#levantamento .flow-note').innerText(),/Planilha lida: 2 linha\(s\) aplicada\(s\) na tela, 1 ignorada/);
  await page.screenshot({path:path.join(qa,'levantamento.png'),fullPage:true});
  page.once('dialog',d=>{assert.match(d.message(),/uma vez por locação/);d.accept();});await aplicar.click();
  await page.waitForFunction(()=>/aplicado/.test(document.querySelector('#levantamento .flow-note').textContent));
  const call=await page.evaluate(()=>window.calls.find(c=>c.name==='levantamento_aplicar').args);
  assert.equal(call.p_corte.length,10);assert.deepEqual(call.p_linhas.map(l=>l.grupo_id),['g1','g2']);
  assert.deepEqual(call.p_linhas[0],{grupo_id:'g1',atraso:420,caucao_saldo:1100,caucao_parcela:11,caucao_inicio:null,extras:150,extras_descricao:'Avaria',observacao:null});
  assert.equal(call.p_linhas[1].atraso,90);assert.equal(call.p_linhas[1].caucao_saldo,0);
  assert.ok(await page.getByLabel('Incluir AAA1111').isDisabled(),'depois de aplicar, a linha fica travada');
  assert.deepEqual(page.errors,[]);

  page=await open('',false);assert.match(await page.locator('#levantamento').innerText(),/Somente o administrador/);
  page=await open('sem-sql');await page.waitForFunction(()=>/levantamento_saldo_inicial\.sql/.test(document.querySelector('#levantamento .flow-note').textContent));assert.deepEqual(page.errors,[]);
  console.log('levantamento.browser ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
