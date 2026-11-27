-- SQL Editor, papel postgres. Rode depois de oficina_orcamento_ajustes.sql.
-- 1. Orçamento de carro da locadora: traz a empresa dona do carro (ex.: Alquiler) para sair no cabeçalho do PDF.
-- 2. Tipo de cada peça ou serviço (corretiva, preventiva, batida/avaria) pode ser trocado no orçamento enquanto está em elaboração.
-- Não apaga dados: a troca do tipo da peça fica registrada à parte (oficina_movimento_natureza), com quem e quando.
begin;
do $do$
declare d text; n text;
 alvo text:='''veiculo'',(select jsonb_build_object(''placa'',c.placa,''marca'',c.marca,''modelo'',c.modelo,''ano'',c.ano,''cor'',c.cor) from public.carros c where c.id=m.carro_id),';
begin
 d:=pg_get_functiondef('public.oficina_orcamento(uuid,uuid)'::regprocedure);
 if position('''locadora''' in d)>0 then return; end if;
 if position(alvo in d)=0 then raise exception 'Não achei o veículo em oficina_orcamento (versão diferente).'; end if;
 n:=replace(d,alvo,alvo||'
  ''locadora'',(select jsonb_build_object(''razao_social'',e.razao_social,''nome_fantasia'',e.nome_fantasia,''cnpj'',e.cnpj) from public.carros c join public.empresas e on e.id=c.empresa_id where c.id=m.carro_id and c.empresa_id<>p_empresa),');
 execute n;
end $do$;

create or replace function public.oficina_linha_natureza(p_empresa uuid,p_tipo text,p_id uuid,p_natureza text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.oficina_movimentos; s public.oficina_manutencao_servicos; m public.oficina_manutencoes;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_natureza not in ('corretiva','preventiva','avaria') or p_natureza is null then raise exception 'Escolha corretiva, preventiva ou batida/avaria.'; end if;
 if p_tipo='peca' then
  select * into x from public.oficina_movimentos where id=p_id and empresa_id=p_empresa and tipo='saida' and manutencao_id is not null;
  if x.id is null then raise exception 'Peça do orçamento não encontrada.'; end if;
  if exists(select 1 from public.oficina_movimento_estorno where movimento_id=x.id) then raise exception 'Esta peça já foi tirada do orçamento.'; end if;
  m:=public.oficina_manutencao_editavel(p_empresa,x.manutencao_id);
  insert into public.oficina_movimento_natureza(movimento_id,natureza,alterado_por) values(x.id,p_natureza,auth.uid())
  on conflict(movimento_id) do update set natureza=excluded.natureza,alterado_por=excluded.alterado_por,alterado_em=now();
 elsif p_tipo='servico' then
  select * into s from public.oficina_manutencao_servicos where id=p_id and empresa_id=p_empresa and removido_em is null;
  if s.id is null then raise exception 'Serviço do orçamento não encontrado.'; end if;
  m:=public.oficina_manutencao_editavel(p_empresa,s.manutencao_id);
  update public.oficina_manutencao_servicos set natureza=p_natureza where id=s.id;
 else raise exception 'Linha inválida.'; end if;
 return jsonb_build_object('id',p_id,'natureza',p_natureza);
end $$;
revoke all on function public.oficina_linha_natureza(uuid,text,uuid,text) from public,anon;
grant execute on function public.oficina_linha_natureza(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Orçamento com a locadora no cabeçalho e tipo de cada linha editável.' as resultado;
