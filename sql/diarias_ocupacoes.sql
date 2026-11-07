-- Execute no SQL Editor como postgres. Não altera os recebimentos históricos importados.
begin;
create table if not exists public.frota_cobrancas (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 grupo_id uuid not null, origem text not null, origem_id uuid not null,
 cliente_id uuid references public.clientes(id), carro_id uuid not null references public.carros(id),
 nome text not null, placa text not null, competencia date not null,
 diaria numeric(12,2) not null check(diaria>0), vencimento timestamptz not null,
 multa numeric(12,2) not null default 0 check(multa>=0), multa_aplicada_em timestamptz,
 criado_em timestamptz not null default now(),unique(empresa_id,grupo_id,competencia)
);
create table if not exists public.frota_cobranca_limites (
 empresa_id uuid not null references public.empresas(id),grupo_id uuid not null,
 termino date,alterado_por uuid not null,alterado_em timestamptz not null default now(),
 primary key(empresa_id,grupo_id)
);
alter table public.frota_recebimentos add column if not exists operacao_id uuid;
alter table public.frota_recebimentos add column if not exists recebido_em timestamptz;
create unique index if not exists frota_recebimento_operacao on public.frota_recebimentos(operacao_id) where operacao_id is not null;
create index if not exists frota_recebimentos_competencia on public.frota_recebimentos(empresa_id,grupo_id,competencia);
create index if not exists frota_recebimentos_data_real on public.frota_recebimentos(empresa_id,recebido_em);
create index if not exists frota_cobrancas_dia on public.frota_cobrancas(empresa_id,competencia);
alter table public.frota_cobrancas enable row level security;
alter table public.frota_cobranca_limites enable row level security;
revoke all on public.frota_cobrancas,public.frota_cobranca_limites from public,anon,authenticated;
grant select on public.frota_cobrancas,public.frota_cobranca_limites to authenticated;
drop policy if exists cobrancas_leitura on public.frota_cobrancas;
create policy cobrancas_leitura on public.frota_cobrancas for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
drop policy if exists cobrancas_limites_leitura on public.frota_cobranca_limites;
create policy cobrancas_limites_leitura on public.frota_cobranca_limites for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create table if not exists public.frota_cobranca_eventos(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
 cobranca_id uuid not null references public.frota_cobrancas(id),tipo text not null,
 multa_anterior numeric(12,2),multa_nova numeric(12,2) not null,
 registrado_por uuid,registrado_em timestamptz not null default now()
);
alter table public.frota_cobranca_eventos enable row level security;
revoke all on public.frota_cobranca_eventos from public,anon,authenticated;
grant select on public.frota_cobranca_eventos to authenticated;
drop policy if exists cobrancas_eventos_leitura on public.frota_cobranca_eventos;
create policy cobrancas_eventos_leitura on public.frota_cobranca_eventos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.frota_auditar_cobranca() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.frota_cobranca_eventos(empresa_id,cobranca_id,tipo,multa_nova,registrado_por) values(new.empresa_id,new.id,'gerada',new.multa,auth.uid());
 elsif old.multa is distinct from new.multa then
  insert into public.frota_cobranca_eventos(empresa_id,cobranca_id,tipo,multa_anterior,multa_nova,registrado_por) values(new.empresa_id,new.id,'multa_recalculada',old.multa,new.multa,auth.uid());
 end if;
 return new;
end $$;
revoke all on function public.frota_auditar_cobranca() from public,anon,authenticated;
drop trigger if exists frota_cobranca_auditoria on public.frota_cobrancas;
create trigger frota_cobranca_auditoria after insert or update of multa on public.frota_cobrancas for each row execute function public.frota_auditar_cobranca();

-- Uma fonte por veículo. Um período operacional prevalece sobre seu espelho no levantamento.
create or replace function public.frota_fontes_diarias(p_empresa uuid,p_dia date)
returns table(grupo_id uuid,origem text,origem_id uuid,cliente_id uuid,carro_id uuid,nome text,placa text,diaria numeric,termino date)
language sql stable security definer set search_path='' as $$
 select p.grupo_id,'periodo',p.id,p.cliente_id,p.carro_id,c.nome_completo,v.placa,p.diaria,l.termino
 from (select distinct on (f.grupo_id) f.* from public.frota_periodos f
 where f.empresa_id=p_empresa and f.tipo='locacao'
 and f.inicio < (p_dia+1)::timestamp at time zone 'America/Manaus'
 and (f.fim is null or f.fim>p_dia::timestamp at time zone 'America/Manaus') order by f.grupo_id,f.inicio desc) p
 join public.carros v on v.id=p.carro_id join public.clientes c on c.id=p.cliente_id
 left join public.frota_cobranca_limites l on l.empresa_id=p_empresa and l.grupo_id=p.grupo_id
 where auth.uid() is not null and public.acesso_modulo(p_empresa,'locacao') and (l.termino is null or p_dia<=l.termino)
 union all
 select f.id,'levantamento',f.id,f.cliente_id,f.carro_id,coalesce(c.nome_completo,f.responsavel),v.placa,coalesce(f.diaria,v.valor_diaria),l.termino
 from public.frota_levantamento f join public.carros v on v.id=f.carro_id
 left join public.clientes c on c.id=f.cliente_id
 left join public.frota_cobranca_limites l on l.empresa_id=p_empresa and l.grupo_id=f.id
 where f.empresa_id=p_empresa and f.ativo and v.situacao<>'Vendido'
 and auth.uid() is not null and public.acesso_modulo(p_empresa,'locacao')
 and (f.inicio is null or f.inicio < (p_dia+1)::timestamp at time zone 'America/Manaus')
 and (l.termino is null or p_dia<=l.termino)
 and not exists(select 1 from public.frota_periodos p where p.carro_id=f.carro_id and p.empresa_id=p_empresa
 and p.tipo='locacao' and p.inicio<(p_dia+1)::timestamp at time zone 'America/Manaus' and (p.fim is null or p.fim>p_dia::timestamp at time zone 'America/Manaus'))
 and not exists(select 1 from public.locacoes x where x.carro_id=f.carro_id and x.status='Ativa')
 union all
 select x.id,'contrato',x.id,x.cliente_id,x.carro_id,c.nome_completo,v.placa,x.valor_diaria,
 case when l.termino is null then (x.data_fim at time zone 'America/Manaus')::date
 when x.data_fim is null then l.termino else least(l.termino,(x.data_fim at time zone 'America/Manaus')::date) end
 from public.locacoes x join public.clientes c on c.id=x.cliente_id join public.carros v on v.id=x.carro_id
 left join public.frota_cobranca_limites l on l.empresa_id=p_empresa and l.grupo_id=x.id
 where x.empresa_id=p_empresa and x.status='Ativa' and auth.uid() is not null and public.acesso_modulo(p_empresa,'locacao')
 and x.data_inicio<(p_dia+1)::timestamp at time zone 'America/Manaus'
 and (x.data_fim is null or p_dia<=(x.data_fim at time zone 'America/Manaus')::date)
 and (l.termino is null or p_dia<=l.termino)
 and not exists(select 1 from public.frota_periodos p where p.carro_id=x.carro_id and p.fim is null)
$$;
revoke all on function public.frota_fontes_diarias(uuid,date) from public,anon,authenticated;

-- Mantém a consulta antiga disponível somente para competências anteriores à ativação.
do $$ begin
 if to_regprocedure('public.frota_previsto_antes_cobrancas(uuid,date)') is null then
  alter function public.frota_previsto(uuid,date) rename to frota_previsto_antes_cobrancas;
 end if;
end $$;
revoke all on function public.frota_previsto_antes_cobrancas(uuid,date) from public,anon,authenticated;

create or replace function public.frota_previsto(p_empresa uuid,p_dia date)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Manaus')::date; resultado jsonb; dia date;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.';end if;
 if p_dia is null or p_dia>hoje+366 then raise exception 'Informe uma data até um ano adiante.';end if;
 if p_dia<'2026-10-10' then return public.frota_previsto_antes_cobrancas(p_empresa,p_dia);end if;
 perform pg_advisory_xact_lock(7261002);
 -- Dias futuros são previsão; gravar o valor apenas quando o dia chegar preserva futuras trocas.
 for dia in select generate_series('2026-10-10'::date,least(p_dia,hoje),interval '1 day')::date loop
  insert into public.frota_cobrancas(empresa_id,grupo_id,origem,origem_id,cliente_id,carro_id,nome,placa,competencia,diaria,vencimento)
  select p_empresa,s.grupo_id,s.origem,s.origem_id,s.cliente_id,s.carro_id,s.nome,s.placa,dia,s.diaria,
  (dia+time '18:00') at time zone 'America/Manaus'
  from public.frota_fontes_diarias(p_empresa,dia) s where s.diaria>0
  on conflict(empresa_id,grupo_id,competencia) do nothing;
  -- Pagamentos até 18h evitam a multa. Após 18h, multa única sobre a diária inteira.
  update public.frota_cobrancas b set multa=case when coalesce((select sum(r.valor) from public.frota_recebimentos r
    where r.empresa_id=p_empresa and r.grupo_id=b.grupo_id and r.competencia=dia and coalesce(r.recebido_em,r.criado_em)<=b.vencimento),0)<b.diaria
    then round(b.diaria*0.11,2) else 0 end,multa_aplicada_em=b.vencimento
  where b.empresa_id=p_empresa and b.competencia=dia and now()>b.vencimento;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.cliente,q.placa),'[]') into resultado from (
  select b.grupo_id,b.origem_id periodo_id,b.cliente_id,b.carro_id,b.nome cliente,b.placa,
  b.diaria diaria_base,b.multa,b.diaria+b.multa diaria,b.vencimento,b.id cobranca_id,l.termino,
  coalesce((select sum(r.valor) from public.frota_recebimentos r where r.empresa_id=p_empresa and r.grupo_id=b.grupo_id and r.competencia=p_dia),0) recebido
  from public.frota_cobrancas b left join public.frota_cobranca_limites l on l.empresa_id=p_empresa and l.grupo_id=b.grupo_id
  where b.empresa_id=p_empresa and b.competencia=p_dia
  union all
  select s.grupo_id,s.origem_id,s.cliente_id,s.carro_id,s.nome,s.placa,s.diaria,0::numeric,s.diaria,
  (p_dia+time '18:00') at time zone 'America/Manaus',null::uuid,s.termino,0::numeric
  from public.frota_fontes_diarias(p_empresa,p_dia) s where p_dia>hoje and s.diaria>0
 ) q;
 return resultado;
end $$;

create or replace function public.frota_confirmar_diaria(p_empresa uuid,p_grupo uuid,p_dia date,p_valor numeric,p_operacao uuid,p_recebido_em timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare item jsonb; existente public.frota_recebimentos;novo uuid:=gen_random_uuid();momento timestamptz:=coalesce(p_recebido_em,now());base numeric;total_anterior numeric;multa_devida numeric;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.';end if;
 if p_operacao is null or p_dia is null or p_dia>(now() at time zone 'America/Manaus')::date or p_valor is null or p_valor<=0 or p_valor<>round(p_valor,2) then raise exception 'Confira data e valor.';end if;
 if not isfinite(momento) or momento>now() then raise exception 'Informe quando recebeu, sem usar uma data futura.';end if;
 if momento<now()-interval '10 minutes' and not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then raise exception 'Somente o administrador pode registrar um recebimento anterior.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into existente from public.frota_recebimentos where operacao_id=p_operacao;
 if existente.id is not null then
  if existente.empresa_id<>p_empresa or existente.grupo_id<>p_grupo or existente.competencia<>p_dia or existente.valor<>p_valor or existente.criado_por<>auth.uid() or (p_recebido_em is not null and existente.recebido_em is distinct from p_recebido_em) then raise exception 'Operação já utilizada com outros dados.';end if;
  return existente.id;
 end if;
 select value into item from jsonb_array_elements(public.frota_previsto(p_empresa,p_dia)) where value->>'grupo_id'=p_grupo::text;
 if item is null then raise exception 'Diária não encontrada.';end if;
 base:=coalesce((item->>'diaria_base')::numeric,(item->>'diaria')::numeric);
 total_anterior:=(item->>'recebido')::numeric;
 multa_devida:=coalesce((item->>'multa')::numeric,0);
 if item->>'vencimento' is not null and momento<=(item->>'vencimento')::timestamptz and now()>(item->>'vencimento')::timestamptz then
  if coalesce((select sum(r.valor) from public.frota_recebimentos r where r.empresa_id=p_empresa and r.grupo_id=p_grupo and r.competencia=p_dia and coalesce(r.recebido_em,r.criado_em)<=(item->>'vencimento')::timestamptz),0)+p_valor>=base then multa_devida:=0;end if;
 end if;
 if p_valor>base+multa_devida-total_anterior then raise exception 'Valor excede o saldo considerando a data real do recebimento. Confira diária, multa e pagamentos anteriores.';end if;
 insert into public.frota_recebimentos(id,empresa_id,grupo_id,competencia,valor,criado_por,operacao_id,recebido_em)
 values(novo,p_empresa,p_grupo,p_dia,p_valor,auth.uid(),p_operacao,momento);
 perform public.frota_previsto(p_empresa,p_dia);
 return novo;
end $$;
create or replace function public.frota_confirmar_diaria(p_empresa uuid,p_grupo uuid,p_dia date,p_valor numeric,p_operacao uuid)
returns uuid language sql security definer set search_path='' as $$
 select public.frota_confirmar_diaria(p_empresa,p_grupo,p_dia,p_valor,p_operacao,null::timestamptz)
$$;
create or replace function public.frota_receber(p_empresa uuid,p_grupo uuid,p_dia date,p_valor numeric)
returns uuid language sql security definer set search_path='' as $$
 select public.frota_confirmar_diaria(p_empresa,p_grupo,p_dia,p_valor,gen_random_uuid())
$$;

create or replace function public.frota_definir_termino(p_empresa uuid,p_grupo uuid,p_termino date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then raise exception 'Somente o administrador pode definir o término.';end if;
 perform pg_advisory_xact_lock(7261002);
 if p_termino is not null and p_termino<(now() at time zone 'America/Manaus')::date then raise exception 'Para encerrar retroativamente, confira as cobranças já registradas.';end if;
 if not exists(select 1 from public.frota_fontes_diarias(p_empresa,(now() at time zone 'America/Manaus')::date) where grupo_id=p_grupo)
 and not exists(select 1 from public.frota_cobrancas where empresa_id=p_empresa and grupo_id=p_grupo) then raise exception 'Ocupação não encontrada.';end if;
 insert into public.frota_cobranca_limites(empresa_id,grupo_id,termino,alterado_por) values(p_empresa,p_grupo,p_termino,auth.uid())
 on conflict(empresa_id,grupo_id) do update set termino=excluded.termino,alterado_por=excluded.alterado_por,alterado_em=now();
end $$;
revoke all on function public.frota_previsto(uuid,date),public.frota_receber(uuid,uuid,date,numeric),public.frota_confirmar_diaria(uuid,uuid,date,numeric,uuid),public.frota_confirmar_diaria(uuid,uuid,date,numeric,uuid,timestamptz),public.frota_definir_termino(uuid,uuid,date) from public,anon;
grant execute on function public.frota_previsto(uuid,date),public.frota_receber(uuid,uuid,date,numeric),public.frota_confirmar_diaria(uuid,uuid,date,numeric,uuid),public.frota_confirmar_diaria(uuid,uuid,date,numeric,uuid,timestamptz),public.frota_definir_termino(uuid,uuid,date) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Diárias das ocupações a partir de 10/10/2026; vencimento 18h Manaus; multa única 11% da diária integral' as resultado;

