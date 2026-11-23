-- SQL Editor, papel postgres. Rode depois de oficina_orcamento_telefone.sql.
-- Peça na manutenção CORRETIVA com locatário responsável: valor = custo da peça (da nota fiscal) + margem (padrão 40%),
-- e esse valor é dividido pelo rateio (padrão 50% locatário / 50% empresa).
-- Exemplo: peça de R$ 100,00 na nota → R$ 140,00 → R$ 70,00 locatário e R$ 70,00 empresa.
-- Preventiva, serviços e cliente de fora não mudam. Manutenção já cobrada do locatário fica como foi cobrada.
-- A margem pode ser mudada pelo administrador (Serviços e ajustes). Não altera nem apaga dados existentes.
begin;
alter table public.oficina_regras_rateio add column if not exists margem_corretiva numeric(6,2) not null default 40;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='oficina_regras_margem_check') then
  alter table public.oficina_regras_rateio add constraint oficina_regras_margem_check check(margem_corretiva between 0 and 500);
 end if;
end $$;

create or replace function public.oficina_rateio(p_empresa uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('corretiva',coalesce((select corretiva_locatario from public.oficina_regras_rateio where empresa_id=p_empresa),50),
  'preventiva',coalesce((select preventiva_locatario from public.oficina_regras_rateio where empresa_id=p_empresa),0),
  'margem_corretiva',coalesce((select margem_corretiva from public.oficina_regras_rateio where empresa_id=p_empresa),40))
$$;
revoke all on function public.oficina_rateio(uuid) from public,anon,authenticated;

create or replace function public.oficina_margem_salvar(p_empresa uuid,p_margem numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador muda a margem.'; end if;
 if p_margem is null or p_margem not between 0 and 500 then raise exception 'Informe uma margem entre 0 e 500%%.'; end if;
 insert into public.oficina_regras_rateio(empresa_id,margem_corretiva,alterado_por) values(p_empresa,p_margem,auth.uid())
 on conflict(empresa_id) do update set margem_corretiva=excluded.margem_corretiva,alterado_por=excluded.alterado_por,alterado_em=now();
 return public.oficina_rateio(p_empresa);
end $$;
revoke all on function public.oficina_margem_salvar(uuid,numeric) from public,anon;
grant execute on function public.oficina_margem_salvar(uuid,numeric) to authenticated;

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
  select z.*,case when tem then (case z.natureza when 'preventiva' then (r->>'preventiva')::numeric else (r->>'corretiva')::numeric end) else 0 end pct_locatario from (
   select 'peca' tipo,x.id,p.descricao,coalesce(p.codigo_barras,p.codigo_interno) codigo,p.unidade,-x.quantidade quantidade,v.unit valor_unitario,
    round(-x.quantidade*v.unit,2) total,x.natureza,x.observacao motivo,false externo,null::text fornecedor,null::text categoria,x.criado_em data,
    coalesce(x.custo_unitario,0) custo_unitario,g.mg margem
   from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id
   cross join lateral (select case when coalesce(x.natureza,m.tipo)='corretiva' then margem else 0 end mg) g
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
select 'Corretiva: peça com margem sobre o custo da nota, dividida entre locatário e empresa.' as resultado;
