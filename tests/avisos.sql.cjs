// Avisos automáticos: devolução amanhã, devolução atrasada e CNH vencendo/vencida, sem repetir e saindo quando resolvem.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();const E='00000000-0000-0000-0000-0000000000e1',U='00000000-0000-0000-0000-00000000000a';
 const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table public.empresas(id uuid primary key);insert into public.empresas values('${E}');
 create table public.clientes(id uuid primary key,empresa_id uuid,nome_completo text);
 create table public.carros(id uuid primary key,placa text);
 create table public.locacoes(id uuid primary key,empresa_id uuid,cliente_id uuid,carro_id uuid,status text,data_fim timestamptz);
 create table public.frota_levantamento(id uuid primary key,cliente_id uuid,ativo boolean);
 create table public.frota_periodos(id uuid primary key,cliente_id uuid,fim timestamptz,tipo text);
 create function public.acesso_modulo(p uuid,m text) returns boolean language sql stable as $$select auth.uid()='${U}'::uuid and m='locacao'$$;`);
 await db.exec(fs.readFileSync(root+'/sql/avisos_automaticos.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/sql/avisos_automaticos.sql','utf8')); // rodar de novo não quebra
 const q=async(s,p)=>(await db.query(s,p)).rows[0];
 const hoje=(await q("select (now() at time zone 'America/Manaus')::date::text d")).d;
 await db.exec(`insert into carros values('${id(21)}','TSD1D53'),('${id(22)}','TAF4F00');
 insert into clientes(id,empresa_id,nome_completo,cnh_validade) values('${id(31)}','${E}','JOAO',current_date+10),('${id(32)}','${E}','MARIA',current_date-3),('${id(33)}','${E}','SEM CARRO',current_date+5);
 insert into locacoes values('${id(41)}','${E}','${id(31)}','${id(21)}','Ativa',((current_date+1)::timestamp+interval '10 hours') at time zone 'America/Manaus'),
  ('${id(42)}','${E}','${id(32)}','${id(22)}','Ativa',now()-interval '2 days'),('${id(43)}','${E}','${id(33)}','${id(21)}','Encerrada',now()-interval '5 days');`);
 await db.exec(`set test.uid='${U}'`);
 let av=(await q('select avisos_listar($1) a',[E])).a;const tipos=av.map(a=>a.tipo).sort();
 assert.deepEqual(tipos,['cnh_vencendo','cnh_vencida','devolucao_amanha','devolucao_atrasada'],'um de cada; SEM CARRO e locação encerrada não avisam');
 assert.equal(av[0].nivel,'urgente','urgentes primeiro');assert.match(av.find(a=>a.tipo==='devolucao_amanha').mensagem,/amanhã às 10:00/);
 assert.match(av.find(a=>a.tipo==='devolucao_atrasada').mensagem,/2 dia\(s\)/);
 // Abrir de novo não repete.
 assert.equal((await q('select avisos_listar($1) a',[E])).a.length,4);
 // Resolvido some e não volta no mesmo dia.
 const cnh=av.find(a=>a.tipo==='cnh_vencendo');await db.query('select avisos_resolver($1,$2)',[E,cnh.id]);assert.equal((await q('select avisos_listar($1) a',[E])).a.length,3);
 // Devolução registrada: aviso de atraso sai sozinho.
 await db.exec(`update locacoes set status='Encerrada' where id='${id(42)}'`);av=(await q('select avisos_listar($1) a',[E])).a;assert.ok(!av.some(a=>a.tipo==='devolucao_atrasada'));
 // CNH renovada: aviso de vencida sai.
 await db.exec(`update clientes set cnh_validade=current_date+400 where id='${id(32)}'`);av=(await q('select avisos_listar($1) a',[E])).a;assert.ok(!av.some(a=>a.cliente_id===id(32)),'MARIA não está mais com carro e renovou');
 // Rotina diária só com a chave de serviço; usuário comum não chama.
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select avisos_gerar_todas()'),/permission denied/);await db.exec('reset role');
 await db.exec("set test.uid=''");await assert.rejects(()=>db.query('select avisos_listar($1)',[E]),/Sem acesso/);
 assert.ok(Number((await q('select avisos_gerar_todas() n')).n)>=0);
 await db.close();console.log('PASS SQL: avisos automáticos (devolução amanhã/atrasada, CNH vencendo/vencida, sem repetir, resolvem sozinhos, rotina só com chave de serviço). Hoje='+hoje);
})().catch(e=>{console.error(e);process.exit(1)});
