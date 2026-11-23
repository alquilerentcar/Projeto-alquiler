-- SQL Editor, papel postgres. Rode depois de oficina_estoque.sql.
-- Peças sem código de barras: o sistema gera um código EAN-13 interno (começa com 20, faixa de uso interno)
-- para imprimir a etiqueta e ler com o leitor. Não altera peças que já têm código.
begin;
-- Dígito verificador do EAN-13.
create or replace function public.oficina_ean13_digito(p_base text)
returns int language sql immutable set search_path='' as $$
 select (10-(sum(substr(p_base,i,1)::int*case when i%2=0 then 3 else 1 end)%10))%10 from generate_series(1,12) i
$$;
create or replace function public.oficina_produto_gerar_codigo(p_empresa uuid,p_produto uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.oficina_produtos; seq bigint; base text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into p from public.oficina_produtos where id=p_produto and empresa_id=p_empresa for update;
 if p.id is null then raise exception 'Peça não encontrada.'; end if;
 if p.codigo_barras is not null then return to_jsonb(p); end if;
 perform pg_advisory_xact_lock(hashtextextended('oficina_ean'||p_empresa::text,0));
 select coalesce(max(substr(codigo_barras,3,10)::bigint),0)+1 into seq from public.oficina_produtos where empresa_id=p_empresa and codigo_barras ~ '^20[0-9]{11}$';
 base:='20'||lpad(seq::text,10,'0');
 update public.oficina_produtos set codigo_barras=base||public.oficina_ean13_digito(base) where id=p.id returning * into p;
 return to_jsonb(p);
end $$;
revoke all on function public.oficina_produto_gerar_codigo(uuid,uuid) from public,anon;
grant execute on function public.oficina_produto_gerar_codigo(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Geração de código de barras para peças pronta.' as resultado;
