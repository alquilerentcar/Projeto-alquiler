-- Permite que somente administradores da própria empresa alterem seus dados.
-- Execute uma vez no SQL Editor do Supabase.
alter table public.empresas enable row level security;

drop policy if exists "administrador atualiza sua empresa" on public.empresas;
create policy "administrador atualiza sua empresa"
on public.empresas
for update
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresa ue
    where ue.empresa_id = empresas.id
      and ue.auth_user_id = auth.uid()
      and ue.administrador = true
      and ue.ativo = true
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresa ue
    where ue.empresa_id = empresas.id
      and ue.auth_user_id = auth.uid()
      and ue.administrador = true
      and ue.ativo = true
  )
);
