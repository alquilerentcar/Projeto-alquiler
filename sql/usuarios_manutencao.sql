begin;
create or replace function public.acessos_excluir_usuario(p_empresa uuid,p_usuario uuid)
returns void language plpgsql security definer set search_path='' as $$
declare u public.usuarios_empresa;
begin
 if auth.uid() is null or not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then raise exception 'Sem permissão para gerenciar esta empresa.';end if;
 perform 1 from public.empresas where id=p_empresa for update;
 select * into u from public.usuarios_empresa where id=p_usuario and empresa_id=p_empresa for update;
 if u.id is null then raise exception 'Usuário não encontrado nesta empresa.';end if;
 if u.auth_user_id=auth.uid() then raise exception 'Você não pode excluir seu próprio acesso.';end if;
 if exists(select 1 from public.administradores_plataforma where auth_user_id=u.auth_user_id and ativo and nivel='desenvolvedor') then raise exception 'O acesso do desenvolvedor não pode ser excluído aqui.';end if;
 if u.administrador and u.ativo and not exists(select 1 from public.usuarios_empresa where empresa_id=p_empresa and id<>u.id and administrador and ativo) then raise exception 'Cadastre outro administrador ativo antes de excluir este acesso.';end if;
 insert into public.acessos_auditoria(autor,acao,empresa_id,alvo_id) values(auth.uid(),'usuario_acesso_excluido',p_empresa,u.id);
 delete from public.usuario_modulos where usuario_empresa_id=u.id;
 delete from public.usuarios_empresa where id=u.id and empresa_id=p_empresa;
end $$;
revoke all on function public.acessos_excluir_usuario(uuid,uuid) from public,anon;
grant execute on function public.acessos_excluir_usuario(uuid,uuid) to authenticated;
commit;
select 'Manutenção de usuários ativada' as resultado;
