-- Cadastro de certificados digitais. Execute no SQL Editor do Supabase.
-- O arquivo A1 fica em bucket privado; a senha do certificado não é armazenada.
-- Somente o usuário Auth confirmado abaixo acessa tabela e arquivos.

create or replace function public.pode_gerenciar_certificados()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) = 'alquilerentcar@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.pode_gerenciar_certificados() from public;
grant execute on function public.pode_gerenciar_certificados() to authenticated;

create table if not exists public.certificados_digitais (
  id uuid primary key default gen_random_uuid(),
  titular text not null,
  tipo text not null check (tipo in ('A1', 'A3')),
  identificador text,
  emissor text,
  numero_serie text,
  valido_de date,
  valido_ate date not null,
  finalidade text,
  observacoes text,
  arquivo_path text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint certificados_periodo check (valido_de is null or valido_ate >= valido_de)
);

alter table public.certificados_digitais enable row level security;
revoke all on public.certificados_digitais from anon;
grant select, insert, update on public.certificados_digitais to authenticated;

drop policy if exists certificados_select on public.certificados_digitais;
drop policy if exists certificados_insert on public.certificados_digitais;
drop policy if exists certificados_update on public.certificados_digitais;

create policy certificados_select on public.certificados_digitais
  for select to authenticated using ((select public.pode_gerenciar_certificados()));
create policy certificados_insert on public.certificados_digitais
  for insert to authenticated with check ((select public.pode_gerenciar_certificados()));
create policy certificados_update on public.certificados_digitais
  for update to authenticated
  using ((select public.pode_gerenciar_certificados()))
  with check ((select public.pode_gerenciar_certificados()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('certificados-digitais', 'certificados-digitais', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists certificados_arquivos_select on storage.objects;
drop policy if exists certificados_arquivos_insert on storage.objects;
drop policy if exists certificados_arquivos_delete on storage.objects;

create policy certificados_arquivos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'certificados-digitais' and (select public.pode_gerenciar_certificados()));
create policy certificados_arquivos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certificados-digitais' and (select public.pode_gerenciar_certificados()));
create policy certificados_arquivos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'certificados-digitais' and (select public.pode_gerenciar_certificados()));
