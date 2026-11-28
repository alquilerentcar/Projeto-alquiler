// Fila dos parcelamentos: um débito novo começa depois da última parcela em aberto do locatário (o caução fica fora da fila).
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();const E='00000000-0000-0000-0000-0000000000e1',OUTRA='00000000-0000-0000-0000-0000000000e2',U='00000000-0000-0000-0000-00000000000a',C='00000000-0000-0000-0000-0000000000c1',C2='00000000-0000-0000-0000-0000000000c2';
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table public.empresas(id uuid primary key);insert into public.empresas values('${E}'),('${OUTRA}');
 create table public.clientes(id uuid primary key,empresa_id uuid);insert into public.clientes values('${C}','${E}'),('${C2}','${E}');
 create function public.acesso_modulo(p uuid,m text) returns boolean language sql stable as $$select auth.uid()='${U}'::uuid and p='${E}'::uuid$$;
 create function public.oficina_acesso(p uuid) returns boolean language sql stable as $$select auth.uid()='${U}'::uuid$$;
 create table public.oficina_manutencoes(id uuid primary key,empresa_id uuid,responsavel_cliente_id uuid);
 create table public.cliente_debitos(id uuid primary key,empresa_id uuid,cliente_id uuid,categoria text,descricao text);
 create table public.cliente_debito_parcelas(id uuid primary key default gen_random_uuid(),empresa_id uuid,debito_id uuid,numero int,vencimento date,valor numeric);
 create table public.cliente_debito_recebimentos(id uuid primary key default gen_random_uuid(),parcela_id uuid,valor numeric);`);
 await db.exec(fs.readFileSync(root+'/sql/parcelamento_fila.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/sql/parcelamento_fila.sql','utf8')); // rodar de novo não quebra
 const q=async(s,p)=>(await db.query(s,p)).rows[0];const hoje=(await q("select (now() at time zone 'America/Manaus')::date::text d")).d;
 const dia=n=>(new Date(Date.parse(hoje+'T12:00:00Z')+n*86400000)).toISOString().slice(0,10);
 await db.exec(`set test.uid='${U}'`);
 let f=(await q('select locatario_fila_inicio($1,$2) f',[E,C])).f;assert.equal(f.inicio,hoje,'sem parcelas: começa hoje');assert.equal(f.ultimo_vencimento,null);
 // Caução de 100 dias não entra na fila; manutenção de 12 parcelas sim.
 await db.exec(`insert into cliente_debitos values('00000000-0000-0000-0000-0000000000d1','${E}','${C}','caucao','Caução'),('00000000-0000-0000-0000-0000000000d2','${E}','${C}','manutencao','Manutenção #10');`);
 for(let i=0;i<100;i++)await db.query("insert into cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor) values($1,'00000000-0000-0000-0000-0000000000d1',$2,$3,65)",[E,i+1,dia(i)]);
 for(let i=0;i<12;i++)await db.query("insert into cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor) values($1,'00000000-0000-0000-0000-0000000000d2',$2,$3,10)",[E,i+1,dia(i)]);
 f=(await q('select locatario_fila_inicio($1,$2) f',[E,C])).f;assert.equal(f.ultimo_vencimento,dia(11));assert.equal(f.inicio,dia(12),'débito novo começa depois da 12ª parcela da manutenção');assert.equal(f.ultima_descricao,'Manutenção #10');
 // Parcela já paga não segura a fila.
 const ult=(await q("select id from cliente_debito_parcelas where debito_id='00000000-0000-0000-0000-0000000000d2' and numero=12")).id;await db.query('insert into cliente_debito_recebimentos(parcela_id,valor) values($1,10)',[ult]);
 assert.equal((await q('select locatario_fila_inicio($1,$2) f',[E,C])).f.inicio,dia(11));
 // Parcelas antigas vencidas e em aberto: a fila nunca começa no passado.
 await db.exec(`insert into cliente_debitos values('00000000-0000-0000-0000-0000000000d3','${E}','${C2}','multa','Multa antiga');`);await db.query("insert into cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor) values($1,'00000000-0000-0000-0000-0000000000d3',1,$2,50)",[E,dia(-5)]);
 assert.equal((await q('select locatario_fila_inicio($1,$2) f',[E,C2])).f.inicio,hoje);
 // Oficina: pelo locatário responsável da manutenção.
 await db.exec(`insert into oficina_manutencoes values('00000000-0000-0000-0000-0000000000f1','${OUTRA}','${C}'),('00000000-0000-0000-0000-0000000000f2','${OUTRA}',null)`);
 assert.equal((await q('select oficina_fila_inicio($1,$2) f',[OUTRA,'00000000-0000-0000-0000-0000000000f1'])).f.inicio,dia(11));
 await assert.rejects(()=>db.query('select oficina_fila_inicio($1,$2)',[OUTRA,'00000000-0000-0000-0000-0000000000f2']),/sem locatário/i);
 await assert.rejects(()=>db.query('select locatario_fila_inicio($1,$2)',[OUTRA,C]),/Sem acesso/);
 await assert.rejects(()=>db.query('select fila_parcelas_cliente($1)',[C]).then(async()=>{await db.exec('set role authenticated');await db.query('select fila_parcelas_cliente($1)',[C]);}),/permission denied/);
 await db.exec('reset role');await db.exec("set test.uid=''");await assert.rejects(()=>db.query('select locatario_fila_inicio($1,$2)',[E,C]),/Sem acesso/);
 await db.close();console.log('PASS SQL: fila dos parcelamentos (depois da última parcela, caução fora, paga não segura, nunca no passado, oficina pelo responsável).');
})().catch(e=>{console.error(e);process.exit(1)});
