// Balcão do estoque com banco simulado: nada chega ao Supabase real.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');const {chromium}=require('playwright');
const qa=path.join(root,'tmp','qa');fs.mkdirSync(qa,{recursive:true});
const seed=()=>{
 window.calls=[];
 const produtos=[{id:'p1',descricao:'Sensor de combustível',codigo_barras:'7896292214101',unidade:'UN',saldo:4,qtd_embalagem:1,categoria:'pecas',ativo:true},
  {id:'p2',descricao:'Detergente 5L',codigo_barras:'7890000000099',unidade:'GL',saldo:10,qtd_embalagem:4,embalagem:'CX',categoria:'limpeza',controla_lote:true,ativo:true}];
 const manutencoes=[{id:'m1',numero:1,placa:'QZA3C46',veiculo:'VW TERA',tipo:'corretiva',motivo:'Barulho',status:'aberta',orcamento_status:'em_elaboracao',responsavel_nome:'LOCATÁRIO FICTÍCIO'}];
 window.db={storage:{from:()=>({upload:async()=>({data:{},error:null})})},async rpc(name,args){window.calls.push({name,args});
  if(name==='oficina_painel')return {data:{produtos,manutencoes},error:null};
  if(name==='oficina_veiculos')return {data:[{carro_id:'c9',placa:'QZZ5H15',veiculo:'VW GOL MPI',empresa:'ALQUILER',ultimo_km:52000}],error:null};
  if(name==='oficina_manutencao_abrir'){const m={id:'m9',numero:9,placa:args.p_dados.placa,veiculo:'VW GOL MPI',tipo:args.p_dados.tipo,motivo:args.p_dados.motivo,status:'aberta',orcamento_status:'em_elaboracao',responsavel_nome:'LOCATÁRIO FICTÍCIO'};manutencoes.push(m);return {data:m,error:null};}
  if(name==='oficina_produto_buscar')return {data:produtos.find(p=>p.codigo_barras===args.p_codigo||p.codigo_interno===args.p_codigo)||null,error:null};
  if(name==='oficina_operador_identificar')return args.p_cpf.replace(/\D/g,'')==='52998224725'?{data:{id:'op1',nome:'JOSÉ ESTOQUE'},error:null}:{data:null,error:{message:'CPF não cadastrado como funcionário do estoque.'}};
  if(name==='oficina_saida')return {data:args.p_itens.map(i=>({movimento_id:'mov-'+i.produto_id,produto_id:i.produto_id,descricao:produtos.find(p=>p.id===i.produto_id).descricao,quantidade:i.quantidade,saldo:1})),error:null};
  if(name==='oficina_saida_avulsa'||name==='oficina_entrada')return {data:args.p_itens.map(i=>({descricao:produtos.find(p=>p.id===i.produto_id).descricao,quantidade:i.quantidade,saldo:5})),error:null};
  if(name==='oficina_produto_salvar'){const p={id:'novo',saldo:0,qtd_embalagem:1,ativo:true,...args.p_dados};produtos.push(p);return {data:p,error:null};}
  return {data:null,error:null};}};
};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:820}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.alquilerContext={company:{id:'tempo',nome_fantasia:'TEMPO'},user:{nome:'BALCÃO'},modules:['oficina']};});await page.addInitScript(seed);
  await page.route('https://qa.test/**',route=>{const f=new URL(route.request().url()).pathname.slice(1).split('?')[0];
   if(f==='pdv-estoque')return route.fulfill({contentType:'text/html',body:fs.readFileSync(root+'/pdv-estoque.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>s.includes('pdv-estoque.js')?s:'')});
   if(f==='auth-guard.js')return route.fulfill({contentType:'text/javascript',body:'export async function requireAuth(){}'});
   if(fs.existsSync(root+'/'+f))return route.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(root+'/'+f,'utf8').replace(/import \{createClient\} from ['"]https:\/\/esm.sh\/@supabase\/supabase-js@2['"];?/,'const createClient=()=>window.db;')});
   return route.fulfill({body:''});});
  await page.goto('https://qa.test/pdv-estoque');const scan=page.getByLabel('Leitor de código de barras');await scan.waitFor();
  const ler=async c=>{await scan.pressSequentially(c,{delay:3});await scan.press('Enter');};
  const cpf=async v=>{await page.getByLabel('CPF do funcionário').waitFor();await page.getByLabel('CPF do funcionário').fill(v);await page.getByLabel('CPF do funcionário').press('Enter');};

  // Retirada para carro: placa pelo leitor/teclado, peça, motivo, CPF e fotos.
  await ler('7896292214101');assert.match(await page.locator('.pdv-aviso').first().innerText(),/Escolha o carro/);
  await ler('QZA-3C46');await page.getByText('Carro QZA3C46 escolhido').waitFor();
  await ler('7896292214101');await ler('7896292214101');assert.equal(await page.getByLabel('Quantidade de Sensor de combustível').inputValue(),'2');
  await page.keyboard.press('F9');assert.match(await page.locator('.pdv-aviso').first().innerText(),/motivo da retirada/);
  await page.getByLabel('Motivo da retirada').fill('Sensor com defeito');await scan.focus();await page.keyboard.press('F9');
  await cpf('000.000.000-00');await page.getByText('CPF não cadastrado').waitFor();await cpf('529.982.247-25');
  await page.getByText('Fotos das peças').waitFor();let c=await page.evaluate(()=>window.calls.find(x=>x.name==='oficina_saida').args);
  assert.equal(c.p_operador,'op1');assert.equal(c.p_manutencao,'m1');assert.deepEqual(c.p_itens,[{produto_id:'p1',quantidade:2,natureza:'corretiva'}]);assert.equal(c.p_observacao,'Sensor com defeito');
  await page.screenshot({path:path.join(qa,'pdv-fotos.png')});
  await page.locator('.pdv-modal button',{hasText:'Concluir'}).click();assert.match(await page.locator('.pdv-aviso').first().innerText(),/por JOSÉ ESTOQUE/);

  // Saída sem carro: uso e consumo, com descrição.
  await page.locator('.pdv-destinos button',{hasText:'Uso e consumo'}).click();await ler('7890000000099');
  await page.keyboard.press('F9');assert.match(await page.locator('.pdv-aviso').first().innerText(),/Setor ou uso/);
  await page.getByLabel('Para onde vai').fill('Limpeza da oficina');await scan.focus();await page.keyboard.press('F9');await cpf('52998224725');
  await page.waitForFunction(()=>window.calls.some(x=>x.name==='oficina_saida_avulsa'));c=await page.evaluate(()=>window.calls.find(x=>x.name==='oficina_saida_avulsa').args);
  assert.deepEqual([c.p_destino,c.p_descricao,c.p_operador],['uso_consumo','Limpeza da oficina','op1']);

  // Venda (revenda): preço por unidade vem do cadastro e pode ser ajustado.
  await page.locator('.pdv-destinos button',{hasText:'Venda (revenda)'}).click();await ler('7896292214101');
  await page.getByLabel('Preço de venda de Sensor de combustível').fill('180,00');await page.getByLabel('Para onde vai').fill('Cliente balcão');await scan.focus();await page.keyboard.press('F9');await cpf('52998224725');
  await page.waitForFunction(()=>window.calls.filter(x=>x.name==='oficina_saida_avulsa').length===2);c=await page.evaluate(()=>window.calls.filter(x=>x.name==='oficina_saida_avulsa')[1].args);
  assert.equal(c.p_destino,'revenda');assert.deepEqual(c.p_itens,[{produto_id:'p1',quantidade:1,valor_venda:180}]);

  // Atendimento rápido: placa de carro que não está na oficina abre a ordem de serviço sem tirar da locação.
  await page.locator('.pdv-destinos button',{hasText:'Manutenção de carro'}).click();await ler('QZZ-5H15');
  await page.getByText('Atendimento rápido',{exact:true}).waitFor();assert.match(await page.locator('.pdv-modal').innerText(),/VW GOL MPI · ALQUILER · último KM 52\.000/);
  await page.locator('.pdv-modal button',{hasText:'PREVENTIVA'}).click();await page.getByLabel('O que vai ser feito').fill('Troca de lâmpada do farol');await page.getByLabel('KM').fill('52.340');
  await page.locator('.pdv-modal button',{hasText:'Abrir ordem de serviço'}).click();await page.getByText('Ordem de serviço #9 aberta para QZZ5H15').waitFor();assert.equal(await page.getByLabel('Motivo da retirada').inputValue(),'Troca de lâmpada do farol');
  c=await page.evaluate(()=>window.calls.find(x=>x.name==='oficina_manutencao_abrir').args.p_dados);
  assert.deepEqual([c.carro_id,c.placa,c.tipo,c.motivo,c.km,c.cliente_externo],['c9','QZZ5H15','preventiva','Troca de lâmpada do farol',52340,null]);
  assert.match(c.observacoes,/não saiu da locação/);await page.screenshot({path:path.join(qa,'pdv-atendimento.png')});
  // Carro de fora da frota pede cliente e modelo.
  await page.locator('.pdv-dir button',{hasText:'Trocar carro'}).click();await page.locator('.pdv-dir button',{hasText:'Atendimento rápido'}).click();
  await page.getByLabel('Placa do carro').fill('ABC1D23');await page.getByText('Carro de fora da frota').waitFor();
  await page.getByLabel('O que vai ser feito').fill('Troca de óleo');await page.locator('.pdv-modal button',{hasText:'Abrir ordem de serviço'}).click();
  assert.match(await page.locator('.pdv-aviso').first().innerText(),/informe o cliente/);await page.keyboard.press('Escape');

  // Entrada: código nunca cadastrado pede a identificação; lote obrigatório; caixa fechada.
  await page.keyboard.press('F3');await ler('Z3AH3200736E2');await page.getByText('Item novo: Z3AH3200736E2').waitFor();
  await page.getByLabel('Identificação do item').fill('Bateria 60Ah');await page.getByLabel('Marca').fill('Moura');await page.getByLabel('Categoria').selectOption('pecas');await page.getByLabel('Identificação do item').press('Enter');
  await page.getByLabel('Quantidade de Bateria 60Ah').waitFor();c=await page.evaluate(()=>window.calls.find(x=>x.name==='oficina_produto_salvar').args.p_dados);assert.equal(c.codigo_interno,'Z3AH3200736E2');assert.equal(c.codigo_barras,null);assert.equal(c.marca,'Moura');assert.match(await page.locator('.pdv-item',{hasText:'Bateria 60Ah'}).innerText(),/Bateria 60Ah · Moura/);
  await ler('7890000000099');await page.getByLabel('Entrada por · Detergente 5L').selectOption('cx');await page.getByLabel('Custo de Detergente 5L').fill('48,00');
  assert.match(await page.locator('.pdv-item',{hasText:'Detergente 5L'}).innerText(),/= 4 GL · R\$\s12,00 cada · total R\$\s48,00/);
  await page.keyboard.press('F9');assert.match(await page.locator('.pdv-aviso').first().innerText(),/Informe o lote de Detergente 5L/);
  await page.getByLabel('Lote de Detergente 5L').fill('L-77');await page.getByLabel('Marca de Detergente 5L').fill('Ypê');await scan.focus();await page.keyboard.press('F9');await cpf('52998224725');
  await page.waitForFunction(()=>window.calls.some(x=>x.name==='oficina_entrada'));c=await page.evaluate(()=>window.calls.find(x=>x.name==='oficina_entrada').args);
  assert.equal(c.p_operador,'op1');assert.deepEqual(c.p_itens.map(i=>[i.produto_id,i.quantidade,i.lote]),[['novo',1,null],['p2',4,'L-77']]);
  assert.deepEqual([c.p_itens[1].custo_unitario,c.p_itens[1].embalagens,c.p_itens[1].custo_embalagem],[12,1,48],'1 caixa de 4 por R$ 48 → R$ 12 cada');assert.deepEqual(c.p_itens.map(i=>i.marca),['Moura','Ypê'],'marca vai em cada entrada');
  await page.screenshot({path:path.join(qa,'pdv-entrada.png')});
  assert.deepEqual(errors,[]);console.log('PASS browser: balcão do estoque com retirada por placa, CPF, fotos, saída sem carro, cadastro de código novo, caixa e lote.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
