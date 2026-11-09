-- Estrutura para recebimentos históricos com composição ainda não informada.
create table if not exists public.financeiro_recebimentos_importados(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
 origem_chave text not null,origem_lote uuid not null,nome_original text not null,
 cliente_id uuid references public.clientes(id),carro_id uuid references public.carros(id),
 data_recebimento date not null,valor numeric(12,2) not null check(valor>0),
 composicao_status text not null default 'pendente' check(composicao_status in ('pendente','classificada')),
 dados_origem jsonb not null,importado_em timestamptz not null default now(),
 unique(empresa_id,origem_chave)
);
alter table public.financeiro_recebimentos_importados enable row level security;
revoke all on public.financeiro_recebimentos_importados from public,anon,authenticated;
grant select on public.financeiro_recebimentos_importados to authenticated;
drop policy if exists recebimentos_importados_leitura on public.financeiro_recebimentos_importados;
create policy recebimentos_importados_leitura on public.financeiro_recebimentos_importados for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create index if not exists recebimentos_importados_data on public.financeiro_recebimentos_importados(empresa_id,data_recebimento);
