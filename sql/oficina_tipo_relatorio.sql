-- SQL Editor, papel postgres. Rode depois de oficina_avaria.sql.
-- 1. Mudar o tipo da manutenção aberta (corretiva, preventiva ou batida/avaria): muda também o tipo das peças
--    e serviços já lançados nela, e o rateio do orçamento acompanha. Se o orçamento já estava com o analista,
--    volta para elaboração (o valor mudou). Manutenção já cobrada do locatário não muda.
--    As saídas do estoque continuam imutáveis: a nova classificação fica numa tabela à parte, com quem e quando mudou.
-- 2. KM deixa de ser obrigatório no relatório de entrada/saída do carro.
-- 3. Relatório do período: para cada saída para carro, como foi classificada e quanto será cobrado do locatário.
-- Não apaga dados.
begin;
create table if not exists public.oficina_movimento_natureza(
 movimento_id uuid primary key references public.oficina_movimentos(id),
 natureza text not null check(natureza in ('corretiva','preventiva','avaria')),
 alterado_por uuid, alterado_em timestamptz not null default now()
);
alter table public.oficina_movimento_natureza enable row level security;
revoke all on public.oficina_movimento_natureza from public,anon,authenticated;

create table if not exists public.oficina_manutencao_tipo_historico(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 manutencao_id uuid not null references public.oficina_manutencoes(id),
 de text not null, para text not null, motivo text not null, alterado_por uuid, alterado_em timestamptz not null default now()
);
alter table public.oficina_manutencao_tipo_historico enable row level security;
revoke all on public.oficina_manutencao_tipo_historico from public,anon,authenticated;

create or replace function public.oficina_manutencao_tipo(p_empresa uuid,p_manutencao uuid,p_tipo text,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; antes text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_tipo not in ('corretiva','preventiva','avaria') then raise exception 'Escolha corretiva, preventiva ou batida / avaria.'; end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Explique por que o tipo da manutenção mudou.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.status in ('concluida','cancelada') then raise exception 'A manutenção #% já foi encerrada: o tipo não pode mais mudar.',m.numero; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário: o tipo não pode mais mudar.',m.numero; end if;
 if m.tipo=p_tipo then return to_jsonb(m); end if;
 antes:=m.tipo;
 insert into public.oficina_movimento_natureza(movimento_id,natureza,alterado_por)
  select x.id,p_tipo,auth.uid() from public.oficina_movimentos x where x.manutencao_id=m.id and x.tipo='saida'
 on conflict(movimento_id) do update set natureza=excluded.natureza,alterado_por=excluded.alterado_por,alterado_em=now();
 update public.oficina_manutencao_servicos set natureza=p_tipo where manutencao_id=m.id and removido_em is null;
 insert into public.oficina_manutencao_tipo_historico(empresa_id,manutencao_id,de,para,motivo,alterado_por) values(p_empresa,m.id,antes,p_tipo,trim(p_motivo),auth.uid());
 update public.oficina_manutencoes set tipo=p_tipo,
  orcamento_status=case when orcamento_status in ('aguardando_aprovacao','aprovado') then 'em_elaboracao' else orcamento_status end,
  orcamento_aprovado=case when orcamento_status in ('aguardando_aprovacao','aprovado') then null else orcamento_aprovado end,
  orcamento_observacao=case when orcamento_status in ('aguardando_aprovacao','aprovado') then 'Tipo mudou de '||antes||' para '||p_tipo||': '||trim(p_motivo) else orcamento_observacao end
 where id=m.id returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.oficina_manutencao_tipo(uuid,uuid,text,text) from public,anon;
grant execute on function public.oficina_manutencao_tipo(uuid,uuid,text,text) to authenticated;

-- KM opcional no relatório do carro.
alter table public.oficina_vistorias alter column km drop not null;
do $do$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.oficina_vistoria_salvar(uuid,uuid,text,jsonb)'::regprocedure);
 if position('Informe o KM do carro.' in d)>0 then
  n:=replace(d,'if v_km is null then raise exception ''Informe o KM do carro.''; end if;','');
  if n=d then raise exception 'Trecho do KM não encontrado em oficina_vistoria_salvar.'; end if;
  execute n;
 end if;
end $do$;

-- O que cada saída para carro vai custar ao locatário (mesma conta do orçamento).
create or replace function public.oficina_movimentos_cobranca(p_empresa uuid,p_de date,p_ate date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:='[]'::jsonb; mid uuid; o jsonb; m public.oficina_manutencoes;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_de is null or p_ate is null or p_ate<p_de or p_ate-p_de>400 then raise exception 'Escolha um período de até 400 dias.'; end if;
 for mid in select distinct x.manutencao_id from public.oficina_movimentos x
  where x.empresa_id=p_empresa and x.tipo='saida' and x.manutencao_id is not null and (x.criado_em at time zone 'America/Manaus')::date between p_de and p_ate loop
  o:=public.oficina_orcamento(p_empresa,mid);
  select * into m from public.oficina_manutencoes where id=mid;
  r:=r||coalesce((select jsonb_agg(jsonb_build_object('id',l->>'id','natureza',l->>'natureza','valor_unitario',(l->>'valor_unitario')::numeric,'total',(l->>'total')::numeric,
    'pct_locatario',(l->>'pct_locatario')::numeric,'valor_locatario',(l->>'valor_locatario')::numeric,'valor_empresa',(l->>'valor_empresa')::numeric,
    'responsavel',o->'responsavel'->>'nome','tipo_manutencao',m.tipo,
    'situacao',case when m.cobranca_debito_id is not null then 'cobrado' when m.status='cancelada' then 'cancelada' when o->'responsavel' is null then 'empresa' when m.orcamento_status='aprovado' then 'aprovado' when m.orcamento_status='aguardando_aprovacao' then 'aguardando_aprovacao' else 'em_elaboracao' end))
   from jsonb_array_elements(o->'linhas') l where l->>'tipo'='peca'),'[]'::jsonb);
 end loop;
 return r;
end $$;
revoke all on function public.oficina_movimentos_cobranca(uuid,date,date) from public,anon;
grant execute on function public.oficina_movimentos_cobranca(uuid,date,date) to authenticated;

-- Orçamento: usa a classificação nova das peças quando o tipo da manutenção mudou.
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
   select 'peca' tipo,x.id,p.descricao,coalesce(p.codigo_barras,p.codigo_interno) codigo,p.unidade,-x.quantidade quantidade,v.unit valor_unitario,
    round(-x.quantidade*v.unit,2) total,coalesce(t.natureza,x.natureza) natureza,x.observacao motivo,false externo,null::text fornecedor,null::text categoria,x.criado_em data,
    coalesce(x.custo_unitario,0) custo_unitario,g.mg margem
   from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id
   left join public.oficina_movimento_natureza t on t.movimento_id=x.id
   cross join lateral (select case when coalesce(t.natureza,x.natureza,m.tipo) in ('corretiva','avaria') then margem else 0 end mg) g
   cross join lateral (select case when g.mg=0 then coalesce(x.custo_unitario,0) else round(coalesce(x.custo_unitario,0)*(1+g.mg/100),2) end unit) v
   where x.manutencao_id=m.id and x.tipo='saida'
   union all
   select 'servico',s.id,s.descricao,null,'SV',s.quantidade,s.valor_unitario,round(s.quantidade*s.valor_unitario,2),s.natureza,s.observacao,s.externo,s.fornecedor,s.categoria,s.criado_em,
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
select 'Tipo da manutenção editável, KM opcional e cobrança no relatório.' as resultado;
