-- Cálculo da caução e preparação para integração futura de assinatura digital.
alter table public.locacoes add column if not exists valor_caucao_pago numeric(12,2) not null default 0;
alter table public.locacoes add column if not exists saldo_caucao numeric(12,2) not null default 0;
alter table public.locacoes add column if not exists status_assinatura text not null default 'Pendente';
alter table public.locacoes add column if not exists assinatura_locadora_em timestamptz;
alter table public.locacoes add column if not exists assinatura_cliente_em timestamptz;
alter table public.locacoes add column if not exists assinatura_provedor text;
alter table public.locacoes add column if not exists assinatura_referencia text;
alter table public.locacoes add column if not exists documento_assinado_url text;

update public.locacoes
set saldo_caucao = greatest(coalesce(valor_caucao, 0) - coalesce(valor_caucao_pago, 0), 0),
    numero_parcelas_caucao = coalesce(nullif(numero_parcelas_caucao, 0), 100),
    valor_parcela_caucao = round(
      greatest(coalesce(valor_caucao, 0) - coalesce(valor_caucao_pago, 0), 0)
      / coalesce(nullif(numero_parcelas_caucao, 0), 100),
      2
    );

with modelo as (select id from public.modelos_contrato where codigo='LOCACAO_PADRAO')
insert into public.campos_modelo_contrato
  (modelo_id, marcador, descricao, origem, campo_origem, valor_padrao, ordem)
select modelo.id, v.marcador, v.descricao, 'locacoes', v.campo_origem, null, v.ordem
from modelo cross join (values
  ('{{ valor_caucao_pago }}','Valor já pago da caução','valor_caucao_pago',39),
  ('{{ saldo_caucao }}','Saldo restante da caução','saldo_caucao',40),
  ('{{ valor_diaria_com_caucao }}','Diária somada à parcela da caução','valor_parcela_caucao',41),
  ('{{ status_assinatura }}','Estado atual da assinatura','status_assinatura',42)
) as v(marcador, descricao, campo_origem, ordem)
on conflict (modelo_id, marcador) do update
set descricao=excluded.descricao, origem=excluded.origem,
    campo_origem=excluded.campo_origem, ordem=excluded.ordem;
