-- Corrigir vínculos ou registrar troca de locatário sem apagar o histórico.
begin;
create table if not exists public.frota_locatario_eventos(
 id uuid primary key,empresa_id uuid not null references public.empresas(id),carro_id uuid not null references public.carros(id),
 origem text not null,origem_id uuid not null,acao text not null,cliente_anterior uuid,cliente_novo uuid not null references public.clientes(id),
 snapshot jsonb not null,data_movimentacao timestamptz,motivo text not null,novo_periodo uuid references public.frota_periodos(id),
 criado_por uuid not null,criado_em timestamptz not null default now()
);
alter table public.frota_locatario_eventos drop constraint if exists frota_locatario_eventos_criado_por_fkey;
alter table public.frota_locatario_eventos enable row level security;
revoke all on public.frota_locatario_eventos from public,anon,authenticated;
grant select on public.frota_locatario_eventos to authenticated;
drop policy if exists frota_locatario_leitura on public.frota_locatario_eventos;
create policy frota_locatario_leitura on public.frota_locatario_eventos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.frota_alterar_locatario(p_empresa uuid,p_id uuid,p_origem text,p_ocupacao uuid,p_cliente uuid,p_acao text,p_motivo text,p_data timestamptz default null,p_diaria numeric default null,p_mesma_pessoa boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare old jsonb;aid uuid;novo uuid;existing public.frota_locatario_eventos;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into existing from public.frota_locatario_eventos where id=p_id;
 if existing.id is not null then
  if existing.empresa_id<>p_empresa or existing.criado_por<>auth.uid() then raise exception 'Sem acesso ao registro.';end if;
  return existing.id;
 end if;
 if p_id is null or p_acao is null or p_acao not in ('corrigir','trocar') or nullif(trim(p_motivo),'') is null or length(p_motivo)>2000 then raise exception 'Confira a ação e o motivo.';end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa and situacao='Ativo') then raise exception 'Selecione um cliente ativo desta empresa.';end if;
 if p_origem='levantamento' then
  select to_jsonb(t) into old from public.frota_levantamento t where id=p_ocupacao and empresa_id=p_empresa and ativo for update;
 elsif p_origem='periodo' then
  select to_jsonb(t) into old from public.frota_periodos t where id=p_ocupacao and empresa_id=p_empresa and fim is null and tipo='locacao' for update;
 else raise exception 'A locação com contrato deve ser tratada em Gerenciar etapas.';end if;
 if old is null then raise exception 'A ocupação já mudou. Atualize a lista.';end if;
 aid:=(old->>'carro_id')::uuid;
 if aid is null then raise exception 'Vincule o veículo antes de alterar o locatário.';end if;
 if (old->>'cliente_id')::uuid=p_cliente then raise exception 'Este cadastro já é o locatário atual.';end if;
 if p_acao='corrigir' then
  if not coalesce(p_mesma_pessoa,false) then raise exception 'Confirme que é a mesma pessoa para corrigir o vínculo.';end if;
  if exists(select 1 from public.locacoes where carro_id=aid and status='Ativa') then raise exception 'Confira o vínculo na locação com contrato.';end if;
  if p_origem='levantamento' and exists(select 1 from public.frota_periodos where carro_id=aid and fim is null) then raise exception 'Corrija o vínculo no período ativo da frota.';end if;
  if p_origem='periodo' and exists(select 1 from public.frota_levantamento where carro_id=aid and ativo and empresa_id=p_empresa and cliente_id is not null and cliente_id is distinct from (old->>'cliente_id')::uuid) then raise exception 'Há um levantamento com outro cliente. Confira os vínculos antes de corrigir.';end if;
  if p_origem='levantamento' then
   update public.frota_levantamento set cliente_id=p_cliente where id=p_ocupacao;
  else update public.frota_periodos set cliente_id=p_cliente where id=p_ocupacao;
  end if;
  if p_origem='periodo' then update public.frota_levantamento set cliente_id=p_cliente where empresa_id=p_empresa and carro_id=aid and ativo and (cliente_id is null or cliente_id=(old->>'cliente_id')::uuid);end if;
 else
  if p_data is null or p_data>now() or p_diaria is null or p_diaria<0 or p_diaria>99999999.99 then raise exception 'Informe a data real da troca e a diária acordada.';end if;
  perform public.frota_encerrar_ocupacao(p_empresa,p_id,p_origem,p_ocupacao,p_data,p_motivo,'Disponível');
  novo:=public.frota_movimentar(p_empresa,jsonb_build_object('acao','iniciar','carro',aid,'tipo','locacao','cliente',p_cliente,'data',p_data,'diaria',p_diaria,'observacoes',p_motivo));
  update public.carros set situacao='Locado' where id=aid;
 end if;
 insert into public.frota_locatario_eventos(id,empresa_id,carro_id,origem,origem_id,acao,cliente_anterior,cliente_novo,snapshot,data_movimentacao,motivo,novo_periodo,criado_por)
 values(p_id,p_empresa,aid,p_origem,p_ocupacao,p_acao,(old->>'cliente_id')::uuid,p_cliente,old,case when p_acao='trocar' then p_data else now() end,trim(p_motivo),novo,auth.uid());
 return p_id;
end $$;
revoke all on function public.frota_alterar_locatario(uuid,uuid,text,uuid,uuid,text,text,timestamptz,numeric,boolean) from public,anon;
grant execute on function public.frota_alterar_locatario(uuid,uuid,text,uuid,uuid,text,text,timestamptz,numeric,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Alteração do locatário na lista preparada' as resultado;
