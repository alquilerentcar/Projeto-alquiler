// Página da locação no navegador, com banco simulado: nada chega ao Supabase real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');const {chromium}=require('playwright');
const qa=path.join(root,'tmp','qa');fs.mkdirSync(qa,{recursive:true});
const seed=()=>{
  const inspection=(locacao_id,tipo)=>({locacao_id,tipo,data_hora:'2026-11-01T12:00:00Z',responsavel:'ANA',quilometragem:100,combustivel:'Cheio',condicao_geral:'Bom estado'});
  const rentals=[
    {id:'nova',empresa_id:'e',cliente_id:'semEmail',carro_id:'c1',status:'Reservada',data_inicio:'2026-11-01T12:00:00Z',data_fim:'2026-12-01T12:00:00Z',valor_diaria:145,valor_caucao:1000,saldo_caucao:400},
    {id:'entrega',empresa_id:'e',cliente_id:'comEmail',carro_id:'c1',status:'Ativa',data_inicio:'2026-11-01T12:00:00Z',contrato_gerado_em:'2026-11-01T12:30:00Z',valor_diaria:145},
    {id:'retorno',empresa_id:'e',cliente_id:'comEmail',carro_id:'c1',status:'Ativa',data_inicio:'2026-11-01T12:00:00Z',contrato_gerado_em:'2026-11-01T12:30:00Z',assinatura_locadora_em:'2026-11-01T13:00:00Z',assinatura_cliente_em:'2026-11-01T14:00:00Z'},
    {id:'fechar',empresa_id:'e',cliente_id:'comEmail',carro_id:'c1',status:'Ativa',data_inicio:'2026-11-01T12:00:00Z',contrato_gerado_em:'2026-11-01T12:30:00Z'},
    {id:'outra',empresa_id:'x',cliente_id:'comEmail',carro_id:'c1',status:'Ativa'},
  ];
  const clients=[{id:'semEmail',nome_completo:'CLIENTE SEM EMAIL'},{id:'comEmail',nome_completo:'CLIENTE COM EMAIL',email:'cliente@example.test'}];
  const inspections=[inspection('entrega','saida'),inspection('retorno','saida'),inspection('retorno','devolucao'),inspection('fechar','saida'),inspection('fechar','devolucao')];
  const event=(locacao_id,acao)=>({locacao_id,acao,criado_em:'2026-11-02T12:00:00Z',usuario_id:'u',dados:{observacoes:'ok'}});
  const events=[event('entrega','contrato_pdf'),event('retorno','contrato_pdf'),event('retorno','entrega'),event('fechar','contrato_pdf'),event('fechar','entrega'),event('fechar','devolucao')];
  const tables={locacoes:rentals,clientes:clients,carros:[{id:'c1',empresa_id:'e',placa:'AAA1111',marca:'FIAT',modelo:'MOBI',situacao:'Disponível',valor_diaria:145,caucao:1000},{id:'c2',empresa_id:'e',placa:'BBB2222',marca:'VW',modelo:'GOL',situacao:'Disponível',valor_diaria:150,caucao:1500}],vistorias_locacao:inspections,locacao_eventos:events};
  window.calls=[];
  window.db={from(table){const filters=[];const rows=()=>(tables[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));const q={select(){return q},order(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){return Promise.resolve({data:rows()[0]||null})},single(){return Promise.resolve({data:rows()[0]||null})},insert(payload){localStorage.setItem('inserted',JSON.stringify(payload));return {select(){return {single(){return Promise.resolve({data:{id:'criada'}})}}}}},then(resolve){resolve({data:rows()})}};return q;},async rpc(name,args){window.calls.push({name,args});return {data:{}}}};
};
const pageRoutes=page=>page.route('https://qa.test/**',route=>{
  const f=new URL(route.request().url()).pathname.slice(1);
  if(f==='locacao-painel'){const html=fs.readFileSync(root+'/locacao-painel.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('src="locacao-painel.js')?s:'');return route.fulfill({contentType:'text/html',body:html});}
  if(f==='locacoes'){const html=fs.readFileSync(root+'/locacoes.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('src="locacoes.js')?s:'');return route.fulfill({contentType:'text/html',body:html});}
  if(['contrato','registros','assinaturas'].includes(f)){const html=fs.readFileSync(root+'/'+f+'.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('src="locacao-voltar.js')?s:'');return route.fulfill({contentType:'text/html',body:html});}
  if(f==='vistoriadores.mjs')return route.fulfill({contentType:'text/javascript',body:'export async function bindVistoriadores(){}'});
  if(f==='auth-guard.js')return route.fulfill({contentType:'text/javascript',body:'export async function requireAuth(){};export function bindLogout(){};'});
  if(f&&fs.existsSync(root+'/'+f)&&!f.includes('..'))return route.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(root+'/'+f,'utf8').replace(/import \{createClient\} from ['"]https:\/\/esm.sh\/@supabase\/supabase-js@2['"];?/,'const createClient=()=>window.db;')});
  return route.fulfill({body:''});
});
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
  try{
    const open=async(id,admin=true,viewport={width:1280,height:900})=>{
      const context=await browser.newContext({viewport}),page=await context.newPage();page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
      await page.addInitScript(a=>{window.alquilerContext={company:{id:'e'},canManageCompany:a};},admin);await page.addInitScript(seed);await pageRoutes(page);
      await page.goto('https://qa.test/locacao-painel'+(id?'?locacao='+id:''));await page.locator('#rental-title:not(:text("Carregando"))').waitFor();return page;
    };
    const state=(page,title)=>page.locator('#rental-stepper li',{hasText:title}).getAttribute('data-state');

    let page=await open('nova');
    assert.equal(await page.locator('#rental-title').innerText(),'CLIENTE SEM EMAIL');
    assert.equal(await page.locator('#next-link').innerText(),'Preencher vistoria de saída');
    assert.equal(await page.locator('#next-link').getAttribute('href'),'contrato.html?locacao=nova');
    assert.ok(await page.locator('#rental-alert').isVisible());
    assert.equal(await state(page,'Vistoria de saída'),'current');
    await page.screenshot({path:path.join(qa,'locacao-painel-nova.png'),fullPage:true});
    assert.deepEqual(page.errors,[]);

    page=await open('entrega');
    assert.ok(!(await page.locator('#rental-alert').isVisible()));
    assert.equal(await state(page,'Assinatura'),'attention');
    assert.equal(await page.locator('#next-operation').innerText(),'Confirmar entrega');
    await page.locator('#next-operation').click();await page.locator('#operation-dialog[open]').waitFor();
    assert.equal(await page.locator('#operation-form').getAttribute('data-action'),'entrega');
    await page.locator('[name=vistoria_conferida]').check();await page.locator('[name=assinatura_conferida]').check();await page.locator('[name=observacoes]').fill('Entrega conferida.');
    await page.screenshot({path:path.join(qa,'locacao-painel-entrega.png')});
    await page.locator('#operation-confirm').click();await page.locator('#toast.show').waitFor();
    const call=await page.evaluate(()=>window.calls.at(-1));
    assert.equal(call.name,'locacao_confirmar_etapa');assert.equal(call.args.p_locacao,'entrega');assert.equal(call.args.p_acao,'entrega');assert.equal(call.args.p_dados.assinatura_conferida,true);assert.ok(call.args.p_dados.data_entrega);
    assert.deepEqual(page.errors,[]);

    page=await open('retorno');
    assert.equal(await page.locator('#next-operation').innerText(),'Encerrar locação');
    assert.equal(await state(page,'Entrega do veículo'),'done');
    assert.deepEqual(page.errors,[]);

    page=await open('fechar',false);
    assert.equal(await page.locator('#next-operation').innerText(),'Encerrar locação','qualquer usuário encerra');
    await page.locator('#next-operation').click();await page.locator('#quick-close-dialog[open]').waitFor();
    assert.equal(await page.locator('#operation-dialog[open]').count(),0,'sem o diálogo antigo de etapas');
    await page.locator('#quick-close-dialog [name=fim]').fill('2026-11-04T10:30');await page.locator('#quick-close-dialog [name=situacao]').selectOption('Manutenção');await page.locator('#quick-close-dialog [name=motivo]').fill('Fim do contrato');
    await page.screenshot({path:path.join(qa,'locacao-encerrar.png')});
    await page.locator('#quick-close-dialog [type=submit]').click();await page.locator('#toast.show').waitFor();
    const closing=await page.evaluate(()=>window.calls.at(-1));
    assert.equal(closing.name,'locacao_encerrar_rapido');assert.equal(closing.args.p_locacao,'fechar');assert.equal(closing.args.p_fim,'2026-11-04T14:30:00.000Z');assert.equal(closing.args.p_situacao,'Manutenção');assert.equal(closing.args.p_motivo,'Fim do contrato');
    assert.match(await page.locator('#toast').innerText(),/diárias param/);
    assert.deepEqual(page.errors,[]);

    page=await open('outra');
    assert.equal(await page.locator('#rental-title').innerText(),'Locação indisponível');
    assert.ok(!(await page.locator('#rental-content').isVisible()));
    page=await open('');
    assert.equal(await page.locator('#rental-title').innerText(),'Locação indisponível');

    for(const screen of ['contrato','registros','assinaturas']){
      await page.goto('https://qa.test/'+screen+'?locacao=nova');
      const back=page.locator('.topbar a',{hasText:'Voltar à locação'});
      assert.equal(await back.getAttribute('href'),'locacao-painel.html?locacao=nova',screen);
    }

    await page.goto('https://qa.test/locacoes');await page.locator('#rental-body tr').first().waitFor();
    assert.equal(await page.locator('#operation-dialog').count(),1);
    const row=page.locator('#rental-body tr',{hasText:'CLIENTE SEM EMAIL'});
    assert.equal(await row.locator('.table-actions button',{hasText:'Gerenciar etapas'}).count(),0);
    assert.equal(await page.locator('#rental-body tr',{hasText:'CLIENTE COM EMAIL'}).first().locator('.table-actions button',{hasText:'Encerrar'}).count(),1,'locação ativa com Encerrar na lista');assert.equal(await row.locator('.table-actions button',{hasText:'Encerrar'}).count(),0,'reservada sem Encerrar');
    await row.locator('.table-actions button',{hasText:'Abrir locação'}).click();
    await page.waitForURL('**/locacao-painel.html?locacao=nova');

    const form=async(viewport={width:1280,height:900})=>{const p=await open('nova',true,viewport);await p.goto('https://qa.test/locacoes');await p.locator('#rental-body tr').first().waitFor();await p.locator('#new-rental').click();await p.locator('#rental-dialog[open]').waitFor();return p;};
    page=await form();
    await page.locator('#rental-client-search').fill('com email');
    assert.equal(await page.locator('#rental-client').inputValue(),'comEmail');
    await page.locator('#rental-car-search').fill('gol');await page.locator('#rental-car-search').press('Enter');
    await page.waitForFunction(()=>document.querySelector('[name=valor_diaria]').value==='150');
    assert.equal(await page.locator('#rental-dialog[open]').count(),1,'Enter na busca não salva');
    await page.locator('[name=data_inicio]').fill('2026-11-05T20:00');
    await page.locator('[data-days="30"]').click();
    assert.equal(await page.locator('[name=data_fim]').inputValue(),'2026-12-05T20:00');
    await page.locator('[name=valor_caucao_pago]').fill('400');
    const summary=await page.locator('#rental-summary').innerText();
    assert.match(summary,/Contrato de 30 dias, até 05\/12\/2026/);assert.match(summary,/R\$\s4\.500,00/);assert.match(summary,/saldo de R\$\s1\.100,00 em 100x de R\$\s11,00/);assert.match(summary,/R\$\s161,00 por dia/);assert.match(summary,/abaixo de R\$ 1\.000/);
    await page.locator('[name=valor_caucao_pago]').fill('1000');
    assert.match(await page.locator('#rental-summary').innerText(),/dia seguinte à entrega/);
    await page.locator('[name=valor_caucao_pago]').fill('400');
    await page.locator('[name=data_fim]').fill('2026-11-20T20:00');
    assert.equal(await page.locator('[name=tempo_dias]').inputValue(),'15');
    assert.ok(!(await page.locator('#rental-form [name=observacoes]').isVisible()));
    await page.locator('#rental-summary').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,'locacao-formulario.png')});
    await page.locator('#save-rental').click();await page.waitForURL('**/locacao-painel.html?locacao=criada');
    const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('inserted')));
    assert.equal(saved.cliente_id,'comEmail');assert.equal(saved.carro_id,'c2');assert.equal(saved.status,'Reservada');assert.equal(saved.data_inicio,'2026-11-06T00:00:00.000Z');assert.equal(saved.data_fim,'2026-11-21T00:00:00.000Z');assert.equal(saved.valor_caucao_pago,400);assert.equal(saved.saldo_caucao,1100);assert.equal(saved.valor_parcela_caucao,11);assert.equal(saved.multa_atraso_percentual,11);assert.equal(saved.tempo_dias,undefined);
    page=await form({width:375,height:812});
    assert.ok(await page.evaluate(()=>{const d=document.querySelector('#rental-dialog');return d.scrollWidth<=d.clientWidth;}),'formulário sem rolagem lateral no celular');
    await page.screenshot({path:path.join(qa,'locacao-formulario-celular.png')});

    page=await open('entrega',true,{width:375,height:812});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=0,'sem rolagem lateral no celular: '+overflow);
    await page.screenshot({path:path.join(qa,'locacao-painel-celular.png'),fullPage:true});
    console.log('locacao-painel.browser ok');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
