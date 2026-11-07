-- A conta de Auth será criada pelo proprietário do projeto.
-- Somente o e-mail confirmado abaixo terá acesso a clientes e documentos.
create or replace function public.pode_gerenciar_clientes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) = 'alquilerentcar@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.pode_gerenciar_clientes() from public;
grant execute on function public.pode_gerenciar_clientes() to authenticated;

alter table public.clientes enable row level security;
grant select, insert, update on public.clientes to authenticated;
revoke all on public.clientes from anon;

create policy clientes_admin_select on public.clientes
  for select to authenticated
  using ((select public.pode_gerenciar_clientes()));

create policy clientes_admin_insert on public.clientes
  for insert to authenticated
  with check ((select public.pode_gerenciar_clientes()));

create policy clientes_admin_update on public.clientes
  for update to authenticated
  using ((select public.pode_gerenciar_clientes()))
  with check ((select public.pode_gerenciar_clientes()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-clientes',
  'documentos-clientes',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy documentos_clientes_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-clientes' and (select public.pode_gerenciar_clientes()));

create policy documentos_clientes_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-clientes' and (select public.pode_gerenciar_clientes()));

create policy documentos_clientes_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-clientes' and (select public.pode_gerenciar_clientes()));
