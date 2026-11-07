-- SQL Editor, papel postgres. Preserva recebimentos e parcelamentos existentes.
begin;
create table if not exists public.financeiro_baixas (
 id uuid primary key, empresa_id uuid not null references public.empresas(id),
 cliente_id uuid not null references public.clientes(id), grupo_id uuid not null,
 competencia date not null, valor numeric(12,2) not null check(valor>0),
 recebido_em timestamptz not null, pedido jsonb not null, resultado jsonb not null,
 criado_por uuid not null, criado_em timestamptz not null default now()
);
alter table public.financeiro_baixas enable row level security;
revoke all on public.financeiro_baixas from public,anon,authenticated;
grant select on public.financeiro_baixas to authenticated;
drop policy if exists baixas_leitura on public.financeiro_baixas;
create policy baixas_leitura on public.financeiro_baixas for select to authenticated
 using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.financeiro_baixa_disponivel(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(public.acesso_modulo(p_empresa,'locacao'),false)
$$;
revoke all on function public.financeiro_baixa_disponivel(uuid) from public,anon;
grant execute on function public.financeiro_baixa_disponivel(uuid) to authenticated;

-- A baixa inteira confirma ou reverte: nunca grava apenas uma parte do dinheiro.
create or replace function public.financeiro_baixar_composto(
 p_empresa uuid,p_grupo uuid,p_dia date,p_operacao uuid,p_total numeric,
 p_recebido_em timestamptz,p_diaria numeric,p_itens jsonb,
 p_observacao text default null,p_caucao jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 anterior public.financeiro_baixas; pedido jsonb; item jsonb; diaria jsonb;
 cliente uuid; parcela public.cliente_debito_parcelas; debito public.cliente_debitos;
 valor numeric; soma numeric:=0; ids uuid[]:='{}'; resultado jsonb:='[]';
 recibo uuid; nova uuid; quantidade integer; unitaria numeric; previo numeric; primeiro date;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then
  raise exception using errcode='42501',message='Sem acesso à empresa.';
 end if;
 if p_operacao is null or p_total is null or p_total::text in ('NaN','Infinity','-Infinity')
 or p_total<=0 or p_total>9999999999.99 or p_total<>round(p_total,2)
 or p_diaria is null or p_diaria::text in ('NaN','Infinity','-Infinity') or p_diaria<0 or p_diaria<>round(p_diaria,2)
 or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>120
 or p_recebido_em is null or not isfinite(p_recebido_em) or p_recebido_em>now()
 or p_dia is null or p_dia>(now() at time zone 'America/Manaus')::date
 or length(coalesce(p_observacao,''))>1000 then raise exception 'Confira os valores e a data real do recebimento.'; end if;
 if p_recebido_em<now()-interval '10 minutes' and not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then
  raise exception 'Somente o administrador pode registrar um recebimento anterior.';
 end if;
 -- Mesmo bloqueio das diárias; antes dos bloqueios das parcelas evita inversão de travas.
 perform pg_advisory_xact_lock(7261002);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 pedido:=jsonb_build_object('grupo',p_grupo,'dia',p_dia,'total',p_total,'quando',p_recebido_em,
  'diaria',p_diaria,'itens',p_itens,'observacao',coalesce(nullif(trim(p_observacao),''),''),'caucao',p_caucao);
 select * into anterior from public.financeiro_baixas where id=p_operacao;
 if found then
  if anterior.empresa_id<>p_empresa or anterior.criado_por<>auth.uid() or anterior.pedido<>pedido then
   raise exception 'Operação já utilizada com outros dados.';
  end if;
  return anterior.resultado;
 end if;
 select value into diaria from jsonb_array_elements(public.frota_previsto(p_empresa,p_dia))
  where value->>'grupo_id'=p_grupo::text;
 cliente:=(diaria->>'cliente_id')::uuid;
 if cliente is null or diaria->>'cobranca_id' is null then raise exception 'Diária ou vínculo do locatário não encontrado. Atualize a tela.'; end if;
 if p_caucao is not null then
  if not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception 'Somente o administrador pode criar o parcelamento de caução.';end if;
  quantidade:=(p_caucao->>'quantidade')::integer;unitaria:=(p_caucao->>'parcela')::numeric;
  previo:=coalesce((p_caucao->>'anterior')::numeric,0);primeiro:=(p_caucao->>'primeiro')::date;
  if quantidade is null or quantidade not between 1 and 120 or unitaria is null or unitaria<=0
   or unitaria::text in ('NaN','Infinity','-Infinity') or unitaria<>round(unitaria,2)
   or previo is null or previo<0 or previo::text in ('NaN','Infinity','-Infinity') or previo<>round(previo,2)
   or primeiro is null then raise exception 'Confira o parcelamento da caução.';end if;
  nova:=gen_random_uuid();
  perform public.cliente_debito_criar(p_empresa,cliente,nova,'caucao',p_caucao->>'descricao',
   unitaria*quantidade+previo,previo,quantidade,primeiro,'diaria');
 end if;
 soma:=p_diaria;
 for item in select value from jsonb_array_elements(p_itens) loop
  valor:=(item->>'valor')::numeric;
  if valor is null or valor::text in ('NaN','Infinity','-Infinity') or valor<=0 or valor<>round(valor,2) then raise exception 'Valor inválido na composição.';end if;
  if item->>'tipo'='nova_caucao' then
   if nova is null then raise exception 'Informe o parcelamento da caução.';end if;
   select * into parcela from public.cliente_debito_parcelas where debito_id=nova and numero=1;
  else
   select * into parcela from public.cliente_debito_parcelas where id=(item->>'parcela_id')::uuid and empresa_id=p_empresa for update;
  end if;
  if parcela.id is null or parcela.empresa_id<>p_empresa then raise exception 'Parcela não encontrada nesta empresa.';end if;
  if parcela.id=any(ids) then raise exception 'Parcela repetida na composição.';end if;
  ids:=array_append(ids,parcela.id);
  select * into debito from public.cliente_debitos where id=parcela.debito_id;
  if debito.cliente_id<>cliente or debito.empresa_id<>p_empresa then raise exception 'A parcela pertence a outro locatário.';end if;
  recibo:=public.cliente_debito_receber(p_empresa,parcela.id,gen_random_uuid(),valor,p_recebido_em,p_observacao);
  resultado:=resultado||jsonb_build_array(jsonb_build_object('tipo',debito.categoria,'parcela_id',parcela.id,'recebimento_id',recibo,'valor',valor));
  soma:=soma+valor;
 end loop;
 if nova is not null and not exists(select 1 from jsonb_array_elements(p_itens) x where x->>'tipo'='nova_caucao') then
  raise exception 'Informe quanto desta baixa pertence à nova caução.';
 end if;
 if soma<>p_total then raise exception 'A soma da diária e dos extras deve ser igual ao valor recebido.';end if;
 if p_diaria>0 then
  recibo:=public.frota_confirmar_diaria(p_empresa,p_grupo,p_dia,p_diaria,gen_random_uuid(),p_recebido_em);
  resultado:=jsonb_build_array(jsonb_build_object('tipo','diaria','recebimento_id',recibo,'valor',p_diaria))||resultado;
 end if;
 insert into public.financeiro_baixas(id,empresa_id,cliente_id,grupo_id,competencia,valor,recebido_em,pedido,resultado,criado_por)
 values(p_operacao,p_empresa,cliente,p_grupo,p_dia,p_total,p_recebido_em,pedido,resultado,auth.uid());
 return resultado;
end $$;
revoke all on function public.financeiro_baixar_composto(uuid,uuid,date,uuid,numeric,timestamptz,numeric,jsonb,text,jsonb) from public,anon;
grant execute on function public.financeiro_baixar_composto(uuid,uuid,date,uuid,numeric,timestamptz,numeric,jsonb,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Baixa única de diária, caução e extras preparada. Recebimentos anteriores preservados.' as resultado;
