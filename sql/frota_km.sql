-- Executar como postgres. Requer frota_operacao.sql e importar-ocupacoes-atuais.sql.
begin;
create table if not exists public.frota_km (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),carro_id uuid not null references public.carros(id),
 leitura_em timestamptz not null,km bigint not null check(km>=0),cliente_id uuid references public.clientes(id),responsavel text,ocupacao_chave text,
 observacoes text,criado_por uuid,criado_em timestamptz not null default now(),precisao_data text not null default 'hora' check(precisao_data in ('dia','hora')),origem text not null default 'manual',unique(empresa_id,carro_id,leitura_em)
);
alter table public.frota_km alter column criado_por drop not null;
alter table public.frota_km add column if not exists precisao_data text not null default 'hora' check(precisao_data in ('dia','hora'));
alter table public.frota_km add column if not exists origem text not null default 'manual';
alter table public.frota_km enable row level security;
revoke all on public.frota_km from public,anon,authenticated;
grant select on public.frota_km to authenticated;
drop policy if exists frota_km_leitura on public.frota_km;
create policy frota_km_leitura on public.frota_km for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.frota_registrar_km(p_empresa uuid,p_carro uuid,p_leitura timestamptz,p_km bigint,p_observacoes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare novo uuid; pessoa uuid; nome text; chave text; candidatos integer;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.'; end if;
 if p_leitura is null or p_leitura>now() or p_km is null or p_km<0 or length(coalesce(p_observacoes,''))>2000 then raise exception 'Informe data real, KM positivo e observação de até 2000 caracteres.'; end if;
 if not exists(select 1 from public.carros where id=p_carro and empresa_id=p_empresa) and not exists(select 1 from public.frota_periodos where carro_id=p_carro and empresa_id=p_empresa) and not exists(select 1 from public.frota_levantamento where carro_id=p_carro and empresa_id=p_empresa and ativo) then raise exception 'Veículo não pertence à operação desta empresa.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_carro::text,0));
 if exists(select 1 from public.frota_km where carro_id=p_carro and ((leitura_em<p_leitura and km>p_km) or (leitura_em>p_leitura and km<p_km))) then raise exception 'KM incompatível com uma leitura anterior ou posterior.'; end if;
 -- Sobreposição entre fluxos deixa a leitura sem atribuição, em vez de escolher uma pessoa.
 select count(*) into candidatos from (
 select id from public.frota_periodos where empresa_id=p_empresa and carro_id=p_carro and inicio<=p_leitura and (fim is null or p_leitura<fim)
 union all select id from public.locacoes where empresa_id=p_empresa and carro_id=p_carro and status in ('Ativa','Encerrada') and data_inicio<=p_leitura and (data_fim is null or p_leitura<data_fim)
 ) x;
 if candidatos=1 then
  select p.cliente_id,coalesce(to_jsonb(c)->>'nome_completo',to_jsonb(c)->>'nome'),'periodo:'||p.id into pessoa,nome,chave from public.frota_periodos p left join public.clientes c on c.id=p.cliente_id where p.empresa_id=p_empresa and p.carro_id=p_carro and p.inicio<=p_leitura and (p.fim is null or p_leitura<p.fim);
  if chave is null then select l.cliente_id,coalesce(to_jsonb(c)->>'nome_completo',to_jsonb(c)->>'nome'),'locacao:'||l.id into pessoa,nome,chave from public.locacoes l left join public.clientes c on c.id=l.cliente_id where l.empresa_id=p_empresa and l.carro_id=p_carro and l.status in ('Ativa','Encerrada') and l.data_inicio<=p_leitura and (l.data_fim is null or p_leitura<l.data_fim); end if;
 elsif candidatos=0 then
  -- Levantamento sem início conhecido: só permite atribuição de leituras posteriores ao registro.
  select l.cliente_id,l.responsavel,'levantamento:'||l.id||':'||coalesce(l.cliente_id::text,l.responsavel) into pessoa,nome,chave from public.frota_levantamento l where l.empresa_id=p_empresa and l.carro_id=p_carro and l.ativo and p_leitura>=coalesce(l.inicio,l.registrado_em);
 end if;
 insert into public.frota_km(empresa_id,carro_id,leitura_em,km,cliente_id,responsavel,ocupacao_chave,observacoes,criado_por) values(p_empresa,p_carro,p_leitura,p_km,pessoa,nome,chave,nullif(trim(p_observacoes),''),auth.uid()) returning id into novo;
 return novo;
end $$;
revoke all on function public.frota_registrar_km(uuid,uuid,timestamptz,bigint,text) from public,anon;
grant execute on function public.frota_registrar_km(uuid,uuid,timestamptz,bigint,text) to authenticated;
commit;
select 'Histórico de KM preparado' as resultado;
