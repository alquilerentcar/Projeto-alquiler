begin;
create or replace function public.acessos_excluir_conta(p_empresa uuid,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare alvo uuid; total integer; ref record; possui boolean;
begin
 if auth.uid() is null or not coalesce(public.acesso_desenvolvedor(),false) then
  raise exception using errcode='42501',message='Somente a BG SYSTEMS pode excluir uma conta de todas as empresas.';
 end if;
 select auth_user_id into alvo from public.usuarios_empresa where id=p_usuario and empresa_id=p_empresa;
 if alvo is null then raise exception 'Usuário não encontrado nesta empresa.';end if;
 if alvo=auth.uid() then raise exception 'Você não pode excluir sua própria conta.';end if;
 if exists(select 1 from public.administradores_plataforma where auth_user_id=alvo) then raise exception 'Contas da plataforma não podem ser excluídas aqui.';end if;
 perform 1 from public.empresas where id in(select empresa_id from public.usuarios_empresa where auth_user_id=alvo) order by id for update;
 perform 1 from auth.users where id=alvo for update;
 if exists(select 1 from public.usuarios_empresa u where u.auth_user_id=alvo and u.administrador and u.ativo and not exists(select 1 from public.usuarios_empresa outro where outro.empresa_id=u.empresa_id and outro.auth_user_id<>alvo and outro.administrador and outro.ativo)) then
  raise exception 'Cadastre outro administrador ativo em cada empresa antes de excluir esta conta.';
 end if;
 for ref in select c.conrelid::regclass as tabela,a.attname as coluna,c.confrelid from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace n on n.oid=t.relnamespace join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1 and c.confrelid in('auth.users'::regclass,'public.usuarios_empresa'::regclass) and t.relname not in('usuarios_empresa','usuario_modulos','administradores_plataforma') loop
  if ref.confrelid='auth.users'::regclass then execute format('select exists(select 1 from %s where %I=$1)',ref.tabela,ref.coluna) into possui using alvo;
  else execute format('select exists(select 1 from %s where %I in(select id from public.usuarios_empresa where auth_user_id=$1))',ref.tabela,ref.coluna) into possui using alvo;end if;
  if possui then raise exception 'Esta conta está vinculada ao histórico da operação. Suspenda o acesso; a exclusão não apagará esses registros.';end if;
 end loop;
 select count(*) into total from public.usuarios_empresa where auth_user_id=alvo;
 insert into public.acessos_auditoria(autor,acao,empresa_id,alvo_id) values(auth.uid(),'usuario_conta_excluida',p_empresa,alvo);
 delete from public.usuario_modulos where usuario_empresa_id in(select id from public.usuarios_empresa where auth_user_id=alvo);
 delete from public.usuarios_empresa where auth_user_id=alvo;
 delete from auth.users where id=alvo;
 return jsonb_build_object('ok',true,'acessos_removidos',total);
exception when foreign_key_violation then
 raise exception 'Esta conta possui registros que exigem preservação do histórico. Nenhuma exclusão foi aplicada. Suspenda o acesso ou solicite tratamento à BG SYSTEMS.';
end $$;
revoke all on function public.acessos_excluir_conta(uuid,uuid) from public,anon;
grant execute on function public.acessos_excluir_conta(uuid,uuid) to authenticated;
commit;
select 'Exclusão completa de contas configurada' as resultado;
