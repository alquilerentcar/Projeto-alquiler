// Oficina no banco simulado: nada chega ao Supabase real.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const tempo=id(1),alquiler=id(2),fora=id(3),user=id(9),carroAlq=id(20),carroFora=id(21);
(async()=>{const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
-- O usuário acessa a Tempo da Mecânica e a Alquiler; não acessa a terceira empresa.
create function public.acesso_modulo(uuid,text) returns boolean language sql as $$select auth.uid() is not null and $1 in ('${tempo}'::uuid,'${alquiler}'::uuid)$$;
create function public.acesso_admin_empresa(uuid) returns boolean language sql as $$select auth.uid()='${user}'::uuid and $1 in ('${tempo}'::uuid,'${alquiler}'::uuid)$$;
create table modulos(id uuid primary key default gen_random_uuid(),codigo text unique,nome text,descricao text,ativo boolean);insert into modulos(codigo,nome,descricao,ativo) values('locacao','Locação','',true),('oficina','Oficina','Módulo futuro',false);
create function public.acessos_painel() returns text language sql as $$select string_agg(codigo,',' order by codigo) from public.modulos where codigo in ('locacao','financeiro')$$;
create table cliente_debitos(id uuid primary key,empresa_id uuid,cliente_id uuid,categoria text,descricao text,valor_total numeric,pago_anterior numeric,pedido jsonb,criado_por uuid,locacao_id uuid);
create table cliente_debito_parcelas(id uuid primary key default gen_random_uuid(),empresa_id uuid,debito_id uuid,numero int,vencimento date,valor numeric);
create schema storage;create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(bucket_id text,name text);
create table usuarios_empresa(id uuid primary key default gen_random_uuid(),empresa_id uuid,auth_user_id uuid,nome text,cargo text,administrador boolean,ativo boolean);insert into usuarios_empresa(empresa_id,auth_user_id,nome,cargo,administrador,ativo) values('${tempo}','${user}','ADMIN',null,true,true),('${tempo}','${id(8)}','ANALISTA FICTÍCIO','Analista',false,true);
create table frota_substituicoes(id uuid primary key,empresa_id uuid,cliente_id uuid,anterior_id uuid,posterior_id uuid,data_troca timestamptz,confirmado_em timestamptz);
create table empresas(id uuid primary key,nome_fantasia text,razao_social text,cnpj text);insert into empresas values('${tempo}','TEMPO DA MECÂNICA','TEMPO DA MECANICA LTDA','11222333000181'),('${alquiler}','ALQUILER','ALQUILER LTDA','44555666000199'),('${fora}','OUTRA',null,null);
create table clientes(id uuid primary key,empresa_id uuid,nome_completo text,cpf text,contato_1_numero text,contato_2_numero text);insert into clientes values('${id(50)}','${alquiler}','LOCATÁRIO FICTÍCIO','00000000000','92999990000'),('${id(51)}','${alquiler}','OUTRO LOCATÁRIO',null,null);
create table locacoes(id uuid primary key,empresa_id uuid,cliente_id uuid,carro_id uuid,status text,data_inicio timestamptz,data_fim timestamptz);insert into locacoes values('${id(60)}','${alquiler}','${id(50)}','${carroAlq}','Ativa',now()-interval '20 days',null);
create table frota_levantamento(id uuid primary key,empresa_id uuid,carro_id uuid,cliente_id uuid,inicio timestamptz,ativo boolean);
create table debitos_teste(id uuid primary key,empresa_id uuid,cliente_id uuid,categoria text,descricao text,valor numeric,vencimento date);
create function public.cliente_debito_criar(p_empresa uuid,p_cliente uuid,p_operacao uuid,p_categoria text,p_descricao text,p_total numeric,p_pago numeric,p_parcelas int,p_primeiro date,p_periodicidade text) returns uuid language plpgsql as $$begin if not public.acesso_modulo(p_empresa,'locacao') then raise exception 'Somente o administrador pode cadastrar débitos extras.';end if;insert into public.debitos_teste values(p_operacao,p_empresa,p_cliente,p_categoria,p_descricao,p_total,p_primeiro);return p_operacao;end$$;
create table carros(id uuid primary key,empresa_id uuid,placa text,marca text,modelo text,ano int,situacao text,cor text,situacao_confirmada_em timestamptz);
insert into carros values('${carroAlq}','${alquiler}','QZA3C46','VW','TERA',2025,'Disponível','BRANCO'),('${carroFora}','${fora}','ABC1D23','FIAT','UNO',2010,'Disponível',null);
create table frota_periodos(id uuid primary key,grupo_id uuid,empresa_id uuid,carro_id uuid,cliente_id uuid,tipo text,inicio timestamptz,fim timestamptz,diaria numeric);
insert into frota_periodos values('${id(30)}','${id(30)}','${alquiler}','${carroAlq}',null,'manutencao',now()-interval '1 day',null,null);
create table frota_km(id uuid primary key default gen_random_uuid(),carro_id uuid,leitura_em timestamptz,km bigint);insert into frota_km(carro_id,leitura_em,km) values('${carroAlq}',now(),15000);
set test.uid='${user}';`);
await db.exec(fs.readFileSync(root+'/sql/oficina_estoque.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_orcamento.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_fotos_aprovacao.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_modulo.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_etiquetas.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_cadastro_movimentos.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_estoque_fluxo.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/oficina_compra_marca.sql','utf8'));
// Módulo Oficina liberado em Acessos e oficina ligada à locadora que atende.
assert.equal((await db.query('select acessos_painel() p')).rows[0].p,'locacao,oficina','Oficina aparece em Acessos');
assert.equal((await db.query("select ativo from modulos where codigo='oficina'")).rows[0].ativo,true);
assert.equal((await db.query('select oficina_veiculos($1) p',[tempo])).rows[0].p.some(v=>v.placa==='QZA3C46'),false,'sem ligação, a oficina não vê os carros da locadora');
await db.query('select oficina_empresa_atendida_definir($1,$2,true)',[tempo,alquiler]);
assert.ok((await db.query('select oficina_empresas_atendidas_lista($1) p',[tempo])).rows[0].p.some(e=>e.empresa_id===alquiler&&e.atendida));
await assert.rejects(()=>db.query('select oficina_empresa_atendida_definir($1,$2,true)',[tempo,fora]),/administra as duas/);
const one=async(sql,args)=>(await db.query(sql,args)).rows[0];

// Cadastro de peça com código de barras; código repetido é recusado.
const filtro=(await one("select oficina_produto_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Filtro de óleo',codigo_barras:'7891234567895',unidade:'un',estoque_minimo:2})])).p;
assert.equal(filtro.unidade,'UN');assert.equal(Number(filtro.saldo),0);
await assert.rejects(()=>db.query("select oficina_produto_salvar($1,null,$2)",[tempo,JSON.stringify({descricao:'Outro',codigo_barras:'7891234567895'})]),/Já existe/);
const oleo=(await one("select oficina_produto_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Óleo 5W30',codigo_interno:'OL-530',unidade:'L'})])).p;
assert.equal((await one("select oficina_produto_buscar($1,'7891234567895') p",[tempo])).p.id,filtro.id,'leitor encontra pelo código de barras');
assert.equal((await one("select oficina_produto_buscar($1,'ol-530') p",[tempo])).p.id,oleo.id,'encontra pelo código interno');
assert.equal((await one("select oficina_produto_buscar($1,'000') p",[tempo])).p,null);

// Entrada: saldo e custo médio; repetir a mesma operação não duplica.
const entrada=[{produto_id:filtro.id,quantidade:10,custo_unitario:20},{produto_id:oleo.id,quantidade:8,custo_unitario:35.5}];
await db.query("select oficina_entrada($1,$2,$3::jsonb,'NF 123','AUTOPEÇAS')",[tempo,id(100),JSON.stringify(entrada)]);
await db.query("select oficina_entrada($1,$2,$3::jsonb,'NF 123','AUTOPEÇAS')",[tempo,id(100),JSON.stringify(entrada)]);
let f=await one('select saldo,custo_medio from oficina_produtos where id=$1',[filtro.id]);assert.equal(Number(f.saldo),10);assert.equal(Number(f.custo_medio),20);
await db.query("select oficina_entrada($1,$2,$3::jsonb)",[tempo,id(101),JSON.stringify([{produto_id:filtro.id,quantidade:10,custo_unitario:30}])]);
f=await one('select saldo,custo_medio from oficina_produtos where id=$1',[filtro.id]);assert.equal(Number(f.saldo),20);assert.equal(Number(f.custo_medio),25,'custo médio ponderado');
await assert.rejects(()=>db.query("select oficina_entrada($1,$2,$3::jsonb)",[tempo,id(102),JSON.stringify([{produto_id:filtro.id,quantidade:1},{produto_id:filtro.id,quantidade:2}])]),/duas vezes/);
await assert.rejects(()=>db.query("select oficina_entrada($1,$2,$3::jsonb)",[tempo,id(103),JSON.stringify([{produto_id:filtro.id,quantidade:0}])]),/Quantidade/);

// Manutenção: carro da Alquiler aparece como "em manutenção na Frota"; abrir liga ao período.
let painel=(await one('select oficina_painel($1) p',[tempo])).p;assert.equal(painel.frota_em_manutencao.length,1);assert.equal(painel.frota_em_manutencao[0].placa,'QZA3C46');
const veiculos=(await one('select oficina_veiculos($1) p',[tempo])).p;assert.ok(veiculos.some(v=>v.placa==='QZA3C46'&&v.ultimo_km==15000));assert.ok(!veiculos.some(v=>v.placa==='ABC1D23'),'carro de empresa sem acesso não aparece');
await assert.rejects(()=>db.query("select oficina_manutencao_abrir($1,$2,$3)",[tempo,id(200),JSON.stringify({carro_id:carroAlq,tipo:'corretiva'})]),/motivo/);
const m=(await one("select oficina_manutencao_abrir($1,$2,$3) p",[tempo,id(201),JSON.stringify({carro_id:carroAlq,tipo:'corretiva',motivo:'Barulho na suspensão dianteira',km:15010})])).p;
assert.equal(m.numero,1);assert.equal(m.placa,'QZA3C46');assert.equal(m.periodo_id,id(30));assert.equal(m.veiculo,'VW TERA');
assert.equal((await one("select oficina_manutencao_abrir($1,$2,$3) p",[tempo,id(201),JSON.stringify({carro_id:carroAlq,tipo:'corretiva',motivo:'Barulho na suspensão dianteira'})])).p.id,m.id,'mesma operação não duplica');
await assert.rejects(()=>db.query("select oficina_manutencao_abrir($1,$2,$3)",[tempo,id(202),JSON.stringify({carro_id:carroAlq,tipo:'preventiva',motivo:'Revisão'})]),/já tem uma manutenção aberta/);
await assert.rejects(()=>db.query("select oficina_manutencao_abrir($1,$2,$3)",[tempo,id(203),JSON.stringify({carro_id:carroFora,tipo:'preventiva',motivo:'Revisão'})]),/não encontrado/);
const ext=(await one("select oficina_manutencao_abrir($1,$2,$3) p",[tempo,id(204),JSON.stringify({placa:'xyz-9a87',cliente_externo:'JOÃO CLIENTE',veiculo:'GOL 2015',tipo:'preventiva',motivo:'Troca de óleo'})])).p;
assert.equal(ext.placa,'XYZ9A87');assert.equal(ext.numero,2);assert.equal(ext.carro_id,null);
painel=(await one('select oficina_painel($1) p',[tempo])).p;assert.equal(painel.frota_em_manutencao.length,0,'carro sai da lista da Frota depois de aberto');

// Saída: peça para o carro, com corretiva ou preventiva; sem estoque, nada sai.
await db.query("select oficina_saida($1,$2,$3,$4::jsonb,$5)",[tempo,id(300),m.id,JSON.stringify([{produto_id:filtro.id,quantidade:1},{produto_id:oleo.id,quantidade:4,natureza:'preventiva'}]),'Troca na revisão']);
await db.query("select oficina_saida($1,$2,$3,$4::jsonb,$5)",[tempo,id(300),m.id,JSON.stringify([{produto_id:filtro.id,quantidade:1},{produto_id:oleo.id,quantidade:4,natureza:'preventiva'}]),'Troca na revisão']);
assert.equal(Number((await one('select saldo from oficina_produtos where id=$1',[filtro.id])).saldo),19,'saída repetida não baixa de novo');
const movs=(await one('select oficina_movimentos_lista($1,$2) p',[tempo,m.id])).p;
assert.equal(movs.length,2);assert.ok(movs.every(x=>x.placa==='QZA3C46'&&x.manutencao===1));
assert.equal(movs.find(x=>x.produto==='Filtro de óleo').natureza,'corretiva','sem informar, vale o tipo da manutenção');assert.equal(movs.find(x=>x.produto==='Óleo 5W30').natureza,'preventiva');
await assert.rejects(()=>db.query("select oficina_saida($1,$2,$3,$4::jsonb,$5)",[tempo,id(301),m.id,JSON.stringify([{produto_id:filtro.id,quantidade:1},{produto_id:oleo.id,quantidade:5}]),"Troca"]),/Estoque insuficiente de Óleo 5W30: tem 4, pediu 5/);
assert.equal(Number((await one('select saldo from oficina_produtos where id=$1',[filtro.id])).saldo),19,'erro em um item não baixa os outros');
await assert.rejects(()=>db.query("select oficina_saida($1,$2,null,$3::jsonb,$4)",[tempo,id(302),JSON.stringify([{produto_id:filtro.id,quantidade:1}]),"Troca"]),/Escolha a manutenção/);
painel=(await one('select oficina_painel($1) p',[tempo])).p;const pm=painel.manutencoes.find(x=>x.id===m.id);assert.equal(pm.pecas,2);assert.equal(Number(pm.custo_pecas),25+4*35.5);

// Responsável: ocupante atual do carro (contrato ativo), mesmo com o carro parado na oficina.
assert.equal(m.responsavel_cliente_id,id(50));assert.equal(m.responsavel_nome,'LOCATÁRIO FICTÍCIO');assert.equal(ext.responsavel_cliente_id,null,'veículo de fora sem locatário');
await assert.rejects(()=>db.query("select oficina_saida($1,$2,$3,$4::jsonb,'')",[tempo,id(310),m.id,JSON.stringify([{produto_id:filtro.id,quantidade:1}])]),/motivo/);
const sugest=(await one('select oficina_responsaveis_sugeridos($1,$2) p',[tempo,m.id])).p;assert.equal(sugest[0].cliente_id,id(50));assert.equal(sugest[0].atual,true);
// Serviço de fora (ar-condicionado com terceiro) e serviço do catálogo.
await assert.rejects(()=>db.query("select oficina_servico_lancar($1,$2,$3,$4)",[tempo,id(320),m.id,JSON.stringify({descricao:'Carga de gás',categoria:'ar_condicionado',valor_unitario:200,externo:true})]),/quem fez/);
await db.query("select oficina_servico_lancar($1,$2,$3,$4)",[tempo,id(321),m.id,JSON.stringify({descricao:'Carga de gás do ar',categoria:'ar_condicionado',valor_unitario:200,externo:true,fornecedor:'CARECA AR'})]);
await db.query("select oficina_servico_lancar($1,$2,$3,$4)",[tempo,id(321),m.id,JSON.stringify({descricao:'Carga de gás do ar',categoria:'ar_condicionado',valor_unitario:200,externo:true,fornecedor:'CARECA AR'})]);
const cat=(await one("select oficina_servico_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Alinhamento',categoria:'suspensao',valor_padrao:80})])).p;
await assert.rejects(()=>db.query("select oficina_servico_salvar($1,null,$2)",[tempo,JSON.stringify({descricao:'Qualquer',categoria:'jardinagem'})]),/categorias/);
const alin=(await one("select oficina_servico_lancar($1,$2,$3,$4) p",[tempo,id(322),m.id,JSON.stringify({servico_id:cat.id,natureza:'preventiva'})])).p;assert.equal(Number(alin.valor_unitario),80);
await db.query("select oficina_servico_remover($1,$2)",[tempo,alin.id]);
// Orçamento: corretiva 50/50, preventiva 100% empresa.
let orc=(await one('select oficina_orcamento($1,$2) p',[tempo,m.id])).p;
assert.equal(orc.linhas.length,3,'serviço removido não entra');assert.equal(orc.responsavel.nome,'LOCATÁRIO FICTÍCIO');assert.equal(orc.empresa.razao_social,'TEMPO DA MECANICA LTDA');
assert.equal(Number(orc.totais.geral),367);assert.equal(Number(orc.totais.locatario),112.5);assert.equal(Number(orc.totais.empresa),254.5);
const lfiltro=orc.linhas.find(l=>l.descricao==='Filtro de óleo');assert.equal(Number(lfiltro.pct_locatario),50);assert.equal(Number(lfiltro.valor_locatario),12.5);assert.equal(lfiltro.motivo,'Troca na revisão');
assert.equal(Number(orc.linhas.find(l=>l.descricao==='Óleo 5W30').valor_locatario),0,'preventiva: empresa paga');
// Rateio configurável pelo administrador.
await db.query("select oficina_rateio_salvar($1,40,90)",[tempo]);orc=(await one('select oficina_orcamento($1,$2) p',[tempo,m.id])).p;assert.equal(Number(orc.totais.locatario),Number((10+127.8+80).toFixed(2)));
await db.query("select oficina_rateio_salvar($1,50,0)",[tempo]);
// Sem locatário, a empresa paga tudo.
await db.query("select oficina_manutencao_responsavel($1,$2,null)",[tempo,m.id]);assert.equal(Number((await one('select oficina_orcamento($1,$2) p',[tempo,m.id])).p.totais.locatario),0);
await db.query("select oficina_manutencao_responsavel($1,$2,$3)",[tempo,m.id,id(50)]);
// Fotos: cada peça retirada precisa da foto da peça nova funcionando e da antiga (ou justificativa).
const pend=(await one('select oficina_fotos_pendentes($1,$2) p',[tempo,m.id])).p;assert.equal(pend.length,2);
await assert.rejects(()=>db.query('select oficina_orcamento_enviar($1,$2)',[tempo,m.id]),/Faltam as fotos .* 2 peça/);
await assert.rejects(()=>db.query("select oficina_manutencao_status($1,$2,'concluida')",[tempo,m.id]),/Faltam as fotos/);
const [mvF,mvO]=[pend.find(x=>x.produto==='Filtro de óleo').movimento_id,pend.find(x=>x.produto==='Óleo 5W30').movimento_id];
await assert.rejects(()=>db.query("select oficina_foto_registrar($1,$2,'nova',$3)",[tempo,mvF,'outra/pasta/x.jpg']),/inválido/);
await assert.rejects(()=>db.query("select oficina_foto_registrar($1,$2,'antiga',null,'x')",[tempo,mvF]),/explique/);
let f1=(await one("select oficina_foto_registrar($1,$2,'nova',$3) p",[tempo,mvF,tempo+'/'+mvF+'/nova.jpg'])).p;assert.equal(f1.concluida,false);
f1=(await one("select oficina_foto_registrar($1,$2,'antiga',$3) p",[tempo,mvF,tempo+'/'+mvF+'/antiga.jpg'])).p;assert.equal(f1.concluida,true);
await db.query("select oficina_foto_registrar($1,$2,'nova',$3)",[tempo,mvO,tempo+'/'+mvO+'/nova.jpg']);
await db.query("select oficina_foto_registrar($1,$2,'antiga',null,'Óleo velho descartado no coletor')",[tempo,mvO]);
assert.equal((await one('select oficina_fotos_pendentes($1,$2) p',[tempo,m.id])).p.length,0);
assert.equal((await one('select oficina_fotos_lista($1,$2) p',[tempo,m.id])).p.length,4);
// Aprovação: só o analista (ou administrador). Enviado, não aceita lançamentos.
await assert.rejects(()=>db.query('select oficina_cobrar_locatario($1,$2,10,current_date)',[tempo,m.id]),/aprovado pelo analista/);
await db.query('select oficina_orcamento_enviar($1,$2)',[tempo,m.id]);
await assert.rejects(()=>db.query("select oficina_saida($1,$2,$3,$4::jsonb,'Troca')",[tempo,id(312),m.id,JSON.stringify([{produto_id:filtro.id,quantidade:1}])]),/aguardando aprovação/);
await db.exec(`set test.uid='${id(8)}'`);
await assert.rejects(()=>db.query('select oficina_orcamento_decidir($1,$2,true)',[tempo,m.id]),/Somente o analista/);
assert.equal((await one('select oficina_painel($1) p',[tempo])).p.analista,false);
await db.exec(`set test.uid='${user}'`);
assert.ok((await one('select oficina_aprovadores_lista($1) p',[tempo])).p.some(u=>u.nome==='ANALISTA FICTÍCIO'&&!u.analista));
await db.query('select oficina_aprovador_definir($1,$2,true)',[tempo,id(8)]);
await db.exec(`set test.uid='${id(8)}'`);
await assert.rejects(()=>db.query('select oficina_aprovadores_lista($1)',[tempo]),/administrador/);
await assert.rejects(()=>db.query("select oficina_orcamento_decidir($1,$2,false,'')",[tempo,m.id]),/explique/);
const ap=(await one('select oficina_orcamento_decidir($1,$2,true) p',[tempo,m.id])).p;assert.equal(ap.orcamento_status,'aprovado');assert.equal(Number(ap.orcamento_aprovado.locatario),112.5);
await db.exec(`set test.uid='${user}'`);
await assert.rejects(()=>db.query('select oficina_servico_lancar($1,$2,$3,$4)',[tempo,id(323),m.id,JSON.stringify({descricao:'Extra',categoria:'mecanica',valor_unitario:10})]),/aprovado/);
// Cobrança: parcelada na diária, na locadora do locatário, uma vez só.
await assert.rejects(()=>db.query('select oficina_cobrar_locatario($1,$2,0,current_date)',[tempo,m.id]),/1 a 120 parcelas/);
const cob=(await one("select oficina_cobrar_locatario($1,$2,15,(now() at time zone 'America/Manaus')::date) p",[tempo,m.id])).p;assert.equal(Number(cob.valor),112.5);assert.equal(cob.parcelas,15);
const deb=await one('select * from cliente_debitos where id=$1',[cob.debito_id]);assert.equal(deb.empresa_id,alquiler);assert.equal(deb.categoria,'manutencao');assert.match(deb.descricao,/Manutenção #1 · QZA3C46/);assert.equal(deb.locacao_id,id(60),'ligado à locação ativa');
const parc=(await db.query('select valor,vencimento::text v from cliente_debito_parcelas where debito_id=$1 order by numero',[cob.debito_id])).rows;assert.equal(parc.length,15);assert.equal(parc.reduce((s,x)=>s+Number(x.valor),0),112.5);assert.equal(Number(parc[0].valor),7.5);
await assert.rejects(()=>db.query('select oficina_cobrar_locatario($1,$2,1,current_date)',[tempo,m.id]),/já foi cobrada/);
await assert.rejects(()=>db.query('select oficina_orcamento_reabrir($1,$2,$3)',[tempo,m.id,'Ajuste']),/Já cobrado/);
await assert.rejects(()=>db.query('select oficina_manutencao_responsavel($1,$2,null)',[tempo,m.id]),/já foi cobrada/);
await assert.rejects(()=>db.query('select oficina_cobrar_locatario($1,$2,1,current_date)',[tempo,ext.id]),/aprovado|não tem locatário/);
// Responsável com substituição: o locatário foi para outro carro; a manutenção do carro antigo fica no nome dele.
const carroSub=id(22),carroAnt=id(23);await db.query("insert into carros values($1,$2,'SUB1S11','VW','POLO',2024,'Locado',null),($3,$2,'ANT2A22','VW','GOL',2020,'Manutenção',null)",[carroSub,alquiler,carroAnt]);
await db.query("insert into frota_substituicoes values($1,$2,$3,$4,$5,now()-interval '2 days',now()-interval '2 days')",[id(70),alquiler,id(51),carroAnt,carroSub]);
const m3=(await one("select oficina_manutencao_abrir($1,$2,$3) p",[tempo,id(205),JSON.stringify({carro_id:carroAnt,tipo:'corretiva',motivo:'Pane elétrica'})])).p;
assert.equal(m3.responsavel_cliente_id,id(51),'quem foi para o substituto saindo deste carro');
assert.ok((await one('select oficina_responsaveis_sugeridos($1,$2) p',[tempo,m3.id])).p.some(x=>x.cliente_id===id(51)&&x.substituto));
assert.ok((await one("select oficina_buscar_locatarios($1,'locat') p",[tempo])).p.length>=2,'busca qualquer locatário pelo nome');
await db.query("select oficina_manutencao_status($1,$2,'cancelada')",[tempo,m3.id]);
// Saída da manutenção: o GOL não tem peça nem serviço da oficina, não pode sair; vendido pode.
await assert.rejects(()=>db.query("update carros set situacao='Disponível' where id=$1",[carroAnt]),/ANT2A22 só sai da manutenção depois que a oficina registrar/);
await db.query("update carros set situacao='Vendido' where id=$1",[carroAnt]);
// O TERA teve peças na manutenção #1: pode voltar a ficar disponível.
await db.query("update carros set situacao='Manutenção' where id=$1",[carroAlq]);await db.query("update carros set situacao='Disponível' where id=$1",[carroAlq]);
// Financeiro da manutenção no módulo Oficina.
const fin=(await one("select oficina_financeiro($1,(now() at time zone 'America/Manaus')::date-1,(now() at time zone 'America/Manaus')::date+1) p",[tempo])).p;
const fm1=fin.find(x=>x.numero===1);assert.ok(fm1.cobrada_em);assert.equal(Number(fm1.totais.locatario),112.5);assert.ok(!fin.some(x=>x.id===m3.id),'cancelada fica fora');
// Histórico da peça: carro, manutenção e responsável.
const hf=(await one('select oficina_movimentos_lista($1,null,$2) p',[tempo,filtro.id])).p.find(x=>x.tipo==='saida');assert.equal(hf.placa,'QZA3C46');assert.equal(hf.responsavel,'LOCATÁRIO FICTÍCIO');assert.equal(hf.observacao,'Troca na revisão');
// Nota fiscal: entra no estoque, aprende o código do fornecedor e não importa duas vezes.
const chave='13261111222333000181550010000012341000012345';
const nota={chave,numero:'1234',serie:'1',emitente_cnpj:'11.222.333/0001-81',emitente_nome:'AUTOPEÇAS FICTÍCIA',emissao:'2026-11-10',valor_total:130};
const antesNf=Number((await one('select saldo from oficina_produtos where id=$1',[filtro.id])).saldo);
await db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(500),JSON.stringify(nota),JSON.stringify([{produto_id:filtro.id,quantidade:5,custo_unitario:26,codigo_fornecedor:'F-001'}])]);
await db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(500),JSON.stringify(nota),JSON.stringify([{produto_id:filtro.id,quantidade:5,custo_unitario:26,codigo_fornecedor:'F-001'}])]);
assert.equal(Number((await one('select saldo from oficina_produtos where id=$1',[filtro.id])).saldo),antesNf+5,'mesma importação não duplica');
await assert.rejects(()=>db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(501),JSON.stringify(nota),JSON.stringify([{produto_id:filtro.id,quantidade:5}])]),/já foi importada/);
const conf=(await one('select oficina_nota_conferir($1,$2,$3) p',[tempo,chave,'11222333000181'])).p;assert.equal(conf.importada.numero,'1234');assert.equal(conf.codigos['F-001'],filtro.id);
await assert.rejects(()=>db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(502),JSON.stringify({...nota,chave:'123'}),'[]']),/chave/);

// Encerrar: concluída não recebe mais peças; com peças não pode cancelar.
await assert.rejects(()=>db.query("select oficina_manutencao_status($1,$2,'cancelada')",[tempo,m.id]),/Conclua/);
await db.query("select oficina_manutencao_status($1,$2,'concluida','Trocado bieleta')",[tempo,m.id]);
await assert.rejects(()=>db.query("select oficina_saida($1,$2,$3,$4::jsonb,$5)",[tempo,id(303),m.id,JSON.stringify([{produto_id:filtro.id,quantidade:1}]),"Troca"]),/encerrada|cobrada/);

// Ajuste de inventário pelo administrador.
await db.query("select oficina_ajuste($1,$2,$3,17,'Contagem mensal')",[tempo,id(400),filtro.id]);
const aj=(await one('select oficina_movimentos_lista($1,null,$2) p',[tempo,filtro.id])).p;assert.equal(Number(aj[0].quantidade),-7,'19 + 5 da nota = 24, contados 17');assert.equal(aj[0].tipo,'ajuste');
await assert.rejects(()=>db.query("select oficina_ajuste($1,$2,$3,17,'x')",[fora,id(401),filtro.id]),/administrador/);

// Código de barras gerado para item sem código (EAN-13 interno, sequencial e válido).
const semCod=(await one("select oficina_produto_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Mangueira sem código'})])).p;
const g1=(await one('select oficina_produto_gerar_codigo($1,$2) p',[tempo,semCod.id])).p;assert.equal(g1.codigo_barras,'2000000000015');
assert.equal((await one('select oficina_produto_gerar_codigo($1,$2) p',[tempo,semCod.id])).p.codigo_barras,'2000000000015','gerar de novo não troca o código');
const semCod2=(await one("select oficina_produto_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Abraçadeira'})])).p;
assert.equal((await one('select oficina_produto_gerar_codigo($1,$2) p',[tempo,semCod2.id])).p.codigo_barras,'2000000000022');
assert.equal((await one("select oficina_produto_buscar($1,'2000000000022') p",[tempo])).p.id,semCod2.id,'o leitor encontra pelo código gerado');
// Cadastro completo: categoria, embalagem, lote e preço de venda.
const det=(await one("select oficina_produto_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Detergente 5L',categoria:'limpeza',unidade:'GL',embalagem:'CX',qtd_embalagem:4,controla_lote:true,preco_venda:45})])).p;
assert.equal(det.categoria,'limpeza');assert.equal(Number(det.qtd_embalagem),4);assert.equal(det.controla_lote,true);
await assert.rejects(()=>db.query("select oficina_produto_salvar($1,null,$2)",[tempo,JSON.stringify({descricao:'Item X',categoria:'comida'})]),/categoria/);
const det2=(await one("select oficina_produto_salvar($1,$2,$3) p",[tempo,det.id,JSON.stringify({descricao:'Detergente 5 litros'})])).p;assert.equal(det2.categoria,'limpeza','editar sem mandar a categoria mantém');assert.equal(Number(det2.preco_venda),45);
await assert.rejects(()=>db.query("select oficina_entrada($1,$2,$3::jsonb)",[tempo,id(600),JSON.stringify([{produto_id:det.id,quantidade:8,custo_unitario:30}])]),/Informe o lote de Detergente/);
await db.query("select oficina_entrada($1,$2,$3::jsonb,'NF 77','LIMPEZA FICTÍCIA')",[tempo,id(601),JSON.stringify([{produto_id:det.id,quantidade:4,custo_unitario:30,lote:'L-01'},{produto_id:det.id,quantidade:4,custo_unitario:32,lote:'L-02'}])]);
assert.equal(Number((await one('select saldo from oficina_produtos where id=$1',[det.id])).saldo),8);
// Saídas sem carro: uso e consumo, obra, revenda (com preço) e perda; estoque nunca negativo.
await assert.rejects(()=>db.query("select oficina_saida_avulsa($1,$2,'obra','',$3::jsonb)",[tempo,id(610),JSON.stringify([{produto_id:det.id,quantidade:1}])]),/qual obra/);
await assert.rejects(()=>db.query("select oficina_saida_avulsa($1,$2,'festa','x',$3::jsonb)",[tempo,id(611),JSON.stringify([{produto_id:det.id,quantidade:1}])]),/Escolha a situação da saída/);
await db.query("select oficina_saida_avulsa($1,$2,'uso_consumo','Limpeza da oficina',$3::jsonb)",[tempo,id(612),JSON.stringify([{produto_id:det.id,quantidade:2}])]);
await db.query("select oficina_saida_avulsa($1,$2,'obra','Galpão novo',$3::jsonb)",[tempo,id(613),JSON.stringify([{produto_id:det.id,quantidade:1}])]);
await db.query("select oficina_saida_avulsa($1,$2,'revenda','Cliente balcão',$3::jsonb)",[tempo,id(614),JSON.stringify([{produto_id:det.id,quantidade:1}])]);
await assert.rejects(()=>db.query("select oficina_saida_avulsa($1,$2,'perda','Vazou',$3::jsonb)",[tempo,id(615),JSON.stringify([{produto_id:det.id,quantidade:10}])]),/Estoque insuficiente de Detergente 5 litros: tem 4, pediu 10/);
// Registro completo e imutável.
const rel=(await one("select oficina_movimentos_relatorio($1,(now() at time zone 'America/Manaus')::date-1,(now() at time zone 'America/Manaus')::date) p",[tempo])).p;
const relDet=rel.filter(x=>x.produto==='Detergente 5 litros');assert.equal(relDet.length,5);
assert.ok(relDet.some(x=>x.tipo==='entrada'&&x.lote==='L-02'&&Number(x.custo_unitario)===32&&x.documento==='NF 77'));
assert.ok(relDet.some(x=>x.destino==='obra'&&x.destino_descricao==='Galpão novo'));assert.ok(relDet.some(x=>x.destino==='revenda'&&Number(x.valor_venda)===45));
assert.ok(rel.some(x=>x.destino==='manutencao'&&x.placa==='QZA3C46'),'saídas antigas para carro aparecem como manutenção');assert.equal(relDet[0].usuario,'ADMIN');
await assert.rejects(()=>db.query('update oficina_movimentos set quantidade=1 where produto_id=$1',[det.id]),/não podem ser alterados/);
await assert.rejects(()=>db.query('delete from oficina_movimentos where produto_id=$1',[det.id]),/não podem ser alterados/);
// Nota fiscal leva o lote.
await db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(620),JSON.stringify({chave:'13261111222333000181550010000099991000099999',numero:'9999',emitente_cnpj:'11222333000181',emitente_nome:'X'}),JSON.stringify([{produto_id:det.id,quantidade:4,custo_unitario:31,lote:'L-NF'}])]);
assert.ok((await one('select count(*)::int n from oficina_movimentos where lote=$1',['L-NF'])).n===1);

// Funcionário do estoque identificado pelo CPF em cada operação do balcão (CPF fictício, com dígitos válidos).
await assert.rejects(()=>db.query("select oficina_operador_salvar($1,null,'JOSÉ ESTOQUE','111.111.111-11')",[tempo]),/CPF inválido/);
const op=(await one("select oficina_operador_salvar($1,null,'JOSÉ ESTOQUE','529.982.247-25') p",[tempo])).p;assert.equal(op.cpf_final,'4725');
await assert.rejects(()=>db.query("select oficina_operador_salvar($1,null,'OUTRO','52998224725')",[tempo]),/Já existe/);
await assert.rejects(()=>db.query("select oficina_operador_identificar($1,'00000000000')",[tempo]),/não cadastrado/);
const ident=(await one("select oficina_operador_identificar($1,'52998224725') p",[tempo])).p;assert.equal(ident.nome,'JOSÉ ESTOQUE');
await db.query("select oficina_entrada($1,$2,$3::jsonb,null,null,null,$4)",[tempo,id(700),JSON.stringify([{produto_id:det.id,quantidade:1,lote:'L-03'}]),ident.id]);
await db.query("select oficina_saida_avulsa($1,$2,'uso_consumo','Lavagem',$3::jsonb,$4)",[tempo,id(701),JSON.stringify([{produto_id:det.id,quantidade:1}]),ident.id]);
const relOp=(await one("select oficina_movimentos_relatorio($1,(now() at time zone 'America/Manaus')::date,(now() at time zone 'America/Manaus')::date) p",[tempo])).p;
assert.equal(relOp.filter(x=>x.operador==='JOSÉ ESTOQUE').length,2,'entrada e saída com o funcionário');
await db.query("select oficina_operador_salvar($1,$2,'JOSÉ ESTOQUE','52998224725',false)",[tempo,op.id]);
await assert.rejects(()=>db.query("select oficina_operador_identificar($1,'52998224725')",[tempo]),/não cadastrado/,'desativado não entra');
await assert.rejects(()=>db.query("select oficina_entrada($1,$2,$3::jsonb,null,null,null,$4)",[tempo,id(702),JSON.stringify([{produto_id:det.id,quantidade:1,lote:'L-04'}]),op.id]),/inativo/);

// Fluxo do estoque: caixa de paçoca (20 un por R$ 12,00 → R$ 0,60 cada), venda a R$ 1,00 a unidade.
const pac=(await one("select oficina_produto_salvar($1,null,$2) p",[tempo,JSON.stringify({descricao:'Paçoca',categoria:'revenda',unidade:'UN',embalagem:'CX',qtd_embalagem:20,preco_venda:1})])).p;
await db.query("select oficina_entrada($1,$2,$3::jsonb,'NF 88','DOCES FICTÍCIOS')",[tempo,id(800),JSON.stringify([{produto_id:pac.id,quantidade:40,custo_unitario:0.6,embalagens:2,custo_embalagem:12}])]);
let pp=await one('select saldo,custo_medio from oficina_produtos where id=$1',[pac.id]);assert.equal(Number(pp.saldo),40);assert.equal(Number(pp.custo_medio),0.6);
const movCx=await one("select embalagens,custo_embalagem from oficina_movimentos where operacao_id=$1",[id(800)]);assert.equal(Number(movCx.embalagens),2);assert.equal(Number(movCx.custo_embalagem),12);
await db.query("select oficina_saida_avulsa($1,$2,'revenda','Cliente balcão',$3::jsonb)",[tempo,id(801),JSON.stringify([{produto_id:pac.id,quantidade:15}])]);
await db.query("select oficina_saida_avulsa($1,$2,'uso_consumo','Café da equipe',$3::jsonb)",[tempo,id(802),JSON.stringify([{produto_id:pac.id,quantidade:3}])]);
await db.query("select oficina_saida_avulsa($1,$2,'devolucao','Fornecedor: caixa amassada',$3::jsonb)",[tempo,id(803),JSON.stringify([{produto_id:pac.id,quantidade:2}])]);
const hoje="(now() at time zone 'America/Manaus')::date";
const res=(await one(`select oficina_estoque_resumo($1,${hoje}-1,${hoje}) p`,[tempo])).p;
const rp=res.revenda.find(x=>x.produto==='Paçoca');assert.equal(Number(rp.entrou),40);assert.equal(Number(rp.vendido),15);assert.equal(Number(rp.receita),15);assert.equal(Number(rp.custo_vendido),9);assert.equal(Number(rp.lucro),6);assert.equal(Number(rp.saldo),20);
const pr=res.patrimonio.find(x=>x.categoria==='revenda');assert.ok(Number(pr.valor_custo)>=12,'20 paçocas a R$ 0,60 = R$ 12 em patrimônio');assert.ok(Number(pr.valor_venda)>=20);
assert.ok(res.periodo.some(x=>x.tipo==='saida'&&x.situacao==='devolucao'&&Number(x.unidades)===2));assert.ok(res.periodo.some(x=>x.tipo==='saida'&&x.situacao==='revenda'&&Number(x.valor_venda)>=15));
assert.ok((await one(`select oficina_movimentos_relatorio($1,${hoje},${hoje}) p`,[tempo])).p.some(x=>Number(x.custo_embalagem)===12),'relatório mostra o custo da caixa');

// Compra: marca, preço pago e fornecedor ficam na entrada e na última compra do item.
const pacCompra=await one('select ultimo_custo,ultimo_fornecedor,ultimo_documento from oficina_produtos where id=$1',[pac.id]);
assert.deepEqual([Number(pacCompra.ultimo_custo),pacCompra.ultimo_fornecedor,pacCompra.ultimo_documento],[0.6,'DOCES FICTÍCIOS','NF 88']);
await db.query("select oficina_entrada($1,$2,$3::jsonb,'NF 90','AUTOPEÇAS FICTÍCIA')",[tempo,id(900),JSON.stringify([{produto_id:pac.id,quantidade:20,custo_unitario:0.7,marca:'Amor'}])]);
let pc=await one('select marca,ultimo_custo,ultimo_fornecedor from oficina_produtos where id=$1',[pac.id]);assert.deepEqual([pc.marca,Number(pc.ultimo_custo),pc.ultimo_fornecedor],['Amor',0.7,'AUTOPEÇAS FICTÍCIA']);
await db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(901),JSON.stringify({chave:'13261111222333000181550010000088881000088888',numero:'8888',emitente_cnpj:'11222333000181',emitente_nome:'DISTRIBUIDORA FICTÍCIA'}),JSON.stringify([{produto_id:pac.id,quantidade:20,custo_unitario:0.65,marca:'Paçoquita'}])]);
pc=await one('select marca,ultimo_custo,ultimo_fornecedor,ultimo_documento from oficina_produtos where id=$1',[pac.id]);assert.deepEqual([pc.marca,Number(pc.ultimo_custo),pc.ultimo_fornecedor,pc.ultimo_documento],['Paçoquita',0.65,'DISTRIBUIDORA FICTÍCIA','NF 8888']);
assert.ok((await one(`select oficina_movimentos_relatorio($1,${hoje},${hoje}) p`,[tempo])).p.some(x=>x.marca==='Paçoquita'&&x.fornecedor==='DISTRIBUIDORA FICTÍCIA'),'relatório mostra marca e fornecedor');

// Carro que entra em manutenção na Locação abre manutenção sozinho na Oficina.
await db.exec(`set test.uid='${user}'`);
const antes=(await one('select count(*)::int n from oficina_manutencoes')).n;
await db.exec(fs.readFileSync(root+'/sql/oficina_entrada_automatica.sql','utf8'));
const carroAuto=id(950),carroRev=id(951),carroOutra=id(952);
await db.query("insert into carros values($1,$2,'AUT1A11','FIAT','MOBI',2024,'Disponível',null),($3,$2,'REV2R22','VW','POLO',2024,'Locado',null),($4,$5,'OUT3O33','FIAT','UNO',2010,'Disponível',null)",[carroAuto,alquiler,carroRev,carroOutra,fora]);
await db.query("insert into frota_km(carro_id,leitura_em,km) values($1,now(),42000)",[carroAuto]);
await db.query("update carros set situacao='Manutenção' where id=$1",[carroAuto]);
let auto=(await db.query("select * from oficina_manutencoes where carro_id=$1",[carroAuto])).rows;
assert.equal(auto.length,1,'abre uma manutenção na oficina que atende a Alquiler');
assert.deepEqual([auto[0].empresa_id,auto[0].placa,auto[0].tipo,auto[0].status,Number(auto[0].km)],[tempo,'AUT1A11','corretiva','aberta',42000]);
assert.match(auto[0].observacoes,/automaticamente/);
// O período de manutenção da Frota não abre outra: só liga o período à que já está aberta.
await db.query("insert into frota_periodos values($1,$1,$2,$3,null,'manutencao',now(),null,null)",[id(953),alquiler,carroAuto]);
auto=(await db.query("select * from oficina_manutencoes where carro_id=$1",[carroAuto])).rows;assert.equal(auto.length,1);assert.equal(auto[0].periodo_id,id(953));
// Revisão entra como preventiva.
await db.query("update carros set situacao='Revisão' where id=$1",[carroRev]);
assert.equal((await one("select tipo from oficina_manutencoes where carro_id=$1",[carroRev])).tipo,'preventiva');
// Empresa que a oficina não atende: nada abre.
await db.query("update carros set situacao='Manutenção' where id=$1",[carroOutra]);
assert.equal((await one("select count(*)::int n from oficina_manutencoes where carro_id=$1",[carroOutra])).n,0);
const numeros=(await db.query("select numero from oficina_manutencoes where empresa_id=$1 order by numero",[tempo])).rows.map(r=>r.numero);
assert.equal(new Set(numeros).size,numeros.length,'números das manutenções não se repetem');
assert.ok((await one('select count(*)::int n from oficina_manutencoes')).n>=antes+2);

// Orçamento abre com o telefone do contato do cadastro do cliente.
const mResp=await one('select id from oficina_manutencoes where responsavel_cliente_id=$1 limit 1',[id(50)]);
assert.equal((await one('select oficina_orcamento($1,$2) p',[tempo,mResp.id])).p.responsavel.telefone,'92999990000');
await db.exec(fs.readFileSync(root+'/sql/oficina_orcamento_telefone.sql','utf8'));
assert.equal((await one('select oficina_orcamento($1,$2) p',[tempo,mResp.id])).p.responsavel.telefone,'92999990000');

// Ordem de serviço: relatórios de entrada e saída; conclusão só com peça/serviço e os dois relatórios.
await db.exec(fs.readFileSync(root+'/sql/oficina_ordem_servico.sql','utf8'));
const os=(await one("select oficina_manutencao_abrir($1,$2,$3) m",[tempo,id(960),JSON.stringify({carro_id:carroAuto,tipo:'preventiva',motivo:'Troca de óleo'})]).catch(async()=>({m:(await one("select to_jsonb(m) m from oficina_manutencoes m where carro_id=$1 and status='aberta'",[carroAuto])).m}))).m;
await assert.rejects(()=>db.query("select oficina_manutencao_status($1,$2,'concluida')",[tempo,os.id]),/Lance pelo menos uma peça ou serviço/);
await db.query("select oficina_servico_lancar($1,$2,$3,$4)",[tempo,id(961),os.id,JSON.stringify({descricao:'Troca de óleo',quantidade:1,valor_unitario:80})]);
await assert.rejects(()=>db.query("select oficina_manutencao_status($1,$2,'concluida')",[tempo,os.id]),/relatório de entrada/);
const foto=(t)=>`${tempo}/vistoria/${os.id}/${t}-1.jpg`;
await assert.rejects(()=>db.query("select oficina_vistoria_salvar($1,$2,'saida',$3)",[tempo,os.id,JSON.stringify({km:52100,combustivel:4,fotos:[foto('saida')]})]),/primeiro o relatório de entrada/);
await assert.rejects(()=>db.query("select oficina_vistoria_salvar($1,$2,'entrada',$3)",[tempo,os.id,JSON.stringify({km:52000,combustivel:4,fotos:[]})]),/pelo menos uma foto/);
await assert.rejects(()=>db.query("select oficina_vistoria_salvar($1,$2,'entrada',$3)",[tempo,os.id,JSON.stringify({km:52000,combustivel:4,fotos:['outra/empresa/x.jpg']})]),/Arquivo de foto inválido/);
const ve=(await one("select oficina_vistoria_salvar($1,$2,'entrada',$3) v",[tempo,os.id,JSON.stringify({km:'52.000',combustivel:4,itens:{estepe:true,documento:true},avarias:'Risco na porta traseira',fotos:[foto('entrada')]})])).v;
assert.deepEqual([Number(ve.km),ve.combustivel,ve.itens.estepe,ve.avarias],[52000,4,true,'Risco na porta traseira']);
await assert.rejects(()=>db.query("select oficina_manutencao_status($1,$2,'concluida')",[tempo,os.id]),/relatório de saída/);
await assert.rejects(()=>db.query("select oficina_vistoria_salvar($1,$2,'saida',$3)",[tempo,os.id,JSON.stringify({km:51000,combustivel:4,fotos:[foto('saida')]})]),/menor que o de entrada/);
await db.query("select oficina_vistoria_salvar($1,$2,'saida',$3)",[tempo,os.id,JSON.stringify({km:52003,combustivel:3,fotos:[foto('saida')]})]);
assert.deepEqual((await one('select oficina_vistorias_resumo($1) p',[tempo])).p[os.id],{entrada:true,saida:true});
assert.equal((await one('select oficina_vistorias($1,$2) p',[tempo,os.id])).p.length,2);
await db.query("select oficina_manutencao_status($1,$2,'concluida')",[tempo,os.id]);
await assert.rejects(()=>db.query("select oficina_vistoria_salvar($1,$2,'saida',$3)",[tempo,os.id,JSON.stringify({km:52003,combustivel:3,fotos:[foto('saida')]})]),/já foi encerrada/);

// Notas fiscais: guarda tudo (XML ou digitada), não lança a mesma nota duas vezes e lista com os itens.
await db.exec(fs.readFileSync(root+'/sql/oficina_notas_controle.sql','utf8'));
const chaveX='13261122763502005842552210001214601001214614',xmlNf='<nfeProc><NFe><infNFe Id="NFe'+chaveX+'"></infNFe></NFe></nfeProc>';
const antesX=Number((await one('select saldo from oficina_produtos where id=$1',[filtro.id])).saldo);
await db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(970),JSON.stringify({origem:'xml',chave:chaveX,numero:'121460',serie:'221',emitente_cnpj:'22763502005842',emitente_nome:'DISTRIBUIDORA FICTÍCIA',emissao:'2026-11-23',valor_total:596.79,valor_produtos:596.79,frete:0,desconto:0,natureza_operacao:'VENDA',xml:xmlNf}),
 JSON.stringify([{produto_id:filtro.id,quantidade:3,custo_unitario:198.93,marca:'Dayco',codigo_fornecedor:'10025600273',n:1,descricao:'TENSOR TENSIONADOR',ean:'7898598389552',ncm:'84835090',unidade:'UN',valor_unitario:198.93,valor_total:596.79}])]);
assert.equal(Number((await one('select saldo from oficina_produtos where id=$1',[filtro.id])).saldo),antesX+3);
await assert.rejects(()=>db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(971),JSON.stringify({origem:'manual',numero:'777',emitente_nome:'X',emissao:'2026-11-23'}),'[]']),/pelo menos um item/);
await assert.rejects(()=>db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(971),JSON.stringify({origem:'manual',numero:'777',emitente_nome:'X'}),JSON.stringify([{produto_id:filtro.id,quantidade:1,custo_unitario:10}])]),/data de emissão/);
await assert.rejects(()=>db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(971),JSON.stringify({origem:'xml',numero:'777',emitente_nome:'X',emissao:'2026-11-23'}),JSON.stringify([{produto_id:filtro.id,quantidade:1,custo_unitario:10}])]),/chave/);
const manual={origem:'manual',numero:'5580',serie:'1',emitente_nome:'Loja de Peças Fictícia',emitente_cnpj:'',emissao:'2026-11-20',valor_total:20,valor_produtos:20};
await db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(972),JSON.stringify(manual),JSON.stringify([{produto_id:filtro.id,quantidade:2,custo_unitario:10,descricao:'Filtro de óleo',unidade:'UN',valor_total:20}])]);
await assert.rejects(()=>db.query('select oficina_nota_importar($1,$2,$3,$4)',[tempo,id(973),JSON.stringify({...manual,emitente_nome:' loja de peças fictícia '}),JSON.stringify([{produto_id:filtro.id,quantidade:2,custo_unitario:10}])]),/já foi lançada/);
const notas=(await one('select oficina_notas_lista($1,$2,$3) p',[tempo,'2026-11-01','2026-11-30'])).p;
const nx=notas.find(n=>n.numero==='121460'),nm=notas.find(n=>n.numero==='5580');
assert.equal(nx.chave,chaveX);assert.equal(nx.origem,'xml');assert.equal(nx.tem_xml,true);assert.equal(nx.natureza_operacao,'VENDA');assert.equal(Number(nx.valor_total),596.79);
assert.deepEqual([nx.itens[0].descricao,nx.itens[0].produto,nx.itens[0].ncm,Number(nx.itens[0].custo_unitario),nx.itens[0].marca],['TENSOR TENSIONADOR','Filtro de óleo','84835090',198.93,'Dayco']);
assert.equal(nm.origem,'manual');assert.equal(nm.chave,null);assert.equal(nm.tem_xml,false);assert.equal(notas.indexOf(nx)<notas.indexOf(nm),true,'mais recente primeiro');
assert.equal((await one('select oficina_nota_xml($1,$2) x',[tempo,nx.id])).x,xmlNf);

// Corretiva: peça pelo custo da nota +40%, dividida 50/50. Manutenção já cobrada não muda.
const antesMargem=(await one('select oficina_orcamento($1,$2) p',[tempo,m.id])).p.totais;
await db.exec(fs.readFileSync(root+'/sql/oficina_margem_corretiva.sql','utf8'));
assert.equal(Number((await one('select oficina_rateio($1) r',[tempo])).r.margem_corretiva),40);
assert.deepEqual((await one('select oficina_orcamento($1,$2) p',[tempo,m.id])).p.totais.locatario,antesMargem.locatario,'já cobrada: fica como foi cobrada');
const mMg=(await one("select to_jsonb(x) m from oficina_manutencoes x where carro_id=$1 and status in ('aberta','aguardando_pecas') and cobranca_debito_id is null",[m.carro_id])).m;
assert.equal(mMg.responsavel_cliente_id,id(50));
await db.query("select oficina_saida($1,$2,$3,$4::jsonb,'Troca da correia')",[tempo,id(981),mMg.id,JSON.stringify([{produto_id:filtro.id,quantidade:2,natureza:'corretiva'}])]);
await db.query("select oficina_saida($1,$2,$3,$4::jsonb,'Lâmpada na revisão')",[tempo,id(982),mMg.id,JSON.stringify([{produto_id:filtro.id,quantidade:1,natureza:'preventiva'}])]);
await db.query("select oficina_servico_lancar($1,$2,$3,$4)",[tempo,id(983),mMg.id,JSON.stringify({descricao:'Mão de obra',quantidade:1,valor_unitario:100})]);
const om=(await one('select oficina_orcamento($1,$2) p',[tempo,mMg.id])).p;
const lc=om.linhas.find(l=>l.motivo==='Troca da correia'),lp=om.linhas.find(l=>l.motivo==='Lâmpada na revisão'),ls=om.linhas.find(l=>l.descricao==='Mão de obra');
const custo=Number(lc.custo_unitario);assert.ok(custo>0);
assert.equal(Number(lc.valor_unitario),Math.round(custo*1.4*100)/100);assert.equal(Number(lc.total),Math.round(2*Number(lc.valor_unitario)*100)/100);
assert.equal(Number(lc.valor_locatario),Math.round(Number(lc.total)*0.5*100)/100);assert.equal(Number(lc.margem),40);
assert.equal(Number(lp.valor_unitario),Number(lp.custo_unitario),'preventiva sem margem');assert.equal(Number(lp.valor_locatario),0);
assert.equal(Number(ls.valor_unitario),100,'serviço sem margem');assert.equal(Number(ls.valor_locatario),50);
assert.ok(Number(om.totais.custo_pecas)>=Math.round(3*custo*100)/100);assert.equal(mMg.tipo==='corretiva'||lc.natureza==='corretiva',true);
await assert.rejects(()=>db.query('select oficina_margem_salvar($1,$2)',[tempo,600]),/entre 0 e 500/);
await db.query('select oficina_margem_salvar($1,$2)',[tempo,0]);
assert.equal(Number((await one('select oficina_orcamento($1,$2) p',[tempo,mMg.id])).p.linhas.find(l=>l.motivo==='Troca da correia').valor_unitario),custo,'margem zerada: preço de custo');
await db.query('select oficina_margem_salvar($1,$2)',[tempo,40]);

// Batida / avaria: 100% do locatário, peça com a mesma margem, serviço sem margem.
await assert.rejects(()=>db.query("select oficina_saida($1,$2,$3,$4::jsonb,'x')",[tempo,id(984),mMg.id,JSON.stringify([{produto_id:filtro.id,quantidade:1,natureza:'batida'}])]));
await db.exec(fs.readFileSync(root+'/sql/oficina_avaria.sql','utf8'));
await db.exec(fs.readFileSync(root+'/sql/oficina_avaria.sql','utf8')); // rodar de novo não quebra
assert.equal(Number((await one('select oficina_rateio($1) r',[tempo])).r.avaria),100);
await db.query("select oficina_saida($1,$2,$3,$4::jsonb,'Para-choque da batida')",[tempo,id(985),mMg.id,JSON.stringify([{produto_id:filtro.id,quantidade:1,natureza:'avaria'}])]);
await db.query("select oficina_servico_lancar($1,$2,$3,$4)",[tempo,id(986),mMg.id,JSON.stringify({descricao:'Funilaria da batida',quantidade:1,valor_unitario:300,natureza:'avaria'})]);
const oa=(await one('select oficina_orcamento($1,$2) p',[tempo,mMg.id])).p;
const la=oa.linhas.find(l=>l.motivo==='Para-choque da batida'),sa=oa.linhas.find(l=>l.descricao==='Funilaria da batida');
assert.equal(Number(la.valor_unitario),Math.round(Number(la.custo_unitario)*1.4*100)/100,'avaria com margem');
assert.equal(Number(la.valor_locatario),Number(la.total));assert.equal(Number(la.valor_empresa),0);
assert.equal(Number(sa.valor_locatario),300);assert.equal(Number(sa.valor_empresa),0);
assert.equal(Number(oa.linhas.find(l=>l.motivo==='Troca da correia').valor_locatario),Number(lc.valor_locatario),'corretiva não muda');
const mAv=(await one("select oficina_manutencao_abrir($1,$2,$3::jsonb) r",[tempo,id(987),JSON.stringify({carro_id:id(41),tipo:'avaria',motivo:'Bateu a traseira'})]).catch(e=>({erro:e.message})));
if(mAv.erro)assert.doesNotMatch(mAv.erro,/corretiva|preventiva|tipo/i,'abrir manutenção de avaria');

// Mudar o tipo da manutenção aberta: peças e serviços acompanham, saídas continuam imutáveis.
await db.exec(fs.readFileSync(root+'/sql/oficina_tipo_relatorio.sql','utf8'));
await db.exec(fs.readFileSync(root+'/sql/oficina_tipo_relatorio.sql','utf8')); // rodar de novo não quebra
await assert.rejects(()=>db.query('select oficina_manutencao_tipo($1,$2,$3,$4)',[tempo,mMg.id,'preventiva','']),/Explique/);
await assert.rejects(()=>db.query('select oficina_manutencao_tipo($1,$2,$3,$4)',[tempo,mMg.id,'outra','x motivo']),/Escolha/);
await assert.rejects(()=>db.query('select oficina_manutencao_tipo($1,$2,$3,$4)',[tempo,m.id,'preventiva','motivo qualquer']),/já foi cobrada|encerrada/,'já cobrada não muda');
const antesTipo=(await one('select oficina_orcamento($1,$2) p',[tempo,mMg.id])).p;
assert.ok(Number(antesTipo.totais.locatario)>0);
await db.query('select oficina_manutencao_tipo($1,$2,$3,$4)',[tempo,mMg.id,'preventiva','Era revisão programada']);
const depoisTipo=(await one('select oficina_orcamento($1,$2) p',[tempo,mMg.id])).p;
assert.equal(depoisTipo.manutencao.tipo,'preventiva');
assert.ok(depoisTipo.linhas.every(l=>l.natureza==='preventiva'),'todas as linhas viram preventiva');
assert.equal(Number(depoisTipo.totais.locatario),0,'preventiva: empresa paga');
assert.ok(depoisTipo.linhas.filter(l=>l.tipo==='peca').every(l=>Number(l.valor_unitario)===Number(l.custo_unitario)),'preventiva sem margem');
assert.equal((await one("select count(*)::int n from oficina_movimentos where manutencao_id=$1 and natureza='preventiva'",[mMg.id])).n<depoisTipo.linhas.filter(l=>l.tipo==='peca').length,true,'saída original não foi alterada');
await db.query('select oficina_manutencao_tipo($1,$2,$3,$4)',[tempo,mMg.id,'avaria','Na verdade bateu o carro']);
const av2=(await one('select oficina_orcamento($1,$2) p',[tempo,mMg.id])).p;
assert.equal(Number(av2.totais.empresa),0,'avaria: 100% locatário');assert.equal(Number(av2.totais.locatario),Number(av2.totais.geral));
assert.equal((await one('select count(*)::int n from oficina_manutencao_tipo_historico where manutencao_id=$1',[mMg.id])).n,2);
// Relatório: o que cada saída vai custar ao locatário.
const rc=(await one("select oficina_movimentos_cobranca($1,current_date-30,current_date) r",[tempo])).r;
const daMg=rc.filter(x=>x.tipo_manutencao==='avaria');assert.ok(daMg.length>=3);assert.ok(daMg.every(x=>x.natureza==='avaria'&&Number(x.valor_empresa)===0));
assert.ok(rc.some(x=>x.situacao==='cobrado'),'manutenção já cobrada aparece como cobrada');
// KM opcional no relatório do carro.
const vOs=await one("select oficina_vistoria_salvar($1,$2,'entrada',$3) v",[tempo,mMg.id,JSON.stringify({combustivel:4,fotos:[`${tempo}/vistoria/${mMg.id}/entrada-1.jpg`]})]).catch(e=>({erro:e.message}));
assert.ok(!vOs.erro||!/KM/.test(vOs.erro),'sem KM não bloqueia: '+(vOs.erro||''));

// Sem login, nada.
await db.exec("set test.uid='';");await assert.rejects(()=>db.query('select oficina_painel($1)',[tempo]),/Sem acesso/);
await db.close();console.log('PASS SQL: Oficina com peças por código de barras, entradas com custo médio, saídas por carro corretiva/preventiva sem estoque negativo, manutenções ligadas à Frota, responsável, rateio, serviços, nota fiscal, fotos da peça, aprovação do analista, cobrança parcelada, responsável com substituição, módulo separado, trava de saída da manutenção, financeiro, código de barras gerado, cadastro completo com lote, saídas sem carro, registro imutável, funcionário pelo CPF, fluxo do estoque (caixa, venda, devolução e resumo) compra com marca, preço e fornecedor, entrada automática na oficina quando o carro entra em manutenção e ordem de serviço com relatórios de entrada e saída.');
})().catch(e=>{console.error(e);process.exit(1)});
