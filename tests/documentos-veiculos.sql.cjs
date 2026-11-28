// Documentos dos veículos: registro com arquivo privado na pasta da empresa, validade, arquivar sem apagar, envio registrado e avisos de vencimento.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();const E='00000000-0000-0000-0000-0000000000e1',O='00000000-0000-0000-0000-0000000000e2',U='00000000-0000-0000-0000-00000000000a';
 const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');const CAR=id(21),CLI=id(31),D1=id(51),D2=id(52);
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create table public.empresas(id uuid primary key);insert into public.empresas values('${E}'),('${O}');
 create table public.clientes(id uuid primary key,empresa_id uuid,nome_completo text,email text,cnh_validade date);
 create table public.carros(id uuid primary key,empresa_id uuid,placa text,situacao text,marca text,modelo text);
 create table public.locacoes(id uuid primary key,empresa_id uuid,cliente_id uuid,carro_id uuid,status text,data_fim timestamptz);
 create table public.frota_levantamento(id uuid primary key,empresa_id uuid,carro_id uuid,cliente_id uuid,ativo boolean);
 create table public.frota_periodos(id uuid primary key,empresa_id uuid,carro_id uuid,cliente_id uuid,fim timestamptz,tipo text);
 create table public.frota_substituicoes(id uuid primary key,empresa_id uuid,cliente_id uuid,anterior_id uuid,posterior_id uuid,confirmado_em timestamptz);
 create function public.acesso_modulo(p uuid,m text) returns boolean language sql stable as $$select auth.uid()='${U}'::uuid and p='${E}'::uuid and m='locacao'$$;`);
 await db.exec(fs.readFileSync(root+'/sql/avisos_automaticos.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/sql/documentos_veiculos.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/sql/documentos_veiculos.sql','utf8')); // rodar de novo não quebra
 const q=async(s,p)=>(await db.query(s,p)).rows[0];
 await db.exec(`insert into carros values('${CAR}','${E}','TSD1D53','Locado');insert into clientes(id,empresa_id,nome_completo,email) values('${CLI}','${E}','JOAO','joao@exemplo.com');
 insert into frota_levantamento values('${id(61)}','${E}','${CAR}','${CLI}',true);
 insert into storage.objects(bucket_id,name) values('documentos-veiculos','${E}/${CAR}/${D1}.pdf'),('documentos-veiculos','${E}/${CAR}/${D2}.jpg');`);
 assert.equal((await q("select public from storage.buckets where id='documentos-veiculos'")).public,false,'arquivos privados');
 await db.exec(`set test.uid='${U}'`);
 assert.equal((await q('select acesso_doc_veiculo($1) a',[E+'/'+CAR+'/x.pdf'])).a,true);assert.equal((await q('select acesso_doc_veiculo($1) a',[O+'/'+CAR+'/x.pdf'])).a,false,'outra empresa não lê');assert.equal((await q('select acesso_doc_veiculo($1) a',['lixo/x.pdf'])).a,false);
 await assert.rejects(()=>db.query('select carro_documento_registrar($1,$2,$3,$4,$5,$6,$7)',[E,CAR,D1,'crlv','CRLV 2026',O+'/'+CAR+'/'+D1+'.pdf',null]),/Confira o arquivo/,'caminho fora da pasta da empresa');
 await db.query('select carro_documento_registrar($1,$2,$3,$4,$5,$6,current_date+10)',[E,CAR,D1,'crlv','CRLV 2026',E+'/'+CAR+'/'+D1+'.pdf']);
 await db.query('select carro_documento_registrar($1,$2,$3,$4,$5,$6,current_date-1)',[E,CAR,D2,'seguro','Apólice 2025',E+'/'+CAR+'/'+D2+'.jpg']);
 await db.query('select carro_documento_registrar($1,$2,$3,$4,$5,$6,current_date+10)',[E,CAR,D1,'crlv','CRLV 2026',E+'/'+CAR+'/'+D1+'.pdf']); // repetir não duplica
 assert.equal((await q('select count(*)::int n from carro_documentos')).n,2);
 assert.deepEqual((await q('select carro_ocupante_atual($1,$2) o',[E,CAR])).o,{cliente_id:CLI,nome:'JOAO',email:'joao@exemplo.com'});
 let av=(await q('select avisos_listar($1) a',[E])).a;assert.deepEqual(av.map(a=>a.tipo).sort(),['documento_vencendo','documento_vencido']);assert.match(av.find(a=>a.tipo==='documento_vencido').titulo,/Seguro vencido · TSD1D53/);
 // Arquivar o seguro vencido tira o aviso; o registro continua.
 await db.query('select carro_documento_atualizar($1,$2,current_date-1,true)',[E,D2]);av=(await q('select avisos_listar($1) a',[E])).a;assert.deepEqual(av.map(a=>a.tipo),['documento_vencendo']);
 assert.equal((await q('select count(*)::int n from carro_documentos')).n,2,'arquivar não apaga');
 // CRLV renovado (validade longe) tira o aviso de vencendo.
 await db.query('select carro_documento_atualizar($1,$2,current_date+300,false)',[E,D1]);assert.equal((await q('select avisos_listar($1) a',[E])).a.length,0);
 const env=(await q('select carro_documento_envio_registrar($1,$2,$3,$4,$5,$6) r',[E,CAR,CLI,' JOAO@Exemplo.com ',[D1],'Entrega do veículo (locação)'])).r;assert.ok(env);
 assert.equal((await q('select email from carro_documento_envios')).email,'joao@exemplo.com');
 await assert.rejects(()=>db.query('select carro_documento_registrar($1,$2,$3,$4,$5,$6,$7)',[O,CAR,id(53),'crlv','X',O+'/'+CAR+'/'+id(53)+'.pdf',null]),/Sem permissão/);
 // ===== Envio automático do CRLV =====
 const CAR2=id(22),CLI2=id(32);await db.exec(`insert into carros values('${CAR2}','${E}','TAF4F00','Disponível');insert into clientes(id,empresa_id,nome_completo,email) values('${CLI2}','${E}','MARIA',null);`);
 assert.equal((await q('select count(*)::int n from crlv_envios_fila')).n,1,'a ocupação do JOAO (levantamento) já entrou na fila');
 // Locação ativada no mesmo dia, mesmo carro e locatário: não duplica.
 await db.exec(`insert into locacoes values('${id(71)}','${E}','${CLI}','${CAR}','Reservada',null);update locacoes set status='Ativa' where id='${id(71)}';`);
 assert.equal((await q('select count(*)::int n from crlv_envios_fila')).n,1,'um e-mail só por carro+locatário+dia');
 // Troca confirmada para o TAF4F00 (sem CRLV) da MARIA (sem e-mail).
 await db.exec(`insert into frota_substituicoes values('${id(81)}','${E}','${CLI2}','${CAR}','${CAR2}',null);update frota_substituicoes set confirmado_em=now() where id='${id(81)}';`);
 let fila=(await q('select crlv_fila_pendentes($1) f',[E])).f;assert.equal(fila.length,2);
 const fJoao=fila.find(x=>x.cliente_id===CLI),fMaria=fila.find(x=>x.cliente_id===CLI2);
 assert.equal(fJoao.documento.id,D1,'pega o CRLV atual do carro');assert.equal(fJoao.email,'joao@exemplo.com');assert.equal(fMaria.documento,null);assert.equal(fMaria.origem,'substituicao');
 await db.query('select crlv_fila_resultado($1,$2,false,$3,null)',[E,fMaria.id,'sem_crlv']);
 av=(await q('select avisos_listar($1) a',[E])).a;assert.match(av.find(a=>a.tipo==='crlv_pendente').mensagem,/TAF4F00 está sem CRLV/);
 assert.equal((await q('select tentativas from crlv_envios_fila where id=$1',[fMaria.id])).tentativas,0,'falta de CRLV não gasta tentativa');
 await db.query('select crlv_fila_resultado($1,$2,true,null,$3)',[E,fJoao.id,D1]);
 assert.ok((await q('select enviado_em from crlv_envios_fila where id=$1',[fJoao.id])).enviado_em);assert.equal((await q("select count(*)::int n from carro_documento_envios where motivo like 'Envio automático%'")).n,1);
 assert.equal((await q('select crlv_fila_pendentes($1) f',[E])).f.length,1,'enviado sai da fila');
 // Erro do serviço gasta tentativa; com 5 falhas para de tentar.
 for(let i=0;i<5;i++)await db.query('select crlv_fila_resultado($1,$2,false,$3,null)',[E,fMaria.id,'brevo 500']);
 assert.equal((await q('select crlv_fila_pendentes($1) f',[E])).f.length,0);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select crlv_fila_pendentes_todas()'),/permission denied/);await db.exec('reset role');
 await db.exec("set test.uid=''");await assert.rejects(()=>db.query('select carro_ocupante_atual($1,$2)',[E,CAR]),/Sem permissão/);
 await db.close();console.log('PASS SQL: documentos dos veículos (pasta da empresa, sem duplicar, ocupante atual, avisos de vencimento, arquivar sem apagar, envio registrado, fila automática do CRLV sem duplicar, pendência com aviso).');
})().catch(e=>{console.error(e);process.exit(1)});
