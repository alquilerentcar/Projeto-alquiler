-- Execute este arquivo para retirar as permissões temporárias sem login.
-- As políticas antigas do usuário autorizado continuam preservadas.
-- Para voltar a usar o aplicativo depois da revogação, reative a tela e as
-- verificações de login no código da interface.

do $$
declare
  tabela text;
begin
  foreach tabela in array array['clientes', 'fornecedores', 'carros', 'contratos'] loop
    if to_regclass(format('public.%I', tabela)) is not null then
      execute format('drop policy if exists acesso_sem_login_select on public.%I', tabela);
      execute format('drop policy if exists acesso_sem_login_insert on public.%I', tabela);
      execute format('drop policy if exists acesso_sem_login_update on public.%I', tabela);
      execute format('revoke select, insert, update on public.%I from anon', tabela);
    end if;
  end loop;
end;
$$;

drop policy if exists acesso_sem_login_documentos_select on storage.objects;
drop policy if exists acesso_sem_login_documentos_insert on storage.objects;
drop policy if exists acesso_sem_login_documentos_delete on storage.objects;
