-- Controle operacional inicial. Executar como postgres após as etapas de acessos.
-- Preserva contratos, veículos e locações existentes.
begin;
alter table public.carros add column if not exists proprietario_nome text;
alter table public.carros add column if not exists proprietario_documento text;
alter table public.carros add column if not exists localizacao text;
alter table public.empresas add column if not exists oficina_habilitada boolean not null default false;
alter table public.empresas add column if not exists cor_paineis text not null default '#ffffff' check(cor_paineis ~ '^#[0-9a-fA-F]{6}$');
grant update(oficina_habilitada,cor_paineis) on public.empresas to authenticated;
create table if not exists public.frota_periodos (
 id uuid primary key default gen_random_uuid(), grupo_id uuid not null,
 empresa_id uuid not null references public.empresas(id),
 carro_id uuid not null references public.carros(id),
 cliente_id uuid references public.clientes(id),
 tipo text not null check(tipo in ('locacao','manutencao','indisponivel')),
 inicio timestamptz not null, fim timestamptz, previsao timestamptz,
 diaria numeric(12,2) check(diaria>=0), localizacao text, observacoes text,
 anterior_id uuid references public.frota_periodos(id),
 criado_por uuid not null, criado_em timestamptz not null default now(),
 check(fim is null or fim>inicio),
 check(tipo<>'locacao' or (cliente_id is not null and diaria is not null))
);
create unique index if not exists frota_um_periodo_aberto on public.frota_periodos(carro_id) where fim is null;
create index if not exists frota_periodos_empresa on public.frota_periodos(empresa_id,inicio);
create table if not exists public.frota_recebimentos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 grupo_id uuid not null, competencia date not null, valor numeric(12,2) not null check(valor>0),
 criado_por uuid not null, criado_em timestamptz not null default now()
);
alter table public.frota_periodos enable row level security;
alter table public.frota_recebimentos enable row level security;
revoke all on public.frota_periodos,public.frota_recebimentos from public,anon,authenticated;
grant select on public.frota_periodos,public.frota_recebimentos to authenticated;
drop policy if exists frota_periodos_leitura on public.frota_periodos;
create policy frota_periodos_leitura on public.frota_periodos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
drop policy if exists frota_recebimentos_leitura on public.frota_recebimentos;
create policy frota_recebimentos_leitura on public.frota_recebimentos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.frota_movimentar(p_empresa uuid,p_dados jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare acao text:=p_dados->>'acao'; veiculo public.carros; atual public.frota_periodos; novo uuid:=gen_random_uuid(); momento timestamptz; cliente uuid; tipo text; diaria numeric; dono uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.'; end if;
 if acao not in ('iniciar','trocar','encerrar') or acao is null then raise exception 'Ação inválida.'; end if;
 momento:=(p_dados->>'data')::timestamptz;
 if momento is null or momento>now() then raise exception 'Informe uma data válida, sem antecipar uma movimentação.'; end if;
 -- Todas as alterações de ocupação são serializadas, inclusive trocas entre empresas.
 perform pg_advisory_xact_lock(7261002);
 if acao in ('trocar','encerrar') then
  select * into atual from public.frota_periodos where id=(p_dados->>'periodo')::uuid and empresa_id=p_empresa and fim is null for update;
  if atual.id is null then raise exception 'O período não está aberto nesta empresa.'; end if;
  if momento<=atual.inicio then raise exception 'A movimentação deve ser posterior ao início.'; end if;
 end if;
 if acao in ('trocar','encerrar') and exists(select 1 from public.frota_recebimentos where grupo_id=atual.grupo_id and competencia>(momento at time zone 'America/Manaus')::date) then
  raise exception 'Há recebimentos posteriores à data informada. Confira o histórico antes de retroagir o período.';
 end if;
 if acao='encerrar' then
  update public.frota_periodos set fim=momento where id=atual.id;
  return atual.id;
 end if;
 select * into veiculo from public.carros where id=(p_dados->>'carro')::uuid for update;
 if veiculo.id is null or not coalesce(public.acesso_modulo(veiculo.empresa_id,'locacao'),false) then raise exception 'Sem acesso à empresa proprietária do veículo.'; end if;
 if veiculo.situacao='Inativo' then raise exception 'Veículo inativo.'; end if;
 if exists(select 1 from public.frota_periodos where carro_id=veiculo.id and tstzrange(inicio,fim,'[)') && tstzrange(momento,null,'[)'))
  or exists(select 1 from public.locacoes where carro_id=veiculo.id and status='Ativa')
 then raise exception 'Veículo ocupado. Encerre o período atual antes de usar este carro.'; end if;
 tipo:=case when acao='trocar' then atual.tipo else p_dados->>'tipo' end;
 if tipo not in ('locacao','manutencao','indisponivel') or tipo is null then raise exception 'Tipo inválido.'; end if;
 if tipo='manutencao' and not exists(select 1 from public.empresas where id=p_empresa and oficina_habilitada) then raise exception 'Oficina não habilitada para esta empresa.'; end if;
 if acao='trocar' and atual.tipo<>'locacao' then raise exception 'Somente locações permitem troca de veículo.'; end if;
 cliente:=case when acao='trocar' then atual.cliente_id else nullif(p_dados->>'cliente','')::uuid end;
 if tipo='locacao' then
  if not exists(select 1 from public.clientes where id=cliente and empresa_id=p_empresa) then raise exception 'Selecione um cliente desta empresa.'; end if;
  diaria:=nullif(p_dados->>'diaria','')::numeric;
  if diaria is null or diaria<0 or diaria>99999999.99 then raise exception 'Informe a diária acordada.'; end if;
  if acao='trocar' and diaria is distinct from atual.diaria and exists(select 1 from public.frota_recebimentos where grupo_id=atual.grupo_id and competencia=(momento at time zone 'America/Manaus')::date) then
   raise exception 'A diária deste dia já recebeu pagamento. Confira o recebimento antes de alterar o valor por uma troca.';
  end if;
 end if;
 if nullif(p_dados->>'previsao','')::timestamptz<momento then raise exception 'Previsão anterior ao início.'; end if;
 if acao='trocar' then update public.frota_periodos set fim=momento where id=atual.id; end if;
 insert into public.frota_periodos(id,grupo_id,empresa_id,carro_id,cliente_id,tipo,inicio,previsao,diaria,localizacao,observacoes,anterior_id,criado_por)
 values(novo,case when acao='trocar' then atual.grupo_id else novo end,p_empresa,veiculo.id,cliente,tipo,momento,nullif(p_dados->>'previsao','')::timestamptz,diaria,left(p_dados->>'localizacao',300),left(p_dados->>'observacoes',2000),atual.id,auth.uid());
 return novo;
end $$;

create or replace function public.frota_impedir_conflito_contrato()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='Ativa' then
  perform pg_advisory_xact_lock(7261002);
  if exists(select 1 from public.frota_periodos where carro_id=new.carro_id and fim is null) then
   raise exception 'O veículo já tem ocupação na Frota. Confira os períodos antes de iniciar outra locação.';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.frota_impedir_conflito_contrato() from public,anon,authenticated;
drop trigger if exists frota_contrato_sem_conflito on public.locacoes;
create trigger frota_contrato_sem_conflito before insert or update of status,carro_id on public.locacoes for each row execute function public.frota_impedir_conflito_contrato();

-- Um lançamento por locação e dia. Na troca no mesmo dia, vale a última diária daquele dia.
create or replace function public.frota_previsto(p_empresa uuid,p_dia date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.'; end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into resultado from (
  select p.grupo_id,p.id periodo_id,p.cliente_id,c.nome_completo cliente,v.placa,p.diaria,
   coalesce((select sum(r.valor) from public.frota_recebimentos r where r.empresa_id=p_empresa and r.grupo_id=p.grupo_id and r.competencia=p_dia),0) recebido
  from (select distinct on (grupo_id) * from public.frota_periodos
   where empresa_id=p_empresa and tipo='locacao'
    and inicio<(p_dia+1)::timestamp at time zone 'America/Manaus'
    and (fim is null or fim>p_dia::timestamp at time zone 'America/Manaus')
   order by grupo_id,inicio desc) p
  join public.clientes c on c.id=p.cliente_id join public.carros v on v.id=p.carro_id
 ) q;
 return resultado;
end $$;

create or replace function public.frota_receber(p_empresa uuid,p_grupo uuid,p_dia date,p_valor numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare item jsonb; novo uuid:=gen_random_uuid();
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.'; end if;
 if p_dia is null or p_dia>(now() at time zone 'America/Manaus')::date or p_valor is null or p_valor<=0 then raise exception 'Data ou valor inválido.'; end if;
 perform pg_advisory_xact_lock(7261002);
 select value into item from jsonb_array_elements(public.frota_previsto(p_empresa,p_dia)) where value->>'grupo_id'=p_grupo::text;
 if item is null or p_valor>(item->>'diaria')::numeric-(item->>'recebido')::numeric then raise exception 'Valor excede o saldo da diária. Atualize a tela.'; end if;
 insert into public.frota_recebimentos(id,empresa_id,grupo_id,competencia,valor,criado_por) values(novo,p_empresa,p_grupo,p_dia,p_valor,auth.uid());
 return novo;
end $$;

create or replace function public.frota_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.'; end if;
 return jsonb_build_object(
  'carros',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('empresa_nome',e.nome_fantasia,'ocupado_externo',exists(select 1 from public.frota_periodos p where p.carro_id=c.id and p.fim is null and p.empresa_id<>p_empresa))) from public.carros c join public.empresas e on e.id=c.empresa_id where public.acesso_modulo(c.empresa_id,'locacao')),'[]'),
  'periodos',coalesce((select jsonb_agg(to_jsonb(p) order by inicio desc) from public.frota_periodos p where p.empresa_id=p_empresa),'[]'),
  'clientes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome_completo)) from public.clientes where empresa_id=p_empresa),'[]'));
end $$;
revoke all on function public.frota_movimentar(uuid,jsonb),public.frota_previsto(uuid,date),public.frota_receber(uuid,uuid,date,numeric),public.frota_painel(uuid) from public,anon;
grant execute on function public.frota_movimentar(uuid,jsonb),public.frota_previsto(uuid,date),public.frota_receber(uuid,uuid,date,numeric),public.frota_painel(uuid) to authenticated;
commit;
select 'Controle operacional da frota preparado' as resultado;
