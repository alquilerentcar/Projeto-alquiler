-- Documentos imutáveis das locações e acompanhamento de assinatura eletrônica.
alter table public.locacoes add column if not exists contrato_status text not null default 'Rascunho';
alter table public.locacoes add column if not exists contrato_gerado_em timestamptz;

create table if not exists public.documentos_locacao (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references public.locacoes(id) on delete cascade,
  tipo text not null default 'contrato_locacao' check (tipo in ('contrato_locacao','alteracao_veiculo','distrato','aditivo','vistoria','outro')),
  versao integer not null default 1 check (versao > 0),
  nome text not null,
  status text not null default 'rascunho' check (status in ('rascunho','pdf_gerado','enviado','visualizado','assinado_parcial','assinado','validado','recusado','cancelado')),
  arquivo_original_path text,
  arquivo_assinado_path text,
  provedor text,
  provedor_documento_id text,
  provedor_payload jsonb not null default '{}'::jsonb,
  gerado_em timestamptz,
  enviado_em timestamptz,
  assinado_em timestamptz,
  validado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (locacao_id, tipo, versao)
);

create table if not exists public.documento_signatarios (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos_locacao(id) on delete cascade,
  papel text not null check (papel in ('locadora','locatario','testemunha')),
  nome text not null,
  email text,
  telefone text,
  cpf text,
  provedor_assinatura_id text,
  link_assinatura text,
  status text not null default 'pendente',
  visualizado_em timestamptz,
  assinado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists public.documento_eventos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid references public.documentos_locacao(id) on delete cascade,
  provedor_evento_id text unique,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null default now()
);

create index if not exists documentos_locacao_locacao_idx on public.documentos_locacao(locacao_id, criado_em desc);
create index if not exists documento_signatarios_documento_idx on public.documento_signatarios(documento_id);

alter table public.documentos_locacao enable row level security;
alter table public.documento_signatarios enable row level security;
alter table public.documento_eventos enable row level security;
grant select, insert, update on public.documentos_locacao to authenticated;
grant select, insert, update on public.documento_signatarios to authenticated;
grant select on public.documento_eventos to authenticated;

drop policy if exists documentos_locacao_admin on public.documentos_locacao;
create policy documentos_locacao_admin on public.documentos_locacao for all to authenticated
  using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));
drop policy if exists documento_signatarios_admin on public.documento_signatarios;
create policy documento_signatarios_admin on public.documento_signatarios for all to authenticated
  using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));
drop policy if exists documento_eventos_admin on public.documento_eventos;
create policy documento_eventos_admin on public.documento_eventos for select to authenticated
  using ((select public.pode_gerenciar_clientes()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('documentos-contratuais','documentos-contratuais',false,52428800,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists documentos_contratuais_admin on storage.objects;
create policy documentos_contratuais_admin on storage.objects for all to authenticated
  using (bucket_id='documentos-contratuais' and (select public.pode_gerenciar_clientes()))
  with check (bucket_id='documentos-contratuais' and (select public.pode_gerenciar_clientes()));
