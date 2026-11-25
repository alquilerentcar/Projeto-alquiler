// Tela da Oficina com banco simulado: nada chega ao Supabase real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');const {chromium}=require('playwright');
const qa=path.join(root,'tmp','qa');fs.mkdirSync(qa,{recursive:true});
const seed=()=>{
 window.calls=[];
 const produtos=[{id:'p3',descricao:'Mangueira sem código',codigo_barras:null,codigo_interno:null,unidade:'UN',saldo:2,estoque_minimo:0,custo_medio:10,localizacao:'C3',ativo:true},{id:'p1',descricao:'Sensor de combustível',codigo_barras:'7891234567895',codigo_interno:null,unidade:'UN',saldo:4,estoque_minimo:2,custo_medio:150,localizacao:'A1',ativo:true},
  {id:'p2',descricao:'Pastilha de freio',codigo_barras:'7890000000099',codigo_interno:null,unidade:'JG',saldo:1,estoque_minimo:2,custo_medio:80,localizacao:'B2',ativo:true}];
 const manutencoes=[{id:'m1',numero:1,placa:'QZA3C46',veiculo:'VW TERA',tipo:'corretiva',motivo:'Barulho na suspensão',status:'aberta',entrada_em:'2026-11-13T12:00:00Z',pecas:0,custo_pecas:0,valor_servicos:0,carro_id:'c1',responsavel_cliente_id:'cl1',responsavel_nome:'LOCATÁRIO FICTÍCIO'}];
 const servicos=[{id:'s1',descricao:'Alinhamento',categoria:'suspensao',valor_padrao:80}];
 let cobrada=false,orcStatus='em_elaboracao';
 const orc=()=>({empresa:{razao_social:'TEMPO DA MECANICA LTDA',cnpj:'11222333000181'},rateio:{corretiva:50,preventiva:0},
  manutencao:{...manutencoes[0],km:15010,orcamento_status:orcStatus,cobranca_debito_id:cobrada?'d1':null,cobrada_em:cobrada?'2026-11-14T12:00:00Z':null},veiculo:{placa:'QZA3C46',marca:'VW',modelo:'TERA',ano:2025,cor:'BRANCO'},responsavel:{nome:'LOCATÁRIO FICTÍCIO'},
  linhas:[{tipo:'peca',id:'x1',descricao:'Sensor de combustível',codigo:'7891234567895',unidade:'UN',quantidade:1,valor_unitario:150,total:150,natureza:'corretiva',motivo:'Sensor com defeito',pct_locatario:50,valor_locatario:75,valor_empresa:75},
   ...window.calls.filter(c=>c.name==='oficina_servico_lancar').map((c,i)=>({tipo:'servico',id:'sv'+i,descricao:c.args.p_dados.descricao,categoria:c.args.p_dados.categoria,externo:c.args.p_dados.externo,fornecedor:c.args.p_dados.fornecedor,quantidade:c.args.p_dados.quantidade,valor_unitario:c.args.p_dados.valor_unitario,total:c.args.p_dados.valor_unitario*c.args.p_dados.quantidade,natureza:c.args.p_dados.natureza||'corretiva',pct_locatario:c.args.p_dados.natureza==='preventiva'?0:50,valor_locatario:c.args.p_dados.valor_unitario*(c.args.p_dados.natureza==='preventiva'?0:.5)}))],
  totais:{pecas:150,servicos:0,geral:150,locatario:75,empresa:75}});
 const q=()=>{const b={select(){return b},eq(){return b},in(){return b},order(){return b},range(){return b},limit(){return b},single(){return Promise.resolve({data:null})},maybeSingle(){return Promise.resolve({data:null})},then(r){r({data:[],error:null})}};return b;};
 window.uploads=[];window.db={from:q,storage:{from:b=>({download:async()=>({data:null,error:{message:'sem arquivo'}}),upload:async(path,file)=>{window.uploads.push({b,path,size:file.size});return {data:{path},error:null};},createSignedUrl:async()=>({data:{signedUrl:'about:blank'},error:null}),createSignedUrls:async ps=>({data:ps.map(p=>({path:p,signedUrl:'about:blank'})),error:null})})},async rpc(name,args){window.calls.push({name,args});
  if(name==='oficina_vistorias_resumo'){const r={};for(const v of (window.vist||[]))(r[v.manutencao_id]??={})[v.tipo]=true;return {data:r,error:null};}
  if(name==='oficina_vistorias')return {data:(window.vist||[]).filter(v=>v.manutencao_id===args.p_manutencao),error:null};
  if(name==='oficina_vistoria_salvar'){window.vist=(window.vist||[]).filter(v=>!(v.manutencao_id===args.p_manutencao&&v.tipo===args.p_tipo));const v={manutencao_id:args.p_manutencao,tipo:args.p_tipo,...args.p_dados,km:Number(String(args.p_dados.km).replace(/\D/g,'')),criado_em:'2026-11-23T12:00:00Z'};window.vist.push(v);return {data:v,error:null};}
  if(name==='oficina_painel')return {data:{rateio:{corretiva:50,preventiva:0},analista:true,produtos,servicos,manutencoes,frota_em_manutencao:[{periodo_id:'x',carro_id:'c2',placa:'QZF4G04',veiculo:'VW TERA',desde:'2026-11-12T10:00:00Z',empresa:'ALQUILER'}]},error:null};
  if(name==='oficina_produto_buscar')return {data:produtos.find(p=>p.codigo_barras===args.p_codigo)||null,error:null};
  if(name==='oficina_produto_salvar'){const p={id:'novo'+produtos.length,saldo:0,custo_medio:0,ativo:true,...args.p_dados};produtos.push(p);return {data:p,error:null};}
  if(name==='oficina_entrada')return {data:args.p_itens.map(i=>({descricao:produtos.find(p=>p.id===i.produto_id).descricao,quantidade:i.quantidade,saldo:i.quantidade})),error:null};
  if(name==='oficina_nota_conferir')return {data:{importada:null,codigos:{}},error:null};
  if(name==='oficina_notas_lista')return {data:[{id:'n1',chave:'13261122763502005842552210001214601001214614',numero:'121460',serie:'221',emitente_cnpj:'22763502005842',emitente_nome:'DISTRIBUIDORA FICTÍCIA',emissao:'2026-11-23',valor_total:699.21,valor_produtos:699.21,frete:0,desconto:0,natureza_operacao:'VENDA',origem:'xml',tem_xml:true,criado_em:'2026-11-23T14:00:00Z',criado_por:'ANA',
   itens:[{n:1,descricao:'TENSOR TENSIONADOR',codigo_fornecedor:'10025600273',ean:'7898598389552',produto:'Sensor de combustível',marca:'Dayco',quantidade:3,unidade:'UN',custo_unitario:198.93,valor_total:596.79},{n:2,descricao:'CORREIA ALTERNADOR',codigo_fornecedor:'10622600586',produto:'Pastilha de freio',quantidade:3,unidade:'UN',custo_unitario:34.14,valor_total:102.42}]},
   {id:'n2',chave:null,numero:'5580',serie:null,emitente_cnpj:null,emitente_nome:'LOJA FICTÍCIA',emissao:'2026-11-20',valor_total:20,origem:'manual',tem_xml:false,criado_em:'2026-11-20T14:00:00Z',itens:[{descricao:'Filtro',produto:'Mangueira sem código',quantidade:2,custo_unitario:10}]}],error:null};
  if(name==='oficina_nota_xml')return {data:'<nfeProc/>',error:null};
  if(name==='oficina_nota_importar')return {data:args.p_itens.map(i=>({descricao:produtos.find(p=>p.id===i.produto_id).descricao,quantidade:i.quantidade,saldo:i.quantidade})),error:null};
  if(name==='oficina_saida')return {data:args.p_itens.map(i=>({movimento_id:'mov-'+i.produto_id,descricao:produtos.find(p=>p.id===i.produto_id).descricao,quantidade:i.quantidade,saldo:0})),error:null};
  if(name==='oficina_foto_registrar')return {data:{concluida:false},error:null};
  if(name==='oficina_fotos_pendentes')return {data:args.p_manutencao?[]:[{movimento_id:'mov-x',produto:'Sensor de combustível',quantidade:1,unidade:'UN',placa:'XAA1A11',manutencao:4,tem_nova:true,tem_antiga:false}],error:null};
  if(name==='oficina_fotos_lista')return {data:[{movimento_id:'x1',tipo:'nova',arquivo_path:'tempo/x1/nova.jpg',produto:'Sensor de combustível'},{movimento_id:'x1',tipo:'antiga',arquivo_path:null,justificativa:'Peça antiga descartada',produto:'Sensor de combustível'}],error:null};
  if(name==='oficina_orcamento_enviar'){orcStatus='aguardando_aprovacao';manutencoes[0].orcamento_status=orcStatus;return {data:{},error:null};}
  if(name==='oficina_orcamento_decidir'){orcStatus=args.p_aprovar?'aprovado':'reprovado';manutencoes[0].orcamento_status=orcStatus;return {data:{},error:null};}
  if(name==='oficina_aprovadores_lista')return {data:[{auth_user_id:'u1',nome:'ADMIN',administrador:true,analista:false},{auth_user_id:'u2',nome:'ANA ANALISTA',cargo:'Analista',administrador:false,analista:false}],error:null};
  if(name==='oficina_aprovador_definir')return {data:null,error:null};
  if(name==='oficina_produto_gerar_codigo'){const p=produtos.find(x=>x.id===args.p_produto);p.codigo_barras='2000000000015';return {data:{...p},error:null};}
  if(name==='oficina_estoque_resumo')return {data:{patrimonio:[{categoria:'revenda',itens:1,unidades:20,valor_custo:12,valor_venda:20,sem_preco:0},{categoria:'pecas',itens:2,unidades:5,valor_custo:680,valor_venda:null,sem_preco:0}],periodo:[{tipo:'entrada',situacao:null,movimentos:1,unidades:40,valor_custo:24,valor_venda:null},{tipo:'saida',situacao:'revenda',movimentos:1,unidades:15,valor_custo:9,valor_venda:15},{tipo:'saida',situacao:'devolucao',movimentos:1,unidades:2,valor_custo:1.2,valor_venda:null}],revenda:[{produto:'Paçoca',unidade:'UN',saldo:20,custo_medio:0.6,preco_venda:1,entrou:40,vendido:15,receita:15,custo_vendido:9,lucro:6}]},error:null};
  if(name==='oficina_empresas_atendidas_lista')return {data:[{empresa_id:'alq',nome:'ALQUILER RENT A CAR',atendida:false,pode_alterar:true}],error:null};
  if(name==='oficina_empresa_atendida_definir')return {data:null,error:null};
  if(name==='oficina_financeiro')return {data:[{id:'m1',numero:1,placa:'QZA3C46',veiculo:'VW TERA',tipo:'corretiva',orcamento_status:'aprovado',entrada_em:'2026-11-13T12:00:00Z',responsavel:'LOCATÁRIO FICTÍCIO',cobrada_em:'2026-11-14T12:00:00Z',totais:{geral:350,pecas:150,servicos:200,locatario:175,empresa:175}},
   {id:'m2',numero:2,placa:'QZF4G04',veiculo:'VW TERA',tipo:'preventiva',orcamento_status:'em_elaboracao',entrada_em:'2026-11-15T12:00:00Z',responsavel:'OUTRO',cobrada_em:null,totais:{geral:100,pecas:100,servicos:0,locatario:40,empresa:60}},
   {id:'m3',numero:3,placa:'XYZ9A87',veiculo:'GOL',tipo:'corretiva',orcamento_status:'aprovado',entrada_em:'2026-11-16T12:00:00Z',responsavel:null,cliente_externo:'JOÃO',cobrada_em:null,totais:{geral:80,pecas:0,servicos:80,locatario:0,empresa:80}}],error:null};
  if(name==='oficina_veiculos')return {data:[{carro_id:'c2',placa:'QZF4G04',veiculo:'VW TERA 2025',empresa:'ALQUILER',ultimo_km:15000}],error:null};
  if(name==='oficina_manutencao_abrir')return {data:{id:'m2',numero:2,placa:'QZF4G04'},error:null};
  if(name==='oficina_orcamento')return {data:orc(),error:null};
  if(name==='oficina_responsaveis_sugeridos')return {data:[{cliente_id:'cl1',nome:'LOCATÁRIO FICTÍCIO',atual:true},{cliente_id:'cl2',nome:'LOCATÁRIO ANTERIOR',atual:false}],error:null};
  if(name==='oficina_servico_lancar')return {data:{id:'sv'},error:null};
  if(name==='oficina_cobrar_locatario'){cobrada=true;return {data:{debito_id:'d1',valor:75,locatario:'LOCATÁRIO FICTÍCIO'},error:null};}
  if(name==='oficina_servico_salvar'){servicos.push({id:'s2',...args.p_dados});return {data:{id:'s2'},error:null};}
  if(name==='oficina_movimentos_lista')return {data:[{tipo:'entrada',quantidade:4,saldo_depois:4,criado_em:'2026-11-10T12:00:00Z',documento:'NF 1234'},{tipo:'saida',quantidade:-1,saldo_depois:3,placa:'XAA1A11',manutencao:1,natureza:'corretiva',responsavel:'ANA',criado_em:'2026-11-11T12:00:00Z'},{tipo:'saida',quantidade:-1,saldo_depois:2,placa:'YBB2B22',manutencao:2,natureza:'preventiva',criado_em:'2026-11-12T12:00:00Z'},{tipo:'saida',quantidade:-1,saldo_depois:1,placa:'ZCC3C33',manutencao:3,natureza:'corretiva',criado_em:'2026-11-13T12:00:00Z'}],error:null};
  if(name==='oficina_saida_avulsa')return {data:args.p_itens.map(i=>({descricao:produtos.find(p=>p.id===i.produto_id).descricao,quantidade:i.quantidade})),error:null};
  if(name==='oficina_movimentos_relatorio')return {data:[{id:'e1',tipo:'entrada',criado_em:'2026-11-20T12:00:00Z',produto:'Sensor de combustível',unidade:'UN',quantidade:2,valor:300,saldo_depois:2,documento:'NF 9'},
   {id:'s1',tipo:'saida',destino:'manutencao',criado_em:'2026-11-21T12:00:00Z',produto:'Sensor de combustível',unidade:'UN',quantidade:-1,valor:150,saldo_depois:1,placa:'QZA3C46',manutencao:1,natureza:'corretiva'},
   {id:'s2',tipo:'saida',destino:'uso_consumo',destino_descricao:'Limpeza da oficina',criado_em:'2026-11-22T12:00:00Z',produto:'Estopa',unidade:'UN',quantidade:-3,valor:6,saldo_depois:7}],error:null};
  if(name==='oficina_movimentos_cobranca')return {data:[{id:'s1',natureza:'avaria',total:210,pct_locatario:100,valor_locatario:210,valor_empresa:0,responsavel:'LOCATÁRIO FICTÍCIO',situacao:'aprovado'}],error:null};
  return {data:null,error:null};}};
};
const routes=page=>page.route('https://qa.test/**',route=>{
 const f=new URL(route.request().url()).pathname.slice(1);
 if(f==='oficina'){const html=fs.readFileSync(root+'/oficina.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('oficina.js')?s:'');return route.fulfill({contentType:'text/html',body:html});}
 if(f==='auth-guard.js')return route.fulfill({contentType:'text/javascript',body:'export async function requireAuth(){};export function bindLogout(){};'});
 const file=f.split('?')[0];
 if(file&&fs.existsSync(root+'/'+file)&&!file.includes('..'))return route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(root+'/'+file,'utf8').replace(/import \{createClient\} from ['"]https:\/\/esm.sh\/@supabase\/supabase-js@2['"];?/,'const createClient=()=>window.db;')});
 return route.fulfill({body:''});
});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 try{
  const open=async(q)=>{const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true}),page=await context.newPage();page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
   await page.addInitScript(()=>{window.alquilerContext={company:{id:'tempo',razao_social:'TEMPO DA MECANICA LTDA',nome_fantasia:'TEMPO DA MECÂNICA',cnpj:'11222333000181'},canManageCompany:true,user:{nome:'TESTE'},modules:['locacao']};});await page.addInitScript(seed);await routes(page);
   await page.goto('https://qa.test/oficina?'+q);await page.locator('#oficina section.panel').first().waitFor();return page;};
  // O leitor de código de barras digita rápido e aperta Enter.
  const ler=async(page,codigo)=>{const s=page.getByLabel('Código de barras');await s.pressSequentially(codigo,{delay:5});await s.press('Enter');};

  // Entrada sem nota: lê duas vezes a mesma peça (soma), cadastra peça nova pelo código lido.
  let page=await open('secao=entrada');
  await ler(page,'7891234567895');await page.getByLabel('Quantidade de Sensor de combustível').waitFor();await ler(page,'7891234567895');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Quantidade de Sensor de combustível"]').value==='2');
  await ler(page,'7899999999999');await page.getByText('Peça não cadastrada: 7899999999999').waitFor();
  await page.getByLabel('Descrição').fill('Correia dentada');await page.locator('#oficina button',{hasText:'Cadastrar peça'}).click();
  await page.getByLabel('Quantidade de Correia dentada').waitFor();await page.getByLabel('Custo de Sensor de combustível').fill('152,50');await page.getByLabel('Marca de Correia dentada').fill('');
  await page.locator('#oficina button',{hasText:'Registrar entrada'}).click();await page.waitForFunction(()=>/Entrada registrada/.test(document.querySelector('#oficina .flow-note').textContent));
  let call=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_entrada').args);assert.deepEqual(call.p_itens.map(i=>[i.quantidade,i.custo_unitario,i.marca]),[[2,152.5,null],[1,null,null]]);

  // Entrada com nota: importa o XML, liga pelo código de barras, cadastra os itens novos e dá entrada de tudo.
  await page.locator('#oficina input[type=file]').setInputFiles(path.join(__dirname,'fixtures','nfe-ficticia.xml'));
  await page.getByText('NF 1234 série 1').waitFor();assert.match(await page.locator('#oficina .ofi-nf').innerText(),/pelo código de barras/);
  assert.equal(await page.getByLabel('Peça para SENSOR DE COMBUSTIVEL').inputValue(),'p1');assert.equal(await page.getByLabel('Peça para OLEO 5W30 SINTETICO').inputValue(),'');
  assert.match(await page.locator('#oficina .ofi-nf').innerText(),/Fornecedor: .+ · CNPJ \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  assert.equal(await page.getByLabel('Preço de compra de SENSOR DE COMBUSTIVEL').inputValue(),'150');
  await page.getByLabel('Marca de SENSOR DE COMBUSTIVEL').fill('Bosch');await page.getByLabel('Preço de compra de SENSOR DE COMBUSTIVEL').fill('149,90');
  // Peça nova da nota: o código de barras é informado por quem lança (vem preenchido com o da nota, quando houver).
  assert.equal(await page.getByLabel('Código de barras da peça nova FILTRO DE AR "PREMIUM"').inputValue(),'7890000000017');
  assert.equal(await page.getByLabel('Código de barras da peça nova SENSOR DE COMBUSTIVEL').isHidden(),true,'peça já ligada não pede código');
  await page.getByLabel('Código de barras da peça nova OLEO 5W30 SINTETICO').fill('7891234567895');await page.locator('#oficina button',{hasText:'Dar entrada da nota'}).click();
  assert.match(await page.locator('#oficina .ofi-nf .ofi-erro').innerText(),/já é da peça "Sensor de combustível"/);
  await page.getByLabel('Código de barras da peça nova OLEO 5W30 SINTETICO').fill('78A');await page.locator('#oficina button',{hasText:'Dar entrada da nota'}).click();
  assert.match(await page.locator('#oficina .ofi-nf .ofi-erro').innerText(),/só números/);
  await page.getByLabel('Código de barras da peça nova OLEO 5W30 SINTETICO').fill('7891111111111');
  await page.getByLabel('Quantidade que já saiu de SENSOR DE COMBUSTIVEL').fill('9');await page.getByLabel('Carro que usou SENSOR DE COMBUSTIVEL').selectOption('m1');
  await page.locator('#oficina button',{hasText:'Dar entrada da nota'}).click();assert.match(await page.locator('#oficina .ofi-nf .ofi-erro').innerText(),/Saiu mais SENSOR DE COMBUSTIVEL do que veio na nota/);
  await page.getByLabel('Quantidade que já saiu de SENSOR DE COMBUSTIVEL').fill('1');
  await page.screenshot({path:path.join(qa,'oficina-nf.png'),fullPage:true});
  await page.locator('#oficina button',{hasText:'Dar entrada da nota'}).click();await page.waitForFunction(()=>/NF 1234 importada/.test(document.querySelector('#oficina .flow-note').textContent));
  call=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_nota_importar').args);
  assert.equal(call.p_nota.chave,'13261111222333000181550010000012341000012345');assert.equal(call.p_itens.length,3);assert.deepEqual({produto_id:call.p_itens[0].produto_id,quantidade:call.p_itens[0].quantidade,custo_unitario:call.p_itens[0].custo_unitario,marca:call.p_itens[0].marca,codigo_fornecedor:call.p_itens[0].codigo_fornecedor},{produto_id:'p1',quantidade:4,custo_unitario:149.9,marca:'Bosch',codigo_fornecedor:'SC-445'});
  assert.equal(call.p_nota.origem,'xml');assert.match(call.p_nota.xml,/<infNFe/);assert.ok(call.p_itens[0].descricao);assert.equal(call.p_itens[0].unidade,'UN');
  const nfSaida=await page.evaluate(()=>window.calls.filter(c=>c.name==='oficina_saida').map(c=>c.args));assert.equal(nfSaida.length,1);
  assert.equal(nfSaida[0].p_manutencao,'m1');assert.deepEqual(nfSaida[0].p_itens,[{produto_id:'p1',quantidade:1,natureza:'corretiva'}]);assert.match(nfSaida[0].p_observacao,/NF 1234/);
  assert.match(await page.locator('#oficina .flow-note').innerText(),/Saída para QZA3C46: .+ -1/);
  // Nota em papel: digitada com número, emissão e fornecedor fica registrada como nota.
  {const p2=await open('secao=entrada');await ler(p2,'7891234567895');await p2.getByLabel('Quantidade de Sensor de combustível').waitFor();
   await p2.getByLabel('Nº da nota fiscal').fill('5580');await p2.locator('#oficina button',{hasText:'Registrar entrada'}).click();
   assert.match(await p2.locator('#oficina .ofi-erro').last().innerText(),/informe a data de emissão e o fornecedor/);
   await p2.getByLabel('Emissão da nota').fill('2026-11-20');await p2.getByLabel('Fornecedor',{exact:true}).fill('Loja Fictícia');await p2.locator('#oficina button',{hasText:'Registrar entrada'}).click();
   assert.match(await p2.locator('#oficina .ofi-erro').last().innerText(),/preço de compra \(por unidade\) de: Sensor de combustível/);
   await p2.getByLabel('Custo de Sensor de combustível').fill('10');await p2.getByLabel('Chave de acesso (se tiver)').fill('123');await p2.locator('#oficina button',{hasText:'Registrar entrada'}).click();
   assert.match(await p2.locator('#oficina .ofi-erro').last().innerText(),/44 números/);await p2.getByLabel('Chave de acesso (se tiver)').fill('');
   await p2.locator('#oficina button',{hasText:'Registrar entrada'}).click();await p2.waitForFunction(()=>/NF 5580 lançada/.test(document.querySelector('#oficina .flow-note').textContent));
   const mc=await p2.evaluate(()=>window.calls.find(c=>c.name==='oficina_nota_importar').args);
   assert.deepEqual([mc.p_nota.origem,mc.p_nota.numero,mc.p_nota.emissao,mc.p_nota.emitente_nome,mc.p_nota.chave,mc.p_nota.valor_total],['manual','5580','2026-11-20','Loja Fictícia',null,10]);
   assert.deepEqual([mc.p_itens[0].produto_id,mc.p_itens[0].quantidade,mc.p_itens[0].custo_unitario,mc.p_itens[0].descricao,mc.p_itens[0].valor_total],['p1',1,10,'Sensor de combustível',10]);
   assert.ok(!(await p2.evaluate(()=>window.calls.some(c=>c.name==='oficina_entrada'))));assert.deepEqual(p2.errors,[]);await p2.context().close();}
  // Aba Notas fiscais: lista, resumo, itens da nota e XML guardado.
  {const p3=await open('secao=notas');await p3.getByText('121460 / 221').waitFor();
   const txt=await p3.locator('#oficina').innerText();assert.match(txt,/Total das notas\s*R\$\s*719,21/);assert.match(txt,/22\.763\.502\/0058-42/);assert.match(txt,/Digitada/);
   await p3.locator('#oficina tr',{hasText:'121460'}).getByRole('button',{name:'Ver itens'}).click();await p3.getByText('TENSOR TENSIONADOR').waitFor();
   const det=await p3.locator('#oficina .ofi-nf').innerText();assert.match(det,/Chave de acesso: 13261122763502005842552210001214601001214614/);assert.match(det,/Dayco/);assert.match(det,/198,93/);assert.match(det,/596,79/);assert.match(det,/por ANA/);
   const dl=p3.waitForEvent('download');await p3.locator('#oficina button',{hasText:'Baixar XML'}).click();assert.match((await dl).suggestedFilename(),/^NFe-1326.*\.xml$/);
   await p3.getByLabel('Buscar nota').fill('correia');assert.equal(await p3.locator('#oficina tbody tr').first().locator('td').nth(1).innerText(),'121460 / 221');
   await p3.screenshot({path:path.join(qa,'oficina-notas.png'),fullPage:true});assert.deepEqual(p3.errors,[]);await p3.context().close();}
  const novas=await page.evaluate(()=>window.calls.filter(c=>c.name==='oficina_produto_salvar').map(c=>c.args.p_dados));assert.ok(novas.some(n=>n.descricao==='OLEO 5W30 SINTETICO'&&n.codigo_barras==='7891111111111'&&n.unidade==='LT'));
  assert.deepEqual(page.errors,[]);

  // Saída: motivo obrigatório, quem paga aparece, estoque não fica negativo.
  page=await open('secao=saida&manutencao=m1');assert.match(await page.locator('#oficina').innerText(),/Locatário responsável: LOCATÁRIO FICTÍCIO\. Corretiva: 50% locatário e 50% empresa\. Preventiva: 100% empresa/);
  await ler(page,'7890000000099');await page.getByLabel('Quantidade de Pastilha de freio').waitFor();
  await page.getByLabel('Quantidade de Pastilha de freio').fill('2');await page.locator('#oficina button',{hasText:'Registrar saída'}).click();
  const errSaida=await page.locator('#oficina .ofi-erro').last().innerText();assert.match(errSaida,/Estoque insuficiente de Pastilha de freio: tem 1, pediu 2/);assert.match(errSaida,/motivo da retirada/);
  await page.getByLabel('Quantidade de Pastilha de freio').fill('1');await page.getByLabel('Corretiva ou preventiva · Pastilha de freio').selectOption('preventiva');
  await page.getByLabel('Motivo da retirada (por que a peça saiu)').fill('Pastilha gasta na revisão');
  await page.locator('#oficina button',{hasText:'Registrar saída'}).click();await page.waitForFunction(()=>/Saída registrada para QZA3C46/.test(document.querySelector('#oficina .flow-note').textContent));
  call=await page.evaluate(()=>window.calls.findLast(c=>c.name==='oficina_saida').args);assert.equal(call.p_observacao,'Pastilha gasta na revisão');assert.deepEqual(call.p_itens,[{produto_id:'p2',quantidade:1,natureza:'preventiva'}]);
  // Operação só fecha com a foto da peça nova funcionando e a da antiga.
  const foto=path.join(qa,'peca-ficticia.png');fs.writeFileSync(foto,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64'));
  await page.getByLabel('Foto da peça nova funcionando · Pastilha de freio').setInputFiles(foto);await page.getByText('Foto da peça nova funcionando: enviada').waitFor();
  page.once('dialog',d=>d.accept('Pastilha velha descartada'));await page.locator('#oficina button',{hasText:'Não há peça antiga'}).click();await page.getByText('Fotos completas').waitFor();
  const fotosReg=await page.evaluate(()=>window.calls.filter(c=>c.name==='oficina_foto_registrar').map(c=>c.args));
  assert.equal(fotosReg[0].p_movimento,'mov-p2');assert.equal(fotosReg[0].p_tipo,'nova');assert.match(fotosReg[0].p_path,/^tempo\/mov-p2\/nova-.+\.png$/);assert.equal(fotosReg[1].p_justificativa,'Pastilha velha descartada');
  assert.equal((await page.evaluate(()=>window.uploads))[0].b,'oficina-fotos');

  // Orçamento: responsável, serviço de fora, totais com rateio, PDF e cobrança.
  page=await open('secao=manutencoes');assert.match(await page.locator('#oficina tbody').innerText(),/LOCATÁRIO FICTÍCIO/);
  await page.locator('#oficina button',{hasText:'Orçamento'}).click();const dlg=page.locator('#oficina-dialog[open]');await dlg.getByText('Sensor com defeito',{exact:false}).waitFor();
  // Tela baixa: o conteúdo do orçamento rola e o cabeçalho continua visível.
  {await page.setViewportSize({width:1366,height:480});const r=await page.evaluate(()=>{const d=document.querySelector('#oficina-dialog'),b=d.querySelector(':scope>.dialog-body');b.scrollTop=10000;
   return {cabe:d.getBoundingClientRect().bottom<=innerHeight+1,rola:b.scrollHeight>b.clientHeight,desceu:b.scrollTop>0,topo:d.querySelector(':scope>.dialog-header').getBoundingClientRect().top>=0};});
   assert.deepEqual(r,{cabe:true,rola:true,desceu:true,topo:true});await page.setViewportSize({width:1366,height:900});await page.evaluate(()=>{document.querySelector('#oficina-dialog>.dialog-body').scrollTop=0;});}
  assert.match(await dlg.innerText(),/50% · R\$\s75,00/);assert.match(await dlg.innerText(),/Parte do locatário\s*R\$\s75,00/);
  await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="Locatário responsável"] option')].some(o=>/LOCATÁRIO ANTERIOR/.test(o.textContent)));
  await dlg.getByLabel('Descrição do serviço').fill('Carga de gás do ar');await dlg.getByLabel('Categoria').selectOption('ar_condicionado');await dlg.getByLabel('Corretiva / preventiva').selectOption('preventiva');
  await dlg.getByLabel('Valor (R$)').fill('200');await dlg.getByRole('checkbox',{name:'Serviço de fora'}).check();await dlg.getByLabel('Quem fez (serviço de fora)').fill('CARECA AR');
  await dlg.locator('button',{hasText:'Lançar serviço'}).click();await dlg.getByText('Carga de gás do ar (CARECA AR)',{exact:false}).waitFor();
  call=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_servico_lancar').args.p_dados);assert.deepEqual([call.externo,call.fornecedor,call.natureza,call.valor_unitario],[true,'CARECA AR','preventiva',200]);
  await page.screenshot({path:path.join(qa,'oficina-orcamento.png'),fullPage:true});
  // PDF no papel timbrado (biblioteca de PDF baixada da internet; sem internet o teste avisa e segue).
  const [down]=await Promise.all([page.waitForEvent('download',{timeout:20000}).catch(()=>null),dlg.locator('button',{hasText:'Gerar orçamento'}).click()]);
  if(down){const pdf=fs.readFileSync(await down.path());assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.match(down.suggestedFilename(),/orcamento-00001-QZA3C46\.pdf/);fs.writeFileSync(path.join(qa,'orcamento-exemplo.pdf'),pdf);}
  else console.log('Aviso: PDF não gerado (sem acesso à biblioteca pdf-lib):',await dlg.locator('.ofi-erro').innerText());
  assert.match(await dlg.innerText(),/Peça antiga descartada/,'fotos aparecem no orçamento');assert.match(await dlg.innerText(),/Em elaboração/);
  await dlg.locator('button',{hasText:'Enviar para aprovação'}).click();await dlg.getByText('Aguardando aprovação').waitFor();
  assert.equal(await dlg.locator('button',{hasText:'Lançar serviço'}).count(),0,'enviado não aceita lançamentos');
  page.once('dialog',d=>d.accept());await dlg.locator('button',{hasText:'Aprovar orçamento'}).click();await dlg.locator('.ofi-badge.aprovado').waitFor();
  assert.equal(await dlg.getByLabel('Parcelas diárias').inputValue(),'2');await dlg.getByLabel('Parcelas diárias').fill('5');assert.match(await dlg.innerText(),/5 × R\$\s15,00 por dia/);
  page.once('dialog',d=>{assert.match(d.message(),/Lançar R\$\s75,00 para LOCATÁRIO FICTÍCIO em 5 parcela\(s\) diária\(s\)/);d.accept();});
  await dlg.locator('button',{hasText:'Lançar na locação do locatário'}).click();await page.waitForFunction(()=>/lançados na locação de LOCATÁRIO FICTÍCIO em 5 parcela/.test(document.querySelector('#oficina .flow-note').textContent));
  const cobArgs=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_cobrar_locatario').args);assert.equal(cobArgs.p_parcelas,5);assert.match(cobArgs.p_primeiro,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(await dlg.locator('button',{hasText:'Lançar na locação'}).count(),0,'depois de cobrar, some');
  assert.deepEqual(page.errors,[]);

  // Fotos pendentes e aprovações.
  // Ordem de serviço: relatório de entrada (KM, combustível, itens, avarias, fotos), saída e impressão.
  page=await open('secao=manutencoes');assert.match(await page.locator('#oficina tbody').innerText(),/falta relatório de entrada/);
  await page.locator('#oficina button',{hasText:'Relatório de entrada'}).click();let dv=page.locator('#oficina-dialog[open]');
  await dv.getByLabel('KM').fill('15.020');await dv.getByLabel('Combustível').selectOption({label:'1/2'});await dv.getByLabel('Estepe').check();await dv.getByLabel('Documento (CRLV)').check();
  await dv.getByLabel('Avarias').fill('Risco no para-choque');await dv.getByLabel('Fotos do carro').setInputFiles(foto);await dv.getByText('1 foto(s) do carro enviada(s).').waitFor();
  await dv.locator('button',{hasText:'Salvar relatório'}).click();await page.getByText('Relatório de entrada da manutenção #1 salvo.').waitFor();
  let vc=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_vistoria_salvar').args);
  assert.deepEqual([vc.p_tipo,vc.p_dados.km,vc.p_dados.combustivel,vc.p_dados.itens.estepe,vc.p_dados.itens.macaco,vc.p_dados.avarias],['entrada','15.020',4,true,false,'Risco no para-choque']);
  assert.match(vc.p_dados.fotos[0],/^tempo\/vistoria\/m1\/entrada-/);assert.match(await page.locator('#oficina tbody').innerText(),/falta relatório de saída/);
  await page.locator('#oficina button',{hasText:'Relatório de saída'}).click();dv=page.locator('#oficina-dialog[open]');
  assert.equal(await dv.getByLabel('KM').getAttribute('placeholder'),'Na entrada: 15.020');assert.equal(await dv.getByLabel('Estepe').isChecked(),true,'itens da entrada já vêm marcados');
  await dv.getByLabel('KM').fill('15032');await dv.getByLabel('Combustível').selectOption({label:'1/2'});await dv.getByLabel('Observação').fill('Trocado o sensor; voltar em 10 mil km');
  await dv.getByLabel('Fotos do carro').setInputFiles(foto);await dv.getByText('1 foto(s) do carro enviada(s).').waitFor();await dv.locator('button',{hasText:'Salvar relatório'}).click();
  await page.getByText('Relatório de saída da manutenção #1 salvo.').waitFor();assert.doesNotMatch(await page.locator('#oficina tbody').innerText(),/falta relatório/);
  const [osPag]=await Promise.all([page.waitForEvent('popup'),page.locator('#oficina button',{hasText:'Imprimir OS'}).click()]);
  await osPag.getByText('ORDEM DE SERVIÇO').waitFor();const osTxt=await osPag.locator('body').innerText();
  for(const t of [/Nº 00001/,/Relatório de entrada/,/15\.020/,/Risco no para-choque/,/Sensor de combustível/,/Relatório de saída/,/voltar em 10 mil km/,/Mecânico responsável/])assert.match(osTxt,t);
  await osPag.screenshot({path:path.join(qa,'ordem-servico.png'),fullPage:true});await osPag.close();assert.deepEqual(page.errors,[]);

  page=await open('secao=fotos');await page.getByText('Sensor de combustível · 1 UN · XAA1A11 · manutenção #4').waitFor();assert.match(await page.locator('#oficina').innerText(),/Foto da peça nova funcionando: enviada/);
  page=await open('secao=aprovacoes');assert.match(await page.locator('#oficina').innerText(),/Nenhum orçamento aguardando aprovação/);

  // Estoque: resumo com patrimônio, entradas/saídas e revenda.
  page=await open('secao=estoque');await page.getByText('Patrimônio por categoria').waitFor();const resumo=await page.locator('#oficina').innerText();
  assert.match(resumo,/Patrimônio em estoque \(a custo\)\s*R\$\s692,00/);assert.match(resumo,/Lucro da revenda\s*R\$\s6,00/);assert.match(resumo,/Devolução ao fornecedor/);assert.match(resumo,/Paçoca[\s\S]*40%/);
  await page.screenshot({path:path.join(qa,'oficina-resumo-estoque.png'),fullPage:true});
  // Estoque: histórico mostra cada carro que usou o sensor e quanto resta.
  page=await open('secao=estoque');await page.locator('#oficina tbody tr',{hasText:'Sensor de combustível'}).locator('button',{hasText:'Histórico'}).click();
  await page.locator('#oficina-dialog').getByText('Saíram 3 para 3 carro(s)',{exact:false}).waitFor();const hist=await page.locator('#oficina-dialog').innerText();
  assert.match(hist,/Em estoque: 4 UN/);assert.match(hist,/XAA1A11 · 1 UN · manutenção #1/);assert.match(hist,/YBB2B22/);assert.match(hist,/ZCC3C33/);
  // Peça sem código: gera o código de barras e imprime a etiqueta na impressora de cupom.
  await page.keyboard.press('Escape');await page.locator('#oficina tbody tr',{hasText:'Mangueira sem código'}).locator('button',{hasText:'Gerar código de barras'}).click();
  const dlgEtq=page.locator('#oficina-dialog[open]');await dlgEtq.getByText('Imprimir etiqueta').first().waitFor();
  assert.equal(await dlgEtq.getByLabel('Impressora').inputValue(),'bobina80');assert.equal(await dlgEtq.getByLabel('Cópias · Mangueira sem código').inputValue(),'2','uma por unidade em estoque');
  const [janela]=await Promise.all([page.context().waitForEvent('page'),dlgEtq.locator('button',{hasText:'Imprimir'}).click()]);
  await janela.waitForLoadState();const etq=await janela.content();assert.match(etq,/size:80mm 40mm/);assert.equal((etq.match(/class="etq"/g)||[]).length,2);assert.match(etq,/aria-label="Código de barras 2000000000015"/);
  await janela.screenshot({path:path.join(qa,'etiqueta-cupom.png')});await janela.close();
  assert.equal(await page.locator('#oficina tbody tr',{hasText:'Mangueira sem código'}).locator('button',{hasText:'Imprimir etiqueta'}).count(),1,'depois de gerar, vira imprimir');
  assert.deepEqual(page.errors,[]);

  // Serviços: catálogo e rateio.
  page=await open('secao=servicos');assert.match(await page.locator('#oficina').innerText(),/Alinhamento[\s\S]*Suspensão[\s\S]*80,00/);assert.match(await page.locator('#oficina').innerText(),/Preventiva: 100% empresa/);
  await page.getByLabel('Analista · ANA ANALISTA').check();await page.waitForFunction(()=>/ANA ANALISTA agora aprova/.test(document.querySelector('#oficina .flow-note').textContent));
  await page.getByLabel('Serviço',{exact:true}).fill('Higienização completa');await page.getByLabel('Categoria').selectOption('higienizacao');await page.getByLabel('Valor padrão (R$)').fill('150');
  await page.locator('#oficina button',{hasText:'Cadastrar serviço'}).click();await page.waitForFunction(()=>/Serviço cadastrado/.test(document.querySelector('#oficina .flow-note').textContent));
  call=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_servico_salvar').args.p_dados);assert.deepEqual(call,{descricao:'Higienização completa',categoria:'higienizacao',valor_padrao:150});
  assert.match(await page.locator('#oficina').innerText(),/Empresas atendidas pela oficina[\s\S]*ALQUILER RENT A CAR/);
  await page.getByLabel('Atende · ALQUILER RENT A CAR').check();await page.waitForFunction(()=>/A oficina agora atende ALQUILER RENT A CAR/.test(document.querySelector('#oficina .flow-note').textContent));
  assert.deepEqual(page.errors,[]);

  // Financeiro da manutenção dentro do módulo Oficina.
  page=await open('secao=financeiro');await page.locator('#oficina .metric').first().waitFor();
  const fin=await page.locator('#oficina').innerText();
  assert.match(fin,/Parte da empresa\s*R\$\s235,00/);assert.match(fin,/Total das manutenções\s*R\$\s530,00/);assert.match(fin,/Parte dos locatários\s*R\$\s215,00/);assert.match(fin,/Já lançado na locação\s*R\$\s175,00/);assert.match(fin,/Falta cobrar do locatário\s*R\$\s40,00/);assert.match(fin,/Clientes de fora\s*R\$\s80,00/);
  assert.match(fin,/JOÃO \(cliente de fora\)/);assert.match(fin,/QZA3C46 · 1 manutenção\(ões\) · total R\$\s350,00/);
  await page.screenshot({path:path.join(qa,'oficina-financeiro.png'),fullPage:true});
  assert.deepEqual(page.errors,[]);
  // Mudar o tipo da manutenção aberta (corretiva → batida), com motivo.
  page=await open('secao=manutencoes');await page.locator('#oficina button',{hasText:'Mudar tipo'}).first().click();
  await page.getByLabel('Novo tipo').selectOption('avaria');await page.locator('#oficina-dialog button',{hasText:'Mudar tipo'}).click();
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='oficina_manutencao_tipo').length),0,'motivo obrigatório');
  await page.getByLabel('Por que mudou').fill('Na verdade bateu o carro');await page.locator('#oficina-dialog button',{hasText:'Mudar tipo'}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.name==='oficina_manutencao_tipo'));
  assert.deepEqual(await page.evaluate(()=>{const a=window.calls.find(c=>c.name==='oficina_manutencao_tipo').args;return [a.p_manutencao,a.p_tipo,a.p_motivo];}),['m1','avaria','Na verdade bateu o carro']);
  // Retirar peça para uso e consumo: sem carro, com descrição.
  page=await open('secao=saida');await page.getByLabel('Para onde vai').selectOption('uso_consumo');
  assert.equal(await page.getByLabel('Manutenção').isVisible(),false);
  await ler(page,'7890000000099');await page.getByLabel('Quantidade de Pastilha de freio').waitFor();
  await page.locator('#oficina button',{hasText:'Registrar saída'}).click();assert.match(await page.locator('#oficina .ofi-erro').last().innerText(),/setor ou uso/i);
  await page.getByLabel('Descrição do destino').fill('Ferramenta do box 2');await page.locator('#oficina button',{hasText:'Registrar saída'}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.name==='oficina_saida_avulsa'));
  const av=await page.evaluate(()=>window.calls.find(c=>c.name==='oficina_saida_avulsa').args);assert.equal(av.p_destino,'uso_consumo');assert.equal(av.p_descricao,'Ferramenta do box 2');assert.deepEqual(av.p_itens,[{produto_id:'p2',quantidade:1}]);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='oficina_saida'&&!c.args.p_manutencao).length),0);
  // Relatório do período: marcar entradas e/ou saídas e ver o que será cobrado.
  page=await open('secao=movimentos');await page.getByText('Será cobrado').waitFor();
  let txt=await page.locator('#oficina').innerText();assert.match(txt,/R\$\s?210,00 de LOCATÁRIO FICTÍCIO \(100% de R\$\s?210,00\)/);assert.match(txt,/Batida \/ avaria/);assert.match(txt,/Aprovado, falta cobrar/);assert.match(txt,/R\$\s?210,00 a cobrar/);assert.match(txt,/Limpeza da oficina/);
  await page.getByLabel('Saídas',{exact:true}).uncheck();txt=await page.locator('#oficina table').innerText();assert.doesNotMatch(txt,/Limpeza da oficina/);assert.match(txt,/NF 9/);
  await page.getByLabel('Saídas',{exact:true}).check();await page.getByLabel('Entradas',{exact:true}).uncheck();txt=await page.locator('#oficina table').innerText();assert.doesNotMatch(txt,/NF 9/);assert.match(txt,/QZA3C46/);
  await page.screenshot({path:path.join(qa,'oficina-relatorio-periodo.png'),fullPage:true});
  assert.deepEqual(page.errors,[]);
  console.log('oficina.browser ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
