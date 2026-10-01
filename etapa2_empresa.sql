-- Aplicar depois de etapa1_acessos.sql. Não modifica documentos já emitidos.
begin;
do $$ begin
 if to_regprocedure('public.acesso_gerenciar_usuarios(uuid)') is null then
  raise exception 'Aplique etapa1_acessos.sql primeiro.';
 end if;
end $$;
alter table public.empresas add column if not exists cor_primaria text not null default '#2864da';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.empresas'::regclass and conname='empresa_cor_valida') then
  alter table public.empresas add constraint empresa_cor_valida check(cor_primaria ~ '^#[0-9a-fA-F]{6}$');
 end if;
end $$;
grant update(cor_primaria) on public.empresas to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('identidade-empresas','identidade-empresas',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];

create or replace function public.empresa_identidade_permitida(p_nome text,p_escrita boolean)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare eid uuid;
begin
 begin eid:=split_part(p_nome,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 if p_escrita then return public.acesso_admin_empresa(eid); end if;
 return public.acesso_modulo(eid,'locacao');
end $$;
revoke all on function public.empresa_identidade_permitida(text,boolean) from public;
grant execute on function public.empresa_identidade_permitida(text,boolean) to authenticated,anon;
-- As restritivas também limitam políticas permissivas antigas de storage.
drop policy if exists identidade_leitura_limite on storage.objects;
create policy identidade_leitura_limite on storage.objects as restrictive for select to public
using(bucket_id <> 'identidade-empresas' or public.empresa_identidade_permitida(name,false));
drop policy if exists identidade_insercao_limite on storage.objects;
create policy identidade_insercao_limite on storage.objects as restrictive for insert to public
with check(bucket_id <> 'identidade-empresas' or public.empresa_identidade_permitida(name,true));
drop policy if exists identidade_alteracao_limite on storage.objects;
create policy identidade_alteracao_limite on storage.objects as restrictive for update to public
using(bucket_id <> 'identidade-empresas' or public.empresa_identidade_permitida(name,true))
with check(bucket_id <> 'identidade-empresas' or public.empresa_identidade_permitida(name,true));
drop policy if exists identidade_exclusao_limite on storage.objects;
create policy identidade_exclusao_limite on storage.objects as restrictive for delete to public
using(bucket_id <> 'identidade-empresas' or public.empresa_identidade_permitida(name,true));
drop policy if exists identidade_leitura on storage.objects;
create policy identidade_leitura on storage.objects for select to authenticated
using(bucket_id='identidade-empresas' and public.empresa_identidade_permitida(name,false));
drop policy if exists identidade_escrita on storage.objects;
create policy identidade_escrita on storage.objects for all to authenticated
using(bucket_id='identidade-empresas' and public.empresa_identidade_permitida(name,true))
with check(bucket_id='identidade-empresas' and public.empresa_identidade_permitida(name,true));
commit;
select 'Etapa 2 aplicada' as resultado;
