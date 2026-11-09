-- Previsão diária criada quando ambas as partes assinam o contrato.
create table if not exists public.pagamentos_locacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  locacao_id uuid not null references public.locacoes(id) on delete cascade,
  data_vencimento date not null,
  numero_parcela integer not null,
  valor_diaria numeric(12,2) not null default 0,
  valor_caucao numeric(12,2) not null default 0,
  valor_total numeric(12,2) generated always as (valor_diaria + valor_caucao) stored,
  status text not null default 'pendente' check (status in ('pendente','pago','vencido','cancelado')),
  pago_em timestamptz,
  referencia_externa text,
  qr_code text,
  link_pagamento text,
  criado_em timestamptz not null default now(),
  unique (locacao_id, data_vencimento)
);

create or replace function public.gerar_previsao_pagamentos(p_locacao_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.locacoes%rowtype; d date; n integer:=0; parcela numeric(12,2);
begin
  select * into r from public.locacoes where id=p_locacao_id;
  if r.id is null or r.data_inicio is null or r.data_fim is null then return; end if;
  parcela:=coalesce(r.valor_parcela_caucao,0);
  for d in select generate_series(r.data_inicio::date,r.data_fim::date,interval '1 day')::date loop
    n:=n+1;
    insert into public.pagamentos_locacao(empresa_id,locacao_id,data_vencimento,numero_parcela,valor_diaria,valor_caucao)
    values(r.empresa_id,r.id,d,n,coalesce(r.valor_diaria,0),case when n<=coalesce(r.numero_parcelas_caucao,0) then parcela else 0 end)
    on conflict(locacao_id,data_vencimento) do update set valor_diaria=excluded.valor_diaria,valor_caucao=excluded.valor_caucao;
  end loop;
end $$;

create or replace function public.ativar_pagamentos_apos_assinatura()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status_assinatura in ('Assinado','Assinado por ambas as partes')
     and coalesce(old.status_assinatura,'') is distinct from new.status_assinatura then
    perform public.gerar_previsao_pagamentos(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_pagamentos_apos_assinatura on public.locacoes;
create trigger trg_pagamentos_apos_assinatura after update of status_assinatura on public.locacoes
for each row execute function public.ativar_pagamentos_apos_assinatura();

alter table public.pagamentos_locacao enable row level security;
create policy "empresa consulta pagamentos" on public.pagamentos_locacao for select to authenticated using (public.usuario_tem_empresa(empresa_id));
create policy "empresa atualiza pagamentos" on public.pagamentos_locacao for update to authenticated using (public.usuario_tem_empresa(empresa_id)) with check (public.usuario_tem_empresa(empresa_id));
