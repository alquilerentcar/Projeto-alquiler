-- Execute no SQL Editor como postgres. Preserva histórico, contratos e recebimentos.
-- Aplicar uma vez no SQL Editor como postgres. Não apaga contratos ou ocupações.
begin;
create table if not exists public.frota_substituicoes (
 id uuid primary key, empresa_id uuid not null references public.empresas(id),
 criado_por uuid not null, criado_em timestamptz not null default now(),
 confirmado_em timestamptz, origem_tipo text not null check(origem_tipo in ('levantamento','periodo','locacao')),
 origem_id uuid not null, cliente_id uuid not null references public.clientes(id),
 anterior_id uuid not null references public.carros(id), posterior_id uuid not null references public.carros(id),
 data_troca timestamptz not null, versao_id uuid not null references public.versoes_modelos_documentos(id),
 snapshot jsonb not null, valores jsonb not null, texto text not null, fotos integer not null check(fotos between 1 and 20),
 check(anterior_id<>posterior_id)
);
alter table public.frota_substituicoes drop constraint if exists frota_substituicoes_criado_por_fkey;
alter table public.frota_substituicoes enable row level security;
revoke all on public.frota_substituicoes from public,anon,authenticated;
grant select on public.frota_substituicoes to authenticated;
drop policy if exists substituicoes_leitura on public.frota_substituicoes;
create policy substituicoes_leitura on public.frota_substituicoes for select to authenticated
using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.substituicao_preparar(p_empresa uuid,p_id uuid,p_origem text,p_ocupacao uuid,p_carro uuid,p_data timestamptz,p_versao uuid,p_valores jsonb,p_fotos integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.frota_substituicoes; origem jsonb; anterior public.carros; posterior public.carros;
 c public.clientes; e public.empresas; v public.versoes_modelos_documentos; campos jsonb; txt text; marker text[]; cid uuid; aid uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 select * into d from public.frota_substituicoes where id=p_id;
 if d.id is not null then
  if d.empresa_id<>p_empresa or d.criado_por<>auth.uid() then raise exception 'Preparação indisponível.';end if;
  return to_jsonb(d);
 end if;
 if p_id is null or p_data is null or p_data>now() or p_fotos is null or p_fotos not between 1 and 20
 or jsonb_typeof(p_valores) is distinct from 'object' or length(p_valores::text)>50000 then raise exception 'Confira data, fotos e dados da troca.';end if;
 if p_origem='levantamento' then
  select to_jsonb(t) into origem from public.frota_levantamento t where id=p_ocupacao and empresa_id=p_empresa and ativo;
 elsif p_origem='periodo' then
  select to_jsonb(t) into origem from public.frota_periodos t where id=p_ocupacao and empresa_id=p_empresa and fim is null and tipo='locacao';
 elsif p_origem='locacao' then
  select to_jsonb(t) into origem from public.locacoes t where id=p_ocupacao and empresa_id=p_empresa and status='Ativa';
 else raise exception 'Origem inválida.';end if;
 if origem is null then raise exception 'Esta ocupação não está mais ativa. Atualize a frota.';end if;
 if p_data<=coalesce(nullif(origem->>'inicio','')::timestamptz,nullif(origem->>'data_inicio','')::timestamptz,'-infinity'::timestamptz) then raise exception 'A troca deve ser posterior ao início da ocupação.';end if;
 cid:=(origem->>'cliente_id')::uuid;aid:=(origem->>'carro_id')::uuid;
 select * into c from public.clientes where id=cid and empresa_id=p_empresa;
 select * into anterior from public.carros where id=aid;
 select * into posterior from public.carros where id=p_carro;
 if c.id is null or anterior.id is null then raise exception 'Vincule o cliente e o carro no cadastro da ocupação.';end if;
 if posterior.id is null or posterior.id=anterior.id or not coalesce(public.acesso_modulo(posterior.empresa_id,'locacao'),false) then raise exception 'Selecione outro veículo autorizado.';end if;
 if posterior.situacao<>'Disponível' then raise exception 'O substituto deve estar disponível para locação.';end if;
 select * into e from public.empresas where id=p_empresa;
 select vv.* into v from public.versoes_modelos_documentos vv join public.modelos_documentos m on m.id=vv.modelo_id
 where vv.id=p_versao and m.empresa_id=p_empresa and not m.arquivado and m.versao_publicada=vv.versao;
 if v.id is null or v.nome !~* '(substitui|altera)' then raise exception 'Selecione um modelo publicado de substituição de veículo.';end if;
 campos:=p_valores||jsonb_build_object('empresa_razao_social',e.razao_social,'empresa_cnpj',e.cnpj,'empresa_endereco',e.endereco,
 'nome_locatario',c.nome_completo,'cpf',c.cpf,'cnh',c.cnh,'endereco',c.endereco,
 'veiculo_anterior',anterior.placa,'veiculo_placa',anterior.placa,'carro_anterior',anterior.placa,
 'veiculo_posterior',posterior.placa,'nova_placa',posterior.placa,'carro_posterior',posterior.placa,
 'dados_veiculo_anterior',concat_ws(' · ',anterior.placa,anterior.marca,anterior.modelo),
 'dados_veiculo_posterior',concat_ws(' · ',posterior.placa,posterior.marca,posterior.modelo),
 'data_troca',to_char(p_data at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'),
 'data_alteracao',to_char(p_data at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'),
 'data_inicio',case when coalesce(origem->>'inicio',origem->>'data_inicio') is null then null else to_char(coalesce(origem->>'inicio',origem->>'data_inicio')::timestamptz at time zone 'America/Manaus','DD/MM/YYYY') end);
 if nullif(trim(campos->>'motivo_alteracao'),'') is null then raise exception 'Informe o motivo da troca.';end if;
 txt:=v.conteudo;
 for marker in select regexp_matches(v.conteudo,'(\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\})','g') loop
  if nullif(trim(campos->>marker[2]),'') is null then raise exception 'Preencha o campo: %',marker[2];end if;
  txt:=replace(txt,marker[1],campos->>marker[2]);
 end loop;
 insert into public.frota_substituicoes(id,empresa_id,criado_por,origem_tipo,origem_id,cliente_id,anterior_id,posterior_id,data_troca,versao_id,snapshot,valores,texto,fotos)
 values(p_id,p_empresa,auth.uid(),p_origem,p_ocupacao,cid,aid,p_carro,p_data,p_versao,
 jsonb_build_object('empresa',to_jsonb(e),'cliente',to_jsonb(c),'anterior',to_jsonb(anterior),'posterior',to_jsonb(posterior),'ocupacao',origem,'modelo',to_jsonb(v)),campos,txt,p_fotos) returning * into d;
 return to_jsonb(d);
end $$;

create or replace function public.substituicao_confirmar(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.frota_substituicoes; origem jsonb; novo uuid; i integer; car public.carros;
begin
 perform pg_advisory_xact_lock(7261002);
 select * into d from public.frota_substituicoes where id=p_id for update;
 if d.id is null or auth.uid() is null or d.criado_por<>auth.uid() or not coalesce(public.acesso_modulo(d.empresa_id,'locacao'),false) then raise exception 'Sem acesso à troca.';end if;
 if d.confirmado_em is not null then return to_jsonb(d);end if;
 if not exists(select 1 from storage.objects where bucket_id='substituicoes-frota' and name=d.empresa_id::text||'/'||d.id::text||'/termo.pdf') then raise exception 'Gere e envie o PDF antes de confirmar.';end if;
 for i in 1..d.fotos loop
  if not exists(select 1 from storage.objects where bucket_id='substituicoes-frota' and name=d.empresa_id::text||'/'||d.id::text||'/foto-'||i::text||'.jpg') then raise exception 'Falta a foto % do substituto.',i;end if;
 end loop;
 select * into car from public.carros where id=d.posterior_id for update;
 if car.situacao<>'Disponível' or not coalesce(public.acesso_modulo(car.empresa_id,'locacao'),false)
 or exists(select 1 from public.frota_levantamento where carro_id=d.posterior_id and ativo)
 or exists(select 1 from public.frota_periodos where carro_id=d.posterior_id and tstzrange(inicio,fim,'[)') && tstzrange(d.data_troca,null,'[)'))
 or exists(select 1 from public.locacoes where carro_id=d.posterior_id and status='Ativa') then raise exception 'O substituto já não está disponível. A troca não foi registrada.';end if;
 if d.origem_tipo='periodo' then
  select to_jsonb(t) into origem from public.frota_periodos t where id=d.origem_id and empresa_id=d.empresa_id and fim is null and cliente_id=d.cliente_id and carro_id=d.anterior_id for update;
 elsif d.origem_tipo='locacao' then
  select to_jsonb(t) into origem from public.locacoes t where id=d.origem_id and empresa_id=d.empresa_id and status='Ativa' and cliente_id=d.cliente_id and carro_id=d.anterior_id for update;
 else
  select to_jsonb(t) into origem from public.frota_levantamento t where id=d.origem_id and empresa_id=d.empresa_id and ativo and cliente_id=d.cliente_id and carro_id=d.anterior_id for update;
 end if;
 if origem is distinct from d.snapshot->'ocupacao' then raise exception 'A ocupação mudou durante a preparação. A troca não foi registrada.';end if;
 if exists(select 1 from public.frota_periodos where carro_id=d.anterior_id and fim is null and (d.origem_tipo<>'periodo' or id<>d.origem_id))
 or exists(select 1 from public.frota_levantamento where carro_id=d.anterior_id and ativo and (empresa_id<>d.empresa_id or cliente_id is distinct from d.cliente_id))
 or exists(select 1 from public.locacoes where carro_id=d.anterior_id and status='Ativa' and (d.origem_tipo<>'locacao' or id<>d.origem_id)) then raise exception 'Há outra ocupação ativa no carro anterior. Confira a frota.';end if;
 if d.origem_tipo='periodo' then
  novo:=public.frota_movimentar(d.empresa_id,jsonb_build_object('acao','trocar','periodo',d.origem_id,'carro',d.posterior_id,'data',d.data_troca,'diaria',origem->>'diaria','observacoes',d.valores->>'motivo_alteracao'));
 elsif d.origem_tipo='locacao' then
  update public.locacoes set carro_id=d.posterior_id where id=d.origem_id;
  update public.frota_levantamento set ativo=false where carro_id=d.anterior_id and cliente_id=d.cliente_id and empresa_id=d.empresa_id and ativo;
 else
  update public.frota_substituicoes set snapshot=snapshot||jsonb_build_object('historico_anterior_substituto',(select to_jsonb(t) from public.frota_levantamento t where empresa_id=d.empresa_id and placa=car.placa)) where id=d.id;
  update public.frota_levantamento set ativo=false where id=d.origem_id;
  insert into public.frota_levantamento(empresa_id,placa,carro_id,cliente_id,responsavel,contato,inicio,diaria,ativo,km,km_data)
  values(d.empresa_id,car.placa,car.id,d.cliente_id,origem->>'responsavel',origem->>'contato',d.data_troca,(origem->>'diaria')::numeric,true,
   nullif(d.valores->>'quilometragem_posterior','')::bigint,(d.data_troca at time zone 'America/Manaus')::date)
  on conflict(empresa_id,placa) do update set carro_id=excluded.carro_id,cliente_id=excluded.cliente_id,responsavel=excluded.responsavel,contato=excluded.contato,inicio=excluded.inicio,diaria=excluded.diaria,ativo=true,km=excluded.km,km_data=excluded.km_data;
 end if;
 update public.frota_levantamento set ativo=false where empresa_id=d.empresa_id and carro_id=d.anterior_id and cliente_id=d.cliente_id and ativo;
 update public.carros set situacao='Locado' where id=d.posterior_id;
 update public.carros set situacao='Disponível' where id=d.anterior_id and situacao='Locado';
 update public.frota_substituicoes set confirmado_em=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;

create or replace function public.substituicao_arquivo(p_nome text,p_escrita boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.frota_substituicoes d where public.acesso_modulo(d.empresa_id,'locacao')
 and (not p_escrita or (d.criado_por=auth.uid() and d.confirmado_em is null))
 and (p_nome=d.empresa_id::text||'/'||d.id::text||'/termo.pdf'
 or exists(select 1 from generate_series(1,d.fotos) i where p_nome=d.empresa_id::text||'/'||d.id::text||'/foto-'||i::text||'.jpg')));
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('substituicoes-frota','substituicoes-frota',false,52428800,array['application/pdf','image/jpeg']) on conflict(id) do nothing;
drop policy if exists substituicao_storage_limite on storage.objects;
create policy substituicao_storage_limite on storage.objects as restrictive for all to public
using(bucket_id<>'substituicoes-frota' or public.substituicao_arquivo(name,false))
with check(bucket_id<>'substituicoes-frota' or public.substituicao_arquivo(name,true));
drop policy if exists substituicao_storage_leitura on storage.objects;
create policy substituicao_storage_leitura on storage.objects for select to authenticated using(bucket_id='substituicoes-frota' and public.substituicao_arquivo(name,false));
drop policy if exists substituicao_storage_insercao on storage.objects;
create policy substituicao_storage_insercao on storage.objects for insert to authenticated with check(bucket_id='substituicoes-frota' and public.substituicao_arquivo(name,true));
drop policy if exists substituicao_storage_sem_edicao on storage.objects;
create policy substituicao_storage_sem_edicao on storage.objects as restrictive for update to public using(bucket_id<>'substituicoes-frota');
drop policy if exists substituicao_storage_sem_exclusao on storage.objects;
create policy substituicao_storage_sem_exclusao on storage.objects as restrictive for delete to public using(bucket_id<>'substituicoes-frota');
revoke all on function public.substituicao_preparar(uuid,uuid,text,uuid,uuid,timestamptz,uuid,jsonb,integer),public.substituicao_confirmar(uuid),public.substituicao_arquivo(text,boolean) from public,anon;
grant execute on function public.substituicao_preparar(uuid,uuid,text,uuid,uuid,timestamptz,uuid,jsonb,integer),public.substituicao_confirmar(uuid),public.substituicao_arquivo(text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Substituição integrada à frota preparada' as resultado;

-- Aplicar no SQL Editor como postgres. Preserva o histórico; não exclui clientes.
begin;
create table if not exists public.frota_ocupacoes_encerradas(
 id uuid primary key,empresa_id uuid not null references public.empresas(id),carro_id uuid not null references public.carros(id),
 origem text not null check(origem in ('levantamento','periodo')),origem_id uuid not null,
 snapshot jsonb not null,fim timestamptz not null,motivo text not null,situacao_posterior text not null,
 criado_por uuid not null,criado_em timestamptz not null default now(),unique(origem,origem_id)
);
alter table public.frota_ocupacoes_encerradas drop constraint if exists frota_ocupacoes_encerradas_criado_por_fkey;
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

begin;
create or replace function public.impedir_ocupacao_veiculo_vendido()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.carros where id=new.carro_id and situacao='Vendido') then
  if tg_table_name='locacoes' then
   if new.status in ('Ativa','Reservada') then raise exception 'Veículo vendido: não pode iniciar ou reservar uma locação.';end if;
  elsif new.fim is null then raise exception 'Veículo vendido: não pode receber uma ocupação atual.';end if;
 end if;
 return new;
end $$;
drop trigger if exists bloquear_vendido_locacoes on public.locacoes;
create trigger bloquear_vendido_locacoes before insert or update on public.locacoes for each row execute function public.impedir_ocupacao_veiculo_vendido();
drop trigger if exists bloquear_vendido_periodos on public.frota_periodos;
create trigger bloquear_vendido_periodos before insert or update on public.frota_periodos for each row execute function public.impedir_ocupacao_veiculo_vendido();
revoke all on function public.impedir_ocupacao_veiculo_vendido() from public,anon,authenticated;
commit;

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
