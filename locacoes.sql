create table if not exists public.locacoes (
 id uuid primary key default gen_random_uuid(), cliente_id uuid not null references public.clientes(id), carro_id uuid not null references public.carros(id),
 data_inicio timestamptz not null, data_fim timestamptz, valor_diaria numeric(12,2), valor_pago numeric(12,2) not null default 0,
 status text not null default 'Reservada', observacoes text, contrato_modelo_id uuid, criado_em timestamptz not null default now()
);
alter table public.locacoes enable row level security; grant select,insert,update on public.locacoes to authenticated; revoke all on public.locacoes from anon;
create policy locacoes_admin_select on public.locacoes for select to authenticated using ((select public.pode_gerenciar_clientes()));
create policy locacoes_admin_insert on public.locacoes for insert to authenticated with check ((select public.pode_gerenciar_clientes()));
create policy locacoes_admin_update on public.locacoes for update to authenticated using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));
