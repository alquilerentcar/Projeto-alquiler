-- SQL Editor, papel postgres. Rode depois dos três SQLs da oficina.
-- Oficina como módulo próprio, separado da Locação:
-- 1. O módulo "Oficina" passa a aparecer em Acessos (licença da empresa e permissão de cada usuário).
-- 2. A área de Mecânica só abre para quem tem o módulo Oficina na empresa da oficina.
-- 3. A oficina atende empresas escolhidas (ex.: Tempo da Mecânica atende a Alquiler): vê os carros
--    e locatários delas sem precisar de acesso à Locação, e lança a parte do locatário no financeiro dele.
-- 4. Carro em manutenção só sai da manutenção depois que a oficina registrar peça ou serviço nele.
-- 5. Financeiro da manutenção dentro do módulo Oficina.
-- Não altera cadastros, locações nem pagamentos. Depois de rodar, libere o módulo em Acessos.
begin;
-- ===================== 1. Módulo Oficina disponível em Acessos =====================
update public.modulos set ativo=true,nome='Oficina',descricao='Manutenções, peças, estoque e financeiro da oficina' where codigo='oficina';
-- As funções de Acessos têm a lista de módulos liberados escrita nelas ('locacao','financeiro').
-- Acrescenta 'oficina' nessas listas, preservando o restante de cada função como está no banco.
do $$
declare f record; def text; novo text; n int:=0;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace
  where s.nspname='public' and p.proname like 'acessos\_%' loop
  def:=pg_get_functiondef(f.oid);
  if position('in (''locacao''' in def)>0 and position('''oficina''' in def)=0 then
   novo:=replace(def,'in (''locacao''','in (''locacao'',''oficina''');
   execute novo; n:=n+1; raise notice 'Módulo Oficina liberado em %',f.proname;
  end if;
 end loop;
 raise notice '% função(ões) de Acessos atualizada(s).',n;
end $$;

-- ===================== 3. Empresas atendidas pela oficina =====================
create table if not exists public.oficina_empresas_atendidas(
 oficina_empresa_id uuid not null references public.empresas(id), empresa_id uuid not null references public.empresas(id),
 definido_por uuid, definido_em timestamptz not null default now(), primary key(oficina_empresa_id,empresa_id),
 check(oficina_empresa_id<>empresa_id)
);
alter table public.oficina_empresas_atendidas enable row level security;
revoke all on public.oficina_empresas_atendidas from public,anon,authenticated;
grant select on public.oficina_empresas_atendidas to authenticated;

-- A oficina enxerga a própria empresa e as empresas que atende.
create or replace function public.oficina_atende(p_oficina uuid,p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_oficina=p_empresa or exists(select 1 from public.oficina_empresas_atendidas a where a.oficina_empresa_id=p_oficina and a.empresa_id=p_empresa)
$$;
revoke all on function public.oficina_atende(uuid,uuid) from public,anon,authenticated;

-- ===================== 2. Acesso só pelo módulo Oficina =====================
create or replace function public.oficina_acesso(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(public.acesso_modulo(p_empresa,'oficina'),false)
$$;
drop policy if exists oficina_empresas_atendidas_leitura on public.oficina_empresas_atendidas;
create policy oficina_empresas_atendidas_leitura on public.oficina_empresas_atendidas for select to authenticated using(public.oficina_acesso(oficina_empresa_id));

create or replace function public.oficina_empresas_atendidas_lista(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 -- Empresas que o usuário administra (pode ligar) e as já ligadas.
 return coalesce((select jsonb_agg(jsonb_build_object('empresa_id',e.id,'nome',e.nome_fantasia,
  'atendida',exists(select 1 from public.oficina_empresas_atendidas a where a.oficina_empresa_id=p_empresa and a.empresa_id=e.id),
  'pode_alterar',coalesce(public.acesso_admin_empresa(p_empresa),false) and coalesce(public.acesso_admin_empresa(e.id),false)) order by e.nome_fantasia)
  from public.empresas e where e.id<>p_empresa and (exists(select 1 from public.oficina_empresas_atendidas a where a.oficina_empresa_id=p_empresa and a.empresa_id=e.id)
   or coalesce(public.acesso_admin_empresa(e.id),false))),'[]'::jsonb);
end $$;
revoke all on function public.oficina_empresas_atendidas_lista(uuid) from public,anon;
grant execute on function public.oficina_empresas_atendidas_lista(uuid) to authenticated;

-- Liga ou desliga: exige ser administrador das duas empresas.
create or replace function public.oficina_empresa_atendida_definir(p_empresa uuid,p_atendida uuid,p_ligar boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) or not coalesce(public.acesso_admin_empresa(p_atendida),false) then
  raise exception using errcode='42501',message='Somente quem administra as duas empresas liga a oficina à locadora.';
 end if;
 if p_empresa=p_atendida then raise exception 'Escolha outra empresa.'; end if;
 if coalesce(p_ligar,false) then insert into public.oficina_empresas_atendidas(oficina_empresa_id,empresa_id,definido_por) values(p_empresa,p_atendida,auth.uid()) on conflict do nothing;
 else delete from public.oficina_empresas_atendidas where oficina_empresa_id=p_empresa and empresa_id=p_atendida; end if;
end $$;
revoke all on function public.oficina_empresa_atendida_definir(uuid,uuid,boolean) from public,anon;
grant execute on function public.oficina_empresa_atendida_definir(uuid,uuid,boolean) to authenticated;

-- As funções da oficina conferiam acesso à Locação da empresa do carro/locatário.
-- Passam a conferir se a oficina atende aquela empresa.
do $$
declare f record; def text; n int:=0;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace
  where s.nspname='public' and p.proname like 'oficina\_%' loop
  def:=pg_get_functiondef(f.oid);
  if position('public.acesso_modulo(c.empresa_id,''locacao'')' in def)>0 then
   execute replace(def,'public.acesso_modulo(c.empresa_id,''locacao'')','public.oficina_atende(p_empresa,c.empresa_id)');
   n:=n+1; raise notice 'Oficina: % passa a usar as empresas atendidas',f.proname;
  end if;
 end loop;
 raise notice '% função(ões) da oficina atualizada(s).',n;
end $$;

-- ===================== Cobrança no financeiro da locadora atendida =====================
-- O analista da oficina lança a parte do locatário, parcelada na diária, sem precisar administrar a locadora.
create or replace function public.oficina_cobrar_locatario(p_empresa uuid,p_manutencao uuid,p_parcelas integer,p_primeiro date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; o jsonb; valor numeric; novo uuid:=gen_random_uuid(); loc uuid; centavos bigint; base bigint; resto bigint; i int;
begin
 if not public.oficina_acesso(p_empresa) or not public.oficina_pode_aprovar(p_empresa) then raise exception using errcode='42501',message='Somente o analista da oficina lança a cobrança.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário.',m.numero; end if;
 if m.orcamento_status<>'aprovado' then raise exception 'O orçamento precisa ser aprovado pelo analista antes da cobrança.'; end if;
 if m.responsavel_cliente_id is null then raise exception 'Esta manutenção não tem locatário responsável.'; end if;
 if not public.oficina_atende(p_empresa,m.responsavel_empresa_id) then raise exception 'Esta oficina não atende a empresa do locatário.'; end if;
 if p_parcelas is null or p_parcelas not between 1 and 120 or p_primeiro is null or p_primeiro<(now() at time zone 'America/Manaus')::date-1 then
  raise exception 'Informe de 1 a 120 parcelas diárias e a data da primeira (a partir de hoje).';
 end if;
 o:=public.oficina_orcamento(p_empresa,p_manutencao); valor:=(o->'totais'->>'locatario')::numeric;
 if valor is distinct from (m.orcamento_aprovado->>'locatario')::numeric then raise exception 'O orçamento mudou depois da aprovação. Peça ao analista para revisar.'; end if;
 if valor<=0 then raise exception 'Não há valor a cobrar do locatário.'; end if;
 centavos:=round(valor*100); if centavos<p_parcelas then raise exception 'Cada parcela deve ter pelo menos R$ 0,01.'; end if;
 base:=centavos/p_parcelas; resto:=centavos%p_parcelas;
 insert into public.cliente_debitos(id,empresa_id,cliente_id,categoria,descricao,valor_total,pago_anterior,pedido,criado_por)
 values(novo,m.responsavel_empresa_id,m.responsavel_cliente_id,'manutencao','Manutenção #'||m.numero||' · '||m.placa,valor,0,
  jsonb_build_object('origem','oficina','oficina',p_empresa,'manutencao',m.id,'parcelas',p_parcelas,'primeiro',p_primeiro,'periodicidade','diaria'),auth.uid());
 for i in 1..p_parcelas loop
  insert into public.cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor)
  values(m.responsavel_empresa_id,novo,i,p_primeiro+i-1,(base+case when i=p_parcelas then resto else 0 end)::numeric/100);
 end loop;
 select l.id into loc from public.locacoes l where l.cliente_id=m.responsavel_cliente_id and l.status='Ativa' order by l.data_inicio desc limit 1;
 if loc is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='cliente_debitos' and column_name='locacao_id') then
  execute 'update public.cliente_debitos set locacao_id=$1 where id=$2' using loc,novo;
 end if;
 update public.oficina_manutencoes set cobranca_debito_id=novo,cobrada_em=now() where id=m.id;
 return jsonb_build_object('debito_id',novo,'valor',valor,'parcelas',p_parcelas,'primeira',p_primeiro,'locatario',m.responsavel_nome);
end $$;
revoke all on function public.oficina_cobrar_locatario(uuid,uuid,integer,date) from public,anon;
grant execute on function public.oficina_cobrar_locatario(uuid,uuid,integer,date) to authenticated;

-- ===================== 4. Saída da manutenção só com registro da oficina =====================
create or replace function public.carro_saida_manutencao_exige_oficina() returns trigger
language plpgsql security definer set search_path='' as $$
declare entrada timestamptz;
begin
 if old.situacao in ('Manutenção','Revisão') and new.situacao is distinct from old.situacao
 and coalesce(new.situacao,'') not in ('Manutenção','Revisão','Vendido','Inativo') then
  -- Início desta passagem pela manutenção (com folga de um dia para registros feitos antes da entrada formal).
  entrada:=coalesce((select max(p.inicio) from public.frota_periodos p where p.carro_id=new.id and p.tipo='manutencao'),old.situacao_confirmada_em,now()-interval '30 days')-interval '1 day';
  if not exists(select 1 from public.oficina_manutencoes m where m.carro_id=new.id and m.status<>'cancelada' and m.entrada_em>=entrada
   and (exists(select 1 from public.oficina_movimentos x where x.manutencao_id=m.id and x.tipo='saida')
     or exists(select 1 from public.oficina_manutencao_servicos s where s.manutencao_id=m.id and s.removido_em is null))) then
   raise exception 'O veículo % só sai da manutenção depois que a oficina registrar alguma peça ou serviço nele.',new.placa;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.carro_saida_manutencao_exige_oficina() from public,anon,authenticated;
drop trigger if exists carro_saida_manutencao_oficina on public.carros;
create trigger carro_saida_manutencao_oficina before update of situacao on public.carros for each row execute function public.carro_saida_manutencao_exige_oficina();

-- ===================== 5. Financeiro da manutenção =====================
create or replace function public.oficina_financeiro(p_empresa uuid,p_de date,p_ate date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb:='[]'; m public.oficina_manutencoes; o jsonb;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_de is null or p_ate is null or p_ate<p_de or p_ate-p_de>400 then raise exception 'Escolha um período de até 400 dias.'; end if;
 for m in select * from public.oficina_manutencoes where empresa_id=p_empresa and status<>'cancelada'
  and (entrada_em at time zone 'America/Manaus')::date between p_de and p_ate order by entrada_em loop
  o:=public.oficina_orcamento(p_empresa,m.id);
  r:=r||jsonb_build_array(jsonb_build_object('id',m.id,'numero',m.numero,'placa',m.placa,'veiculo',m.veiculo,'tipo',m.tipo,'status',m.status,
   'orcamento_status',m.orcamento_status,'entrada_em',m.entrada_em,'responsavel',m.responsavel_nome,'cliente_externo',m.cliente_externo,
   'cobrada_em',m.cobrada_em,'totais',o->'totais'));
 end loop;
 return r;
end $$;
revoke all on function public.oficina_financeiro(uuid,date,date) from public,anon;
grant execute on function public.oficina_financeiro(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Módulo Oficina separado. Agora libere o módulo em Acessos e ligue a oficina à locadora.' as resultado;
