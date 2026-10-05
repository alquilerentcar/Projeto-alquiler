-- Execute uma vez no SQL Editor. Preserva contas, senhas e permissões existentes.
begin;
create or replace function public.perfil_email_alvo(p_empresa uuid,p_usuario uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare alvo uuid;
begin
 if auth.uid() is null or not public.acesso_gerenciar_usuarios(p_empresa) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 select auth_user_id into alvo from public.usuarios_empresa where id=p_usuario and empresa_id=p_empresa;
 if alvo is null then raise exception 'Usuário não encontrado nesta empresa.'; end if;
 if not public.acesso_desenvolvedor() and (
  exists(select 1 from public.administradores_plataforma where auth_user_id=alvo and ativo)
  or exists(select 1 from public.usuarios_empresa where auth_user_id=alvo and empresa_id<>p_empresa)
 ) then raise exception 'Esta conta é compartilhada ou da plataforma. Solicite a alteração ao Controle da BG SYSTEMS.'; end if;
 return alvo;
end $$;
revoke all on function public.perfil_email_alvo(uuid,uuid) from public,anon;
grant execute on function public.perfil_email_alvo(uuid,uuid) to authenticated;
-- Executa na mesma transação da alteração no Auth; evita e-mails divergentes.
create or replace function public.perfil_sincronizar_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.usuarios_empresa set email=new.email where auth_user_id=new.id;
 return new;
end $$;
revoke all on function public.perfil_sincronizar_email() from public,anon,authenticated;
drop trigger if exists perfil_email_sincronizado on auth.users;
create trigger perfil_email_sincronizado after update of email on auth.users for each row
when (old.email is distinct from new.email) execute function public.perfil_sincronizar_email();
commit;
select 'Perfil e alteração de e-mail preparados' as resultado;
