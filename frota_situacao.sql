-- Atualização de situação pela lista de Frotas e ocupações. Não encerra locações.
begin;
create table if not exists public.frota_situacao_eventos(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),carro_id uuid not null references public.carros(id),
 situacao_anterior text,situacao_nova text not null,descricao text,criado_por uuid not null,criado_em timestamptz not null default now()
);
alter table public.frota_situacao_eventos drop constraint if exists frota_situacao_eventos_criado_por_fkey;
alter table public.frota_situacao_eventos enable row level security;
revoke all on public.frota_situacao_eventos from public,anon,authenticated;
grant select on public.frota_situacao_eventos to authenticated;
drop policy if exists frota_situacao_leitura on public.frota_situacao_eventos;
create policy frota_situacao_leitura on public.frota_situacao_eventos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.frota_definir_situacao(p_empresa uuid,p_carro uuid,p_situacao text,p_descricao text default null)
returns text language plpgsql security definer set search_path='' as $$
declare c public.carros;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 if p_situacao is null or p_situacao not in ('Disponível','Indisponível','Manutenção','Revisão') or length(coalesce(p_descricao,''))>2000 then raise exception 'Situação ou descrição inválida.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into c from public.carros where id=p_carro for update;
 if c.id is null or c.empresa_id<>p_empresa then raise exception 'Altere a situação na empresa responsável por este veículo.';end if;
 if c.situacao in ('Vendido','Inativo') then raise exception 'Confira o cadastro do veículo vendido ou inativo antes de alterar a situação.';end if;
 if exists(select 1 from public.frota_levantamento where carro_id=c.id and ativo)
 or exists(select 1 from public.locacoes where carro_id=c.id and status='Ativa')
 or exists(select 1 from public.frota_periodos where carro_id=c.id and fim is null) then raise exception 'Encerre a ocupação ou o período atual antes de alterar a situação do carro.';end if;
 if p_situacao in ('Manutenção','Revisão') and nullif(trim(p_descricao),'') is null then raise exception 'Informe a descrição da manutenção ou revisão.';end if;
 if c.situacao is not distinct from p_situacao and (p_descricao is null or c.observacoes is not distinct from trim(p_descricao)) then return p_situacao;end if;
 insert into public.frota_situacao_eventos(empresa_id,carro_id,situacao_anterior,situacao_nova,descricao,criado_por)
 values(p_empresa,c.id,c.situacao,p_situacao,nullif(trim(p_descricao),''),auth.uid());
 update public.carros set situacao=p_situacao,situacao_confirmada_em=now(),observacoes=case when p_descricao is not null then nullif(trim(p_descricao),'') else observacoes end where id=c.id;
 return p_situacao;
end $$;
revoke all on function public.frota_definir_situacao(uuid,uuid,text,text) from public,anon;
grant execute on function public.frota_definir_situacao(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Situação do veículo na lista de frota preparada' as resultado;
