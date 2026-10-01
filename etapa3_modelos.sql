-- Etapa 3: modelos por empresa, publicação e documentos com conteúdo preservado.
begin;
do $$ begin
 if to_regprocedure('public.acesso_gerenciar_usuarios(uuid)') is null then raise exception 'Aplique a Etapa 1 primeiro.'; end if;
end $$;
create table if not exists public.modelos_documentos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 nome text not null check(length(trim(nome)) between 1 and 120), conteudo text not null default '' check(length(conteudo)<=100000),
 revisao integer not null default 1, versao_publicada integer not null default 0,
 arquivado boolean not null default false, atualizado_em timestamptz not null default now(),
 unique(id,empresa_id)
);
create table if not exists public.versoes_modelos_documentos (
 id uuid primary key default gen_random_uuid(),modelo_id uuid not null,empresa_id uuid not null,
 versao integer not null, nome text not null,conteudo text not null,publicado_em timestamptz not null default now(),publicado_por uuid not null,
 foreign key(modelo_id,empresa_id) references public.modelos_documentos(id,empresa_id),unique(modelo_id,versao),unique(id,empresa_id)
);
create table if not exists public.documentos_modelos_emitidos (
 id uuid primary key,empresa_id uuid not null references public.empresas(id),locacao_id uuid not null references public.locacoes(id),numero bigint not null,
 versao_id uuid not null, nome text not null,texto text not null,valores jsonb not null,empresa_snapshot jsonb not null,
 criado_em timestamptz not null default now(),criado_por uuid not null,arquivo_path text,
 foreign key(versao_id,empresa_id) references public.versoes_modelos_documentos(id,empresa_id),unique(empresa_id,numero)
);
alter table public.modelos_documentos enable row level security;
alter table public.versoes_modelos_documentos enable row level security;
alter table public.documentos_modelos_emitidos enable row level security;
revoke all on public.modelos_documentos,public.versoes_modelos_documentos,public.documentos_modelos_emitidos from anon,authenticated;
grant select on public.modelos_documentos,public.versoes_modelos_documentos,public.documentos_modelos_emitidos to authenticated;
drop policy if exists modelos_admin on public.modelos_documentos;
create policy modelos_admin on public.modelos_documentos for select to authenticated using(public.acesso_admin_empresa(empresa_id));
drop policy if exists versoes_empresa on public.versoes_modelos_documentos;
create policy versoes_empresa on public.versoes_modelos_documentos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
drop policy if exists emitidos_empresa on public.documentos_modelos_emitidos;
create policy emitidos_empresa on public.documentos_modelos_emitidos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.modelo_documento_salvar(p_empresa uuid,p_id uuid,p_revisao integer,p_nome text,p_conteudo text,p_publicar boolean default false,p_arquivado boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.modelos_documentos;
begin
 if not public.acesso_admin_empresa(p_empresa) then raise exception 'Somente o administrador desta empresa pode alterar modelos.'; end if;
 if length(trim(coalesce(p_nome,''))) not between 1 and 120 or length(coalesce(p_conteudo,''))>100000 then raise exception 'Informe nome até 120 caracteres e texto até 100 mil caracteres.'; end if;
 if p_publicar and (length(trim(coalesce(p_conteudo,'')))=0 or p_arquivado) then raise exception 'Preencha o texto e reative o modelo antes de publicar.'; end if;
 if p_publicar and regexp_replace(p_conteudo,'\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}','','g') ~ '\{\{|\}\}' then raise exception 'Marcador inválido. Use {{ nome_do_campo }}.'; end if;
 if p_id is null then
  insert into public.modelos_documentos(empresa_id,nome,conteudo,arquivado) values(p_empresa,trim(p_nome),coalesce(p_conteudo,''),p_arquivado) returning * into m;
 else
  select * into m from public.modelos_documentos where id=p_id and empresa_id=p_empresa for update;
  if m.id is null then raise exception 'Modelo não encontrado nesta empresa.'; end if;
  if m.revisao is distinct from p_revisao then raise exception 'Outra pessoa alterou este modelo. Recarregue antes de salvar.'; end if;
  update public.modelos_documentos set nome=trim(p_nome),conteudo=coalesce(p_conteudo,''),revisao=revisao+1,arquivado=p_arquivado,atualizado_em=now() where id=m.id returning * into m;
 end if;
 if p_publicar then
  update public.modelos_documentos set versao_publicada=versao_publicada+1 where id=m.id returning * into m;
  insert into public.versoes_modelos_documentos(modelo_id,empresa_id,versao,nome,conteudo,publicado_por) values(m.id,p_empresa,m.versao_publicada,m.nome,m.conteudo,auth.uid());
 end if;
 return to_jsonb(m);
end $$;

create or replace function public.modelos_documentos_publicados(p_empresa uuid)
returns setof public.versoes_modelos_documentos language sql stable security definer set search_path=public as $$
 select v.* from public.versoes_modelos_documentos v join public.modelos_documentos m on m.id=v.modelo_id
 where m.empresa_id=p_empresa and not m.arquivado and v.versao=m.versao_publicada and public.acesso_modulo(p_empresa,'locacao') order by v.nome;
$$;

create or replace function public.documento_modelo_preparar(p_empresa uuid,p_locacao uuid,p_versao uuid,p_valores jsonb default '{}'::jsonb,p_confirmar boolean default false,p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.versoes_modelos_documentos;e public.empresas;r jsonb;c jsonb;a jsonb;fields jsonb;txt text;missing text[]:='{}';marker text[];d public.documentos_modelos_emitidos;next_number bigint;
begin
 if not public.acesso_modulo(p_empresa,'locacao') then raise exception 'Sem acesso a esta empresa.'; end if;
 if jsonb_typeof(p_valores)<>'object' or length(p_valores::text)>100000 then raise exception 'Campos inválidos.'; end if;
 if p_confirmar and p_id is not null then
  select * into d from public.documentos_modelos_emitidos where id=p_id;
  if d.id is not null then
   if d.empresa_id<>p_empresa or d.locacao_id<>p_locacao or d.versao_id<>p_versao or d.criado_por<>auth.uid() then raise exception 'Identificador de emissão inválido.'; end if;
   return to_jsonb(d);
  end if;
 end if;
 select v1.* into v from public.versoes_modelos_documentos v1 join public.modelos_documentos m on m.id=v1.modelo_id
 where v1.id=p_versao and m.empresa_id=p_empresa and not m.arquivado and m.versao_publicada=v1.versao for share of m;
 if v.id is null then raise exception 'Modelo indisponível ou versão substituída. Atualize a lista.'; end if;
 select to_jsonb(l) into r from public.locacoes l where id=p_locacao and empresa_id=p_empresa;
 if r is null then raise exception 'Locação não encontrada nesta empresa.'; end if;
 select * into e from public.empresas where id=p_empresa;
 select to_jsonb(t) into c from public.clientes t where id=(r->>'cliente_id')::uuid and empresa_id=p_empresa;
 select to_jsonb(t) into a from public.carros t where id=(r->>'carro_id')::uuid and empresa_id=p_empresa;
 if c is null or a is null then raise exception 'Confira o cliente e o veículo vinculados à locação.'; end if;
 fields:=coalesce(p_valores,'{}')||jsonb_build_object(
  'empresa_razao_social',e.razao_social,'empresa_nome_fantasia',e.nome_fantasia,'empresa_cnpj',e.cnpj,'empresa_endereco',e.endereco,'empresa_email',e.email,'empresa_telefone',e.telefone,
  'nome_locatario',c->>'nome_completo','cpf',c->>'cpf','rg',c->>'rg','cnh',c->>'cnh','endereco',c->>'endereco','telefone',c->>'telefone','email',c->>'email',
  'veiculo_marca',a->>'marca','veiculo_modelo',a->>'modelo','veiculo_placa',a->>'placa','veiculo_renavam',a->>'renavam','veiculo_chassi',a->>'chassi',
  'data_inicio',r->>'data_inicio','data_fim',r->>'data_fim','valor_diaria',r->>'valor_diaria','valor_caucao',r->>'valor_caucao','valor_caucao_pago',r->>'valor_caucao_pago');
 txt:=v.conteudo;
 for marker in select regexp_matches(v.conteudo,'(\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\})','g') loop
  if nullif(trim(fields->>marker[2]),'') is null then missing:=array_append(missing,marker[2]);
  else txt:=replace(txt,marker[1],fields->>marker[2]); end if;
 end loop;
 if not p_confirmar then return jsonb_build_object('nome',v.nome,'texto',txt,'valores',fields,'pendentes',to_jsonb(missing),'empresa_snapshot',to_jsonb(e)); end if;
 if cardinality(missing)>0 then raise exception 'Preencha os campos pendentes: %',array_to_string(missing,', '); end if;
 if p_id is null then raise exception 'Identificador da emissão obrigatório.'; end if;
 perform 1 from public.empresas where id=p_empresa for update;
 select coalesce(max(numero),0)+1 into next_number from public.documentos_modelos_emitidos where empresa_id=p_empresa;
 insert into public.documentos_modelos_emitidos(id,empresa_id,locacao_id,versao_id,nome,texto,valores,empresa_snapshot,criado_por,numero)
 values(p_id,p_empresa,p_locacao,p_versao,v.nome,txt,fields,to_jsonb(e),auth.uid(),next_number) returning * into d;
 return to_jsonb(d);
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documentos-modelos','documentos-modelos',false,52428800,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['application/pdf'];
create or replace function public.documento_modelo_arquivo(p_nome text,p_escrita boolean)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.documentos_modelos_emitidos d where p_nome=d.empresa_id::text||'/'||d.id::text||'.pdf'
 and public.acesso_modulo(d.empresa_id,'locacao') and (not p_escrita or (d.criado_por=auth.uid() and d.arquivo_path is null)));
$$;
drop policy if exists modelos_pdf_limite on storage.objects;
create policy modelos_pdf_limite on storage.objects as restrictive for all to public
using(bucket_id<>'documentos-modelos' or public.documento_modelo_arquivo(name,false))
with check(bucket_id<>'documentos-modelos' or public.documento_modelo_arquivo(name,true));
drop policy if exists modelos_pdf_sem_alteracao on storage.objects;
create policy modelos_pdf_sem_alteracao on storage.objects as restrictive for update to public using(bucket_id<>'documentos-modelos');
drop policy if exists modelos_pdf_sem_exclusao on storage.objects;
create policy modelos_pdf_sem_exclusao on storage.objects as restrictive for delete to public using(bucket_id<>'documentos-modelos');
drop policy if exists modelos_pdf_leitura on storage.objects;
create policy modelos_pdf_leitura on storage.objects for select to authenticated using(bucket_id='documentos-modelos' and public.documento_modelo_arquivo(name,false));
drop policy if exists modelos_pdf_insercao on storage.objects;
create policy modelos_pdf_insercao on storage.objects for insert to authenticated with check(bucket_id='documentos-modelos' and public.documento_modelo_arquivo(name,true));
create or replace function public.documento_modelo_finalizar(p_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare d public.documentos_modelos_emitidos;p text;
begin
 select * into d from public.documentos_modelos_emitidos where id=p_id for update;
 if d.id is null or not public.acesso_modulo(d.empresa_id,'locacao') or d.criado_por<>auth.uid() then raise exception 'Sem acesso à emissão.'; end if;
 p:=d.empresa_id::text||'/'||d.id::text||'.pdf';
 if not exists(select 1 from storage.objects where bucket_id='documentos-modelos' and name=p) then raise exception 'Envie o PDF antes de finalizar.'; end if;
 update public.documentos_modelos_emitidos set arquivo_path=p where id=p_id and arquivo_path is null;
 return p;
end $$;
revoke all on function public.modelo_documento_salvar(uuid,uuid,integer,text,text,boolean,boolean),public.modelos_documentos_publicados(uuid),public.documento_modelo_preparar(uuid,uuid,uuid,jsonb,boolean,uuid),public.documento_modelo_finalizar(uuid),public.documento_modelo_arquivo(text,boolean) from public,anon;
grant execute on function public.modelo_documento_salvar(uuid,uuid,integer,text,text,boolean,boolean),public.modelos_documentos_publicados(uuid),public.documento_modelo_preparar(uuid,uuid,uuid,jsonb,boolean,uuid),public.documento_modelo_finalizar(uuid),public.documento_modelo_arquivo(text,boolean) to authenticated;
grant execute on function public.documento_modelo_arquivo(text,boolean) to anon;
create index if not exists emitidos_modelos_locacao_idx on public.documentos_modelos_emitidos(empresa_id,locacao_id,criado_em desc);
commit;
select 'Etapa 3 aplicada' as resultado;
