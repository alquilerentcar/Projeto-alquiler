-- SQL Editor, papel postgres. Faz o módulo Oficina aparecer ao entrar no sistema.
-- No banco, quatro funções de Acessos só reconheciam a Locação:
-- 1. acessos_contexto: a lista de módulos ao entrar só trazia a Locação (por isso a Oficina não aparecia);
-- 2. acessos_salvar_empresa: ao salvar a empresa, só a Locação podia ser desmarcada;
-- 3. acessos_validar_usuario: o administrador da empresa precisava ter a Locação (empresa só com Oficina não teria administrador);
-- 4. acesso_gerenciar_usuarios: só quem tinha a Locação gerenciava usuários.
-- Troca apenas esses trechos, mantendo o resto de cada função como está no banco. Não altera dados.
begin;
do $$
declare
 trocas text[][]:=array[
  ['acessos_contexto',
   'where codigo=''locacao'' and public.acesso_modulo(e.id,codigo)',
   'where codigo in (''locacao'',''oficina'') and public.acesso_modulo(e.id,codigo)'],
  ['acessos_salvar_empresa',
   'modulo_id in (select id from public.modulos where codigo=''locacao'')',
   'modulo_id in (select id from public.modulos where codigo in (''locacao'',''oficina''))'],
  ['acessos_validar_usuario',
   'not (''locacao''=any(coalesce(p_modulos,array[]::text[])))',
   'not (coalesce(p_modulos,array[]::text[]) && array[''locacao'',''oficina'']::text[])'],
  ['acesso_gerenciar_usuarios',
   'public.acesso_modulo(p_empresa,''locacao'') and exists(',
   '(public.acesso_modulo(p_empresa,''locacao'') or public.acesso_modulo(p_empresa,''oficina'')) and exists(']];
 i int; f record; def text; achou boolean;
begin
 for i in 1..array_length(trocas,1) loop
  achou:=false;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=trocas[i][1] loop
   def:=pg_get_functiondef(f.oid);
   if position(trocas[i][2] in def)>0 then execute replace(def,trocas[i][2],trocas[i][3]); achou:=true; raise notice 'Corrigido: %',trocas[i][1];
   elsif position(trocas[i][3] in def)>0 then achou:=true; raise notice 'Já estava corrigido: %',trocas[i][1];
   end if;
  end loop;
  if not achou then raise exception 'Não encontrei o trecho esperado em %. Nada foi alterado.',trocas[i][1]; end if;
 end loop;
end $$;
commit;
-- Conferência: deve mostrar 1 em cada coluna.
select
 (select count(*) from pg_proc where proname='acessos_contexto' and position('''locacao'',''oficina''' in pg_get_functiondef(oid))>0) as entrada_mostra_oficina,
 (select count(*) from pg_proc where proname='acessos_salvar_empresa' and position('codigo in (''locacao'',''oficina'')' in pg_get_functiondef(oid))>0) as salvar_empresa,
 (select count(*) from pg_proc where proname='acessos_validar_usuario' and position('array[''locacao'',''oficina'']' in pg_get_functiondef(oid))>0) as administrador,
 (select count(*) from pg_proc where proname='acesso_gerenciar_usuarios' and position('acesso_modulo(p_empresa,''oficina'')' in pg_get_functiondef(oid))>0) as gerenciar_usuarios;
