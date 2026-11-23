-- SQL Editor, papel postgres. Deixa quem tem acesso à Oficina ler o papel timbrado da própria empresa
-- (ex.: Tempo da Mecânica, que não tem o módulo Locação). Escrita continua só para o administrador.
-- Não altera nem apaga arquivos ou dados.
begin;
create or replace function public.empresa_identidade_permitida(p_nome text,p_escrita boolean)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare eid uuid;
begin
 begin eid:=split_part(p_nome,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 if p_escrita then return public.acesso_admin_empresa(eid); end if;
 return coalesce(public.acesso_modulo(eid,'locacao'),false) or coalesce(public.oficina_acesso(eid),false);
end $$;
revoke all on function public.empresa_identidade_permitida(text,boolean) from public;
grant execute on function public.empresa_identidade_permitida(text,boolean) to authenticated,anon;
commit;
select 'Papel timbrado liberado para leitura por quem usa a Oficina.' as resultado;
