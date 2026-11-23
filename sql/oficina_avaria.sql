-- SQL Editor, papel postgres. Rode depois de oficina_margem_corretiva.sql.
-- Novo tipo de manutenção/peça/serviço: AVARIA (batida, dano causado pelo locatário) = 100% do locatário.
-- A peça entra pelo custo da nota + a mesma margem da corretiva. Sem locatário responsável, a empresa paga.
-- Corretiva e preventiva não mudam. Não altera nem apaga dados existentes.
begin;
alter table public.oficina_manutencoes drop constraint if exists oficina_manutencoes_tipo_check;
alter table public.oficina_manutencoes add constraint oficina_manutencoes_tipo_check check(tipo in ('corretiva','preventiva','avaria'));
alter table public.oficina_movimentos drop constraint if exists oficina_movimentos_natureza_check;
alter table public.oficina_movimentos add constraint oficina_movimentos_natureza_check check(natureza in ('corretiva','preventiva','avaria'));
alter table public.oficina_manutencao_servicos drop constraint if exists oficina_manutencao_servicos_natureza_check;
alter table public.oficina_manutencao_servicos add constraint oficina_manutencao_servicos_natureza_check check(natureza in ('corretiva','preventiva','avaria'));

-- Abertura, retirada de peça e lançamento de serviço passam a aceitar 'avaria' (troca só a lista de tipos válidos).
do $$
declare f text; d text; n text;
begin
 foreach f in array array['public.oficina_manutencao_abrir(uuid,uuid,jsonb)','public.oficina_saida(uuid,uuid,uuid,jsonb,text,uuid)','public.oficina_servico_lancar(uuid,uuid,uuid,jsonb)'] loop
  d:=pg_get_functiondef(f::regprocedure);
  if position('''avaria''' in d)>0 then continue; end if;
  n:=replace(d,'(''corretiva'',''preventiva'')','(''corretiva'',''preventiva'',''avaria'')');
  if n=d then raise exception 'Lista de tipos não encontrada em %',f; end if;
  n:=replace(n,'corretiva ou preventiva','corretiva, preventiva ou avaria');
  n:=replace(n,'corretivo ou preventivo','corretivo, preventivo ou de avaria');
  execute n;
 end loop;
end $$;

create or replace function public.oficina_rateio(p_empresa uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('corretiva',coalesce((select corretiva_locatario from public.oficina_regras_rateio where empresa_id=p_empresa),50),
  'preventiva',coalesce((select preventiva_locatario from public.oficina_regras_rateio where empresa_id=p_empresa),0),
  'avaria',100,
  'margem_corretiva',coalesce((select margem_corretiva from public.oficina_regras_rateio where empresa_id=p_empresa),40))
$$;
revoke all on function public.oficina_rateio(uuid) from public,anon,authenticated;

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
    round(-x.quantidade*v.unit,2) total,x.natureza,x.observacao motivo,false externo,null::text fornecedor,null::text categoria,x.criado_em data,
    coalesce(x.custo_unitario,0) custo_unitario,g.mg margem
   from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id
   cross join lateral (select case when coalesce(x.natureza,m.tipo) in ('corretiva','avaria') then margem else 0 end mg) g
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
select 'Avaria: 100% do locatário.' as resultado;
