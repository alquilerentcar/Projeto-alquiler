begin;
create table if not exists public.frota_levantamento(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
 placa text not null,carro_id uuid references public.carros(id),cliente_id uuid references public.clientes(id),
 responsavel text not null,contato text not null,km bigint check(km>=0),km_data date,
 inicio timestamptz,diaria numeric(12,2) check(diaria>=0),ativo boolean not null default true,
 registrado_em timestamptz not null default now(),unique(empresa_id,placa)
);
alter table public.frota_levantamento enable row level security;
revoke all on public.frota_levantamento from anon,authenticated;
grant select on public.frota_levantamento to authenticated;
drop policy if exists levantamento_leitura on public.frota_levantamento;
create policy levantamento_leitura on public.frota_levantamento for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
commit;
