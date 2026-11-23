-- SQL Editor, papel postgres. Rode depois de caucao_automatica_contas_receber.sql e contas_receber_baixa.sql.
-- Levantamento dos locatários com data de corte:
-- 1. Diárias anteriores ao corte ficam quitadas como "levantamento" (não é dinheiro no caixa).
-- 2. O que o locatário ainda deve na data de corte vira saldo inicial: diárias em atraso, caução e extras.
-- Não apaga nem altera pagamentos já registrados.
begin;
alter table public.frota_recebimentos add column if not exists origem text;
comment on column public.frota_recebimentos.origem is 'null = dinheiro recebido; levantamento = quitação de abertura, não entra no caixa';

create table if not exists public.levantamento_saldos(
 id uuid primary key, empresa_id uuid not null references public.empresas(id), corte date not null,
 linhas jsonb not null, resultado jsonb not null, criado_por uuid not null, criado_em timestamptz not null default now()
);
create table if not exists public.levantamento_grupos(
 empresa_id uuid not null references public.empresas(id), grupo_id uuid not null,
 levantamento_id uuid not null references public.levantamento_saldos(id), corte date not null,
 primary key(empresa_id,grupo_id)
);
alter table public.levantamento_saldos enable row level security;
alter table public.levantamento_grupos enable row level security;
revoke all on public.levantamento_saldos,public.levantamento_grupos from public,anon,authenticated;
grant select on public.levantamento_saldos,public.levantamento_grupos to authenticated;
drop policy if exists levantamento_saldos_leitura on public.levantamento_saldos;
create policy levantamento_saldos_leitura on public.levantamento_saldos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
drop policy if exists levantamento_grupos_leitura on public.levantamento_grupos;
create policy levantamento_grupos_leitura on public.levantamento_grupos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));

-- Lista para o levantamento: cada locação em andamento ou com diária em aberto antes do corte,
-- com o que o sistema já sabe (diária, diárias em aberto, última paga, caução).
create or replace function public.levantamento_locatarios(p_empresa uuid,p_corte date)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Manaus')::date;
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then
  raise exception using errcode='42501',message='Somente o administrador faz o levantamento.';
 end if;
 if p_corte is null or p_corte<'2026-10-10' or p_corte>hoje+1 then raise exception 'A data de corte deve ser entre 10/10/2026 e amanhã.'; end if;
 perform public.frota_previsto(p_empresa,hoje);
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.nome,q.placa) from (
  with ativos as (
   select s.grupo_id,s.origem,s.cliente_id,s.nome,s.placa,s.diaria from public.frota_fontes_diarias(p_empresa,hoje) s
  ), cob as (
   select b.grupo_id,b.competencia,b.diaria+b.multa valor,
    coalesce((select sum(x.valor) from public.frota_recebimentos x where x.empresa_id=p_empresa and x.grupo_id=b.grupo_id and x.competencia=b.competencia),0) recebido
   from public.frota_cobrancas b where b.empresa_id=p_empresa and b.competencia<p_corte
  ), grupos as (
   select grupo_id from ativos union select grupo_id from cob where valor>recebido
  )
  select g.grupo_id,
   coalesce(a.origem,u.origem) origem,coalesce(a.cliente_id,u.cliente_id) cliente_id,coalesce(a.nome,u.nome) nome,
   coalesce(a.placa,u.placa) placa,coalesce(a.diaria,u.diaria) diaria,(a.grupo_id is not null) em_andamento,
   (select count(*) from cob c where c.grupo_id=g.grupo_id and c.valor>c.recebido)::int abertas_qtd,
   coalesce((select sum(c.valor-c.recebido) from cob c where c.grupo_id=g.grupo_id and c.valor>c.recebido),0) abertas_valor,
   (select max(c.competencia) from cob c where c.grupo_id=g.grupo_id and c.valor<=c.recebido) ultima_paga,
   r.valor_caucao caucao_total,r.valor_caucao_pago caucao_pago,
   coalesce(r.saldo_caucao,r.valor_caucao-coalesce(r.valor_caucao_pago,0)) caucao_saldo,r.valor_parcela_caucao caucao_parcela,
   (exists(select 1 from public.cliente_debitos d where d.locacao_id=g.grupo_id and d.categoria='caucao')
    or (coalesce(a.cliente_id,u.cliente_id) is not null and public.cliente_caucao_manual_aberta(p_empresa,coalesce(a.cliente_id,u.cliente_id)))) caucao_parcelada,
   l.corte levantado_em
  from grupos g
  left join ativos a on a.grupo_id=g.grupo_id
  left join lateral (select b.origem,b.cliente_id,b.nome,b.placa,b.diaria from public.frota_cobrancas b
   where b.empresa_id=p_empresa and b.grupo_id=g.grupo_id order by b.competencia desc limit 1) u on true
  left join public.locacoes r on r.id=g.grupo_id and r.empresa_id=p_empresa
  left join public.levantamento_grupos l on l.empresa_id=p_empresa and l.grupo_id=g.grupo_id
 ) q),'[]'::jsonb);
end $$;
revoke all on function public.levantamento_locatarios(uuid,date) from public,anon;
grant execute on function public.levantamento_locatarios(uuid,date) to authenticated;

-- Aplica o levantamento de uma vez: tudo ou nada, e cada locação só pode ser levantada uma vez.
-- Linha: {grupo_id, atraso, caucao_saldo, caucao_parcela, caucao_inicio, extras, extras_descricao, observacao}
create or replace function public.levantamento_aplicar(p_empresa uuid,p_operacao uuid,p_corte date,p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 hoje date:=(now() at time zone 'America/Manaus')::date; anterior public.levantamento_saldos; l jsonb; b record;
 grupo uuid; cliente uuid; placa text; atraso numeric; caucao numeric; parcela numeric; inicio date; extras numeric;
 extras_desc text; quitadas int; quitado numeric; saldo numeric; momento timestamptz; novo uuid; centavos bigint; unidade bigint; quantidade int;
 d_atraso uuid; d_caucao uuid; d_extras uuid; saida jsonb:='[]'; vistos uuid[]:='{}';
 num constant text:='^[0-9]{1,10}(\.[0-9]{1,2})?$';
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then
  raise exception using errcode='42501',message='Somente o administrador aplica o levantamento.';
 end if;
 if p_operacao is null or p_corte is null or p_corte<'2026-10-10' or p_corte>hoje+1
 or p_linhas is null or jsonb_typeof(p_linhas)<>'array' or jsonb_array_length(p_linhas) not between 1 and 1000 then
  raise exception 'Confira a data de corte e as linhas do levantamento.';
 end if;
 perform pg_advisory_xact_lock(7261002);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into anterior from public.levantamento_saldos where id=p_operacao;
 if found then
  if anterior.empresa_id<>p_empresa or anterior.criado_por<>auth.uid() or anterior.corte<>p_corte or anterior.linhas<>p_linhas then
   raise exception 'Operação já utilizada com outros dados.';
  end if;
  return anterior.resultado;
 end if;
 perform public.frota_previsto(p_empresa,hoje);
 insert into public.levantamento_saldos(id,empresa_id,corte,linhas,resultado,criado_por)
 values(p_operacao,p_empresa,p_corte,p_linhas,'[]',auth.uid());
 -- Depois do vencimento das diárias quitadas: não muda a regra da multa das 18h.
 momento:=least(now(),p_corte::timestamp at time zone 'America/Manaus');
 for l in select value from jsonb_array_elements(p_linhas) loop
  grupo:=nullif(l->>'grupo_id','')::uuid;
  if grupo is null then raise exception 'Linha sem código da locação.'; end if;
  if grupo=any(vistos) then raise exception 'Locação repetida no levantamento.'; end if;
  vistos:=array_append(vistos,grupo);
  select s.cliente_id,s.placa into cliente,placa from public.frota_fontes_diarias(p_empresa,hoje) s where s.grupo_id=grupo limit 1;
  if placa is null then
   select b2.cliente_id,b2.placa into cliente,placa from public.frota_cobrancas b2 where b2.empresa_id=p_empresa and b2.grupo_id=grupo order by b2.competencia desc limit 1;
  end if;
  if placa is null then raise exception 'Locação % não encontrada nesta empresa. Baixe a lista de novo.',grupo; end if;
  if exists(select 1 from public.levantamento_grupos where empresa_id=p_empresa and grupo_id=grupo) then
   raise exception 'A locação do veículo % já foi levantada.',placa;
  end if;
  foreach extras_desc in array array['atraso','caucao_saldo','caucao_parcela','extras'] loop
   if coalesce(l->>extras_desc,'')<>'' and (l->>extras_desc)!~num then raise exception 'Valor inválido em % (veículo %).',extras_desc,placa; end if;
  end loop;
  atraso:=coalesce(nullif(l->>'atraso','')::numeric,0); caucao:=coalesce(nullif(l->>'caucao_saldo','')::numeric,0);
  parcela:=coalesce(nullif(l->>'caucao_parcela','')::numeric,0); extras:=coalesce(nullif(l->>'extras','')::numeric,0);
  inicio:=coalesce(nullif(l->>'caucao_inicio','')::date,p_corte);
  extras_desc:=nullif(trim(coalesce(l->>'extras_descricao','')),'');
  if (atraso>0 or caucao>0 or extras>0) and cliente is null then
   raise exception 'O veículo % não tem locatário vinculado. Vincule na Frota antes de lançar saldo.',placa;
  end if;
  -- 1. Quita as diárias antes do corte com o saldo exato de cada uma.
  quitadas:=0; quitado:=0;
  for b in select x.competencia,x.diaria+x.multa-coalesce((select sum(r.valor) from public.frota_recebimentos r
     where r.empresa_id=p_empresa and r.grupo_id=x.grupo_id and r.competencia=x.competencia),0) falta
   from public.frota_cobrancas x where x.empresa_id=p_empresa and x.grupo_id=grupo and x.competencia<p_corte loop
   if b.falta>0 then
    insert into public.frota_recebimentos(id,empresa_id,grupo_id,competencia,valor,criado_por,operacao_id,recebido_em,origem)
    values(gen_random_uuid(),p_empresa,grupo,b.competencia,b.falta,auth.uid(),gen_random_uuid(),momento,'levantamento');
    quitadas:=quitadas+1; quitado:=quitado+b.falta;
   end if;
  end loop;
  d_atraso:=null; d_caucao:=null; d_extras:=null;
  -- 2. O que ele ainda devia de diárias na data de corte.
  if atraso>0 then
   d_atraso:=public.cliente_debito_criar(p_empresa,cliente,gen_random_uuid(),'outro',
    'Saldo de diárias até '||to_char(p_corte-1,'DD/MM/YYYY')||' · '||placa,atraso,0,1,p_corte-1,'diaria');
  end if;
  -- 3. Saldo da caução em parcelas diárias seguidas.
  if caucao>0 then
   if exists(select 1 from public.cliente_debitos d where d.locacao_id=grupo and d.categoria='caucao')
   or public.cliente_caucao_manual_aberta(p_empresa,cliente) then
    raise exception 'A caução do veículo % já está parcelada no sistema. Deixe a caução em branco nesta linha.',placa;
   end if;
   if parcela<=0 then raise exception 'Informe a parcela diária da caução do veículo %.',placa; end if;
   centavos:=round(caucao*100); unidade:=least(round(parcela*100),centavos); quantidade:=ceil(centavos::numeric/unidade);
   if quantidade>3650 then raise exception 'Parcela da caução muito pequena no veículo %.',placa; end if;
   d_caucao:=gen_random_uuid();
   insert into public.cliente_debitos(id,empresa_id,cliente_id,categoria,descricao,valor_total,pago_anterior,pedido,criado_por,locacao_id)
   values(d_caucao,p_empresa,cliente,'caucao','Caução (levantamento) · '||placa,caucao,0,
    jsonb_build_object('origem','levantamento','levantamento',p_operacao,'parcelas',quantidade,'primeiro',inicio,'periodicidade','diaria'),
    auth.uid(),(select r.id from public.locacoes r where r.id=grupo and r.empresa_id=p_empresa));
   insert into public.cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor)
   select p_empresa,d_caucao,i,inicio+i-1,(case when i=quantidade then centavos-unidade*(quantidade-1) else unidade end)::numeric/100
   from generate_series(1,quantidade) i;
  end if;
  -- 4. Extras em aberto (multa, avaria, acordo).
  if extras>0 then
   d_extras:=public.cliente_debito_criar(p_empresa,cliente,gen_random_uuid(),'outro',
    coalesce(extras_desc,'Extras do levantamento')||' · '||placa,extras,0,1,p_corte-1,'diaria');
  end if;
  insert into public.levantamento_grupos(empresa_id,grupo_id,levantamento_id,corte) values(p_empresa,grupo,p_operacao,p_corte);
  saida:=saida||jsonb_build_array(jsonb_build_object('grupo_id',grupo,'placa',placa,'diarias_quitadas',quitadas,
   'valor_quitado',quitado,'debito_atraso',d_atraso,'debito_caucao',d_caucao,'debito_extras',d_extras));
 end loop;
 update public.levantamento_saldos s set resultado=saida where s.id=p_operacao;
 return saida;
end $$;
revoke all on function public.levantamento_aplicar(uuid,uuid,date,jsonb) from public,anon;
grant execute on function public.levantamento_aplicar(uuid,uuid,date,jsonb) to authenticated;

-- Histórico do locatário: a quitação do levantamento não aparece como pagamento recebido.
create or replace function public.locatario_extrato(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.';end if;
 return jsonb_build_object(
  'cobrancas',coalesce((select jsonb_agg(to_jsonb(q) order by q.vencimento,q.tipo) from(
   select 'diaria' tipo,b.placa descricao,b.competencia vencimento,b.diaria+b.multa valor,b.multa,
   coalesce((select sum(x.valor) from public.frota_recebimentos x where x.empresa_id=p_empresa and x.grupo_id=b.grupo_id and x.competencia=b.competencia),0) recebido,
   exists(select 1 from public.frota_recebimentos x where x.empresa_id=p_empresa and x.grupo_id=b.grupo_id and x.competencia=b.competencia and x.origem='levantamento') levantamento
   from public.frota_cobrancas b where b.empresa_id=p_empresa and b.cliente_id=p_cliente
   union all
   select d.categoria,d.descricao||' · parcela '||p.numero,p.vencimento,p.valor,0,
   coalesce((select sum(x.valor) from public.cliente_debito_recebimentos x where x.parcela_id=p.id),0),false
   from public.cliente_debito_parcelas p join public.cliente_debitos d on d.id=p.debito_id
   where p.empresa_id=p_empresa and d.cliente_id=p_cliente) q),'[]'::jsonb),
  'pagamentos',coalesce((select jsonb_agg(to_jsonb(q) order by q.recebido_em desc) from(
   select 'diaria' tipo,b.placa descricao,b.competencia referencia,x.valor,coalesce(x.recebido_em,x.criado_em) recebido_em
   from public.frota_recebimentos x join public.frota_cobrancas b on b.empresa_id=x.empresa_id and b.grupo_id=x.grupo_id and b.competencia=x.competencia
   where x.empresa_id=p_empresa and b.cliente_id=p_cliente and x.origem is distinct from 'levantamento'
   union all
   select d.categoria,d.descricao||' · parcela '||p.numero,p.vencimento,x.valor,x.recebido_em
   from public.cliente_debito_recebimentos x join public.cliente_debito_parcelas p on p.id=x.parcela_id join public.cliente_debitos d on d.id=p.debito_id
   where x.empresa_id=p_empresa and d.cliente_id=p_cliente) q),'[]'::jsonb));
end $$;
revoke all on function public.locatario_extrato(uuid,uuid) from public,anon;
grant execute on function public.locatario_extrato(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Levantamento dos locatários pronto. Nenhum pagamento existente foi alterado.' as resultado;
