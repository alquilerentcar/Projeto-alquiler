-- Acesso temporário sem login ao aplicativo de cadastros.
-- Atenção: qualquer pessoa com a URL e a chave pública poderá ler e alterar
-- clientes, fornecedores, carros e contratos, incluindo dados pessoais.
-- Execute no SQL Editor do projeto Supabase.

grant usage on schema public to anon, authenticated;

do $$
declare
  tabela text;
begin
  foreach tabela in array array['clientes', 'fornecedores', 'carros', 'contratos'] loop
    if to_regclass(format('public.%I', tabela)) is not null then
      execute format('alter table public.%I enable row level security', tabela);
      execute format('grant select, insert, update on public.%I to anon, authenticated', tabela);

      execute format('drop policy if exists acesso_sem_login_select on public.%I', tabela);
      execute format('drop policy if exists acesso_sem_login_insert on public.%I', tabela);
      execute format('drop policy if exists acesso_sem_login_update on public.%I', tabela);

      execute format('create policy acesso_sem_login_select on public.%I for select to anon, authenticated using (true)', tabela);
      execute format('create policy acesso_sem_login_insert on public.%I for insert to anon, authenticated with check (true)', tabela);
      execute format('create policy acesso_sem_login_update on public.%I for update to anon, authenticated using (true) with check (true)', tabela);
    end if;
  end loop;
end;
$$;

-- O bucket permanece privado; as políticas abaixo permitem baixar e enviar
-- arquivos sem login por meio da API do aplicativo.
drop policy if exists acesso_sem_login_documentos_select on storage.objects;
drop policy if exists acesso_sem_login_documentos_insert on storage.objects;
drop policy if exists acesso_sem_login_documentos_delete on storage.objects;

create policy acesso_sem_login_documentos_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documentos-clientes');

create policy acesso_sem_login_documentos_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'documentos-clientes');

create policy acesso_sem_login_documentos_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'documentos-clientes');
