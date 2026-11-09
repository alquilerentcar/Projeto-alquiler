-- Execute depois de multiempresa_setup.sql. Migração transacional e reaplicável.
begin;
alter table public.empresas add column if not exists licenca_ativa boolean not null default true;
alter table public.empresas add column if not exists licenca_ate date;
alter table public.usuarios_empresa add column if not exists email text;
update public.usuarios_empresa p set email=u.email from auth.users u where u.id=p.auth_user_id and p.email is null;
insert into public.modulos(codigo,nome,descricao,ordem) values ('financeiro','Financeiro','Contas e relatórios financeiros',20) on conflict(codigo) do nothing;
-- Mantém a navegação financeira já disponível à Alquiler na primeira aplicação.
insert into public.empresa_modulos(empresa_id,modulo_id,ativo)
select e.id,m.id,true from public.empresas e cross join public.modulos m where e.cnpj='54135275000161' and m.codigo='financeiro' on conflict do nothing;
insert into public.usuario_modulos(usuario_empresa_id,modulo_id,pode_visualizar,pode_criar,pode_editar,pode_excluir)
select u.id,m.id,true,true,true,true from public.usuarios_empresa u join public.empresas e on e.id=u.empresa_id cross join public.modulos m
where e.cnpj='54135275000161' and u.usuario='SAUGUSTO' and m.codigo='financeiro' on conflict do nothing;

create or replace function public.acesso_desenvolvedor()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.administradores_plataforma where auth_user_id=auth.uid() and ativo and nivel='desenvolvedor');
$$;
create or replace function public.acesso_licenca(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.empresas where id=p_empresa and ativa and licenca_ativa and (licenca_ate is null or licenca_ate>=current_date));
$$;
create or replace function public.acesso_modulo(p_empresa uuid,p_modulo text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.acesso_licenca(p_empresa) and exists(
   select 1 from public.empresa_modulos em join public.modulos m on m.id=em.modulo_id
   where em.empresa_id=p_empresa and em.ativo and m.ativo and m.codigo=p_modulo
   and (public.acesso_desenvolvedor() or exists(
     select 1 from public.usuarios_empresa u join public.usuario_modulos um on um.usuario_empresa_id=u.id
     where u.auth_user_id=auth.uid() and u.empresa_id=p_empresa and u.ativo and um.modulo_id=m.id and um.pode_visualizar)));
$$;
create or replace function public.acesso_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.acesso_desenvolvedor() or exists(select 1 from public.usuarios_empresa where empresa_id=p_empresa and auth_user_id=auth.uid() and ativo);
$$;
create or replace function public.acesso_admin_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.acesso_desenvolvedor() or (public.acesso_licenca(p_empresa) and exists(select 1 from public.usuarios_empresa where empresa_id=p_empresa and auth_user_id=auth.uid() and ativo and administrador));
$$;

create table if not exists public.acessos_auditoria(id bigint generated always as identity primary key,autor uuid,acao text not null,empresa_id uuid,alvo_id uuid,criado_em timestamptz not null default now());
alter table public.acessos_auditoria enable row level security;
revoke all on public.acessos_auditoria from anon,authenticated;
grant select on public.acessos_auditoria to authenticated;
drop policy if exists auditoria_desenvolvedor on public.acessos_auditoria;
create policy auditoria_desenvolvedor on public.acessos_auditoria for select to authenticated using(public.acesso_desenvolvedor());

create or replace function public.acessos_contexto(p_empresa uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare dev boolean:=public.acesso_desenvolvedor(); e public.empresas%rowtype; u public.usuarios_empresa%rowtype; lista jsonb; mods jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sessão necessária'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'cnpj',cnpj,'nome_fantasia',nome_fantasia) order by nome_fantasia),'[]') into lista from public.empresas where public.acesso_empresa(id);
 select * into e from public.empresas where public.acesso_empresa(id) and (p_empresa is null or id=p_empresa) order by criado_em limit 1;
 select * into u from public.usuarios_empresa where auth_user_id=auth.uid() and empresa_id=e.id and ativo limit 1;
 select coalesce(jsonb_agg(codigo),'[]') into mods from public.modulos where codigo in ('locacao','financeiro') and public.acesso_modulo(e.id,codigo);
 return jsonb_build_object('developer',dev,'company',case when e.id is null then null else to_jsonb(e) end,'companies',lista,'modules',mods,
 'user',jsonb_build_object('nome',coalesce((select nome from public.administradores_plataforma where auth_user_id=auth.uid() and ativo and nivel='desenvolvedor'),u.nome,'Usuário'),'administrador',dev or coalesce(u.administrador,false),'usuario',u.usuario),
 'accessDenied',not dev and u.id is null);
end $$;

create or replace function public.acessos_painel()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.acesso_desenvolvedor() then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 return jsonb_build_object(
 'empresas',coalesce((select jsonb_agg(to_jsonb(e) order by e.nome_fantasia) from public.empresas e),'[]'),
 'modulos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'disponivel',m.codigo in ('locacao','financeiro')) order by m.ordem) from public.modulos m where ativo),'[]'),
 'licencas',coalesce((select jsonb_agg(to_jsonb(em)) from public.empresa_modulos em),'[]'),
 'usuarios',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'empresa_id',u.empresa_id,'nome',u.nome,'usuario',u.usuario,'email',u.email,'cargo',u.cargo,'ativo',u.ativo,'administrador',u.administrador) order by u.nome) from public.usuarios_empresa u),'[]'),
 'permissoes',coalesce((select jsonb_agg(to_jsonb(um)) from public.usuario_modulos um),'[]'));
end $$;

create or replace function public.acessos_salvar_empresa(p_dados jsonb,p_modulos text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid:=nullif(p_dados->>'id','')::uuid; requested_code text;
begin
 if not public.acesso_desenvolvedor() then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 if length(trim(coalesce(p_dados->>'nome_fantasia','')))<2 or length(trim(coalesce(p_dados->>'razao_social','')))<2 or coalesce(p_dados->>'cnpj','') !~ '^[0-9]{14}$' then raise exception 'Informe nome, razão social e CNPJ com 14 dígitos.'; end if;
 if p_modulos is null then raise exception 'Informe os módulos da licença.'; end if;
 foreach requested_code in array p_modulos loop
  if not exists(select 1 from public.modulos where modulos.codigo=requested_code and ativo and modulos.codigo in ('locacao','financeiro')) then raise exception 'Módulo indisponível: %',requested_code; end if;
 end loop;
 if eid is null then
  insert into public.empresas(razao_social,nome_fantasia,cnpj,email,licenca_ativa,licenca_ate)
  values(trim(p_dados->>'razao_social'),trim(p_dados->>'nome_fantasia'),p_dados->>'cnpj',nullif(p_dados->>'email',''),coalesce((p_dados->>'licenca_ativa')::boolean,true),nullif(p_dados->>'licenca_ate','')::date) returning id into eid;
 else
  perform 1 from public.empresas where id=eid for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  update public.empresas set razao_social=trim(p_dados->>'razao_social'),nome_fantasia=trim(p_dados->>'nome_fantasia'),cnpj=p_dados->>'cnpj',email=nullif(p_dados->>'email',''),licenca_ativa=coalesce((p_dados->>'licenca_ativa')::boolean,false),licenca_ate=nullif(p_dados->>'licenca_ate','')::date where id=eid;
 end if;
 update public.empresa_modulos set ativo=false where empresa_id=eid;
 insert into public.empresa_modulos(empresa_id,modulo_id,ativo) select eid,id,true from public.modulos where modulos.codigo=any(p_modulos)
 on conflict(empresa_id,modulo_id) do update set ativo=true;
 insert into public.acessos_auditoria(autor,acao,empresa_id,alvo_id) values(auth.uid(),'empresa_licenca_salva',eid,eid);
 return eid;
end $$;

create or replace function public.acessos_validar_usuario(p_dados jsonb,p_modulos text[])
returns void language plpgsql security definer set search_path='' as $$
declare eid uuid:=(p_dados->>'empresa_id')::uuid; requested_code text;
begin
 if not public.acesso_desenvolvedor() then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 if not exists(select 1 from public.empresas where id=eid) then raise exception 'Empresa não encontrada.'; end if;
 if length(trim(coalesce(p_dados->>'nome','')))<2 or length(p_dados->>'nome')>120 or coalesce(p_dados->>'usuario','') !~ '^[A-Za-z0-9._-]{3,40}$' then raise exception 'Informe nome e identificação do usuário válidos.'; end if;
 if p_modulos is null then raise exception 'Informe os módulos do usuário.'; end if;
 foreach requested_code in array p_modulos loop
  if not exists(select 1 from public.empresa_modulos em join public.modulos m on m.id=em.modulo_id where em.empresa_id=eid and em.ativo and m.ativo and m.codigo=requested_code and m.codigo in ('locacao','financeiro')) then raise exception 'O módulo % não está liberado para a empresa.',requested_code; end if;
 end loop;
 if exists(select 1 from public.usuarios_empresa where empresa_id=eid and upper(usuario)=upper(p_dados->>'usuario') and id is distinct from nullif(p_dados->>'id','')::uuid) then raise exception 'Identificação de usuário já cadastrada nesta empresa.'; end if;
end $$;

create or replace function public.acessos_salvar_usuario(p_dados jsonb,p_modulos text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=nullif(p_dados->>'id','')::uuid; eid uuid:=(p_dados->>'empresa_id')::uuid; authid uuid;
begin
 if not public.acesso_desenvolvedor() then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 perform 1 from public.empresas where id=eid for update;
 perform public.acessos_validar_usuario(p_dados,p_modulos);
 if uid is null then
  authid:=(p_dados->>'auth_user_id')::uuid;
  if not exists(select 1 from auth.users where id=authid) then raise exception 'Conta de autenticação não encontrada.'; end if;
  insert into public.usuarios_empresa(auth_user_id,empresa_id,nome,usuario,email,cargo,administrador,ativo)
  values(authid,eid,trim(p_dados->>'nome'),upper(p_dados->>'usuario'),(select email from auth.users where id=authid),left(p_dados->>'cargo',100),coalesce((p_dados->>'administrador')::boolean,false),coalesce((p_dados->>'ativo')::boolean,true)) returning id into uid;
 else
  update public.usuarios_empresa set nome=trim(p_dados->>'nome'),usuario=upper(p_dados->>'usuario'),cargo=left(p_dados->>'cargo',100),administrador=coalesce((p_dados->>'administrador')::boolean,false),ativo=coalesce((p_dados->>'ativo')::boolean,false) where id=uid and empresa_id=eid;
  if not found then raise exception 'Usuário não encontrado nesta empresa.'; end if;
 end if;
 delete from public.usuario_modulos where usuario_empresa_id=uid;
 insert into public.usuario_modulos(usuario_empresa_id,modulo_id,pode_visualizar,pode_criar,pode_editar,pode_excluir)
 select uid,id,true,true,true,true from public.modulos where codigo=any(p_modulos);
 insert into public.acessos_auditoria(autor,acao,empresa_id,alvo_id) values(auth.uid(),'usuario_acesso_salvo',eid,uid);
 return uid;
end $$;

-- Remove permissões antigas nas tabelas de controle. A escrita passa pelas funções acima.
do $$ declare t text; p record; begin
 foreach t in array array['empresas','usuarios_empresa','empresa_modulos','usuario_modulos','modulos','administradores_plataforma'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy empresas_leitura on public.empresas for select to authenticated using(public.acesso_empresa(id));
create policy perfis_leitura on public.usuarios_empresa for select to authenticated using(auth_user_id=auth.uid() or public.acesso_desenvolvedor());
create policy licencas_leitura on public.empresa_modulos for select to authenticated using(public.acesso_empresa(empresa_id));
create policy permissoes_leitura on public.usuario_modulos for select to authenticated using(public.acesso_desenvolvedor() or exists(select 1 from public.usuarios_empresa u where u.id=usuario_empresa_id and u.auth_user_id=auth.uid()));
create policy modulos_leitura on public.modulos for select to authenticated using(ativo);
create policy plataforma_leitura on public.administradores_plataforma for select to authenticated using(auth_user_id=auth.uid());
-- Administradores da empresa editam apenas dados cadastrais, nunca sua licença.
grant update(razao_social,nome_fantasia,cnpj,email,telefone,endereco,logo_url,papel_timbrado_nome,papel_timbrado_path) on public.empresas to authenticated;
create policy empresa_cadastro on public.empresas for update to authenticated using(public.acesso_admin_empresa(id)) with check(public.acesso_admin_empresa(id));

-- Empresa imutável e referências sempre dentro da mesma empresa.
create or replace function public.acesso_validar_relacoes()
returns trigger language plpgsql security definer set search_path='' as $$
declare fk record; parent_empresa uuid; payload jsonb:=to_jsonb(new); begin
 if tg_op='UPDATE' and new.empresa_id is distinct from old.empresa_id then raise exception 'Não é permitido transferir registros entre empresas.'; end if;
 if new.empresa_id is null then raise exception 'Informe a empresa do registro.'; end if;
 for fk in select a.attname col,c.confrelid::regclass parent,b.attname parent_col
 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
 where c.contype='f' and c.conrelid=tg_relid and cardinality(c.conkey)=1
 and exists(select 1 from pg_attribute x where x.attrelid=c.confrelid and x.attname='empresa_id' and not x.attisdropped)
 loop
  if payload->>fk.col is not null then
   execute format('select empresa_id from %s where %I::text=$1',fk.parent,fk.parent_col) into parent_empresa using payload->>fk.col;
   if parent_empresa is distinct from new.empresa_id then raise exception 'Referência fora da empresa do registro.'; end if;
  end if;
 end loop;
 return new;
end $$;

do $$ declare t text; p record; modulo text; initial_empresa uuid; begin
 select id into initial_empresa from public.empresas where cnpj='54135275000161';
 foreach t in array array['clientes','fornecedores','carros','contratos','locacoes','documentos_locacao','anexos_locacao','vistorias_locacao','certificados_digitais','modelos_contrato','contratos_gerados','assinaturas_contrato','pagamentos_locacao','documento_signatarios','documento_eventos','campos_modelo_contrato','filiais','funcoes_empresa'] loop
  if to_regclass('public.'||t) is null then continue; end if;
  execute format('alter table public.%I add column if not exists empresa_id uuid references public.empresas(id)',t);
  -- A base anterior pertencia somente à Alquiler; não transfere registros já classificados.
  execute format('update public.%I set empresa_id=$1 where empresa_id is null',t) using initial_empresa;
  execute format('alter table public.%I alter column empresa_id set not null',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create index if not exists %I on public.%I(empresa_id)',t||'_empresa_idx',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  modulo:=case when t='pagamentos_locacao' then 'financeiro' else 'locacao' end;
  execute format('create policy acesso_empresa_modulo on public.%I for all to authenticated using(public.acesso_modulo(empresa_id,%L)) with check(public.acesso_modulo(empresa_id,%L))',t,modulo,modulo);
  execute format('drop trigger if exists acesso_relacoes on public.%I',t);
  execute format('create trigger acesso_relacoes before insert or update on public.%I for each row execute function public.acesso_validar_relacoes()',t);
 end loop;
end $$;

-- Arquivos novos usam empresa_id/..., os antigos são resolvidos pelo registro de origem.
create or replace function public.acesso_arquivo(p_bucket text,p_nome text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare eid uuid; prefixo text:=split_part(p_nome,'/',1); begin
 if p_bucket not in ('documentos-clientes','certificados-digitais','documentos-locacao','documentos-contratuais') then return false; end if;
 select id into eid from public.empresas where id::text=prefixo;
 if eid is null and p_bucket='documentos-clientes' then
  select empresa_id into eid from public.clientes where id::text=prefixo;
  if eid is null and to_regclass('public.fornecedores') is not null then execute 'select empresa_id from public.fornecedores where id::text=$1' into eid using prefixo; end if;
 elsif eid is null and p_bucket in ('documentos-locacao','documentos-contratuais') then
  select empresa_id into eid from public.locacoes where id::text=prefixo;
 elsif eid is null and p_bucket='certificados-digitais' and to_regclass('public.certificados_digitais') is not null then
  execute 'select empresa_id from public.certificados_digitais where arquivo_path=$1 limit 1' into eid using p_nome;
 end if;
 return eid is not null and public.acesso_modulo(eid,'locacao');
end $$;
-- Restritiva também fecha quaisquer políticas permissivas legadas nesses buckets.
drop policy if exists acesso_arquivos_limite on storage.objects;
create policy acesso_arquivos_limite on storage.objects as restrictive for all to public
using(bucket_id not in ('documentos-clientes','certificados-digitais','documentos-locacao','documentos-contratuais') or public.acesso_arquivo(bucket_id,name))
with check(bucket_id not in ('documentos-clientes','certificados-digitais','documentos-locacao','documentos-contratuais') or public.acesso_arquivo(bucket_id,name));
drop policy if exists acesso_arquivos on storage.objects;
create policy acesso_arquivos on storage.objects for all to authenticated using(public.acesso_arquivo(bucket_id,name)) with check(public.acesso_arquivo(bucket_id,name));
update storage.buckets set public=false where id in ('documentos-clientes','certificados-digitais','documentos-locacao','documentos-contratuais');

-- Função legada é chamada somente por trigger, não diretamente por usuários.
do $$ begin
 if to_regprocedure('public.gerar_previsao_pagamentos(uuid)') is not null then
  revoke execute on function public.gerar_previsao_pagamentos(uuid) from public,anon,authenticated;
 end if;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure assinatura from pg_proc where pronamespace='public'::regnamespace and (proname like 'acesso\_%' escape '\' or proname like 'acessos\_%' escape '\') loop
  execute format('revoke all on function %s from public,anon',f.assinatura);
  execute format('grant execute on function %s to authenticated',f.assinatura);
 end loop;
end $$;
-- A política restritiva para storage também deve conseguir avaliar sessões anônimas (sempre sem permissão).
grant execute on function public.acesso_arquivo(text,text) to anon;
commit;
