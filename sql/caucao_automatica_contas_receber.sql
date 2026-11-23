-- Executar inteiro no SQL Editor com papel postgres.
-- 1. Novas locações: a caução do contrato vira parcelas diárias a partir da primeira diária.
-- 2. Contas a receber: tudo o que está em aberto, diárias e parcelas, de qualquer dia.
-- 3. Histórico do locatário: cobranças e pagamentos em uma consulta só.
-- Não altera cobranças, parcelas nem pagamentos já existentes.
reset role;
begin;
alter table public.cliente_debitos add column if not exists locacao_id uuid references public.locacoes(id);
create unique index if not exists cliente_debitos_caucao_locacao on public.cliente_debitos(locacao_id) where locacao_id is not null and categoria='caucao';

-- Caução parcelada à mão e ainda com saldo: não cria outra para o mesmo locatário.
create or replace function public.cliente_caucao_manual_aberta(p_empresa uuid,p_cliente uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cliente_debitos d join public.cliente_debito_parcelas p on p.debito_id=d.id
  where d.empresa_id=p_empresa and d.cliente_id=p_cliente and d.categoria='caucao' and d.locacao_id is null
  and p.valor>coalesce((select sum(x.valor) from public.cliente_debito_recebimentos x where x.parcela_id=p.id),0))
$$;
revoke all on function public.cliente_caucao_manual_aberta(uuid,uuid) from public,anon,authenticated;

-- Gera as parcelas diárias da caução de uma locação. Devolve o débito criado ou o já existente;
-- null quando não há saldo, não há data da primeira parcela ou já existe caução manual em aberto.
create or replace function public.locacao_gerar_caucao(p_locacao uuid,p_primeiro date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.locacoes;plano public.locacao_planos_diarias;existente uuid;saldo numeric;centavos bigint;unidade bigint;quantidade integer;primeiro date;placa text;autor uuid;novo uuid:=gen_random_uuid();
begin
 select * into r from public.locacoes where id=p_locacao;
 if r.id is null then return null;end if;
 select * into plano from public.locacao_planos_diarias where locacao_id=r.id;
 select id into existente from public.cliente_debitos where locacao_id=r.id and categoria='caucao';
 if existente is not null then return existente;end if;
 primeiro:=coalesce(plano.primeira_competencia,p_primeiro);
 saldo:=coalesce(r.saldo_caucao,coalesce(r.valor_caucao,0)-coalesce(r.valor_caucao_pago,0));
 if primeiro is null or coalesce(r.valor_caucao,0)<=0 or saldo is null or saldo<=0 or saldo>r.valor_caucao then return null;end if;
 if public.cliente_caucao_manual_aberta(r.empresa_id,r.cliente_id) then return null;end if;
 centavos:=round(saldo*100);
 -- Parcela informada no contrato tem prioridade; sem ela, divide o saldo pelo número de parcelas.
 if coalesce(r.valor_parcela_caucao,0)>0 then unidade:=least(round(r.valor_parcela_caucao*100),centavos);quantidade:=ceil(centavos::numeric/unidade);
 else quantidade:=greatest(1,coalesce(r.numero_parcelas_caucao,100));unidade:=centavos/quantidade;end if;
 if unidade<1 or quantidade>3650 then return null;end if;
 select v.placa into placa from public.carros v where v.id=r.carro_id;
 autor:=coalesce(auth.uid(),plano.criado_por);
 if autor is null then return null;end if;
 insert into public.cliente_debitos(id,empresa_id,cliente_id,categoria,descricao,valor_total,pago_anterior,pedido,criado_por,locacao_id)
 values(novo,r.empresa_id,r.cliente_id,'caucao','Caução da locação'||coalesce(' · '||placa,''),r.valor_caucao,r.valor_caucao-saldo,
  jsonb_build_object('origem','contrato','locacao',r.id,'parcelas',quantidade,'primeiro',primeiro,'periodicidade','diaria'),autor,r.id);
 insert into public.cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor)
 select r.empresa_id,novo,i,primeiro+i-1,(case when i=quantidade then centavos-unidade*(quantidade-1) else unidade end)::numeric/100
 from generate_series(1,quantidade) i;
 return novo;
end $$;
revoke all on function public.locacao_gerar_caucao(uuid,date) from public,anon,authenticated;

-- A primeira diária definida no plano (contrato ou entrega) também define a primeira parcela da caução.
create or replace function public.locacao_plano_gerar_caucao() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.primeira_competencia is not null then perform public.locacao_gerar_caucao(new.locacao_id);end if;
 return new;
end $$;
drop trigger if exists locacao_plano_caucao on public.locacao_planos_diarias;
create trigger locacao_plano_caucao after insert or update of primeira_competencia on public.locacao_planos_diarias
 for each row execute function public.locacao_plano_gerar_caucao();

-- Locações ativas com saldo de caução e sem parcelas: conferência das locações antigas.
create or replace function public.caucao_pendentes(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.nome) from(
  select r.id locacao_id,r.cliente_id,c.nome_completo nome,v.placa,r.valor_caucao,
  coalesce(r.saldo_caucao,r.valor_caucao-coalesce(r.valor_caucao_pago,0)) saldo,r.valor_parcela_caucao,r.numero_parcelas_caucao,
  coalesce(p.primeira_competencia,(r.data_inicio at time zone 'America/Manaus')::date) primeira_sugerida,
  public.cliente_caucao_manual_aberta(p_empresa,r.cliente_id) caucao_manual
  from public.locacoes r join public.clientes c on c.id=r.cliente_id left join public.carros v on v.id=r.carro_id
  left join public.locacao_planos_diarias p on p.locacao_id=r.id
  where r.empresa_id=p_empresa and r.status='Ativa' and coalesce(r.valor_caucao,0)>0
  and coalesce(r.saldo_caucao,r.valor_caucao-coalesce(r.valor_caucao_pago,0))>0
  and not exists(select 1 from public.cliente_debitos d where d.locacao_id=r.id and d.categoria='caucao')) q),'[]'::jsonb);
end $$;
revoke all on function public.caucao_pendentes(uuid) from public,anon;
grant execute on function public.caucao_pendentes(uuid) to authenticated;

-- Administrador parcela a caução de uma locação antiga, a partir da data escolhida.
create or replace function public.locacao_caucao_parcelar(p_empresa uuid,p_locacao uuid,p_primeiro date)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.locacoes;resultado uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador pode parcelar a caução.';end if;
 if p_primeiro is null or not isfinite(p_primeiro) then raise exception 'Informe a data da primeira parcela.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_locacao::text||'caucao',0));
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 if r.id is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 if r.status<>'Ativa' then raise exception 'Somente locações ativas têm a caução parcelada.';end if;
 if exists(select 1 from public.cliente_debitos where locacao_id=r.id and categoria='caucao') then raise exception 'A caução desta locação já está parcelada.';end if;
 if public.cliente_caucao_manual_aberta(p_empresa,r.cliente_id) then raise exception 'Este locatário já tem uma caução parcelada em aberto. Confira em Débitos extras.';end if;
 resultado:=public.locacao_gerar_caucao(r.id,p_primeiro);
 if resultado is null then raise exception 'Não há saldo de caução para parcelar nesta locação.';end if;
 return resultado;
end $$;
revoke all on function public.locacao_caucao_parcelar(uuid,uuid,date) from public,anon;
grant execute on function public.locacao_caucao_parcelar(uuid,uuid,date) to authenticated;

-- Tudo o que está em aberto: diárias geradas até hoje e parcelas de qualquer vencimento.
create or replace function public.contas_receber_painel(p_empresa uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Manaus')::date;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 -- Garante que as diárias e multas até hoje já foram geradas.
 perform public.frota_previsto(p_empresa,hoje);
 return jsonb_build_object('hoje',hoje,
  'diarias',coalesce((select jsonb_agg(to_jsonb(q) order by q.vencimento) from(
   select b.id cobranca_id,b.grupo_id,b.cliente_id,b.nome,b.placa,b.competencia vencimento,b.diaria,b.multa,b.diaria+b.multa valor,
   coalesce((select sum(x.valor) from public.frota_recebimentos x where x.empresa_id=p_empresa and x.grupo_id=b.grupo_id and x.competencia=b.competencia),0) recebido
   from public.frota_cobrancas b where b.empresa_id=p_empresa) q where q.valor>q.recebido),'[]'::jsonb),
  'parcelas',coalesce((select jsonb_agg(to_jsonb(q) order by q.vencimento) from(
   select p.id parcela_id,p.debito_id,p.numero,p.vencimento,p.valor,d.categoria,d.descricao,d.cliente_id,d.locacao_id,c.nome_completo nome,
   coalesce((select sum(x.valor) from public.cliente_debito_recebimentos x where x.parcela_id=p.id),0) recebido
   from public.cliente_debito_parcelas p join public.cliente_debitos d on d.id=p.debito_id join public.clientes c on c.id=d.cliente_id
   where p.empresa_id=p_empresa) q where q.valor>q.recebido),'[]'::jsonb));
end $$;
revoke all on function public.contas_receber_painel(uuid) from public,anon;
grant execute on function public.contas_receber_painel(uuid) to authenticated;

-- Histórico de um locatário: cada cobrança com o que foi pago e a lista de pagamentos.
create or replace function public.locatario_extrato(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.';end if;
 return jsonb_build_object(
  'cobrancas',coalesce((select jsonb_agg(to_jsonb(q) order by q.vencimento,q.tipo) from(
   select 'diaria' tipo,b.placa descricao,b.competencia vencimento,b.diaria+b.multa valor,b.multa,
   coalesce((select sum(x.valor) from public.frota_recebimentos x where x.empresa_id=p_empresa and x.grupo_id=b.grupo_id and x.competencia=b.competencia),0) recebido
   from public.frota_cobrancas b where b.empresa_id=p_empresa and b.cliente_id=p_cliente
   union all
   select d.categoria,d.descricao||' · parcela '||p.numero,p.vencimento,p.valor,0,
   coalesce((select sum(x.valor) from public.cliente_debito_recebimentos x where x.parcela_id=p.id),0)
   from public.cliente_debito_parcelas p join public.cliente_debitos d on d.id=p.debito_id
   where p.empresa_id=p_empresa and d.cliente_id=p_cliente) q),'[]'::jsonb),
  'pagamentos',coalesce((select jsonb_agg(to_jsonb(q) order by q.recebido_em desc) from(
   select 'diaria' tipo,b.placa descricao,b.competencia referencia,x.valor,coalesce(x.recebido_em,x.criado_em) recebido_em
   from public.frota_recebimentos x join public.frota_cobrancas b on b.empresa_id=x.empresa_id and b.grupo_id=x.grupo_id and b.competencia=x.competencia
   where x.empresa_id=p_empresa and b.cliente_id=p_cliente
   union all
   select d.categoria,d.descricao||' · parcela '||p.numero,p.vencimento,x.valor,x.recebido_em
   from public.cliente_debito_recebimentos x join public.cliente_debito_parcelas p on p.id=x.parcela_id join public.cliente_debitos d on d.id=p.debito_id
   where x.empresa_id=p_empresa and d.cliente_id=p_cliente) q),'[]'::jsonb));
end $$;
revoke all on function public.locatario_extrato(uuid,uuid) from public,anon;
grant execute on function public.locatario_extrato(uuid,uuid) to authenticated;

-- Cadastro manual de caução recusado quando a caução da locação já está parcelada e em aberto.
create or replace function public.cliente_debito_criar(p_empresa uuid,p_cliente uuid,p_operacao uuid,p_categoria text,p_descricao text,p_total numeric,p_pago_anterior numeric,p_parcelas integer,p_primeiro date,p_periodicidade text)
returns uuid language plpgsql security definer set search_path='' as $$
declare pedido jsonb;original public.cliente_debitos;centavos bigint;base bigint;resto bigint;i integer;venc date;begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador pode cadastrar débitos extras.';end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.';end if;
 if p_operacao is null or p_categoria is null or p_categoria not in ('caucao','multa','manutencao','outro') or length(trim(coalesce(p_descricao,''))) not between 3 and 1000
 or p_total is null or p_total::text in ('NaN','Infinity','-Infinity') or p_total<=0 or p_total>9999999999.99 or p_total<>round(p_total,2)
 or p_pago_anterior is null or p_pago_anterior::text in ('NaN','Infinity','-Infinity') or p_pago_anterior<0 or p_pago_anterior>=p_total or p_pago_anterior<>round(p_pago_anterior,2)
 or p_parcelas is null or p_parcelas not between 1 and 120 or p_primeiro is null or not isfinite(p_primeiro)
 or p_periodicidade is null or p_periodicidade not in ('diaria','semanal','mensal') then raise exception 'Confira descrição, valores, parcelas e vencimentos.';end if;
 centavos:=((p_total-p_pago_anterior)*100)::bigint;if centavos<p_parcelas then raise exception 'Cada parcela deve ter pelo menos R$ 0,01.';end if;
 pedido:=jsonb_build_object('cliente',p_cliente,'categoria',p_categoria,'descricao',trim(p_descricao),'total',p_total,'pago_anterior',p_pago_anterior,'parcelas',p_parcelas,'primeiro',p_primeiro,'periodicidade',p_periodicidade);
 -- A mesma operação não pode criar duas dívidas, inclusive com cliques concorrentes.
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into original from public.cliente_debitos where id=p_operacao;
 if found then if original.empresa_id<>p_empresa or original.pedido<>pedido then raise exception 'Operação já utilizada com outros dados.';end if;return original.id;end if;
 if p_categoria='caucao' and exists(select 1 from public.cliente_debitos d join public.locacoes l on l.id=d.locacao_id join public.cliente_debito_parcelas p on p.debito_id=d.id
  where d.empresa_id=p_empresa and d.cliente_id=p_cliente and d.categoria='caucao' and l.status='Ativa'
  and p.valor>coalesce((select sum(x.valor) from public.cliente_debito_recebimentos x where x.parcela_id=p.id),0))
 then raise exception 'A caução da locação deste locatário já está parcelada. Use as parcelas existentes.';end if;
 insert into public.cliente_debitos(id,empresa_id,cliente_id,categoria,descricao,valor_total,pago_anterior,pedido,criado_por)
 values(p_operacao,p_empresa,p_cliente,p_categoria,trim(p_descricao),p_total,p_pago_anterior,pedido,auth.uid());
 base:=centavos/p_parcelas;resto:=centavos%p_parcelas;
 for i in 1..p_parcelas loop
 venc:=case p_periodicidade when 'mensal' then (p_primeiro+make_interval(months=>i-1))::date when 'semanal' then p_primeiro+(i-1)*7 else p_primeiro+i-1 end;
 insert into public.cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor) values(p_empresa,p_operacao,i,venc,(base+case when i=p_parcelas then resto else 0 end)::numeric/100);
 end loop;
 return p_operacao;
end $$;

notify pgrst,'reload schema';
commit;
select 'Caução automática, Contas a receber e histórico do locatário preparados' as resultado;
