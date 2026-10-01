-- Aplicar uma vez após as etapas anteriores. Reexecução preserva os registros.
begin;
create table if not exists public.locacao_eventos (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 locacao_id uuid not null references public.locacoes(id),
 acao text not null check(acao in ('entrega','devolucao','encerramento')),
 usuario_id uuid not null, criado_em timestamptz not null default now(),
 dados jsonb not null, transacao bigint not null default txid_current(),
 unique(locacao_id,acao)
);
alter table public.locacao_eventos enable row level security;
revoke all on public.locacao_eventos from public,anon,authenticated;
grant select on public.locacao_eventos to authenticated;
drop policy if exists locacao_eventos_leitura on public.locacao_eventos;
create policy locacao_eventos_leitura on public.locacao_eventos for select to authenticated
 using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.locacao_validar_status() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
  if new.status is distinct from 'Reservada' then raise exception 'Novas locações devem iniciar como Reservada.';end if;
 elsif new.status is distinct from old.status then
  if not exists(select 1 from public.locacao_eventos e where e.locacao_id=new.id and e.empresa_id=new.empresa_id
   and e.transacao=txid_current() and e.usuario_id=auth.uid()
   and ((old.status='Reservada' and new.status='Ativa' and e.acao='entrega') or (old.status='Ativa' and new.status='Encerrada' and e.acao='encerramento')))
  then raise exception 'Use as ações do fluxo para alterar o status da locação.';end if;
 end if;
 if TG_OP='UPDATE' and (new.empresa_id is distinct from old.empresa_id or new.carro_id is distinct from old.carro_id or new.cliente_id is distinct from old.cliente_id)
  and (old.status<>'Reservada' or exists(select 1 from public.locacao_eventos where locacao_id=old.id))
 then raise exception 'Não altere empresa, cliente ou veículo após iniciar o fluxo.';end if;
 return new;
end $$;
drop trigger if exists locacao_status_controlado on public.locacoes;
create trigger locacao_status_controlado before insert or update on public.locacoes for each row execute function public.locacao_validar_status();

create or replace function public.locacao_confirmar_etapa(p_empresa uuid,p_locacao uuid,p_acao text,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.locacoes; v public.vistorias_locacao; saida public.vistorias_locacao; veiculo uuid; evento public.locacao_eventos;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 if p_acao is null or p_acao not in ('entrega','devolucao','encerramento') then raise exception 'Etapa inválida.';end if;
 if p_dados is null or jsonb_typeof(p_dados)<>'object' or length(coalesce(p_dados->>'observacoes','')) not between 5 and 2000 then raise exception 'Informe observações entre 5 e 2000 caracteres.';end if;
 select carro_id into veiculo from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 if veiculo is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 -- Serializa entregas do mesmo veículo, inclusive entre locações diferentes.
 perform 1 from public.carros where id=veiculo and empresa_id=p_empresa for update;
 if not found then raise exception 'Veículo não pertence à empresa.';end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.carro_id is distinct from veiculo then raise exception 'O veículo mudou. Recarregue a locação.';end if;
 perform 1 from public.clientes where id=r.cliente_id and empresa_id=p_empresa;
 if not found then raise exception 'Cliente não pertence à empresa.';end if;
 if exists(select 1 from public.locacao_eventos where locacao_id=r.id and acao=p_acao) then raise exception 'Esta etapa já foi confirmada. Atualize a tela.';end if;
 if p_acao in ('entrega','devolucao') then
  select * into v from public.vistorias_locacao where locacao_id=r.id and tipo=case when p_acao='entrega' then 'saida' else 'devolucao' end for update;
  if v.id is null or v.data_hora is null or nullif(trim(v.responsavel),'') is null or v.quilometragem is null or nullif(trim(v.combustivel),'') is null or nullif(trim(v.condicao_geral),'') is null then raise exception 'Complete a vistoria de %: responsável, data, km, combustível e condição geral.',case when p_acao='entrega' then 'saída' else 'devolução' end;end if;
  if p_dados->>'vistoria_conferida' is distinct from 'true' then raise exception 'Confirme a conferência do checklist e das fotos.';end if;
 end if;
 if p_acao='entrega' then
  if r.status<>'Reservada' then raise exception 'Somente locações reservadas podem confirmar entrega.';end if;
  if exists(select 1 from public.locacoes where empresa_id=p_empresa and carro_id=r.carro_id and id<>r.id and status='Ativa') then raise exception 'Veículo já está em outra locação ativa.';end if;
  if not exists(select 1 from public.documentos_locacao where locacao_id=r.id and tipo='contrato_locacao' and arquivo_original_path is not null) then raise exception 'Gere o PDF do contrato antes da entrega.';end if;
  if p_dados->>'assinatura_conferida' is distinct from 'true' then raise exception 'Confirme que verificou as assinaturas do contrato.';end if;
 elsif p_acao='devolucao' then
  if r.status<>'Ativa' then raise exception 'Somente locações ativas podem registrar devolução.';end if;
  select * into saida from public.vistorias_locacao where locacao_id=r.id and tipo='saida';
  if v.quilometragem<saida.quilometragem or v.data_hora<saida.data_hora then raise exception 'Data e quilometragem de retorno não podem ser anteriores à saída.';end if;
 else
  if not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception 'Somente o administrador pode encerrar a locação.';end if;
  if r.status<>'Ativa' or not exists(select 1 from public.locacao_eventos where locacao_id=r.id and acao='devolucao') then raise exception 'Confirme a devolução antes de encerrar.';end if;
  if p_dados->>'financeiro_conferido' is distinct from 'true' or p_dados->>'caucao_conferida' is distinct from 'true' then raise exception 'Confirme os valores finais e a destinação da caução.';end if;
 end if;
 insert into public.locacao_eventos(empresa_id,locacao_id,acao,usuario_id,dados)
 values(p_empresa,r.id,p_acao,auth.uid(),jsonb_build_object('observacoes',trim(p_dados->>'observacoes'),
  'vistoria',case when p_acao in ('entrega','devolucao') then to_jsonb(v) else null end,
  'assinatura_conferida',p_dados->>'assinatura_conferida'='true','financeiro_conferido',p_dados->>'financeiro_conferido'='true',
  'caucao_conferida',p_dados->>'caucao_conferida'='true','locacao_snapshot',to_jsonb(r))) returning * into evento;
 if p_acao='entrega' then update public.locacoes set status='Ativa' where id=r.id;
 elsif p_acao='encerramento' then update public.locacoes set status='Encerrada' where id=r.id;end if;
 return to_jsonb(evento);
end $$;
revoke all on function public.locacao_validar_status(),public.locacao_confirmar_etapa(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.locacao_confirmar_etapa(uuid,uuid,text,jsonb) to authenticated;
commit;
select 'Etapa 4: operação da locação ativada' as resultado;
