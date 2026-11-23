// Caução automática, Contas a receber e histórico do locatário no banco simulado: nada chega ao Supabase real.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),company=id(1),client=id(2),user=id(3);
(async()=>{const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.acesso_modulo(uuid,text) returns boolean language sql as $$select $1='${company}'::uuid$$;
create function public.acesso_admin_empresa(uuid) returns boolean language sql as $$select $1='${company}'::uuid$$;
create function public.acesso_gerenciar_usuarios(uuid) returns boolean language sql as $$select $1='${company}'::uuid$$;
create table empresas(id uuid primary key);insert into empresas values('${company}');
create table clientes(id uuid primary key,empresa_id uuid,nome_completo text);insert into clientes values('${client}','${company}','CLIENTE FICTÍCIO');
create table carros(id uuid primary key,empresa_id uuid,placa text,situacao text,valor_diaria numeric,situacao_confirmada_em timestamptz);
create table locacoes(id uuid primary key,empresa_id uuid,cliente_id uuid,carro_id uuid,status text,data_inicio timestamptz,data_fim timestamptz,data_assinatura date,valor_diaria numeric,valor_caucao_pago numeric,contrato_gerado_em timestamptz,assinatura_referencia text,valor_caucao numeric,saldo_caucao numeric,numero_parcelas_caucao integer,valor_parcela_caucao numeric);
create table documentos_locacao(id uuid primary key,locacao_id uuid,empresa_id uuid,tipo text,arquivo_original_path text);
create table storage.objects(bucket_id text,name text);
create table frota_periodos(id uuid primary key,grupo_id uuid,empresa_id uuid,carro_id uuid,cliente_id uuid,tipo text,inicio timestamptz,fim timestamptz,diaria numeric);
create table frota_levantamento(id uuid primary key,empresa_id uuid,carro_id uuid,cliente_id uuid,responsavel text,diaria numeric,inicio timestamptz,ativo boolean);
create table frota_recebimentos(id uuid primary key,empresa_id uuid,grupo_id uuid,competencia date,valor numeric,criado_por uuid,criado_em timestamptz default now(),recebido_em timestamptz,operacao_id uuid);
create table cliente_debitos(id uuid primary key,empresa_id uuid,cliente_id uuid,categoria text,descricao text,valor_total numeric,pago_anterior numeric,pedido jsonb,criado_por uuid not null,criado_em timestamptz not null default now());
create table cliente_debito_parcelas(id uuid primary key default gen_random_uuid(),empresa_id uuid,debito_id uuid,numero integer,vencimento date,valor numeric,unique(debito_id,numero));
create table cliente_debito_recebimentos(id uuid primary key,empresa_id uuid,parcela_id uuid,valor numeric,recebido_em timestamptz,observacao text,criado_por uuid);
create table locacao_eventos(id uuid primary key default gen_random_uuid(),empresa_id uuid,locacao_id uuid,acao text,usuario_id uuid,criado_em timestamptz default now(),dados jsonb,transacao bigint default txid_current(),unique(locacao_id,acao));
create table vistorias_locacao(id uuid primary key,locacao_id uuid,tipo text,data_hora timestamptz,responsavel text,quilometragem bigint,combustivel text,condicao_geral text);
create function public.frota_previsto(uuid,date) returns jsonb language sql as $$select '[]'::jsonb$$;
set test.uid='${user}';`);
await db.exec(fs.readFileSync(root+'/sql/diarias_ocupacoes.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/locacao_pdf_diarias.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/caucao_automatica_contas_receber.sql','utf8'));
await db.exec(fs.readFileSync(root+'/sql/clientes_operacao_complementos.sql','utf8').match(/create or replace function public\.cliente_debito_receber[\s\S]*?end \$\$;/)[0]);await db.exec(fs.readFileSync(root+'/sql/contas_receber_baixa.sql','utf8'));await db.exec(fs.readFileSync(root+'/sql/levantamento_saldo_inicial.sql','utf8'));await db.exec(`alter table clientes add column email text;alter table clientes add column telefone text;alter table carros add column marca text;alter table carros add column modelo text;alter table carros add column ano int;alter table carros add column cor text;alter table carros add column renavam text;alter table carros add column chassi text;
create table storage.buckets(id text primary key,name text,public boolean);
create table frota_km(id uuid primary key default gen_random_uuid(),empresa_id uuid,carro_id uuid,leitura_em timestamptz,km bigint,cliente_id uuid,responsavel text,ocupacao_chave text,observacoes text,criado_por uuid,criado_em timestamptz default now(),precisao_data text default 'hora',origem text default 'manual',unique(empresa_id,carro_id,leitura_em));
create table empresas_nome(x int);alter table empresas add column nome_fantasia text;
create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;`);
await db.exec(fs.readFileSync(root+'/sql/app_locatario.sql','utf8'));
await db.exec('create trigger locacao_status_controlado before insert or update on public.locacoes for each row execute function public.locacao_validar_status();');
const day=(await db.query("select (now() at time zone 'America/Manaus')::date::text d")).rows[0].d;
async function rental(n,paid,{car=n+100,storage=true}={}){const rental=id(n),vehicle=id(car),doc=id(n+200);await db.query("insert into carros values($1,$2,$3,'Disponível',145) on conflict do nothing",[vehicle,company,'TEST'+n]);await db.query("insert into locacoes values($1,$2,$3,$4,'Reservada',($5::date)::timestamp at time zone 'America/Manaus',null,$5,145,$6,now(),null)",[rental,company,client,vehicle,day,paid]);await db.query("insert into documentos_locacao values($1,$2,$3,'contrato_locacao',$4)",[doc,rental,company,rental+'/teste.pdf']);if(storage)await db.query("insert into storage.objects values('documentos-contratuais',$1)",[rental+'/teste.pdf']);return {rental,vehicle,doc};}const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
const caucao=(x,{total,pago,parcelas=100,parcela=null})=>db.query('update locacoes set valor_caucao=$2,valor_caucao_pago=$3,saldo_caucao=$2::numeric-$3::numeric,numero_parcelas_caucao=$4,valor_parcela_caucao=$5 where id=$1',[x.rental,total,pago,parcelas,parcela]);
const activate=x=>db.query('select locacao_ativar_por_pdf($1,$2,$3) p',[company,x.rental,x.doc]);
const debts=x=>db.query("select d.*,(select count(*)::int from cliente_debito_parcelas p where p.debito_id=d.id) n,(select sum(valor) from cliente_debito_parcelas p where p.debito_id=d.id) soma,(select min(vencimento)::text from cliente_debito_parcelas p where p.debito_id=d.id) primeira,(select max(valor) from cliente_debito_parcelas p where p.debito_id=d.id) maior,(select min(valor) from cliente_debito_parcelas p where p.debito_id=d.id) menor from cliente_debitos d where d.locacao_id=$1",[x.rental]).then(r=>r.rows);
const tomorrow=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);

// Entrada abaixo de 1000: caução parcelada a partir da data do contrato, com a parcela informada.
const a=await rental(10,400);await caucao(a,{total:1500,pago:400,parcela:11});await activate(a);
let [d]=await debts(a);assert.ok(d,'caução criada ao ativar');assert.equal(d.categoria,'caucao');assert.equal(d.n,100);assert.equal(Number(d.soma),1100);assert.equal(Number(d.maior),11);assert.equal(d.primeira,day);assert.equal(Number(d.valor_total),1500);assert.equal(Number(d.pago_anterior),400);
await activate(a);assert.equal((await debts(a)).length,1,'ativar de novo não duplica');

// Saldo que não divide exato: última parcela leva o resto.
const b=await rental(11,500);await caucao(b,{total:1000,pago:500,parcelas:3});await activate(b);
[d]=await debts(b);assert.equal(d.n,3);assert.equal(Number(d.soma),500);assert.equal(Number(d.menor),166.66);assert.equal(Number(d.maior),166.68);

// Entrada de 1000 ou mais: parcelas só depois da entrega, começando no dia seguinte.
const c=await rental(12,1000);await caucao(c,{total:1500,pago:1000,parcela:50});await activate(c);
assert.equal((await debts(c)).length,0,'sem parcelas antes da entrega');
await db.query("insert into vistorias_locacao values($1,$2,'saida',now()-interval '1 minute','RESPONSÁVEL',10000,'Cheio','Conferido')",[id(500),c.rental]);
await db.query("select locacao_confirmar_etapa($1,$2,'entrega',$3)",[company,c.rental,JSON.stringify({observacoes:'Entrega real conferida',vistoria_conferida:true,assinatura_conferida:true,data_entrega:new Date(Date.now()-60000).toISOString()})]);
[d]=await debts(c);assert.ok(d,'caução criada na entrega');assert.equal(d.n,10);assert.equal(d.primeira,tomorrow);

// Caução paga por inteiro: nada a parcelar.
const e=await rental(13,800);await caucao(e,{total:800,pago:800});await activate(e);assert.equal((await debts(e)).length,0);

// Caução manual em aberto do mesmo locatário: a automática não duplica e a manual nova é recusada.
await assert.rejects(()=>db.query("select cliente_debito_criar($1,$2,$3,'caucao','Caução manual',600,0,6,$4,'diaria')",[company,client,id(900),day]),/já está parcelada/);
await db.query("select cliente_debito_criar($1,$2,$3,'multa','Multa de trânsito',90,0,1,$4,'diaria')",[company,client,id(901),day]);

// Contas a receber: diária de hoje e parcelas de qualquer vencimento, só o que está em aberto.
await db.query("insert into cliente_debito_recebimentos values($1,$2,(select id from cliente_debito_parcelas where debito_id=$3 and numero=1),11,now(),null,$4)",[id(950),company,(await debts(a))[0].id,user]);
const painel=(await one('select contas_receber_painel($1) p',[company])).p;
assert.equal(painel.hoje,day);
assert.ok(painel.diarias.some(x=>x.grupo_id===a.rental&&Number(x.valor)===145),'diária de hoje em aberto');
const parcelasA=painel.parcelas.filter(x=>x.locacao_id===a.rental);assert.equal(parcelasA.length,99,'parcela quitada sai da lista');assert.ok(parcelasA.every(x=>x.categoria==='caucao'));
assert.ok(painel.parcelas.some(x=>x.categoria==='multa'),'extras também aparecem');

// Histórico do locatário: cobranças e pagamentos juntos.
const extrato=(await one('select locatario_extrato($1,$2) p',[company,client])).p;
assert.ok(extrato.cobrancas.some(x=>x.tipo==='diaria'));assert.ok(extrato.cobrancas.some(x=>x.tipo==='caucao'&&Number(x.recebido)===11));
assert.equal(extrato.pagamentos.length,1);assert.equal(extrato.pagamentos[0].tipo,'caucao');assert.equal(Number(extrato.pagamentos[0].valor),11);

// Locação antiga sem plano: aparece na conferência e o administrador parcela a partir da data escolhida.
const f=await rental(14,300,{car:114});await caucao(f,{total:900,pago:300,parcela:20});
await db.query("update locacoes set status='Ativa' where id=$1",[f.rental]).catch(()=>null);
await db.exec("alter table locacoes disable trigger locacao_status_controlado");await db.query("update locacoes set status='Ativa' where id=$1",[f.rental]);await db.exec("alter table locacoes enable trigger locacao_status_controlado");
// Locatário diferente para não esbarrar nas cauções acima.
const other=id(77);await db.query("insert into clientes values($1,$2,'OUTRO LOCATÁRIO')",[other,company]);await db.exec("alter table locacoes disable trigger locacao_status_controlado");await db.query('update locacoes set cliente_id=$2 where id=$1',[f.rental,other]);await db.exec("alter table locacoes enable trigger locacao_status_controlado");
const pend=(await one('select caucao_pendentes($1) p',[company])).p;const item=pend.find(x=>x.locacao_id===f.rental);assert.ok(item,'locação antiga na conferência');assert.equal(Number(item.saldo),600);
await db.query('select locacao_caucao_parcelar($1,$2,$3)',[company,f.rental,day]);
[d]=await debts(f);assert.equal(d.n,30);assert.equal(d.primeira,day);
assert.ok(!(await one('select caucao_pendentes($1) p',[company])).p.some(x=>x.locacao_id===f.rental),'sai da conferência depois de parcelar');
await assert.rejects(()=>db.query('select locacao_caucao_parcelar($1,$2,$3)',[company,c.rental,day]),/saldo|parcelada/);

// Baixa por locatário: diária e parcela de caução no mesmo pagamento, tudo ou nada, sem duplicar.
const parcela2=(await one('select id from cliente_debito_parcelas where debito_id=$1 and numero=2',[(await debts(a))[0].id])).id;
const op=id(960),itens=JSON.stringify([{tipo:'diaria',grupo_id:a.rental,dia:day,valor:100},{tipo:'parcela',parcela_id:parcela2,valor:11}]);
const momento=new Date(Date.now()-60000).toISOString(),receber=(o,total,its,quando=momento)=>db.query('select locatario_receber($1,$2,$3,$4::numeric,$5,$6::jsonb,$7) r',[company,client,o,total,quando,its,'PIX']);
await assert.rejects(()=>receber(id(961),120,itens),/soma/);
assert.equal(Number((await one('select coalesce(sum(valor),0) s from frota_recebimentos where grupo_id=$1',[a.rental])).s),0,'pagamento recusado não grava parte');
await receber(op,111,itens);await receber(op,111,itens);
assert.equal(Number((await one('select sum(valor) s from frota_recebimentos where grupo_id=$1 and competencia=$2',[a.rental,day])).s),100,'diária baixada uma vez');
assert.equal(Number((await one('select sum(valor) s from cliente_debito_recebimentos where parcela_id=$1',[parcela2])).s),11,'caução baixada uma vez');
await assert.rejects(()=>receber(op,50,JSON.stringify([{tipo:'diaria',grupo_id:a.rental,dia:day,valor:50}])),/Operação já utilizada/);
await assert.rejects(()=>receber(id(962),100,JSON.stringify([{tipo:'diaria',grupo_id:a.rental,dia:day,valor:100}])),/Diária de .*excede/);
await assert.rejects(()=>db.query("select locatario_receber($1,$2,$3,11::numeric,now()-interval '1 minute',$4::jsonb)",[company,other,id(963),JSON.stringify([{tipo:'parcela',parcela_id:parcela2,valor:11}])]),/outro locatário/);
const depois=(await one('select contas_receber_painel($1) p',[company])).p;
assert.equal(Number(depois.diarias.find(x=>x.grupo_id===a.rental).recebido),100,'Contas a receber mostra o valor baixado');

// Levantamento: diárias antes do corte quitadas sem virar caixa, saldo inicial em débitos, uma vez por locação.
const corte=tomorrow,velho=id(130),terceiro=id(78);
await db.query("insert into clientes values($1,$2,'LOCATÁRIO ANTIGO')",[terceiro,company]);
await db.query("insert into carros values($1,$2,'OLD1A23','Locado',145) on conflict do nothing",[velho,company]);
await db.query("insert into frota_levantamento values($1,$2,$3,$4,'LOCATÁRIO ANTIGO',null,now()-interval '2 days',true)",[id(131),company,velho,terceiro]);
const lista=(await one('select levantamento_locatarios($1,$2) p',[company,corte])).p;
const linhaA=lista.find(x=>x.grupo_id===a.rental),linhaVelho=lista.find(x=>x.grupo_id===id(131));
assert.ok(linhaA&&linhaVelho,'locações na lista do levantamento');assert.equal(linhaA.caucao_parcelada,true);assert.equal(Number(linhaA.abertas_valor),45,'diária de hoje com 45 em aberto');
assert.equal(linhaVelho.caucao_parcelada,false);assert.equal(linhaVelho.abertas_qtd,3);assert.equal(linhaVelho.cliente_id,terceiro);
const aplicar=(o,linhas,c=corte)=>db.query('select levantamento_aplicar($1,$2,$3,$4::jsonb) r',[company,o,c,JSON.stringify(linhas)]);
const levCount=async()=>Number((await one("select count(*) n from frota_recebimentos where origem='levantamento'")).n);
await assert.rejects(()=>aplicar(id(970),[{grupo_id:id(131)},{grupo_id:a.rental,caucao_saldo:100,caucao_parcela:10}]),/já está parcelada/);
assert.equal(await levCount(),0,'erro em uma linha não grava nenhuma');
await assert.rejects(()=>aplicar(id(970),[{grupo_id:a.rental,atraso:'abc'}]),/inválido/);
const pagosAntes=(await one('select locatario_extrato($1,$2) p',[company,client])).p.pagamentos.length;
const linhasOk=[{grupo_id:a.rental,atraso:300,extras:50,extras_descricao:'Avaria'},{grupo_id:id(131),caucao_saldo:300,caucao_parcela:20,caucao_inicio:corte}];
const res=(await aplicar(id(971),linhasOk)).rows[0].r;await aplicar(id(971),linhasOk);
assert.equal(res.length,2);assert.equal(res.find(x=>x.grupo_id===a.rental).diarias_quitadas,1);assert.equal(res.find(x=>x.grupo_id===id(131)).diarias_quitadas,3);
assert.equal(await levCount(),4,'repetir a mesma operação não duplica');
const pos=(await one('select contas_receber_painel($1) p',[company])).p;
assert.ok(!pos.diarias.some(x=>[a.rental,id(131)].includes(x.grupo_id)),'nenhuma diária antiga em aberto');
const outros=pos.parcelas.filter(x=>x.cliente_id===client&&x.categoria==='outro');
assert.ok(outros.some(x=>Number(x.valor)===300&&/Saldo de diárias/.test(x.descricao)&&x.vencimento===day),'saldo de diárias vencido no dia anterior ao corte');
assert.ok(outros.some(x=>Number(x.valor)===50&&/Avaria/.test(x.descricao)));
const cauVelho=pos.parcelas.filter(x=>x.cliente_id===terceiro&&x.categoria==='caucao');assert.equal(cauVelho.length,15);assert.equal(cauVelho[0].vencimento,corte);
const extratoA=(await one('select locatario_extrato($1,$2) p',[company,client])).p;
assert.equal(extratoA.pagamentos.length,pagosAntes,'quitação do levantamento não aparece como pagamento');
assert.ok(extratoA.cobrancas.some(x=>x.tipo==='diaria'&&x.levantamento===true));
await assert.rejects(()=>aplicar(id(972),[{grupo_id:a.rental}]),/já foi levantada/);
assert.ok((await one('select levantamento_locatarios($1,$2) p',[company,corte])).p.find(x=>x.grupo_id===a.rental).levantado_em,'lista mostra que já foi levantada');
await assert.rejects(()=>aplicar(id(973),[{grupo_id:id(131)}],'2026-01-01'),/corte/);
await assert.rejects(()=>receber(id(974),45,JSON.stringify([{tipo:'diaria',grupo_id:a.rental,dia:day,valor:45}])),/excede/);

// App do locatário: só entra quem foi liberado, cada um vê só os próprios dados, KM entra na frota.
const tenant=id(990);
await db.query("update clientes set email='ana@exemplo.test',telefone='(92) 99999-0000' where id=$1",[client]);
const lista0=(await one('select app_locatarios_lista($1) p',[company])).p;assert.ok(lista0.some(x=>x.cliente_id===client&&!x.liberado&&x.tem_contato));
await assert.rejects(()=>db.query('select app_locatario_liberar($1,$2,true)',[company,other]),/e-mail ou o celular/);
const asTenant=async(fn,jwt={email:'ana@exemplo.test'})=>{await db.exec(`set test.uid='${tenant}';set test.jwt='${JSON.stringify(jwt)}';`);try{return await fn();}finally{await db.exec(`set test.uid='${user}';set test.jwt='';`);}};
await asTenant(()=>assert.rejects(()=>db.query('select app_entrar()'),/não está liberado/));
await db.query('select app_locatario_liberar($1,$2,true)',[company,client]);
await asTenant(()=>assert.rejects(()=>db.query('select app_entrar()'),/não está liberado/),{email:'outra@exemplo.test'});
assert.equal((await asTenant(()=>one('select app_entrar() p'))).p.nome,'CLIENTE FICTÍCIO');
const resumo=(await asTenant(()=>one('select app_resumo() p'))).p;
assert.equal(resumo.veiculo.placa,'TEST10');assert.equal(Number(resumo.locacao.diaria),145);assert.equal(Number(resumo.caucao.total),1500);
assert.ok(Number(resumo.caucao.em_aberto)>0);assert.ok(resumo.a_pagar.itens.length>0);assert.ok(resumo.a_pagar.itens.every(x=>Number(x.valor)>Number(x.recebido)));
assert.ok(Number(resumo.a_pagar.vencido)>=350,'saldo inicial e extras vencidos aparecem');
assert.ok((await asTenant(()=>one('select app_extrato() p'))).p.cobrancas.length>0);
const docs=(await asTenant(()=>one('select app_documentos() p'))).p;assert.ok(docs.contratos.some(x=>x.path===a.rental+'/teste.pdf'));
assert.equal((await asTenant(()=>one('select app_documento_permitido($1,$2) p',['documentos-contratuais',a.rental+'/teste.pdf']))).p,true);
assert.equal((await asTenant(()=>one('select app_documento_permitido($1,$2) p',['documentos-contratuais',f.rental+'/teste.pdf']))).p,false,'contrato de outro locatário bloqueado');
const kmr=(await asTenant(()=>one('select app_informar_km($1) p',[12345]))).p;assert.equal(kmr.km,12345);
assert.equal((await one("select origem,cliente_id from frota_km where km=12345")).origem,'app');
await asTenant(()=>assert.rejects(()=>db.query('select app_informar_km($1)',[12400]),/acabou de informar/));
await db.exec("update frota_km set leitura_em=now()-interval '1 hour' where km=12345");
await asTenant(()=>assert.rejects(()=>db.query('select app_informar_km($1)',[100]),/menor que a última/));
await db.query('select app_locatario_liberar($1,$2,false)',[company,client]);
await asTenant(()=>assert.rejects(()=>db.query('select app_resumo()'),/não liberado/));
await asTenant(()=>assert.rejects(()=>db.query('select app_entrar()'),/não liberado/));
await assert.rejects(()=>db.query('select locatario_extrato_dados($1,$2)',[company,client]).then(()=>db.exec("set role authenticated;select public.locatario_extrato_dados('"+company+"','"+client+"');")).finally(()=>db.exec('reset role')),/permission|permiss/i);

await db.exec("set test.uid='';");await assert.rejects(()=>db.query('select contas_receber_painel($1)',[company]),/permiss/i);
await db.close();console.log('PASS SQL: caução parcelada na ativação ou na entrega, sem duplicar, Contas a receber em aberto, histórico do locatário, conferência das locações antigas, baixa por locatário, levantamento com data de corte e base do app do locatário.');
})().catch(e=>{console.error(e);process.exit(1)});
