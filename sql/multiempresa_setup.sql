-- Estrutura multiempresa do sistema Alquiler
-- Execute uma vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text not null,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  email text,
  telefone text,
  endereco text,
  logo_url text,
  papel_timbrado_nome text,
  papel_timbrado_path text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.filiais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  cnpj text,
  endereco jsonb not null default '{}'::jsonb,
  matriz boolean not null default false,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table if not exists public.funcoes_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  ativa boolean not null default true,
  unique (empresa_id, nome)
);

create table if not exists public.administradores_plataforma (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  usuario text not null unique,
  nivel text not null default 'administrador' check (nivel in ('administrador','desenvolvedor','suporte')),
  pode_acessar_dados_clientes boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text,
  ordem integer not null default 0,
  ativo boolean not null default true
);

create table if not exists public.usuarios_empresa (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  usuario text not null,
  cargo text,
  funcao_id uuid references public.funcoes_empresa(id),
  administrador boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, usuario),
  unique (auth_user_id, empresa_id)
);

create table if not exists public.empresa_modulos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  modulo_id uuid not null references public.modulos(id) on delete cascade,
  ativo boolean not null default true,
  configuracao jsonb not null default '{}'::jsonb,
  primary key (empresa_id, modulo_id)
);

create table if not exists public.usuario_modulos (
  usuario_empresa_id uuid not null references public.usuarios_empresa(id) on delete cascade,
  modulo_id uuid not null references public.modulos(id) on delete cascade,
  pode_visualizar boolean not null default true,
  pode_criar boolean not null default false,
  pode_editar boolean not null default false,
  pode_excluir boolean not null default false,
  pode_aprovar boolean not null default false,
  primary key (usuario_empresa_id, modulo_id)
);

insert into public.modulos (codigo, nome, descricao, ordem) values
  ('locacao', 'Locação', 'Clientes, frota, locações, contratos, recibos e pagamentos', 10),
  ('oficina', 'Oficina', 'Orçamentos, ordens de serviço e manutenções', 20),
  ('compras_estoque', 'Compras e estoque', 'Compras, entradas, saídas e inventário', 30),
  ('relatorios', 'Relatórios', 'Indicadores consolidados por empresa e módulo', 40)
on conflict (codigo) do update set nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem;

insert into public.empresas (razao_social, nome_fantasia, cnpj, email)
values ('ALQUILER RENT A CAR LTDA', 'Alquiler Rent a Car', '54135275000161', 'alquilerentcar@gmail.com')
on conflict (cnpj) do update set razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia;

insert into public.empresa_modulos (empresa_id, modulo_id, ativo)
select e.id, m.id, true from public.empresas e cross join public.modulos m
where e.cnpj = '54135275000161' and m.codigo = 'locacao'
on conflict (empresa_id, modulo_id) do update set ativo = true;

-- Relaciona a conta Supabase já existente à Alquiler.
insert into public.usuarios_empresa (auth_user_id, empresa_id, nome, usuario, cargo, administrador)
select u.id, e.id, 'STEPHANO AUGUSTO CHAVES COSTA', 'SAUGUSTO', 'Administrador e desenvolvedor', true
from auth.users u cross join public.empresas e
where lower(u.email) = 'alquilerentcar@gmail.com' and e.cnpj = '54135275000161'
on conflict (auth_user_id, empresa_id) do update set nome = excluded.nome, usuario = excluded.usuario, cargo = excluded.cargo, administrador = true, ativo = true;

insert into public.administradores_plataforma (auth_user_id, nome, usuario, nivel, pode_acessar_dados_clientes)
select u.id, 'STEPHANO AUGUSTO CHAVES COSTA', 'SAUGUSTO', 'desenvolvedor', true
from auth.users u where lower(u.email) = 'alquilerentcar@gmail.com'
on conflict (auth_user_id) do update set nome = excluded.nome, usuario = excluded.usuario, nivel = excluded.nivel, pode_acessar_dados_clientes = true, ativo = true;

insert into public.filiais (empresa_id, nome, cnpj, matriz)
select e.id, 'Matriz', e.cnpj, true from public.empresas e where e.cnpj = '54135275000161'
on conflict (empresa_id, nome) do update set matriz = true, ativa = true;

insert into public.usuario_modulos (usuario_empresa_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select ue.id, m.id, true, true, true, true, true
from public.usuarios_empresa ue
join public.empresas e on e.id = ue.empresa_id
cross join public.modulos m
where e.cnpj = '54135275000161' and m.codigo = 'locacao'
on conflict (usuario_empresa_id, modulo_id) do update set
  pode_visualizar = true, pode_criar = true, pode_editar = true, pode_excluir = true, pode_aprovar = true;

-- Acrescenta empresa_id às tabelas operacionais que já existirem e associa os dados atuais à Alquiler.
do $$
declare tabela text;
begin
  foreach tabela in array array[
    'clientes','fornecedores','carros','locacoes','documentos_locacao','anexos_locacao',
    'vistorias_locacao','certificados_digitais','modelos_contrato','contratos_gerados','assinaturas_contrato'
  ] loop
    if to_regclass('public.' || tabela) is not null then
      execute format('alter table public.%I add column if not exists empresa_id uuid references public.empresas(id)', tabela);
      execute format('update public.%I set empresa_id = (select id from public.empresas where cnpj = %L) where empresa_id is null', tabela, '54135275000161');
      execute format('create index if not exists %I on public.%I (empresa_id)', tabela || '_empresa_idx', tabela);
    end if;
  end loop;
end $$;

alter table public.empresas enable row level security;
alter table public.usuarios_empresa enable row level security;
alter table public.empresa_modulos enable row level security;
alter table public.usuario_modulos enable row level security;
alter table public.modulos enable row level security;
alter table public.filiais enable row level security;
alter table public.funcoes_empresa enable row level security;
alter table public.administradores_plataforma enable row level security;

create or replace function public.usuario_tem_empresa(empresa uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.usuarios_empresa ue where ue.auth_user_id = auth.uid() and ue.empresa_id = empresa and ue.ativo) $$;

drop policy if exists "usuario le suas empresas" on public.empresas;
create policy "usuario le suas empresas" on public.empresas for select to authenticated
using (public.usuario_tem_empresa(id));
drop policy if exists "usuario le seu perfil" on public.usuarios_empresa;
create policy "usuario le seu perfil" on public.usuarios_empresa for select to authenticated
using (auth_user_id = auth.uid());
drop policy if exists "usuario le modulos" on public.modulos;
create policy "usuario le modulos" on public.modulos for select to authenticated using (ativo);
drop policy if exists "usuario le modulos da empresa" on public.empresa_modulos;
create policy "usuario le modulos da empresa" on public.empresa_modulos for select to authenticated
using (public.usuario_tem_empresa(empresa_id));
drop policy if exists "usuario le suas permissoes" on public.usuario_modulos;
create policy "usuario le suas permissoes" on public.usuario_modulos for select to authenticated
using (exists(select 1 from public.usuarios_empresa ue where ue.id = usuario_empresa_id and ue.auth_user_id = auth.uid()));

create policy "usuario le filiais da empresa" on public.filiais for select to authenticated using (public.usuario_tem_empresa(empresa_id));
create policy "usuario le funcoes da empresa" on public.funcoes_empresa for select to authenticated using (public.usuario_tem_empresa(empresa_id));
create policy "administrador le seu perfil da plataforma" on public.administradores_plataforma for select to authenticated using (auth_user_id = auth.uid());
