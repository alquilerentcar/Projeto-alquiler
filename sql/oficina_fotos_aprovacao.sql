-- SQL Editor, papel postgres. Rode depois de oficina_estoque.sql e oficina_orcamento.sql.
-- Oficina, etapa 3:
-- 1. Cada peça retirada só fica concluída com a foto da peça nova funcionando e a foto da peça antiga.
-- 2. Responsável pela manutenção também quando o locatário foi para um carro substituto.
-- 3. Orçamento enviado para aprovação; só o analista (ou administrador) aprova ou reprova.
-- 4. Parte do locatário lançada no financeiro dele parcelada na diária (como a caução).
-- Não altera dados existentes.
begin;
-- ===================== Fotos da peça =====================
create table if not exists public.oficina_fotos(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 movimento_id uuid not null references public.oficina_movimentos(id), tipo text not null check(tipo in ('nova','antiga')),
 arquivo_path text, justificativa text, criado_por uuid, criado_em timestamptz not null default now(),
 check(arquivo_path is not null or length(trim(coalesce(justificativa,'')))>=5)
);
create unique index if not exists oficina_fotos_arquivo on public.oficina_fotos(arquivo_path) where arquivo_path is not null;
create index if not exists oficina_fotos_movimento on public.oficina_fotos(movimento_id);
alter table public.oficina_fotos enable row level security;
revoke all on public.oficina_fotos from public,anon,authenticated;
grant select on public.oficina_fotos to authenticated;
drop policy if exists oficina_fotos_leitura on public.oficina_fotos;
create policy oficina_fotos_leitura on public.oficina_fotos for select to authenticated using(public.oficina_acesso(empresa_id));
insert into storage.buckets(id,name,public) values('oficina-fotos','oficina-fotos',false) on conflict(id) do nothing;
drop policy if exists oficina_fotos_equipe on storage.objects;
create policy oficina_fotos_equipe on storage.objects for all to authenticated
 using(bucket_id='oficina-fotos' and exists(select 1 from public.empresas e where e.id::text=split_part(name,'/',1) and public.oficina_acesso(e.id)))
 with check(bucket_id='oficina-fotos' and exists(select 1 from public.empresas e where e.id::text=split_part(name,'/',1) and public.oficina_acesso(e.id)));

-- Peça retirada com as duas fotos (ou a falta da peça antiga justificada)?
create or replace function public.oficina_fotos_ok(p_movimento uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.oficina_fotos where movimento_id=p_movimento and tipo='nova')
    and exists(select 1 from public.oficina_fotos where movimento_id=p_movimento and tipo='antiga')
$$;
revoke all on function public.oficina_fotos_ok(uuid) from public,anon,authenticated;

-- Registra a foto já enviada ao bucket oficina-fotos (caminho <empresa>/<movimento>/...).
-- Sem peça antiga (ex.: item novo, fluido descartado): justificativa no lugar da foto.
create or replace function public.oficina_foto_registrar(p_empresa uuid,p_movimento uuid,p_tipo text,p_path text,p_justificativa text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.oficina_movimentos; r public.oficina_fotos;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into x from public.oficina_movimentos where id=p_movimento and empresa_id=p_empresa and tipo='saida';
 if x.id is null then raise exception 'Retirada de peça não encontrada.'; end if;
 if p_tipo not in ('nova','antiga') then raise exception 'Informe se a foto é da peça nova ou da antiga.'; end if;
 if p_path is null and (p_tipo<>'antiga' or length(trim(coalesce(p_justificativa,'')))<5) then
  raise exception 'Envie a foto%.',case when p_tipo='antiga' then ' ou explique por que não há peça antiga' else ' da peça nova funcionando' end;
 end if;
 if p_path is not null and (p_path not like p_empresa::text||'/'||p_movimento::text||'/%' or p_path like '%..%') then raise exception 'Arquivo de foto inválido.'; end if;
 insert into public.oficina_fotos(empresa_id,movimento_id,tipo,arquivo_path,justificativa,criado_por)
 values(p_empresa,p_movimento,p_tipo,p_path,nullif(trim(coalesce(p_justificativa,'')),''),auth.uid()) returning * into r;
 return jsonb_build_object('foto',to_jsonb(r),'concluida',public.oficina_fotos_ok(p_movimento));
end $$;
revoke all on function public.oficina_foto_registrar(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.oficina_foto_registrar(uuid,uuid,text,text,text) to authenticated;

-- Peças retiradas aguardando fotos (todas, ou de uma manutenção).
create or replace function public.oficina_fotos_pendentes(p_empresa uuid,p_manutencao uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('movimento_id',x.id,'produto',p.descricao,'quantidade',-x.quantidade,'unidade',p.unidade,'placa',x.placa,
  'manutencao',m.numero,'manutencao_id',m.id,'criado_em',x.criado_em,
  'tem_nova',exists(select 1 from public.oficina_fotos f where f.movimento_id=x.id and f.tipo='nova'),
  'tem_antiga',exists(select 1 from public.oficina_fotos f where f.movimento_id=x.id and f.tipo='antiga')) order by x.criado_em)
  from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id join public.oficina_manutencoes m on m.id=x.manutencao_id
  where x.empresa_id=p_empresa and x.tipo='saida' and (p_manutencao is null or x.manutencao_id=p_manutencao) and not public.oficina_fotos_ok(x.id)),'[]'::jsonb);
end $$;
revoke all on function public.oficina_fotos_pendentes(uuid,uuid) from public,anon;
grant execute on function public.oficina_fotos_pendentes(uuid,uuid) to authenticated;

-- Fotos de uma manutenção (para ver no orçamento).
create or replace function public.oficina_fotos_lista(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('movimento_id',f.movimento_id,'tipo',f.tipo,'arquivo_path',f.arquivo_path,'justificativa',f.justificativa,'produto',p.descricao,'criado_em',f.criado_em) order by f.criado_em)
  from public.oficina_fotos f join public.oficina_movimentos x on x.id=f.movimento_id join public.oficina_produtos p on p.id=x.produto_id
  where f.empresa_id=p_empresa and x.manutencao_id=p_manutencao),'[]'::jsonb);
end $$;
revoke all on function public.oficina_fotos_lista(uuid,uuid) from public,anon;
grant execute on function public.oficina_fotos_lista(uuid,uuid) to authenticated;

-- ===================== Responsável com substituição =====================
-- 1º quem está com o carro; 2º quem foi para um carro substituto saindo deste carro (últimos 120 dias).
create or replace function public.oficina_ocupante(p_carro uuid)
returns table(cliente_id uuid,nome text,empresa_id uuid)
language sql stable security definer set search_path='' as $$
 select q.cliente_id,c.nome_completo,c.empresa_id from (
  (select l.cliente_id,1 o,l.data_inicio quando from public.locacoes l where l.carro_id=p_carro and l.status='Ativa' order by l.data_inicio desc limit 1)
  union all (select p.cliente_id,2,p.inicio from public.frota_periodos p where p.carro_id=p_carro and p.tipo='locacao' and p.fim is null and p.cliente_id is not null order by p.inicio desc limit 1)
  union all (select f.cliente_id,3,f.inicio from public.frota_levantamento f where f.carro_id=p_carro and f.ativo and f.cliente_id is not null order by f.inicio desc nulls last limit 1)
  union all (select s.cliente_id,4,s.data_troca from public.frota_substituicoes s where s.anterior_id=p_carro and s.confirmado_em is not null and s.data_troca>now()-interval '120 days' order by s.data_troca desc limit 1)
 ) q join public.clientes c on c.id=q.cliente_id order by q.o limit 1
$$;

create or replace function public.oficina_responsaveis_sugeridos(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.oficina_manutencoes;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('cliente_id',x.cliente_id,'nome',c.nome_completo,'ultimo',x.ultimo,'atual',x.atual,'substituto',x.substituto) order by x.atual desc,x.ultimo desc) from (
  select cliente_id,max(ultimo) ultimo,bool_or(atual) atual,bool_or(substituto) substituto from (
   select l.cliente_id,coalesce(l.data_fim,now()) ultimo,(l.status='Ativa') atual,false substituto from public.locacoes l where l.carro_id=m.carro_id
   union all select p.cliente_id,coalesce(p.fim,now()),(p.fim is null),false from public.frota_periodos p where p.carro_id=m.carro_id and p.tipo='locacao' and p.cliente_id is not null
   union all select f.cliente_id,now(),f.ativo,false from public.frota_levantamento f where f.carro_id=m.carro_id and f.cliente_id is not null
   union all select s.cliente_id,s.data_troca,false,true from public.frota_substituicoes s where s.anterior_id=m.carro_id and s.confirmado_em is not null
  ) y where cliente_id is not null group by cliente_id order by bool_or(atual) desc,max(ultimo) desc limit 8) x
  join public.clientes c on c.id=x.cliente_id),'[]'::jsonb);
end $$;

-- Busca qualquer locatário (nome ou CPF) das empresas que o usuário acessa.
create or replace function public.oficina_buscar_locatarios(p_empresa uuid,p_texto text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t text:=trim(coalesce(p_texto,'')); d text:=regexp_replace(coalesce(p_texto,''),'\D','','g');
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if length(t)<3 then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('cliente_id',c.id,'nome',c.nome_completo,'empresa',e.nome_fantasia) order by c.nome_completo) from (
  select c.* from public.clientes c where (c.empresa_id=p_empresa or public.acesso_modulo(c.empresa_id,'locacao'))
  and (c.nome_completo ilike '%'||t||'%' or (length(d)>=4 and regexp_replace(coalesce(c.cpf,''),'\D','','g') like d||'%')) order by c.nome_completo limit 15) c
  join public.empresas e on e.id=c.empresa_id),'[]'::jsonb);
end $$;
revoke all on function public.oficina_buscar_locatarios(uuid,text) from public,anon;
grant execute on function public.oficina_buscar_locatarios(uuid,text) to authenticated;

-- ===================== Aprovação do orçamento =====================
create table if not exists public.oficina_aprovadores(
 empresa_id uuid not null references public.empresas(id), auth_user_id uuid not null,
 definido_por uuid, definido_em timestamptz not null default now(), primary key(empresa_id,auth_user_id)
);
alter table public.oficina_aprovadores enable row level security;
revoke all on public.oficina_aprovadores from public,anon,authenticated;
grant select on public.oficina_aprovadores to authenticated;
drop policy if exists oficina_aprovadores_leitura on public.oficina_aprovadores;
create policy oficina_aprovadores_leitura on public.oficina_aprovadores for select to authenticated using(public.oficina_acesso(empresa_id));

create or replace function public.oficina_pode_aprovar(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coalesce(public.acesso_admin_empresa(p_empresa),false)
  or exists(select 1 from public.oficina_aprovadores a where a.empresa_id=p_empresa and a.auth_user_id=auth.uid()))
$$;
revoke all on function public.oficina_pode_aprovar(uuid) from public,anon;
grant execute on function public.oficina_pode_aprovar(uuid) to authenticated;

-- Administrador marca quais usuários são analistas (aprovam orçamento).
create or replace function public.oficina_aprovadores_lista(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador define os analistas.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('auth_user_id',u.auth_user_id,'nome',u.nome,'cargo',u.cargo,'administrador',u.administrador,
  'analista',exists(select 1 from public.oficina_aprovadores a where a.empresa_id=p_empresa and a.auth_user_id=u.auth_user_id)) order by u.nome)
  from public.usuarios_empresa u where u.empresa_id=p_empresa and u.ativo and u.auth_user_id is not null),'[]'::jsonb);
end $$;
revoke all on function public.oficina_aprovadores_lista(uuid) from public,anon;
grant execute on function public.oficina_aprovadores_lista(uuid) to authenticated;
create or replace function public.oficina_aprovador_definir(p_empresa uuid,p_usuario uuid,p_analista boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador define os analistas.'; end if;
 if not exists(select 1 from public.usuarios_empresa where empresa_id=p_empresa and auth_user_id=p_usuario and ativo) then raise exception 'Usuário não encontrado nesta empresa.'; end if;
 if coalesce(p_analista,false) then insert into public.oficina_aprovadores(empresa_id,auth_user_id,definido_por) values(p_empresa,p_usuario,auth.uid()) on conflict do nothing;
 else delete from public.oficina_aprovadores where empresa_id=p_empresa and auth_user_id=p_usuario; end if;
end $$;
revoke all on function public.oficina_aprovador_definir(uuid,uuid,boolean) from public,anon;
grant execute on function public.oficina_aprovador_definir(uuid,uuid,boolean) to authenticated;

alter table public.oficina_manutencoes add column if not exists orcamento_status text not null default 'em_elaboracao';
alter table public.oficina_manutencoes drop constraint if exists oficina_manutencoes_orcamento_status_check;
alter table public.oficina_manutencoes add constraint oficina_manutencoes_orcamento_status_check check(orcamento_status in ('em_elaboracao','aguardando_aprovacao','aprovado','reprovado'));
alter table public.oficina_manutencoes add column if not exists orcamento_enviado_em timestamptz;
alter table public.oficina_manutencoes add column if not exists orcamento_decidido_por uuid;
alter table public.oficina_manutencoes add column if not exists orcamento_decidido_em timestamptz;
alter table public.oficina_manutencoes add column if not exists orcamento_observacao text;
alter table public.oficina_manutencoes add column if not exists orcamento_aprovado jsonb;

-- Lançamentos só com o orçamento em elaboração (ou reprovado, para corrigir), manutenção aberta e sem cobrança.
create or replace function public.oficina_manutencao_editavel(p_empresa uuid,p_manutencao uuid)
returns public.oficina_manutencoes language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes;
begin
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Escolha a manutenção (o carro).'; end if;
 if m.status not in ('aberta','aguardando_pecas') then raise exception 'A manutenção % já foi encerrada.',m.numero; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário. Não aceita novos lançamentos.',m.numero; end if;
 if m.orcamento_status in ('aguardando_aprovacao','aprovado') then raise exception 'O orçamento da manutenção #% está %. Peça ao analista para reabrir antes de lançar.',m.numero,case m.orcamento_status when 'aprovado' then 'aprovado' else 'aguardando aprovação' end; end if;
 return m;
end $$;

create or replace function public.oficina_orcamento_enviar(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; pend int;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 m:=public.oficina_manutencao_editavel(p_empresa,p_manutencao);
 if not exists(select 1 from public.oficina_movimentos where manutencao_id=m.id) and not exists(select 1 from public.oficina_manutencao_servicos where manutencao_id=m.id and removido_em is null) then
  raise exception 'Lance as peças e os serviços antes de enviar o orçamento.';
 end if;
 select count(*) into pend from public.oficina_movimentos x where x.manutencao_id=m.id and x.tipo='saida' and not public.oficina_fotos_ok(x.id);
 if pend>0 then raise exception 'Faltam as fotos (peça nova funcionando e peça antiga) de % peça(s) retirada(s).',pend; end if;
 update public.oficina_manutencoes set orcamento_status='aguardando_aprovacao',orcamento_enviado_em=now(),orcamento_observacao=null where id=m.id returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.oficina_orcamento_enviar(uuid,uuid) from public,anon;
grant execute on function public.oficina_orcamento_enviar(uuid,uuid) to authenticated;

create or replace function public.oficina_orcamento_decidir(p_empresa uuid,p_manutencao uuid,p_aprovar boolean,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes;
begin
 if not public.oficina_pode_aprovar(p_empresa) then raise exception using errcode='42501',message='Somente o analista aprova ou reprova orçamentos.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.orcamento_status<>'aguardando_aprovacao' then raise exception 'O orçamento da manutenção #% não está aguardando aprovação.',m.numero; end if;
 if p_aprovar is null or (not p_aprovar and length(trim(coalesce(p_observacao,'')))<3) then raise exception 'Para reprovar, explique o motivo.'; end if;
 update public.oficina_manutencoes set orcamento_status=case when p_aprovar then 'aprovado' else 'reprovado' end,orcamento_decidido_por=auth.uid(),orcamento_decidido_em=now(),
  orcamento_observacao=nullif(trim(coalesce(p_observacao,'')),''),orcamento_aprovado=case when p_aprovar then (public.oficina_orcamento(p_empresa,m.id))->'totais' end
 where id=m.id returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.oficina_orcamento_decidir(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.oficina_orcamento_decidir(uuid,uuid,boolean,text) to authenticated;

-- Analista reabre um orçamento aprovado (antes da cobrança) para ajustar.
create or replace function public.oficina_orcamento_reabrir(p_empresa uuid,p_manutencao uuid,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes;
begin
 if not public.oficina_pode_aprovar(p_empresa) then raise exception using errcode='42501',message='Somente o analista reabre orçamentos.'; end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Explique por que o orçamento vai ser reaberto.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.cobranca_debito_id is not null then raise exception 'Já cobrado do locatário: não pode reabrir.'; end if;
 if m.orcamento_status not in ('aguardando_aprovacao','aprovado') then raise exception 'O orçamento já está em elaboração.'; end if;
 update public.oficina_manutencoes set orcamento_status='em_elaboracao',orcamento_observacao=trim(p_motivo),orcamento_aprovado=null where id=m.id returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.oficina_orcamento_reabrir(uuid,uuid,text) from public,anon;
grant execute on function public.oficina_orcamento_reabrir(uuid,uuid,text) to authenticated;

-- Concluir a manutenção exige as fotos de todas as peças retiradas.
create or replace function public.oficina_manutencao_status(p_empresa uuid,p_id uuid,p_status text,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_manutencoes; pend int;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_status not in ('aberta','aguardando_pecas','concluida','cancelada') then raise exception 'Situação inválida.'; end if;
 select * into r from public.oficina_manutencoes where id=p_id and empresa_id=p_empresa for update;
 if r.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if r.status in ('concluida','cancelada') then raise exception 'A manutenção % já foi encerrada.',r.numero; end if;
 if p_status='cancelada' and exists(select 1 from public.oficina_movimentos where manutencao_id=p_id) then
  raise exception 'Esta manutenção já tem peças lançadas. Conclua em vez de cancelar.';
 end if;
 if p_status='concluida' then
  select count(*) into pend from public.oficina_movimentos x where x.manutencao_id=p_id and x.tipo='saida' and not public.oficina_fotos_ok(x.id);
  if pend>0 then raise exception 'Faltam as fotos de % peça(s) retirada(s) para concluir.',pend; end if;
 end if;
 update public.oficina_manutencoes set status=p_status,concluida_em=case when p_status in ('concluida','cancelada') then now() end,
  observacoes=coalesce(nullif(trim(coalesce(p_observacao,'')),''),observacoes) where id=p_id returning * into r;
 return to_jsonb(r);
end $$;

-- ===================== Cobrança parcelada na diária =====================
drop function if exists public.oficina_cobrar_locatario(uuid,uuid);
create or replace function public.oficina_cobrar_locatario(p_empresa uuid,p_manutencao uuid,p_parcelas integer,p_primeiro date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; o jsonb; valor numeric; novo uuid:=gen_random_uuid(); loc uuid;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário.',m.numero; end if;
 if m.orcamento_status<>'aprovado' then raise exception 'O orçamento precisa ser aprovado pelo analista antes da cobrança.'; end if;
 if m.responsavel_cliente_id is null then raise exception 'Esta manutenção não tem locatário responsável.'; end if;
 if p_parcelas is null or p_parcelas not between 1 and 120 or p_primeiro is null or p_primeiro<(now() at time zone 'America/Manaus')::date-1 then
  raise exception 'Informe de 1 a 120 parcelas diárias e a data da primeira (a partir de hoje).';
 end if;
 o:=public.oficina_orcamento(p_empresa,p_manutencao); valor:=(o->'totais'->>'locatario')::numeric;
 if valor is distinct from (m.orcamento_aprovado->>'locatario')::numeric then raise exception 'O orçamento mudou depois da aprovação. Peça ao analista para revisar.'; end if;
 if valor<=0 then raise exception 'Não há valor a cobrar do locatário.'; end if;
 -- Débito na empresa do locatário (a locadora), em parcelas diárias que entram junto com a diária.
 perform public.cliente_debito_criar(m.responsavel_empresa_id,m.responsavel_cliente_id,novo,'manutencao',
  'Manutenção #'||m.numero||' · '||m.placa,valor,0,p_parcelas,p_primeiro,'diaria');
 select l.id into loc from public.locacoes l where l.cliente_id=m.responsavel_cliente_id and l.status='Ativa' order by l.data_inicio desc limit 1;
 if loc is not null and to_regclass('public.cliente_debitos') is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name='cliente_debitos' and column_name='locacao_id') then
  execute 'update public.cliente_debitos set locacao_id=$1 where id=$2' using loc,novo;
 end if;
 update public.oficina_manutencoes set cobranca_debito_id=novo,cobrada_em=now() where id=m.id;
 return jsonb_build_object('debito_id',novo,'valor',valor,'parcelas',p_parcelas,'primeira',p_primeiro,'locatario',m.responsavel_nome);
end $$;
revoke all on function public.oficina_cobrar_locatario(uuid,uuid,integer,date) from public,anon;
grant execute on function public.oficina_cobrar_locatario(uuid,uuid,integer,date) to authenticated;

-- Painel: inclui se o usuário é analista e as pendências de foto.
create or replace function public.oficina_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return jsonb_build_object(
  'rateio',public.oficina_rateio(p_empresa),'analista',public.oficina_pode_aprovar(p_empresa),
  'produtos',coalesce((select jsonb_agg(to_jsonb(p) order by p.descricao) from public.oficina_produtos p where p.empresa_id=p_empresa),'[]'::jsonb),
  'servicos',coalesce((select jsonb_agg(to_jsonb(s) order by s.categoria,s.descricao) from public.oficina_servicos s where s.empresa_id=p_empresa and s.ativo),'[]'::jsonb),
  'manutencoes',coalesce((select jsonb_agg(to_jsonb(q) order by q.status='concluida',q.entrada_em desc) from (
   select m.*,(select count(*) from public.oficina_movimentos x where x.manutencao_id=m.id)::int pecas,
    (select count(*) from public.oficina_movimentos x where x.manutencao_id=m.id and x.tipo='saida' and not public.oficina_fotos_ok(x.id))::int fotos_pendentes,
    coalesce((select sum(-x.quantidade*coalesce(x.custo_unitario,0)) from public.oficina_movimentos x where x.manutencao_id=m.id),0) custo_pecas,
    coalesce((select sum(s.quantidade*s.valor_unitario) from public.oficina_manutencao_servicos s where s.manutencao_id=m.id and s.removido_em is null),0) valor_servicos
   from public.oficina_manutencoes m where m.empresa_id=p_empresa
   and (m.status in ('aberta','aguardando_pecas') or m.entrada_em>now()-interval '60 days')) q),'[]'::jsonb),
  'frota_em_manutencao',coalesce((select jsonb_agg(jsonb_build_object('periodo_id',p.id,'carro_id',c.id,'placa',c.placa,'veiculo',trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,'')),'desde',p.inicio,'empresa',e.nome_fantasia) order by p.inicio)
   from public.frota_periodos p join public.carros c on c.id=p.carro_id join public.empresas e on e.id=c.empresa_id
   where p.tipo='manutencao' and p.fim is null and (c.empresa_id=p_empresa or public.acesso_modulo(c.empresa_id,'locacao'))
   and not exists(select 1 from public.oficina_manutencoes m where m.carro_id=c.id and m.empresa_id=p_empresa and m.status in ('aberta','aguardando_pecas'))),'[]'::jsonb));
end $$;
notify pgrst,'reload schema';
commit;
select 'Oficina etapa 3 pronta: fotos da peça, aprovação pelo analista, responsável com substituição e cobrança parcelada.' as resultado;
