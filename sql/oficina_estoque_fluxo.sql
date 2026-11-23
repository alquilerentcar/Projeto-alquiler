-- SQL Editor, papel postgres. Rode depois de oficina_cadastro_movimentos.sql.
-- Fluxo do estoque:
-- 1. Entrada por embalagem: guarda quantas caixas e o custo da caixa, além das unidades e do custo de cada unidade
--    (ex.: 1 caixa com 20 paçocas por R$ 12,00 → 20 unidades a R$ 0,60).
-- 2. Situação da saída: venda (revenda), uso e consumo, manutenção de carro, construção em andamento,
--    perda/avaria e devolução ao fornecedor.
-- 3. Resumo: patrimônio por categoria (a custo e a preço de venda), entradas e saídas do período por situação,
--    e resultado da revenda (vendido, custo e lucro).
-- Não altera itens nem movimentos existentes.
begin;
alter table public.oficina_movimentos add column if not exists embalagens numeric(12,3);
alter table public.oficina_movimentos add column if not exists custo_embalagem numeric(12,4);
alter table public.oficina_movimentos drop constraint if exists oficina_movimentos_destino_check;
alter table public.oficina_movimentos add constraint oficina_movimentos_destino_check check(destino is null or destino in ('manutencao','uso_consumo','obra','revenda','perda','devolucao'));
-- O livro do estoque continua imutável: a troca acima só amplia as situações aceitas.

do $$
declare def text;
begin
 -- Entrada: registra caixas e custo da caixa quando vierem.
 def:=pg_get_functiondef('public.oficina_entrada(uuid,uuid,jsonb,text,text,text,uuid)'::regprocedure);
 if position('custo_embalagem' in def)=0 then
  def:=replace(def,
   'insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,documento,fornecedor,observacao,lote,operacao_id,criado_por,operador_id,operador_nome)',
   'insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,documento,fornecedor,observacao,lote,operacao_id,criado_por,operador_id,operador_nome,embalagens,custo_embalagem)');
  def:=replace(def,
   'v_lote,p_operacao,auth.uid(),p_operador,v_operador);',
   'v_lote,p_operacao,auth.uid(),p_operador,v_operador,nullif(item->>''embalagens'','''')::numeric,nullif(item->>''custo_embalagem'','''')::numeric);');
  if position('custo_embalagem' in def)=0 then raise exception 'Não consegui atualizar a entrada. Confira se oficina_cadastro_movimentos.sql foi aplicado.'; end if;
  execute def;
 end if;
 -- Saída sem carro: aceita também a devolução ao fornecedor.
 def:=pg_get_functiondef('public.oficina_saida_avulsa(uuid,uuid,text,text,jsonb,uuid)'::regprocedure);
 if position('''devolucao''' in def)=0 then
  def:=replace(def,'if p_destino not in (''uso_consumo'',''obra'',''revenda'',''perda'') then raise exception ''Escolha para onde vai: uso e consumo, construção em andamento, revenda ou perda.'';',
   'if p_destino not in (''uso_consumo'',''obra'',''revenda'',''perda'',''devolucao'') then raise exception ''Escolha a situação da saída: venda, uso e consumo, construção em andamento, perda ou devolução ao fornecedor.'';');
  def:=replace(def,'when ''perda'' then ''Explique a perda ou o descarte.''','when ''perda'' then ''Explique a perda ou o descarte.'' when ''devolucao'' then ''Informe o fornecedor e o motivo da devolução.''');
  if position('''devolucao''' in def)=0 then raise exception 'Não consegui atualizar a saída. Confira se oficina_cadastro_movimentos.sql foi aplicado.'; end if;
  execute def;
 end if;
end $$;

-- ===================== Resumo do estoque =====================
create or replace function public.oficina_estoque_resumo(p_empresa uuid,p_de date,p_ate date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_de is null or p_ate is null or p_ate<p_de or p_ate-p_de>400 then raise exception 'Escolha um período de até 400 dias.'; end if;
 return jsonb_build_object(
  -- Patrimônio hoje: o que está guardado, a custo médio e (revenda) a preço de venda.
  'patrimonio',coalesce((select jsonb_agg(jsonb_build_object('categoria',c.categoria,'itens',c.itens,'unidades',c.unidades,'valor_custo',c.valor_custo,'valor_venda',c.valor_venda,'sem_preco',c.sem_preco) order by c.valor_custo desc)
   from (select categoria,count(*)::int itens,sum(saldo) unidades,round(sum(saldo*custo_medio),2) valor_custo,
    round(sum(case when preco_venda is not null then saldo*preco_venda end),2) valor_venda,count(*) filter(where categoria='revenda' and preco_venda is null and saldo>0)::int sem_preco
    from public.oficina_produtos where empresa_id=p_empresa and ativo group by categoria) c),'[]'::jsonb),
  -- Movimento do período por situação.
  'periodo',coalesce((select jsonb_agg(jsonb_build_object('tipo',z.tipo,'situacao',z.situacao,'movimentos',z.movimentos,'unidades',z.unidades,'valor_custo',z.valor_custo,'valor_venda',z.valor_venda) order by z.tipo,z.valor_custo desc)
   from (select x.tipo,case when x.tipo='saida' then coalesce(x.destino,case when x.manutencao_id is not null then 'manutencao' end,'outra') end situacao,
    count(*)::int movimentos,sum(abs(x.quantidade)) unidades,round(sum(abs(x.quantidade)*coalesce(x.custo_unitario,0)),2) valor_custo,round(sum(abs(x.quantidade)*x.valor_venda),2) valor_venda
    from public.oficina_movimentos x where x.empresa_id=p_empresa and (x.criado_em at time zone 'America/Manaus')::date between p_de and p_ate group by 1,2) z),'[]'::jsonb),
  -- Itens de revenda: quanto entrou, quanto saiu vendido, receita, custo e lucro no período.
  'revenda',coalesce((select jsonb_agg(jsonb_build_object('produto',p.descricao,'unidade',p.unidade,'saldo',p.saldo,'custo_medio',p.custo_medio,'preco_venda',p.preco_venda,
    'entrou',coalesce(r.entrou,0),'vendido',coalesce(r.vendido,0),'receita',coalesce(r.receita,0),'custo_vendido',coalesce(r.custo_vendido,0),'lucro',coalesce(r.receita,0)-coalesce(r.custo_vendido,0)) order by coalesce(r.receita,0) desc,p.descricao)
   from public.oficina_produtos p left join lateral (select sum(case when x.tipo='entrada' then x.quantidade end) entrou,sum(case when x.destino='revenda' then -x.quantidade end) vendido,
     round(sum(case when x.destino='revenda' then -x.quantidade*coalesce(x.valor_venda,0) end),2) receita,round(sum(case when x.destino='revenda' then -x.quantidade*coalesce(x.custo_unitario,0) end),2) custo_vendido
    from public.oficina_movimentos x where x.produto_id=p.id and (x.criado_em at time zone 'America/Manaus')::date between p_de and p_ate) r on true
   where p.empresa_id=p_empresa and p.categoria='revenda'),'[]'::jsonb));
end $$;
revoke all on function public.oficina_estoque_resumo(uuid,date,date) from public,anon;
grant execute on function public.oficina_estoque_resumo(uuid,date,date) to authenticated;

-- Relatório de movimentos com caixas e custo da caixa.
do $$ declare def text; begin
 def:=pg_get_functiondef('public.oficina_movimentos_relatorio(uuid,date,date)'::regprocedure);
 if position('custo_embalagem' in def)=0 then
  execute replace(def,'''operador'',x.operador_nome,','''operador'',x.operador_nome,''embalagens'',x.embalagens,''custo_embalagem'',x.custo_embalagem,');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
select 'Fluxo do estoque pronto: entrada por caixa, situação da saída e resumo do estoque.' as resultado;
