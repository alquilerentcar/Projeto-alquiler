-- Execute como postgres no SQL Editor. Corrige SOMENTE valores.
-- Mantém os vencimentos existentes; a data de entrega ainda precisa ser confirmada.
begin;
do $$
declare d public.cliente_debitos; n integer;
begin
 select * into d from public.cliente_debitos
 where id='4bde2559-6907-4af4-8be0-698da49b56f7'
 and empresa_id='71236d9a-d7aa-420b-a3a0-bdba2e9d8359'
 and cliente_id='b2f70450-4b8b-4811-b4d1-091e7a105a74' for update;
 if not found then raise exception 'Débito do Raimundo não encontrado. Nenhuma alteração realizada.'; end if;
 perform 1 from public.cliente_debito_parcelas where debito_id=d.id for update;
 select count(*) into n from public.cliente_debito_parcelas where debito_id=d.id;
 if n<>31 or d.pago_anterior<>0 then raise exception 'Quantidade ou saldo anterior mudou. Confira o débito.'; end if;
 if exists(select 1 from public.cliente_debito_recebimentos r join public.cliente_debito_parcelas p on p.id=r.parcela_id where p.debito_id=d.id) then
 raise exception 'Há recebimentos. Correção interrompida para preservar as baixas.'; end if;
 if d.valor_total=2015 and not exists(select 1 from public.cliente_debito_parcelas where debito_id=d.id and valor<>65) then return; end if;
 if d.valor_total<>25 then raise exception 'O valor já foi alterado. Confira antes de executar.'; end if;
 update public.cliente_debito_parcelas set valor=65 where debito_id=d.id;
 update public.cliente_debitos set valor_total=2015,
 pedido=jsonb_set(pedido,'{total}','2015'::jsonb)||jsonb_build_object('correcao',jsonb_build_object('total_anterior',25,'valor_parcela',65,'quantidade',31,'corrigido_em',now()))
 where id=d.id;
end $$;
commit;
select 'Raimundo: 31 parcelas de R$ 65,00; total R$ 2.015,00. Vencimentos preservados; confirmar entrega.' as resultado;
