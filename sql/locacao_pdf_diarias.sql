-- Executar inteiro no SQL Editor com papel postgres. Não ativa locações antigas nem altera pagamentos.
reset role;
begin;
create table if not exists public.locacao_planos_diarias(
 locacao_id uuid primary key references public.locacoes(id),empresa_id uuid not null references public.empresas(id),
 documento_id uuid not null references public.documentos_locacao(id),entrada_caucao numeric(12,2) not null check(entrada_caucao>=0),
 diaria numeric(12,2) not null check(diaria>0),data_contrato date not null,
 regra text not null check(regra in ('dia_contrato','apos_entrega')),primeira_competencia date,entregue_em timestamptz,
 criado_por uuid not null,criado_em timestamptz not null default now()
);
alter table public.locacao_planos_diarias enable row level security;
revoke all on public.locacao_planos_diarias from public,anon,authenticated;
grant select on public.locacao_planos_diarias to authenticated;
drop policy if exists plano_diarias_leitura on public.locacao_planos_diarias;
create policy plano_diarias_leitura on public.locacao_planos_diarias for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
alter table public.locacao_eventos drop constraint if exists locacao_eventos_acao_check;
alter table public.locacao_eventos add constraint locacao_eventos_acao_check check(acao in ('entrega','devolucao','encerramento','assinatura_envio','contrato_pdf'));
create or replace function public.locacao_validar_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.status is distinct from 'Reservada' then raise exception 'Novas locações devem iniciar como Reservada.';end if;
 elsif new.status is distinct from old.status then
  if not exists(select 1 from public.locacao_eventos e where e.locacao_id=new.id and e.empresa_id=new.empresa_id
   and e.transacao=txid_current() and e.usuario_id=auth.uid()
   and ((old.status='Reservada' and new.status='Ativa' and e.acao in ('entrega','assinatura_envio','contrato_pdf')) or (old.status='Ativa' and new.status='Encerrada' and e.acao='encerramento')))
  then raise exception 'Use as ações do fluxo para alterar o status da locação.';end if;
 end if;
 if TG_OP='UPDATE' and (new.empresa_id is distinct from old.empresa_id or new.carro_id is distinct from old.carro_id or new.cliente_id is distinct from old.cliente_id)
  and (old.status<>'Reservada' or exists(select 1 from public.locacao_eventos where locacao_id=old.id))
 then raise exception 'Não altere empresa, cliente ou veículo após iniciar o fluxo.';end if;
 return new;
end $$;

-- O plano de uma nova locação controla o início. Ocupações antigas não são convertidas aqui.
do $$begin
 if to_regprocedure('public.frota_fontes_diarias_antes_pdf(uuid,date)') is null then
  alter function public.frota_fontes_diarias(uuid,date) rename to frota_fontes_diarias_antes_pdf;
 end if;
end $$;
revoke all on function public.frota_fontes_diarias_antes_pdf(uuid,date) from public,anon,authenticated;
create or replace function public.frota_fontes_diarias(p_empresa uuid,p_dia date)
returns table(grupo_id uuid,origem text,origem_id uuid,cliente_id uuid,carro_id uuid,nome text,placa text,diaria numeric,termino date)
language sql stable security definer set search_path='' as $$
 select s.* from public.frota_fontes_diarias_antes_pdf(p_empresa,p_dia) s
 where not exists(select 1 from public.locacao_planos_diarias p where p.locacao_id=s.grupo_id
  and(p.primeira_competencia is null or p_dia<p.primeira_competencia))
 and not(s.origem='contrato' and exists(select 1 from public.locacao_planos_diarias p where p.locacao_id=s.grupo_id))
 union all
 select r.id,'contrato',r.id,r.cliente_id,r.carro_id,c.nome_completo,v.placa,p.diaria,
 case when l.termino is null then (r.data_fim at time zone 'America/Manaus')::date
 when r.data_fim is null then l.termino else least(l.termino,(r.data_fim at time zone 'America/Manaus')::date) end
 from public.locacao_planos_diarias p join public.locacoes r on r.id=p.locacao_id
 join public.clientes c on c.id=r.cliente_id join public.carros v on v.id=r.carro_id
 left join public.frota_cobranca_limites l on l.empresa_id=p_empresa and l.grupo_id=r.id
 where p.empresa_id=p_empresa and r.status='Ativa' and auth.uid() is not null and coalesce(public.acesso_modulo(p_empresa,'locacao'),false)
 and p.primeira_competencia is not null and p_dia>=p.primeira_competencia
 and(r.data_fim is null or p_dia<=(r.data_fim at time zone 'America/Manaus')::date)
 and(l.termino is null or p_dia<=l.termino)
 and not exists(select 1 from public.frota_periodos f where f.carro_id=r.carro_id and f.fim is null)
$$;
revoke all on function public.frota_fontes_diarias(uuid,date) from public,anon,authenticated;

create or replace function public.locacao_pdf_configuracao(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;return 1;
end $$;

create or replace function public.locacao_ativar_por_pdf(p_empresa uuid,p_locacao uuid,p_documento uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.locacoes;d public.documentos_locacao;plano public.locacao_planos_diarias;carro uuid;entrada numeric;contrato date;primeira date;regra text;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 perform pg_advisory_xact_lock(7261002);
 select carro_id into carro from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 if carro is null then raise exception 'Locação não encontrada.';end if;
 perform 1 from public.carros where id=carro and empresa_id=p_empresa for update;
 if not found then raise exception 'Veículo não pertence à empresa.';end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.carro_id is distinct from carro then raise exception 'O veículo mudou. Recarregue a locação.';end if;
 select * into d from public.documentos_locacao where id=p_documento and locacao_id=r.id and empresa_id=p_empresa and tipo='contrato_locacao';
 if not found or d.arquivo_original_path is null or not exists(select 1 from storage.objects where bucket_id='documentos-contratuais' and name=d.arquivo_original_path) then raise exception 'Salve o PDF definitivo desta locação antes de ativar.';end if;
 select * into plano from public.locacao_planos_diarias where locacao_id=r.id;
 if found then
  if r.status<>'Ativa' then raise exception 'O plano já existe, mas a locação não está ativa. Atualize os registros antes de continuar.';end if;
  return to_jsonb(plano);
 end if;
 if r.status<>'Reservada' or r.contrato_gerado_em is null then raise exception 'Somente uma locação reservada com PDF pode iniciar este novo fluxo. Locações antigas são preservadas.';end if;
 if exists(select 1 from public.frota_recebimentos where empresa_id=p_empresa and grupo_id=r.id)
 or exists(select 1 from public.frota_cobrancas where empresa_id=p_empresa and grupo_id=r.id) then raise exception 'Esta locação já tem cobranças ou recebimentos. Confira antes de vincular um novo plano.';end if;
 if exists(select 1 from public.locacoes where carro_id=carro and id<>r.id and status='Ativa')
 or exists(select 1 from public.frota_periodos where carro_id=carro and fim is null)
 or exists(select 1 from public.frota_levantamento where carro_id=carro and ativo) then raise exception 'Veículo já ocupado. Não será criada outra locação ou cobrança.';end if;
 if not exists(select 1 from public.carros where id=carro and situacao='Disponível') then raise exception 'Disponibilize o veículo antes de ativar a locação.';end if;
 if not exists(select 1 from public.clientes where id=r.cliente_id and empresa_id=p_empresa) then raise exception 'O locatário não pertence à empresa da locação.';end if;
 entrada:=coalesce(r.valor_caucao_pago,0);contrato:=r.data_assinatura::date;
 if contrato is null or not isfinite(contrato) or contrato>(now() at time zone 'America/Manaus')::date then raise exception 'Informe a data real do contrato, sem usar data futura.';end if;
 if contrato<'2026-10-10'::date then raise exception 'O controle de diárias começa em 10/10/2026. Contratos anteriores precisam de conciliação histórica antes de vincular cobranças.';end if;
 if entrada<0 or entrada::text in ('NaN','Infinity','-Infinity') or r.valor_diaria is null or r.valor_diaria<=0 or r.valor_diaria::text in ('NaN','Infinity','-Infinity') then raise exception 'Confira entrada da caução e diária.';end if;
 regra:=case when entrada<1000 then 'dia_contrato' else 'apos_entrega' end;
 primeira:=case when entrada<1000 then contrato else null end;
 insert into public.locacao_planos_diarias(locacao_id,empresa_id,documento_id,entrada_caucao,diaria,data_contrato,regra,primeira_competencia,criado_por)
 values(r.id,p_empresa,d.id,entrada,r.valor_diaria,contrato,regra,primeira,auth.uid()) returning * into plano;
 insert into public.locacao_eventos(empresa_id,locacao_id,acao,usuario_id,dados)
 values(p_empresa,r.id,'contrato_pdf',auth.uid(),jsonb_build_object('observacoes','Locação ativada pelo PDF definitivo. Não representa assinatura ou entrega física.','documento_id',d.id,'plano',to_jsonb(plano),'locacao_snapshot',to_jsonb(r)));
 update public.locacoes set status='Ativa' where id=r.id;
 if primeira is not null then perform public.frota_previsto(p_empresa,(now() at time zone 'America/Manaus')::date);end if;
 return to_jsonb(plano);
end $$;

create or replace function public.locacao_ocupar_por_envio(p_empresa uuid,p_locacao uuid,p_referencia text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.locacoes;carro uuid;evento uuid;begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 select carro_id into carro from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 if carro is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 -- Mesmo bloqueio global das demais movimentações de frota, além da trava do carro.
 perform pg_advisory_xact_lock(7261002);
 perform 1 from public.carros where id=carro and empresa_id=p_empresa for update;
 if not found then raise exception 'Veículo não encontrado nesta empresa.';end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.carro_id is distinct from carro then raise exception 'O veículo mudou. Atualize a locação.';end if;
 select id into evento from public.locacao_eventos where locacao_id=r.id and acao='assinatura_envio';
 if evento is not null then
  if p_referencia is null or r.assinatura_referencia=p_referencia then return evento;end if;
  raise exception 'A referência de assinatura não corresponde ao envio registrado.';
 end if;
 if (r.status<>'Reservada' and not exists(select 1 from public.locacao_planos_diarias where locacao_id=r.id)) or r.contrato_gerado_em is null then raise exception 'Gere o PDF de uma locação reservada antes de enviar.';end if;
 if exists(select 1 from public.locacoes where carro_id=carro and id<>r.id and status='Ativa')
 or exists(select 1 from public.frota_periodos where carro_id=carro and fim is null)
 or exists(select 1 from public.frota_levantamento where carro_id=carro and ativo)
 then raise exception 'Veículo já ocupado. Confira a frota antes de enviar o contrato.';end if;
 if exists(select 1 from public.carros where id=carro and situacao in ('Manutenção','Revisão','Indisponível','Vendido','Inativo')) then raise exception 'Veículo não está disponível para esta locação.';end if;
 if not exists(select 1 from public.documentos_locacao where locacao_id=r.id and empresa_id=p_empresa and tipo='contrato_locacao' and arquivo_original_path is not null) then raise exception 'PDF definitivo não encontrado.';end if;
 -- Chamada sem referência é apenas a verificação anterior ao envio.
 if p_referencia is null then return r.id;end if;
 if length(trim(p_referencia)) not between 3 and 200 or r.assinatura_referencia is distinct from p_referencia then raise exception 'Salve primeiro a confirmação recebida do provedor.';end if;
 insert into public.locacao_eventos(empresa_id,locacao_id,acao,usuario_id,dados)
 values(p_empresa,r.id,'assinatura_envio',auth.uid(),jsonb_build_object('observacoes',case when exists(select 1 from public.locacao_planos_diarias where locacao_id=r.id) then 'Contrato enviado para assinatura. Locação e cobranças já vinculadas ao PDF, sem duplicação.' else 'Ocupação iniciada pelo envio confirmado para assinatura.' end,'referencia',p_referencia,'entrega_fisica_confirmada',false,'assinatura_concluida',false,'locacao_snapshot',to_jsonb(r))) returning id into evento;
 update public.locacoes set status='Ativa' where id=r.id;
 return evento;
end $$;

create or replace function public.locacao_confirmar_etapa(p_empresa uuid,p_locacao uuid,p_acao text,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.locacoes; v public.vistorias_locacao; saida public.vistorias_locacao; veiculo uuid; evento public.locacao_eventos; momento timestamptz;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 if p_acao is null or p_acao not in ('entrega','devolucao','encerramento') then raise exception 'Etapa inválida.';end if;
 if p_dados is null or jsonb_typeof(p_dados)<>'object' or length(coalesce(p_dados->>'observacoes','')) not between 5 and 2000 then raise exception 'Informe observações entre 5 e 2000 caracteres.';end if;
 perform pg_advisory_xact_lock(7261002);
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
  if r.status<>'Reservada' and not (r.status='Ativa' and exists(select 1 from public.locacao_planos_diarias where locacao_id=r.id)) then raise exception 'Esta locação não permite confirmar entrega.';end if;
  if exists(select 1 from public.locacao_planos_diarias where locacao_id=r.id) then
   momento:=nullif(p_dados->>'data_entrega','')::timestamptz;
   if momento is null or not isfinite(momento) or momento>now() or momento<r.data_inicio then raise exception 'Informe a data e hora reais da entrega, posteriores ao início da locação e sem data futura.';end if;
  end if;
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
  'data_entrega',momento,'caucao_conferida',p_dados->>'caucao_conferida'='true','locacao_snapshot',to_jsonb(r))) returning * into evento;
 if p_acao='entrega' and momento is not null then
  update public.locacao_planos_diarias set entregue_em=momento,primeira_competencia=case when regra='apos_entrega' then (momento at time zone 'America/Manaus')::date+1 else primeira_competencia end where locacao_id=r.id;
 end if;
 if p_acao='entrega' then update public.locacoes set status='Ativa' where id=r.id;
 elsif p_acao='encerramento' then update public.locacoes set status='Encerrada' where id=r.id;end if;
 if p_acao='entrega' and momento is not null then perform public.frota_previsto(p_empresa,(now() at time zone 'America/Manaus')::date);end if;
 return to_jsonb(evento);
end $$;

revoke all on function public.locacao_pdf_configuracao(uuid),public.locacao_ativar_por_pdf(uuid,uuid,uuid) from public,anon;
grant execute on function public.locacao_pdf_configuracao(uuid),public.locacao_ativar_por_pdf(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'PDF vinculado à locação; entrada abaixo de 1000: diária no contrato; demais: após entrega. Extras manuais.' as resultado;
