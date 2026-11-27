-- SQL Editor, papel postgres. Tela inicial de cada usuário em cada empresa: onde ele cai depois de entrar.
-- O administrador da empresa escolhe em Administração → Acessos. Sem escolha, continua como hoje.
-- A tela só vale se o usuário ainda tiver o módulo dela. Não altera nem apaga dados existentes.
begin;
create table if not exists public.usuarios_tela_inicial(
 usuario_empresa_id uuid primary key references public.usuarios_empresa(id) on delete cascade,
 tela text not null check(tela in ('dashboard.html','locacoes.html','financeiro.html','oficina.html?secao=manutencoes','oficina.html?secao=saida','oficina.html?secao=estoque','pdv-estoque.html')),
 alterado_por uuid, alterado_em timestamptz not null default now()
);
alter table public.usuarios_tela_inicial enable row level security;
revoke all on public.usuarios_tela_inicial from public,anon,authenticated;

create or replace function public.tela_inicial_modulo(p_tela text)
returns text language sql immutable set search_path='' as $$
 select case when p_tela like 'oficina.html%' or p_tela='pdv-estoque.html' then 'oficina' else 'locacao' end
$$;

-- Para o administrador: a tela inicial de cada usuário da empresa.
create or replace function public.acesso_telas_iniciais(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador vê as telas iniciais.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('usuario_empresa_id',u.id,'tela',t.tela)) from public.usuarios_empresa u join public.usuarios_tela_inicial t on t.usuario_empresa_id=u.id where u.empresa_id=p_empresa),'[]'::jsonb);
end $$;
revoke all on function public.acesso_telas_iniciais(uuid) from public,anon;
grant execute on function public.acesso_telas_iniciais(uuid) to authenticated;

create or replace function public.acesso_tela_inicial_definir(p_empresa uuid,p_usuario_empresa uuid,p_tela text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_gerenciar_usuarios(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador define a tela inicial.'; end if;
 if not exists(select 1 from public.usuarios_empresa where id=p_usuario_empresa and empresa_id=p_empresa) then raise exception 'Usuário não encontrado nesta empresa.'; end if;
 if nullif(trim(coalesce(p_tela,'')),'') is null then delete from public.usuarios_tela_inicial where usuario_empresa_id=p_usuario_empresa; return; end if;
 insert into public.usuarios_tela_inicial(usuario_empresa_id,tela,alterado_por) values(p_usuario_empresa,p_tela,auth.uid())
 on conflict(usuario_empresa_id) do update set tela=excluded.tela,alterado_por=excluded.alterado_por,alterado_em=now();
end $$;
revoke all on function public.acesso_tela_inicial_definir(uuid,uuid,text) from public,anon;
grant execute on function public.acesso_tela_inicial_definir(uuid,uuid,text) to authenticated;

-- Para quem entrou: a própria tela inicial naquela empresa (só se ainda tiver o módulo).
create or replace function public.acesso_minha_tela_inicial(p_empresa uuid)
returns text language sql stable security definer set search_path='' as $$
 select t.tela from public.usuarios_empresa u join public.usuarios_tela_inicial t on t.usuario_empresa_id=u.id
 where u.empresa_id=p_empresa and u.auth_user_id=auth.uid() and u.ativo
  and coalesce(public.acesso_modulo(p_empresa,public.tela_inicial_modulo(t.tela)),false)
 limit 1
$$;
revoke all on function public.acesso_minha_tela_inicial(uuid) from public,anon;
grant execute on function public.acesso_minha_tela_inicial(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Tela inicial por usuário pronta.' as resultado;
