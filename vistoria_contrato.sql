-- Anexos I e II do contrato: checklist estruturado e classificação das fotos.
create table if not exists public.vistorias_locacao (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references public.locacoes(id) on delete cascade,
  tipo text not null default 'saida' check (tipo in ('saida','troca_entrega','troca_devolucao','devolucao')),
  data_hora timestamptz,
  responsavel text,
  quilometragem bigint check (quilometragem is null or quilometragem >= 0),
  combustivel text,
  condicao_geral text,
  avarias text,
  observacoes text,
  checklist jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho','concluida','bloqueada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (locacao_id, tipo)
);

alter table public.anexos_locacao add column if not exists vistoria_id uuid references public.vistorias_locacao(id) on delete set null;
alter table public.anexos_locacao add column if not exists categoria text;
alter table public.anexos_locacao add column if not exists descricao text;
alter table public.anexos_locacao add column if not exists ordem integer not null default 0;
alter table public.anexos_locacao add column if not exists capturada_em timestamptz;

update public.anexos_locacao
set categoria = 'outro'
where tipo = 'foto_carro' and categoria is null;

create index if not exists vistorias_locacao_locacao_idx on public.vistorias_locacao(locacao_id, data_hora);
create index if not exists anexos_locacao_vistoria_idx on public.anexos_locacao(vistoria_id, ordem, criado_em);

alter table public.vistorias_locacao enable row level security;
grant select, insert, update, delete on public.vistorias_locacao to authenticated;
revoke all on public.vistorias_locacao from anon;

drop policy if exists vistorias_locacao_admin on public.vistorias_locacao;
create policy vistorias_locacao_admin on public.vistorias_locacao
  for all to authenticated
  using ((select public.pode_gerenciar_clientes()))
  with check ((select public.pode_gerenciar_clientes()));

grant update on public.anexos_locacao to authenticated;
