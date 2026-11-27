// Tela inicial por usuário: o administrador escolhe; vale só se o usuário tiver o módulo da tela.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();const E1='00000000-0000-0000-0000-0000000000e1',E2='00000000-0000-0000-0000-0000000000e2',ADM='00000000-0000-0000-0000-00000000000a',OP='00000000-0000-0000-0000-00000000000b';
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table public.empresas(id uuid primary key);insert into public.empresas values('${E1}'),('${E2}');
 create table public.usuarios_empresa(id uuid primary key default gen_random_uuid(),auth_user_id uuid,empresa_id uuid references public.empresas(id),ativo boolean default true,usuario text);
 insert into public.usuarios_empresa(id,auth_user_id,empresa_id,usuario) values('00000000-0000-0000-0000-0000000000a1','${ADM}','${E1}','ADM'),('00000000-0000-0000-0000-0000000000b1','${OP}','${E1}','OP'),('00000000-0000-0000-0000-0000000000b2','${OP}','${E2}','OP');
 create table public.modulos_teste(empresa uuid,usuario uuid,modulo text);insert into public.modulos_teste values('${E1}','${OP}','oficina'),('${E2}','${OP}','locacao');
 create function public.acesso_gerenciar_usuarios(p uuid) returns boolean language sql stable as $$select auth.uid()='${ADM}'::uuid and p='${E1}'::uuid$$;
 create function public.acesso_modulo(p uuid,m text) returns boolean language sql stable as $$select exists(select 1 from public.modulos_teste where empresa=p and usuario=auth.uid() and modulo=m)$$;`);
 await db.exec(fs.readFileSync(root+'/sql/tela_inicial_usuario.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/sql/tela_inicial_usuario.sql','utf8')); // rodar de novo não quebra
 const as=async uid=>db.exec(`set test.uid='${uid}'`);const q=async(s,p)=>(await db.query(s,p)).rows[0];
 await as(OP);await assert.rejects(()=>db.query('select acesso_tela_inicial_definir($1,$2,$3)',[E1,'00000000-0000-0000-0000-0000000000b1','pdv-estoque.html']),/Somente o administrador/);
 await assert.rejects(()=>db.query('select acesso_telas_iniciais($1)',[E1]),/Somente o administrador/);
 await as(ADM);
 await assert.rejects(()=>db.query('select acesso_tela_inicial_definir($1,$2,$3)',[E1,'00000000-0000-0000-0000-0000000000b1','https://outro.site']),/check/);
 await assert.rejects(()=>db.query('select acesso_tela_inicial_definir($1,$2,$3)',[E1,'00000000-0000-0000-0000-0000000000b2','pdv-estoque.html']),/não encontrado nesta empresa/,'não mexe em usuário de outra empresa');
 await db.query('select acesso_tela_inicial_definir($1,$2,$3)',[E1,'00000000-0000-0000-0000-0000000000b1','pdv-estoque.html']);
 assert.deepEqual((await q('select acesso_telas_iniciais($1) t',[E1])).t,[{usuario_empresa_id:'00000000-0000-0000-0000-0000000000b1',tela:'pdv-estoque.html'}]);
 await as(OP);assert.equal((await q('select acesso_minha_tela_inicial($1) t',[E1])).t,'pdv-estoque.html');
 assert.equal((await q('select acesso_minha_tela_inicial($1) t',[E2])).t,null,'outra empresa: sem tela definida');
 await as(ADM);await db.query('select acesso_tela_inicial_definir($1,$2,$3)',[E1,'00000000-0000-0000-0000-0000000000b1','dashboard.html']);
 await as(OP);assert.equal((await q('select acesso_minha_tela_inicial($1) t',[E1])).t,null,'sem o módulo Locação, a tela não vale');
 await as(ADM);await db.query('select acesso_tela_inicial_definir($1,$2,$3)',[E1,'00000000-0000-0000-0000-0000000000b1','']);
 assert.deepEqual((await q('select acesso_telas_iniciais($1) t',[E1])).t,[],'vazio volta ao padrão');
 await db.close();console.log('PASS SQL: tela inicial por usuário (só administrador define, só da própria empresa, vale só com o módulo).');
})().catch(e=>{console.error(e);process.exit(1)});
