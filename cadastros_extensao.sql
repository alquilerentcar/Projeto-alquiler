-- Etapa futura para edição de fornecedores e cadastro de carros e contratos.
-- A política fornecedores_admin_select já foi aplicada separadamente.
alter table public.fornecedores enable row level security;
grant insert, update on public.fornecedores to authenticated;
revoke all on public.fornecedores from anon;
create policy fornecedores_admin_insert on public.fornecedores for insert to authenticated with check ((select public.pode_gerenciar_clientes()));
create policy fornecedores_admin_update on public.fornecedores for update to authenticated using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));

create table if not exists public.carros (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  marca text,
  modelo text,
  ano integer,
  cor text,
  renavam text,
  chassi text,
  valor_diaria numeric(12,2),
  situacao text not null default 'Disponível',
  observacoes text,
  criado_em timestamptz not null default now()
);
alter table public.carros enable row level security;
grant select, insert, update on public.carros to authenticated;
revoke all on public.carros from anon;
create policy carros_admin_select on public.carros for select to authenticated using ((select public.pode_gerenciar_clientes()));
create policy carros_admin_insert on public.carros for insert to authenticated with check ((select public.pode_gerenciar_clientes()));
create policy carros_admin_update on public.carros for update to authenticated using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  carro_id uuid not null references public.carros(id) on delete restrict,
  data_inicio date not null,
  data_fim date,
  valor_diaria numeric(12,2),
  situacao text not null default 'Rascunho',
  observacoes text,
  criado_em timestamptz not null default now(),
  constraint contratos_periodo check (data_fim is null or data_fim >= data_inicio)
);
alter table public.contratos enable row level security;
grant select, insert, update on public.contratos to authenticated;
revoke all on public.contratos from anon;
create policy contratos_admin_select on public.contratos for select to authenticated using ((select public.pode_gerenciar_clientes()));
create policy contratos_admin_insert on public.contratos for insert to authenticated with check ((select public.pode_gerenciar_clientes()));
create policy contratos_admin_update on public.contratos for update to authenticated using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));
