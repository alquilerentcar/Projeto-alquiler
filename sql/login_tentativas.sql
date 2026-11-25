-- SQL Editor, papel postgres. Limite de tentativas do login por usuário guardado no banco
-- (na Vercel cada servidor tinha o próprio contador na memória, então o limite não valia de verdade).
-- Guarda só um código embaralhado (hash) do IP e do usuário, nunca o IP ou a senha.
-- Só o servidor (chave de serviço) usa essas funções. Não altera nem apaga dados existentes.
begin;
create table if not exists public.login_tentativas(
 chave text primary key check(length(chave) between 16 and 128),
 tentativas integer not null default 0,
 janela_ate timestamptz not null
);
alter table public.login_tentativas enable row level security;
revoke all on public.login_tentativas from public,anon,authenticated;

-- Conta uma tentativa e diz se ainda está dentro do limite (janela de 15 minutos).
create or replace function public.login_tentativa_registrar(p_chave text,p_max integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_chave is null or length(p_chave) not between 16 and 128 or p_max is null or p_max<1 then raise exception 'Parâmetros inválidos.'; end if;
 delete from public.login_tentativas where janela_ate<now()-interval '1 day' and random()<0.05;
 insert into public.login_tentativas(chave,tentativas,janela_ate) values(p_chave,1,now()+interval '15 minutes')
 on conflict(chave) do update set
  tentativas=case when public.login_tentativas.janela_ate<now() then 1 else public.login_tentativas.tentativas+1 end,
  janela_ate=case when public.login_tentativas.janela_ate<now() then now()+interval '15 minutes' else public.login_tentativas.janela_ate end
 returning tentativas into n;
 return n<=p_max;
end $$;

-- Login certo zera o contador daquele usuário.
create or replace function public.login_tentativa_limpar(p_chave text)
returns void language sql security definer set search_path='' as $$
 delete from public.login_tentativas where chave=p_chave
$$;

revoke all on function public.login_tentativa_registrar(text,integer) from public,anon,authenticated;
revoke all on function public.login_tentativa_limpar(text) from public,anon,authenticated;
grant execute on function public.login_tentativa_registrar(text,integer) to service_role;
grant execute on function public.login_tentativa_limpar(text) to service_role;
notify pgrst,'reload schema';
commit;
select 'Limite de tentativas do login guardado no banco.' as resultado;
