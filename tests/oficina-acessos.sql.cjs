// Correção das funções de Acessos para o módulo Oficina, com funções simuladas iguais aos trechos do banco real.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{const db=new PGlite();await db.exec(`
create table modulos(id serial primary key,codigo text);insert into modulos(codigo) values('locacao'),('oficina'),('financeiro');
create table empresa_modulos(empresa_id int,modulo_id int,ativo boolean);insert into empresa_modulos values(1,2,true);
create function public.acesso_modulo(int,text) returns boolean language sql as $$select $2 in ('oficina')$$;
create function public.acessos_contexto(e_id int) returns jsonb language plpgsql as $$declare mods jsonb; e record; begin select e_id id into e;
 select coalesce(jsonb_agg(codigo),'[]') into mods from public.modulos where codigo='locacao' and public.acesso_modulo(e.id,codigo); return mods; end$$;
create function public.acessos_salvar_empresa(eid int) returns void language plpgsql as $$begin
 update public.empresa_modulos set ativo=false where empresa_id=eid and modulo_id in (select id from public.modulos where codigo='locacao'); end$$;
create function public.acessos_validar_usuario(p_dados jsonb,p_modulos text[]) returns void language plpgsql as $$begin
 if coalesce((p_dados->>'administrador')::boolean,false) and not ('locacao'=any(coalesce(p_modulos,array[]::text[]))) then raise exception 'Administradores da empresa precisam de acesso ao módulo Locação.'; end if; end$$;
create function public.acesso_gerenciar_usuarios(p_empresa int) returns boolean language sql as $$select public.acesso_modulo(p_empresa,'locacao') and exists(select 1)$$;`);
assert.deepEqual((await db.query('select acessos_contexto(1) m')).rows[0].m,[],'antes: Oficina não aparece');
const sql=fs.readFileSync(root+'/sql/oficina_modulo_acessos.sql','utf8');
await db.exec(sql);
assert.deepEqual((await db.query('select acessos_contexto(1) m')).rows[0].m,['oficina'],'depois: Oficina aparece ao entrar');
await db.query('select acessos_salvar_empresa(1)');assert.equal((await db.query('select ativo from empresa_modulos')).rows[0].ativo,false,'desmarcar a Oficina funciona');
await db.query(`select acessos_validar_usuario('{"administrador":true}',array['oficina'])`);
await assert.rejects(()=>db.query(`select acessos_validar_usuario('{"administrador":true}',array[]::text[])`),/Administradores/);
assert.equal((await db.query('select acesso_gerenciar_usuarios(1) g')).rows[0].g,true,'administrador da oficina gerencia usuários');
await db.exec(sql);// rodar de novo não quebra
const c=(await db.query(sql.slice(sql.indexOf('select\n (select count(*)')))).rows[0];assert.deepEqual(Object.values(c).map(Number),[1,1,1,1]);
await db.close();console.log('PASS SQL: Acessos reconhecem o módulo Oficina (entrada, empresa, administrador e usuários).');
})().catch(e=>{console.error(e);process.exit(1)});
