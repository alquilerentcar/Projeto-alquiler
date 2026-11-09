-- Execute no SQL Editor como postgres. Não apaga empresas, imagens ou dados existentes.
begin;
do $$ begin
 if to_regprocedure('public.acesso_admin_empresa(uuid)') is null or to_regprocedure('public.acesso_empresa(uuid)') is null then
  raise exception 'O controle de acesso precisa estar instalado antes desta correção.';
 end if;
end $$;
alter table public.empresas add column if not exists cep text;
alter table public.empresas add column if not exists numero text;
alter table public.empresas add column if not exists complemento text;
alter table public.empresas add column if not exists bairro text;
alter table public.empresas add column if not exists cidade text;
alter table public.empresas add column if not exists uf text;
alter table public.empresas add column if not exists logo_url text;
alter table public.empresas add column if not exists papel_timbrado_nome text;
alter table public.empresas add column if not exists papel_timbrado_path text;
alter table public.empresas add column if not exists cor_primaria text not null default '#2864da';
alter table public.empresas add column if not exists cor_sidebar text not null default '#111e32';
alter table public.empresas add column if not exists cor_fundo text not null default '#f5f7fb';
alter table public.empresas add column if not exists cor_paineis text not null default '#ffffff';
alter table public.empresas add column if not exists oficina_habilitada boolean not null default false;
alter table public.empresas enable row level security;

grant select on public.empresas to authenticated;
-- A concessão por coluna não autoriza alterar IDs, licenças ou a situação da empresa.
grant update(razao_social,nome_fantasia,cnpj,telefone,email,endereco,cep,numero,complemento,bairro,cidade,uf,
 logo_url,papel_timbrado_nome,papel_timbrado_path,cor_primaria,cor_sidebar,cor_fundo,cor_paineis,oficina_habilitada)
on public.empresas to authenticated;

drop policy if exists empresa_config_leitura on public.empresas;
create policy empresa_config_leitura on public.empresas for select to authenticated
 using(auth.uid() is not null and coalesce(public.acesso_empresa(id),false));
drop policy if exists empresa_config_leitura_limite on public.empresas;
create policy empresa_config_leitura_limite on public.empresas as restrictive for select to authenticated
 using(auth.uid() is not null and coalesce(public.acesso_empresa(id),false));
drop policy if exists empresa_config_atualizacao on public.empresas;
create policy empresa_config_atualizacao on public.empresas for update to authenticated
 using(auth.uid() is not null and coalesce(public.acesso_admin_empresa(id),false))
 with check(auth.uid() is not null and coalesce(public.acesso_admin_empresa(id),false));
drop policy if exists empresa_config_atualizacao_limite on public.empresas;
create policy empresa_config_atualizacao_limite on public.empresas as restrictive for update to authenticated
 using(auth.uid() is not null and coalesce(public.acesso_admin_empresa(id),false))
 with check(auth.uid() is not null and coalesce(public.acesso_admin_empresa(id),false));
notify pgrst,'reload schema';
commit;
select 'Permissões de logo, endereço e configurações da empresa corrigidas' as resultado;
