-- SQL Editor, papel postgres. Rode depois de caucao_automatica_contas_receber.sql.
-- Baixa por locatário: um valor recebido quita as diárias e parcelas escolhidas, tudo ou nada.
-- Não altera recebimentos já registrados.
begin;
create table if not exists public.contas_receber_baixas(
 id uuid primary key, empresa_id uuid not null references public.empresas(id), cliente_id uuid,
 valor numeric(12,2) not null check(valor>0), recebido_em timestamptz not null,
 pedido jsonb not null, resultado jsonb not null,
 criado_por uuid not null, criado_em timestamptz not null default now()
);
alter table public.contas_receber_baixas enable row level security;
revoke all on public.contas_receber_baixas from public,anon,authenticated;
grant select on public.contas_receber_baixas to authenticated;
drop policy if exists contas_receber_baixas_leitura on public.contas_receber_baixas;
create policy contas_receber_baixas_leitura on public.contas_receber_baixas for select to authenticated
 using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.locatario_receber(
 p_empresa uuid,p_cliente uuid,p_operacao uuid,p_total numeric,
 p_recebido_em timestamptz,p_itens jsonb,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 anterior public.contas_receber_baixas; pedido jsonb; item jsonb; prev jsonb;
 parcela public.cliente_debito_parcelas; debito public.cliente_debitos;
 valor numeric; dia date; grupo uuid; soma numeric:=0; chaves text[]:='{}'; chave text;
 recibo uuid; resultado jsonb:='[]';
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then
  raise exception using errcode='42501',message='Sem acesso à empresa.';
 end if;
 if p_operacao is null or p_total is null or p_total::text in ('NaN','Infinity','-Infinity')
 or p_total<=0 or p_total>9999999999.99 or p_total<>round(p_total,2)
 or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 400
 or p_recebido_em is null or not isfinite(p_recebido_em) or p_recebido_em>now()
 or length(coalesce(p_observacao,''))>1000 then
  raise exception 'Confira o valor e a data real do recebimento.';
 end if;
 if p_recebido_em<now()-interval '10 minutes' and not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then
  raise exception 'Somente o administrador pode registrar um recebimento anterior.';
 end if;
 perform pg_advisory_xact_lock(7261002);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 pedido:=jsonb_build_object('cliente',p_cliente,'total',p_total,'quando',p_recebido_em,'itens',p_itens,
  'observacao',coalesce(nullif(trim(p_observacao),''),''));
 select * into anterior from public.contas_receber_baixas where id=p_operacao;
 if found then
  if anterior.empresa_id<>p_empresa or anterior.criado_por<>auth.uid() or anterior.pedido<>pedido then
   raise exception 'Operação já utilizada com outros dados.';
  end if;
  return anterior.resultado;
 end if;
 for item in select value from jsonb_array_elements(p_itens) loop
  valor:=(item->>'valor')::numeric;
  if valor is null or valor::text in ('NaN','Infinity','-Infinity') or valor<=0 or valor<>round(valor,2) then
   raise exception 'Valor inválido em um dos itens.';
  end if;
  if item->>'tipo'='diaria' then
   grupo:=(item->>'grupo_id')::uuid; dia:=(item->>'dia')::date;
   if grupo is null or dia is null then raise exception 'Diária sem referência. Atualize a tela.'; end if;
   chave:='d:'||grupo||':'||dia;
   if chave=any(chaves) then raise exception 'Diária repetida no pagamento.'; end if;
   chaves:=array_append(chaves,chave);
   select value into prev from jsonb_array_elements(public.frota_previsto(p_empresa,dia)) where value->>'grupo_id'=grupo::text;
   if prev is null then raise exception 'Diária de % não encontrada. Atualize a tela.',to_char(dia,'DD/MM/YYYY'); end if;
   if nullif(prev->>'cliente_id','')::uuid is distinct from p_cliente then
    raise exception 'A diária de % pertence a outro locatário.',to_char(dia,'DD/MM/YYYY');
   end if;
   begin
    recibo:=public.frota_confirmar_diaria(p_empresa,grupo,dia,valor,gen_random_uuid(),p_recebido_em);
   exception when others then
    raise exception 'Diária de %: %',to_char(dia,'DD/MM/YYYY'),sqlerrm;
   end;
   resultado:=resultado||jsonb_build_array(jsonb_build_object('tipo','diaria','grupo_id',grupo,'dia',dia,'recebimento_id',recibo,'valor',valor));
  elsif item->>'tipo'='parcela' then
   select * into parcela from public.cliente_debito_parcelas where id=(item->>'parcela_id')::uuid and empresa_id=p_empresa for update;
   if parcela.id is null then raise exception 'Parcela não encontrada nesta empresa.'; end if;
   chave:='p:'||parcela.id;
   if chave=any(chaves) then raise exception 'Parcela repetida no pagamento.'; end if;
   chaves:=array_append(chaves,chave);
   select * into debito from public.cliente_debitos where id=parcela.debito_id;
   if debito.empresa_id<>p_empresa or debito.cliente_id is distinct from p_cliente then
    raise exception 'A parcela pertence a outro locatário.';
   end if;
   begin
    recibo:=public.cliente_debito_receber(p_empresa,parcela.id,gen_random_uuid(),valor,p_recebido_em,p_observacao);
   exception when others then
    raise exception 'Parcela % de %: %',parcela.numero,to_char(parcela.vencimento,'DD/MM/YYYY'),sqlerrm;
   end;
   resultado:=resultado||jsonb_build_array(jsonb_build_object('tipo',debito.categoria,'parcela_id',parcela.id,'recebimento_id',recibo,'valor',valor));
  else
   raise exception 'Item de pagamento desconhecido.';
  end if;
  soma:=soma+valor;
 end loop;
 if soma<>p_total then raise exception 'A soma dos itens deve ser igual ao valor recebido.'; end if;
 insert into public.contas_receber_baixas(id,empresa_id,cliente_id,valor,recebido_em,pedido,resultado,criado_por)
 values(p_operacao,p_empresa,p_cliente,p_total,p_recebido_em,pedido,resultado,auth.uid());
 return resultado;
end $$;
revoke all on function public.locatario_receber(uuid,uuid,uuid,numeric,timestamptz,jsonb,text) from public,anon;
grant execute on function public.locatario_receber(uuid,uuid,uuid,numeric,timestamptz,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Baixa por locatário pronta. Recebimentos anteriores preservados.' as resultado;
