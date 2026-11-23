-- SQL Editor, papel postgres.
-- Corrige o orçamento da Oficina: ele buscava o telefone do locatário numa coluna "telefone"
-- que não existe no cadastro de clientes, e o orçamento não abria ("Sem acesso à Oficina").
-- O telefone passa a vir do contato do cadastro do cliente (contato 1, ou o 2 se o 1 estiver vazio).
-- Não altera dados.
begin;
do $$ declare def text; begin
 def:=pg_get_functiondef('public.oficina_orcamento(uuid,uuid)'::regprocedure);
 if position('c.telefone' in def)>0 then
  execute replace(def,'''telefone'',c.telefone)','''telefone'',coalesce(c.contato_1_numero,c.contato_2_numero))');
 end if;
 if position('c.telefone' in pg_get_functiondef('public.oficina_orcamento(uuid,uuid)'::regprocedure))>0 then
  raise exception 'Não consegui corrigir o orçamento.';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
select 'Orçamento da Oficina corrigido: telefone do locatário vem do contato do cadastro.' as resultado;
