-- SQL Editor, papel postgres. Rode depois de oficina_compra_marca.sql.
-- Controle das notas fiscais de compra da oficina:
-- 1. A nota fica guardada com tudo: emissão, fornecedor, número, série, chave, valores (produtos, frete, desconto, total),
--    cada item como veio na nota (descrição, código, código de barras, NCM, unidade, quantidade, unitário, total) e o XML original.
-- 2. Nota sem XML (papel/digitada): pode ser lançada à mão; a chave fica opcional e o sistema barra a mesma nota duas vezes
--    (mesmo fornecedor, número e série).
-- 3. Lista das notas por período e o XML guardado para baixar.
-- Não altera nem apaga dados existentes; as notas antigas continuam aparecendo (com os dados que tinham).
begin;
alter table public.oficina_notas add column if not exists origem text not null default 'xml';
alter table public.oficina_notas add column if not exists valor_produtos numeric(14,2);
alter table public.oficina_notas add column if not exists frete numeric(14,2);
alter table public.oficina_notas add column if not exists desconto numeric(14,2);
alter table public.oficina_notas add column if not exists natureza_operacao text;
alter table public.oficina_notas add column if not exists observacao text;
alter table public.oficina_notas add column if not exists xml text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='oficina_notas_origem_check') then
  alter table public.oficina_notas add constraint oficina_notas_origem_check check(origem in ('xml','manual'));
 end if;
end $$;
-- O XML só sai pela função (não vai junto na leitura da tabela).
revoke select on public.oficina_notas from authenticated;
grant select(id,empresa_id,chave,numero,serie,emitente_cnpj,emitente_nome,emissao,valor_total,itens,criado_por,criado_em,origem,valor_produtos,frete,desconto,natureza_operacao,observacao) on public.oficina_notas to authenticated;

-- Lança a nota (por XML ou digitada) e dá entrada dos itens no estoque.
-- p_nota: {chave, numero, serie, emitente_cnpj, emitente_nome, emissao, valor_total, valor_produtos, frete, desconto, natureza_operacao, observacao, origem, xml}
-- p_itens: [{produto_id, quantidade, custo_unitario, marca, lote, codigo_fornecedor, descricao, ean, ncm, unidade, valor_total}]
create or replace function public.oficina_nota_importar(p_empresa uuid,p_operacao uuid,p_nota jsonb,p_itens jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existente public.oficina_notas; v_chave text:=nullif(regexp_replace(coalesce(p_nota->>'chave',''),'\D','','g'),'');
 cnpj text:=regexp_replace(coalesce(p_nota->>'emitente_cnpj',''),'\D','','g'); v_numero text:=nullif(trim(coalesce(p_nota->>'numero','')),'');
 v_serie text:=nullif(trim(coalesce(p_nota->>'serie','')),''); v_origem text:=coalesce(nullif(p_nota->>'origem',''),'xml'); v_resultado jsonb; item jsonb;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null or p_nota is null then raise exception 'Informe a nota fiscal.'; end if;
 if v_origem not in ('xml','manual') then raise exception 'Origem da nota inválida.'; end if;
 if v_chave is not null and length(v_chave)<>44 then raise exception 'A chave de acesso da nota tem 44 dígitos (veio com %).',length(v_chave); end if;
 if v_origem='xml' and v_chave is null then raise exception 'Nota fiscal sem chave de acesso válida.'; end if;
 if v_numero is null then raise exception 'Informe o número da nota fiscal.'; end if;
 if nullif(trim(coalesce(p_nota->>'emitente_nome','')),'') is null then raise exception 'Informe o fornecedor da nota.'; end if;
 if nullif(p_nota->>'emissao','') is null then raise exception 'Informe a data de emissão da nota.'; end if;
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then raise exception 'A nota precisa ter pelo menos um item.'; end if;
 if length(coalesce(p_nota->>'xml',''))>1000000 then raise exception 'O XML da nota é grande demais.'; end if;
 select * into existente from public.oficina_notas where id=p_operacao;
 if existente.id is not null then return (select o.resultado from public.oficina_operacoes o where o.id=p_operacao); end if;
 perform pg_advisory_xact_lock(hashtextextended('nf'||p_empresa::text||coalesce(v_chave,cnpj||'/'||v_numero||'/'||coalesce(v_serie,'')),0));
 select * into existente from public.oficina_notas n where n.empresa_id=p_empresa and (
  (v_chave is not null and n.chave=v_chave)
  or (n.numero=v_numero and coalesce(n.serie,'')=coalesce(v_serie,'') and ((cnpj<>'' and n.emitente_cnpj=cnpj) or (cnpj='' and upper(trim(n.emitente_nome))=upper(trim(p_nota->>'emitente_nome'))))))
  limit 1;
 if existente.id is not null then raise exception 'A nota % já foi lançada em %.',existente.numero,to_char(existente.criado_em at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'); end if;
 v_resultado:=public.oficina_entrada(p_empresa,p_operacao,(select jsonb_agg(jsonb_build_object('produto_id',x->>'produto_id','quantidade',x->'quantidade','custo_unitario',x->'custo_unitario','lote',x->>'lote','marca',x->>'marca')) from jsonb_array_elements(p_itens) x),
  'NF '||v_numero||coalesce(' série '||v_serie,''),nullif(p_nota->>'emitente_nome',''),case when v_chave is null then 'Nota lançada sem XML' else 'Chave '||v_chave end);
 insert into public.oficina_notas(id,empresa_id,chave,numero,serie,emitente_cnpj,emitente_nome,emissao,valor_total,itens,criado_por,origem,valor_produtos,frete,desconto,natureza_operacao,observacao,xml)
 values(p_operacao,p_empresa,v_chave,v_numero,v_serie,nullif(cnpj,''),trim(p_nota->>'emitente_nome'),(p_nota->>'emissao')::date,nullif(p_nota->>'valor_total','')::numeric,p_itens,auth.uid(),v_origem,
  nullif(p_nota->>'valor_produtos','')::numeric,nullif(p_nota->>'frete','')::numeric,nullif(p_nota->>'desconto','')::numeric,left(nullif(trim(coalesce(p_nota->>'natureza_operacao','')),''),200),
  left(nullif(trim(coalesce(p_nota->>'observacao','')),''),2000),nullif(p_nota->>'xml',''));
 if cnpj<>'' then
  for item in select value from jsonb_array_elements(p_itens) loop
   if nullif(item->>'codigo_fornecedor','') is not null then
    insert into public.oficina_produto_fornecedor(empresa_id,emitente_cnpj,codigo_fornecedor,produto_id) values(p_empresa,cnpj,item->>'codigo_fornecedor',(item->>'produto_id')::uuid)
    on conflict(empresa_id,emitente_cnpj,codigo_fornecedor) do update set produto_id=excluded.produto_id,atualizado_em=now();
   end if;
  end loop;
 end if;
 return v_resultado;
end $$;
revoke all on function public.oficina_nota_importar(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.oficina_nota_importar(uuid,uuid,jsonb,jsonb) to authenticated;

-- Notas do período (pela data de emissão), com cada item ligado à peça do estoque.
create or replace function public.oficina_notas_lista(p_empresa uuid,p_de date,p_ate date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'chave',n.chave,'numero',n.numero,'serie',n.serie,'emitente_cnpj',n.emitente_cnpj,'emitente_nome',n.emitente_nome,
   'emissao',n.emissao,'valor_total',n.valor_total,'valor_produtos',n.valor_produtos,'frete',n.frete,'desconto',n.desconto,'natureza_operacao',n.natureza_operacao,'observacao',n.observacao,
   'origem',n.origem,'tem_xml',n.xml is not null,'criado_em',n.criado_em,'criado_por',coalesce((select u.nome from public.usuarios_empresa u where u.auth_user_id=n.criado_por limit 1),''),
   'itens',(select coalesce(jsonb_agg(i.value||jsonb_build_object('produto',p.descricao,'codigo_barras',p.codigo_barras,'unidade_estoque',p.unidade) order by i.ordinality),'[]'::jsonb)
     from jsonb_array_elements(n.itens) with ordinality i left join public.oficina_produtos p on p.id=nullif(i.value->>'produto_id','')::uuid and p.empresa_id=n.empresa_id))
   order by coalesce(n.emissao,(n.criado_em at time zone 'America/Manaus')::date) desc,n.criado_em desc)
  from public.oficina_notas n where n.empresa_id=p_empresa and coalesce(n.emissao,(n.criado_em at time zone 'America/Manaus')::date) between coalesce(p_de,'2000-01-01') and coalesce(p_ate,'2999-12-31')),'[]'::jsonb);
end $$;
revoke all on function public.oficina_notas_lista(uuid,date,date) from public,anon;
grant execute on function public.oficina_notas_lista(uuid,date,date) to authenticated;

-- XML original guardado da nota (para baixar).
create or replace function public.oficina_nota_xml(p_empresa uuid,p_nota uuid)
returns text language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return (select n.xml from public.oficina_notas n where n.id=p_nota and n.empresa_id=p_empresa);
end $$;
revoke all on function public.oficina_nota_xml(uuid,uuid) from public,anon;
grant execute on function public.oficina_nota_xml(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Notas fiscais: lançamento completo (XML ou digitada), lista e XML guardado.' as resultado;
