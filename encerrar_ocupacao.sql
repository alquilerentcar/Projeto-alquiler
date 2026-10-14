-- Aplicar no SQL Editor como postgres. Preserva o histórico; não exclui clientes.
begin;
create table if not exists public.frota_ocupacoes_encerradas(
 id uuid primary key,empresa_id uuid not null references public.empresas(id),carro_id uuid not null references public.carros(id),
 origem text not null check(origem in ('levantamento','periodo')),origem_id uuid not null,
 snapshot jsonb not null,fim timestamptz not null,motivo text not null,situacao_posterior text not null,
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),unique(origem,origem_id)
);
alter table public.frota_ocupacoes_encerradas enable row level security;
revoke all on public.frota_ocupacoes_encerradas from public,anon,authenticated;
grant select on public.frota_ocupacoes_encerradas to authenticated;
drop policy if exists ocupacoes_encerradas_leitura on public.frota_ocupacoes_encerradas;
create policy ocupacoes_encerradas_leitura on public.frota_ocupacoes_encerradas for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.frota_encerrar_ocupacao(p_empresa uuid,p_id uuid,p_origem text,p_ocupacao uuid,p_fim timestamptz,p_motivo text,p_situacao text)
returns uuid language plpgsql security definer set search_path='' as $$
declare old jsonb;aid uuid;existing public.frota_ocupacoes_encerradas;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into existing from public.frota_ocupacoes_encerradas where id=p_id;
 if existing.id is not null then
  if existing.empresa_id<>p_empresa or existing.criado_por<>auth.uid() then raise exception 'Sem acesso ao registro.';end if;
  return existing.id;
 end if;
 if p_id is null or p_fim is null or p_fim>now() or nullif(trim(p_motivo),'') is null or length(p_motivo)>2000
 or p_situacao not in ('Disponível','Indisponível','Manutenção','Revisão') or p_situacao is null then raise exception 'Informe data real, motivo e situação posterior.';end if;
 if p_origem='levantamento' then
  select to_jsonb(t) into old from public.frota_levantamento t where id=p_ocupacao and empresa_id=p_empresa and ativo for update;
 elsif p_origem='periodo' then
  select to_jsonb(t) into old from public.frota_periodos t where id=p_ocupacao and empresa_id=p_empresa and fim is null and tipo='locacao' for update;
 else raise exception 'Esta locação deve ser encerrada em Gerenciar etapas.';end if;
 if old is null then raise exception 'Ocupação já encerrada ou alterada. Atualize a tela.';end if;
 aid:=(old->>'carro_id')::uuid;
 if aid is null then raise exception 'Cadastre e vincule o veículo antes de encerrar.';end if;
 if p_fim<=coalesce(nullif(old->>'inicio','')::timestamptz,'-infinity'::timestamptz) then raise exception 'Encerramento anterior ao início.';end if;
 if exists(select 1 from public.locacoes where carro_id=aid and status='Ativa')
 or exists(select 1 from public.frota_periodos where carro_id=aid and fim is null and (p_origem<>'periodo' or id<>p_ocupacao))
 or exists(select 1 from public.frota_levantamento where carro_id=aid and ativo and (empresa_id<>p_empresa or cliente_id is distinct from (old->>'cliente_id')::uuid)) then raise exception 'Há outra ocupação neste carro. Confira o vínculo antes de encerrar.';end if;
 insert into public.frota_ocupacoes_encerradas(id,empresa_id,carro_id,origem,origem_id,snapshot,fim,motivo,situacao_posterior,criado_por)
 values(p_id,p_empresa,aid,p_origem,p_ocupacao,old,p_fim,trim(p_motivo),p_situacao,auth.uid());
 if p_origem='periodo' then perform public.frota_movimentar(p_empresa,jsonb_build_object('acao','encerrar','periodo',p_ocupacao,'data',p_fim));end if;
 update public.frota_levantamento set ativo=false where empresa_id=p_empresa and carro_id=aid and ativo;
 update public.carros set situacao=p_situacao,situacao_confirmada_em=now() where id=aid;
 return p_id;
end $$;
revoke all on function public.frota_encerrar_ocupacao(uuid,uuid,text,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.frota_encerrar_ocupacao(uuid,uuid,text,uuid,timestamptz,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Encerramento de ocupações preparado' as resultado;
