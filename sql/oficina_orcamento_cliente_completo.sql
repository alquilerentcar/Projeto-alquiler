-- SQL Editor, papel postgres. Rode depois de oficina_orcamento_alquiler.sql.
-- Orçamento em nome da locadora dona do carro: além do nome e CNPJ, traz endereço, telefone e e-mail do cadastro da empresa.
-- Só leitura de dados já cadastrados; não altera nem apaga nada.
begin;
do $do$
declare d text; n text;
 velho text:='''locadora'',(select jsonb_build_object(''razao_social'',e.razao_social,''nome_fantasia'',e.nome_fantasia,''cnpj'',e.cnpj) from public.carros c join public.empresas e on e.id=c.empresa_id where c.id=m.carro_id and c.empresa_id<>p_empresa),';
 novo text:='''locadora'',(select (select jsonb_object_agg(j.key,j.value) from jsonb_each(to_jsonb(e)) j where j.key in (''razao_social'',''nome_fantasia'',''cnpj'',''endereco'',''numero'',''complemento'',''bairro'',''cidade'',''uf'',''cep'',''telefone'',''email'')) from public.carros c join public.empresas e on e.id=c.empresa_id where c.id=m.carro_id and c.empresa_id<>p_empresa),';
begin
 d:=pg_get_functiondef('public.oficina_orcamento(uuid,uuid)'::regprocedure);
 if position(novo in d)>0 then return; end if;
 if position(velho in d)=0 then raise exception 'Rode antes sql/oficina_orcamento_alquiler.sql.'; end if;
 n:=replace(d,velho,novo);
 execute n;
end $do$;
notify pgrst,'reload schema';
commit;
select 'Orçamento com os dados completos da locadora.' as resultado;
