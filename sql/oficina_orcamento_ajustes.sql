-- SQL Editor, papel postgres. Rode depois de oficina_tipo_relatorio.sql.
-- 1. Valor da peça no orçamento: digitar à mão ou buscar o custo do cadastro, enquanto o orçamento está em elaboração.
--    Opcional: gravar o valor também no custo da peça (só quando a peça está com custo zerado).
-- 2. Tirar peça do orçamento: a peça volta ao estoque (lançamento de devolução com o motivo) e sai do orçamento e das fotos pendentes.
-- 3. Concluir a manutenção deixa de exigir os relatórios de entrada e saída do carro (por enquanto).
-- O livro do estoque continua imutável: nada é apagado; preço e devolução ficam registrados à parte, com quem e quando.
begin;
create table if not exists public.oficina_movimento_preco(
 movimento_id uuid primary key references public.oficina_movimentos(id),
 custo_unitario numeric(12,4) not null check(custo_unitario>=0),
 origem text not null check(origem in ('manual','cadastro')),
 alterado_por uuid, alterado_em timestamptz not null default now()
);
alter table public.oficina_movimento_preco enable row level security;
revoke all on public.oficina_movimento_preco from public,anon,authenticated;

create table if not exists public.oficina_movimento_estorno(
 movimento_id uuid primary key references public.oficina_movimentos(id),
 devolucao_id uuid not null references public.oficina_movimentos(id),
 motivo text not null, alterado_por uuid, alterado_em timestamptz not null default now()
);
alter table public.oficina_movimento_estorno enable row level security;
revoke all on public.oficina_movimento_estorno from public,anon,authenticated;

-- Valor da peça no orçamento. p_custo nulo = buscar o custo do cadastro da peça.
create or replace function public.oficina_peca_preco(p_empresa uuid,p_movimento uuid,p_custo numeric,p_atualizar_cadastro boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.oficina_movimentos; m public.oficina_manutencoes; p public.oficina_produtos; c numeric; orig text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into x from public.oficina_movimentos where id=p_movimento and empresa_id=p_empresa and tipo='saida' and manutencao_id is not null;
 if x.id is null then raise exception 'Peça do orçamento não encontrada.'; end if;
 if exists(select 1 from public.oficina_movimento_estorno where movimento_id=x.id) then raise exception 'Esta peça já foi tirada do orçamento.'; end if;
 m:=public.oficina_manutencao_editavel(p_empresa,x.manutencao_id);
 select * into p from public.oficina_produtos where id=x.produto_id for update;
 if p_custo is null then
  c:=coalesce(nullif(p.custo_medio,0),nullif(p.ultimo_custo,0));orig:='cadastro';
  if c is null then raise exception 'A peça % está sem custo no cadastro. Digite o valor.',p.descricao; end if;
 else
  if p_custo<0 or p_custo>1000000 then raise exception 'Informe um valor entre R$ 0 e R$ 1.000.000.'; end if;
  c:=round(p_custo,4);orig:='manual';
  if coalesce(p_atualizar_cadastro,false) and coalesce(p.custo_medio,0)=0 and c>0 then update public.oficina_produtos set custo_medio=c where id=p.id; end if;
 end if;
 insert into public.oficina_movimento_preco(movimento_id,custo_unitario,origem,alterado_por) values(x.id,c,orig,auth.uid())
 on conflict(movimento_id) do update set custo_unitario=excluded.custo_unitario,origem=excluded.origem,alterado_por=excluded.alterado_por,alterado_em=now();
 return jsonb_build_object('movimento_id',x.id,'custo_unitario',c,'origem',orig);
end $$;
revoke all on function public.oficina_peca_preco(uuid,uuid,numeric,boolean) from public,anon;
grant execute on function public.oficina_peca_preco(uuid,uuid,numeric,boolean) to authenticated;

-- Tirar a peça do orçamento: volta ao estoque.
create or replace function public.oficina_peca_remover(p_empresa uuid,p_movimento uuid,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.oficina_movimentos; m public.oficina_manutencoes; p public.oficina_produtos; dev uuid:=gen_random_uuid();
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if length(trim(coalesce(p_motivo,''))) not between 3 and 300 then raise exception 'Explique por que a peça saiu do orçamento.'; end if;
 select * into x from public.oficina_movimentos where id=p_movimento and empresa_id=p_empresa and tipo='saida' and manutencao_id is not null;
 if x.id is null then raise exception 'Peça do orçamento não encontrada.'; end if;
 m:=public.oficina_manutencao_editavel(p_empresa,x.manutencao_id);
 perform 1 from public.oficina_movimentos where id=x.id for share;
 if exists(select 1 from public.oficina_movimento_estorno where movimento_id=x.id) then raise exception 'Esta peça já foi tirada do orçamento.'; end if;
 select * into p from public.oficina_produtos where id=x.produto_id for update;
 update public.oficina_produtos set saldo=saldo-x.quantidade where id=p.id returning * into p;
 insert into public.oficina_movimentos(id,empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,manutencao_id,carro_id,placa,lote,observacao,operacao_id,criado_por)
 values(dev,p_empresa,p.id,'ajuste',-x.quantidade,p.saldo,x.custo_unitario,x.manutencao_id,x.carro_id,x.placa,x.lote,
  'Devolvida ao estoque: tirada do orçamento da manutenção #'||m.numero||'. '||trim(p_motivo),gen_random_uuid(),auth.uid());
 insert into public.oficina_movimento_estorno(movimento_id,devolucao_id,motivo,alterado_por) values(x.id,dev,trim(p_motivo),auth.uid());
 return jsonb_build_object('produto',p.descricao,'quantidade',-x.quantidade,'saldo',p.saldo);
end $$;
revoke all on function public.oficina_peca_remover(uuid,uuid,text) from public,anon;
grant execute on function public.oficina_peca_remover(uuid,uuid,text) to authenticated;

-- Peça tirada do orçamento não pede mais foto.
create or replace function public.oficina_fotos_ok(p_movimento uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.oficina_movimento_estorno where movimento_id=p_movimento)
    or (exists(select 1 from public.oficina_fotos where movimento_id=p_movimento and tipo='nova')
    and exists(select 1 from public.oficina_fotos where movimento_id=p_movimento and tipo='antiga'))
$$;
revoke all on function public.oficina_fotos_ok(uuid) from public,anon,authenticated;

-- Concluir sem os relatórios de entrada e saída do carro.
do $do$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.oficina_manutencao_status(uuid,uuid,text,text)'::regprocedure);
 n:=replace(d,'if not exists(select 1 from public.oficina_vistorias v where v.manutencao_id=p_id and v.tipo=''entrada'') then raise exception ''Falta o relatório de entrada do carro para concluir.''; end if;','');
 n:=replace(n,'if not exists(select 1 from public.oficina_vistorias v where v.manutencao_id=p_id and v.tipo=''saida'') then raise exception ''Falta o relatório de saída do carro para concluir.''; end if;','');
 if position('oficina_vistorias' in n)>0 then raise exception 'Não consegui tirar a exigência dos relatórios em oficina_manutencao_status.'; end if;
 if n<>d then execute n; end if;
end $do$;

-- Total da lista de manutenções com o valor ajustado e sem as peças tiradas.
do $do$
declare d text; n text;
 alvo text:='coalesce((select sum(-x.quantidade*coalesce(x.custo_unitario,0)) from public.oficina_movimentos x where x.manutencao_id=m.id),0) custo_pecas';
begin
 d:=pg_get_functiondef('public.oficina_painel(uuid)'::regprocedure);
 if position(alvo in d)>0 then
  n:=replace(d,alvo,'coalesce((select sum(-x.quantidade*coalesce(pr.custo_unitario,x.custo_unitario,0)) from public.oficina_movimentos x left join public.oficina_movimento_preco pr on pr.movimento_id=x.id where x.manutencao_id=m.id and x.tipo=''saida'' and not exists(select 1 from public.oficina_movimento_estorno e where e.movimento_id=x.id)),0) custo_pecas');
  execute n;
 else raise notice 'Total da lista de manutenções não foi ajustado (versão diferente do painel).';
 end if;
end $do$;

-- Orçamento: valor ajustado da peça e sem as peças tiradas.
create or replace function public.oficina_orcamento(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.oficina_manutencoes; r jsonb:=public.oficina_rateio(p_empresa); linhas jsonb; tem boolean; margem numeric;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 tem:=m.responsavel_cliente_id is not null;
 -- Margem só na corretiva com locatário e enquanto não foi cobrada (o que já foi cobrado não muda).
 margem:=case when tem and m.cobranca_debito_id is null then coalesce((r->>'margem_corretiva')::numeric,0) else 0 end;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.tipo,q.data),'[]'::jsonb) into linhas from (
  select z.*,case when tem then (case z.natureza when 'preventiva' then (r->>'preventiva')::numeric when 'avaria' then 100 else (r->>'corretiva')::numeric end) else 0 end pct_locatario from (
   select 'peca' tipo,x.id,p.descricao,coalesce(p.codigo_barras,p.codigo_interno) codigo,pr.origem preco_origem,x.custo_unitario custo_saida,p.unidade,-x.quantidade quantidade,v.unit valor_unitario,
    round(-x.quantidade*v.unit,2) total,coalesce(t.natureza,x.natureza) natureza,x.observacao motivo,false externo,null::text fornecedor,null::text categoria,x.criado_em data,
    coalesce(pr.custo_unitario,x.custo_unitario,0) custo_unitario,g.mg margem
   from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id
   left join public.oficina_movimento_natureza t on t.movimento_id=x.id
   left join public.oficina_movimento_preco pr on pr.movimento_id=x.id
   cross join lateral (select case when coalesce(t.natureza,x.natureza,m.tipo) in ('corretiva','avaria') then margem else 0 end mg) g
   cross join lateral (select case when g.mg=0 then coalesce(pr.custo_unitario,x.custo_unitario,0) else round(coalesce(pr.custo_unitario,x.custo_unitario,0)*(1+g.mg/100),2) end unit) v
   where x.manutencao_id=m.id and x.tipo='saida' and not exists(select 1 from public.oficina_movimento_estorno e where e.movimento_id=x.id)
   union all
   select 'servico',s.id,s.descricao,null,null,null,'SV',s.quantidade,s.valor_unitario,round(s.quantidade*s.valor_unitario,2),s.natureza,s.observacao,s.externo,s.fornecedor,s.categoria,s.criado_em,
    s.valor_unitario,0
   from public.oficina_manutencao_servicos s where s.manutencao_id=m.id and s.removido_em is null
  ) z
 ) q;
 select coalesce(jsonb_agg(l||jsonb_build_object('valor_locatario',round((l->>'total')::numeric*(l->>'pct_locatario')::numeric/100,2),
   'valor_empresa',(l->>'total')::numeric-round((l->>'total')::numeric*(l->>'pct_locatario')::numeric/100,2))),'[]'::jsonb) into linhas from jsonb_array_elements(linhas) l;
 return jsonb_build_object(
  'empresa',(select jsonb_build_object('razao_social',e.razao_social,'nome_fantasia',e.nome_fantasia,'cnpj',e.cnpj) from public.empresas e where e.id=p_empresa),
  'manutencao',to_jsonb(m),'rateio',r,
  'veiculo',(select jsonb_build_object('placa',c.placa,'marca',c.marca,'modelo',c.modelo,'ano',c.ano,'cor',c.cor) from public.carros c where c.id=m.carro_id),
  'responsavel',case when tem then (select jsonb_build_object('nome',c.nome_completo,'cpf',c.cpf,'telefone',coalesce(c.contato_1_numero,c.contato_2_numero)) from public.clientes c where c.id=m.responsavel_cliente_id) end,
  'linhas',linhas,
  'totais',jsonb_build_object(
   'pecas',coalesce((select sum((l->>'total')::numeric) from jsonb_array_elements(linhas) l where l->>'tipo'='peca'),0),
   'custo_pecas',coalesce((select sum(round((l->>'quantidade')::numeric*(l->>'custo_unitario')::numeric,2)) from jsonb_array_elements(linhas) l where l->>'tipo'='peca'),0),
   'servicos',coalesce((select sum((l->>'total')::numeric) from jsonb_array_elements(linhas) l where l->>'tipo'='servico'),0),
   'geral',coalesce((select sum((l->>'total')::numeric) from jsonb_array_elements(linhas) l),0),
   'locatario',coalesce((select sum((l->>'valor_locatario')::numeric) from jsonb_array_elements(linhas) l),0),
   'empresa',coalesce((select sum((l->>'valor_empresa')::numeric) from jsonb_array_elements(linhas) l),0)));
end $$;
revoke all on function public.oficina_orcamento(uuid,uuid) from public,anon;
grant execute on function public.oficina_orcamento(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Valor da peça editável, peça pode sair do orçamento e conclusão sem relatórios.' as resultado;
