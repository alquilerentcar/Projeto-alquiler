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
