-- Multa percentual e anexos próprios de cada locação.
alter table public.locacoes
  add column if not exists multa_atraso_percentual numeric(6,2) not null default 11;

alter table public.locacoes drop constraint if exists locacoes_multa_percentual_ck;
alter table public.locacoes add constraint locacoes_multa_percentual_ck
  check (multa_atraso_percentual >= 0 and multa_atraso_percentual <= 100);

create table if not exists public.anexos_locacao (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references public.locacoes(id) on delete cascade,
  tipo text not null check (tipo in ('foto_carro','vistoria','outro')),
  arquivo_path text not null,
  arquivo_nome text not null,
  mime_type text,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now()
);

create index if not exists anexos_locacao_locacao_idx
  on public.anexos_locacao (locacao_id, criado_em);

alter table public.anexos_locacao enable row level security;
grant select, insert, delete on public.anexos_locacao to authenticated;
revoke all on public.anexos_locacao from anon;
drop policy if exists anexos_locacao_admin on public.anexos_locacao;
create policy anexos_locacao_admin on public.anexos_locacao
  for all to authenticated
  using ((select public.pode_gerenciar_clientes()))
  with check ((select public.pode_gerenciar_clientes()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-locacao',
  'documentos-locacao',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists documentos_locacao_admin on storage.objects;
create policy documentos_locacao_admin on storage.objects
  for all to authenticated
  using (bucket_id='documentos-locacao' and (select public.pode_gerenciar_clientes()))
  with check (bucket_id='documentos-locacao' and (select public.pode_gerenciar_clientes()));
