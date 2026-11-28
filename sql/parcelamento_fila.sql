-- SQL Editor, papel postgres. Fila dos parcelamentos do locatário.
-- Padrão do dia: diária + caução. Qualquer outro débito parcelado (manutenção, multa, outro) começa no dia
-- seguinte ao fim da última parcela em aberto que o locatário já tem, para não somar duas parcelas extras no mesmo dia.
-- Só consulta: não cria, não altera e não apaga nada. A tela usa a data como sugestão do primeiro vencimento.
begin;
create or replace function public.fila_parcelas_cliente(p_cliente uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 with hoje as (select (now() at time zone 'America/Manaus')::date d),
 abertas as (
  select d.descricao,d.categoria,p.vencimento
  from public.cliente_debitos d join public.cliente_debito_parcelas p on p.debito_id=d.id
  where d.cliente_id=p_cliente and d.categoria<>'caucao'
   and p.valor>coalesce((select sum(r.valor) from public.cliente_debito_recebimentos r where r.parcela_id=p.id),0)
 ),
 ultima as (select * from abertas order by vencimento desc limit 1)
 select jsonb_build_object(
  'inicio',greatest((select d from hoje),coalesce((select vencimento+1 from ultima),(select d from hoje))),
  'ultimo_vencimento',(select vencimento from ultima),
  'ultima_descricao',(select descricao from ultima),
  'ultima_categoria',(select categoria from ultima),
  'parcelas_abertas',(select count(*) from abertas))
$$;
revoke all on function public.fila_parcelas_cliente(uuid) from public,anon,authenticated;

-- Débitos extras (Financeiro): locatário da própria empresa.
create or replace function public.locatario_fila_inicio(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso.'; end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.'; end if;
 return public.fila_parcelas_cliente(p_cliente);
end $$;
revoke all on function public.locatario_fila_inicio(uuid,uuid) from public,anon;
grant execute on function public.locatario_fila_inicio(uuid,uuid) to authenticated;

-- Oficina: locatário responsável pela manutenção (pode ser de outra empresa, a locadora).
create or replace function public.oficina_fila_inicio(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select responsavel_cliente_id into c from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa;
 if c is null then raise exception 'Manutenção sem locatário responsável.'; end if;
 return public.fila_parcelas_cliente(c);
end $$;
revoke all on function public.oficina_fila_inicio(uuid,uuid) from public,anon;
grant execute on function public.oficina_fila_inicio(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Fila dos parcelamentos pronta.' as resultado;
