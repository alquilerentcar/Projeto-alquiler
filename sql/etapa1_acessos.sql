-- ETAPA 1: Controle BG SYSTEMS, administradores da empresa e Locação com Financeiro.
-- Execute após ativar_acessos_base_parcial.sql ou acessos_setup.sql, nunca os reaplique depois.
begin;
do $$ begin
 if to_regprocedure('public.acessos_contexto(uuid)') is null then
  raise exception 'Aplique primeiro a ativação inicial de Acessos.';
 end if;
end $$;

create or replace function public.acesso_gerenciar_usuarios(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.acesso_desenvolvedor() or (
  public.acesso_modulo(p_empresa,'locacao') and exists(
   select 1 from public.usuarios_empresa where empresa_id=p_empresa and auth_user_id=auth.uid() and ativo and administrador));
$$;

create or replace function public.acesso_admin_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.acesso_gerenciar_usuarios(p_empresa);
$$;

create or replace function public.acessos_contexto(p_empresa uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare dev boolean:=public.acesso_desenvolvedor(); e public.empresas%rowtype; u public.usuarios_empresa%rowtype; lista jsonb; mods jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sessão necessária'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'cnpj',cnpj,'nome_fantasia',nome_fantasia) order by nome_fantasia),'[]') into lista from public.empresas where public.acesso_empresa(id);
 select * into e from public.empresas where public.acesso_empresa(id) and
  ((p_empresa is not null and id=p_empresa) or (p_empresa is null and jsonb_array_length(lista)=1)) order by criado_em limit 1;
 select * into u from public.usuarios_empresa where auth_user_id=auth.uid() and empresa_id=e.id and ativo limit 1;
 select coalesce(jsonb_agg(codigo),'[]') into mods from public.modulos where codigo='locacao' and public.acesso_modulo(e.id,codigo);
 return jsonb_build_object('schemaVersion',2,'developer',dev,'canManageCompany',e.id is not null and public.acesso_gerenciar_usuarios(e.id),
 'company',case when e.id is null then null else to_jsonb(e) end,'companies',lista,'modules',mods,
 'user',jsonb_build_object('nome',coalesce((select nome from public.administradores_plataforma where auth_user_id=auth.uid() and ativo and nivel='desenvolvedor'),u.nome,(select nome from public.usuarios_empresa where auth_user_id=auth.uid() and ativo order by criado_em limit 1),'Usuário'),
 'administrador',dev or coalesce(u.administrador,false),'usuario',u.usuario),
 'accessDenied',not dev and (jsonb_array_length(lista)=0 or (p_empresa is not null and u.id is null)));
end $$;

create or replace function public.acessos_validar_usuario(p_dados jsonb,p_modulos text[])
returns void language plpgsql security definer set search_path='' as $$
declare eid uuid:=(p_dados->>'empresa_id')::uuid; requested_code text;
begin
 if not public.acesso_gerenciar_usuarios(eid) then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 if not exists(select 1 from public.empresas where id=eid) then raise exception 'Empresa não encontrada.'; end if;
 if length(trim(coalesce(p_dados->>'nome','')))<2 or length(p_dados->>'nome')>120 or coalesce(p_dados->>'usuario','') !~ '^[A-Za-z0-9._-]{3,40}$' then raise exception 'Informe nome e identificação do usuário válidos.'; end if;
 if coalesce((p_dados->>'administrador')::boolean,false) and not ('locacao'=any(coalesce(p_modulos,array[]::text[]))) then raise exception 'Administradores da empresa precisam de acesso ao módulo Locação.'; end if;
 if p_modulos is null then raise exception 'Informe os módulos do usuário.'; end if;
 foreach requested_code in array p_modulos loop
  if not exists(select 1 from public.empresa_modulos em join public.modulos m on m.id=em.modulo_id where em.empresa_id=eid and em.ativo and m.ativo and m.codigo=requested_code and m.codigo in ('locacao')) then raise exception 'O módulo % não está liberado para a empresa.',requested_code; end if;
 end loop;
 if exists(select 1 from public.usuarios_empresa where empresa_id=eid and upper(usuario)=upper(p_dados->>'usuario') and id is distinct from nullif(p_dados->>'id','')::uuid) then raise exception 'Identificação de usuário já cadastrada nesta empresa.'; end if;
end $$;
create or replace function public.acessos_salvar_usuario(p_dados jsonb,p_modulos text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=nullif(p_dados->>'id','')::uuid; eid uuid:=(p_dados->>'empresa_id')::uuid; authid uuid;
begin
 if not public.acesso_gerenciar_usuarios(eid) then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 perform 1 from public.empresas where id=eid for update;
 perform public.acessos_validar_usuario(p_dados,p_modulos);
 if not public.acesso_desenvolvedor() and uid is not null then
  if exists(select 1 from public.usuarios_empresa where id=uid and auth_user_id=auth.uid())
     and (not coalesce((p_dados->>'ativo')::boolean,false) or not coalesce((p_dados->>'administrador')::boolean,false)) then
   raise exception 'Você não pode suspender nem remover seu próprio perfil de administrador.';
  end if;
  if exists(select 1 from public.usuarios_empresa u join public.administradores_plataforma a on a.auth_user_id=u.auth_user_id where u.id=uid and a.ativo and a.nivel='desenvolvedor') then
   raise exception using errcode='42501',message='Somente o desenvolvedor pode alterar seu vínculo com a empresa.';
  end if;
 end if;
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
create or replace function public.acessos_salvar_empresa(p_dados jsonb,p_modulos text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid:=nullif(p_dados->>'id','')::uuid; requested_code text;
begin
 if not public.acesso_desenvolvedor() then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 if length(trim(coalesce(p_dados->>'nome_fantasia','')))<2 or length(trim(coalesce(p_dados->>'razao_social','')))<2 or coalesce(p_dados->>'cnpj','') !~ '^[0-9]{14}$' then raise exception 'Informe nome, razão social e CNPJ com 14 dígitos.'; end if;
 if p_modulos is null then raise exception 'Informe os módulos da licença.'; end if;
 foreach requested_code in array p_modulos loop
  if not exists(select 1 from public.modulos where modulos.codigo=requested_code and ativo and modulos.codigo in ('locacao')) then raise exception 'Módulo indisponível: %',requested_code; end if;
 end loop;
 if eid is null then
  insert into public.empresas(razao_social,nome_fantasia,cnpj,email,licenca_ativa,licenca_ate)
  values(trim(p_dados->>'razao_social'),trim(p_dados->>'nome_fantasia'),p_dados->>'cnpj',nullif(p_dados->>'email',''),coalesce((p_dados->>'licenca_ativa')::boolean,true),nullif(p_dados->>'licenca_ate','')::date) returning id into eid;
 else
  perform 1 from public.empresas where id=eid for update;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  update public.empresas set razao_social=trim(p_dados->>'razao_social'),nome_fantasia=trim(p_dados->>'nome_fantasia'),cnpj=p_dados->>'cnpj',email=nullif(p_dados->>'email',''),licenca_ativa=coalesce((p_dados->>'licenca_ativa')::boolean,false),licenca_ate=nullif(p_dados->>'licenca_ate','')::date where id=eid;
 end if;
 update public.empresa_modulos set ativo=false where empresa_id=eid and modulo_id in (select id from public.modulos where codigo='locacao');
 insert into public.empresa_modulos(empresa_id,modulo_id,ativo) select eid,id,true from public.modulos where modulos.codigo=any(p_modulos)
 on conflict(empresa_id,modulo_id) do update set ativo=true;
 insert into public.acessos_auditoria(autor,acao,empresa_id,alvo_id) values(auth.uid(),'empresa_licenca_salva',eid,eid);
 return eid;
end $$;
create or replace function public.acessos_painel()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.acesso_desenvolvedor() then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 return jsonb_build_object(
 'empresas',coalesce((select jsonb_agg(to_jsonb(e) order by e.nome_fantasia) from public.empresas e),'[]'),
 'modulos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'disponivel',m.codigo in ('locacao')) order by m.ordem) from public.modulos m where ativo and codigo<>'financeiro'),'[]'),
 'licencas',coalesce((select jsonb_agg(to_jsonb(em)) from public.empresa_modulos em),'[]'),
 'usuarios',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'empresa_id',u.empresa_id,'nome',u.nome,'usuario',u.usuario,'email',u.email,'cargo',u.cargo,'ativo',u.ativo,'administrador',u.administrador) order by u.nome) from public.usuarios_empresa u),'[]'),
 'permissoes',coalesce((select jsonb_agg(to_jsonb(um)) from public.usuario_modulos um),'[]'));
end $$;
create or replace function public.acessos_empresa_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.acesso_gerenciar_usuarios(p_empresa) then raise exception using errcode='42501',message='Somente o desenvolvedor'; end if;
 return jsonb_build_object(
 'empresas',coalesce((select jsonb_agg(to_jsonb(e) order by e.nome_fantasia) from public.empresas e where e.id=p_empresa),'[]'),
 'modulos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'disponivel',m.codigo in ('locacao')) order by m.ordem) from public.modulos m where ativo and codigo<>'financeiro'),'[]'),
 'licencas',coalesce((select jsonb_agg(to_jsonb(em)) from public.empresa_modulos em where em.empresa_id=p_empresa),'[]'),
 'usuarios',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'empresa_id',u.empresa_id,'nome',u.nome,'usuario',u.usuario,'email',u.email,'cargo',u.cargo,'ativo',u.ativo,'administrador',u.administrador) order by u.nome) from public.usuarios_empresa u where u.empresa_id=p_empresa),'[]'),
 'permissoes',coalesce((select jsonb_agg(to_jsonb(um)) from public.usuario_modulos um join public.usuarios_empresa u on u.id=um.usuario_empresa_id where u.empresa_id=p_empresa),'[]'));
end $$;
revoke all on function public.acesso_gerenciar_usuarios(uuid),public.acessos_empresa_painel(uuid) from public,anon;
grant execute on function public.acesso_gerenciar_usuarios(uuid),public.acessos_empresa_painel(uuid) to authenticated;
-- Financeiro passa a usar a licença de Locação. Os registros antigos de licença são preservados.
do $$ begin
 if to_regclass('public.pagamentos_locacao') is not null then
  drop policy if exists acesso_empresa_modulo on public.pagamentos_locacao;
  create policy acesso_empresa_modulo on public.pagamentos_locacao for all to authenticated
  using(public.acesso_modulo(empresa_id,'locacao')) with check(public.acesso_modulo(empresa_id,'locacao'));
 end if;
end $$;
commit;
select 'Etapa 1 aplicada' as resultado;
