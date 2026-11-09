begin;
create table if not exists public.notificacoes_postagens (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 autor_id uuid references auth.users(id) on delete set null,
 autor_nome text not null,
 titulo text not null check(char_length(titulo) between 1 and 150),
 mensagem text not null check(char_length(mensagem) between 1 and 5000),
 criado_em timestamptz not null default now()
);
create index if not exists notificacoes_postagens_empresa_data on public.notificacoes_postagens(empresa_id,criado_em desc,id desc);
alter table public.notificacoes_postagens enable row level security;
revoke all on public.notificacoes_postagens from anon,authenticated;
grant select on public.notificacoes_postagens to authenticated;
drop policy if exists postagens_leitura_empresa on public.notificacoes_postagens;
create policy postagens_leitura_empresa on public.notificacoes_postagens for select to authenticated
 using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.notificacao_publicar(p_empresa uuid,p_titulo text,p_mensagem text)
returns uuid language plpgsql security definer set search_path='' as $$
declare nome text; novo uuid;
begin
 if auth.uid() is null or not public.acesso_modulo(p_empresa,'locacao') then raise exception using errcode='42501',message='Sem acesso à empresa.'; end if;
 select u.nome into nome from public.usuarios_empresa u where u.auth_user_id=auth.uid() and u.empresa_id=p_empresa and u.ativo;
 if nome is null then raise exception using errcode='42501',message='É necessário um usuário ativo nesta empresa para publicar.'; end if;
 if char_length(btrim(coalesce(p_titulo,''))) not between 1 and 150 or char_length(btrim(coalesce(p_mensagem,''))) not between 1 and 5000 then raise exception 'Informe título e mensagem dentro dos limites.'; end if;
 insert into public.notificacoes_postagens(empresa_id,autor_id,autor_nome,titulo,mensagem) values(p_empresa,auth.uid(),nome,btrim(p_titulo),btrim(p_mensagem)) returning id into novo;
 return novo;
end $$;
revoke all on function public.notificacao_publicar(uuid,text,text) from public,anon;
grant execute on function public.notificacao_publicar(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
