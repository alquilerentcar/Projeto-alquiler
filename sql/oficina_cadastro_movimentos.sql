-- SQL Editor, papel postgres. Rode depois de oficina_modulo.sql e oficina_etiquetas.sql.
-- Estoque com registro completo:
-- 1. Cadastro do item: categoria (peças, uso e consumo, revenda, construção em andamento, limpeza, ferramenta, outros),
--    como vem (embalagem e quantas unidades por embalagem), controle de lote e preço de venda.
-- 2. Lote registrado em cada entrada (obrigatório nos itens que controlam lote).
-- 3. Lançamentos de saída sem carro: uso e consumo, construção em andamento, revenda e perda/descarte.
-- 4. Relatório de todos os movimentos, que nunca são apagados.
-- 5. Funcionário do estoque identificado pelo CPF em cada entrada e saída (balcão).
-- Não altera itens nem movimentos existentes.
begin;
alter table public.oficina_produtos add column if not exists categoria text not null default 'pecas';
alter table public.oficina_produtos drop constraint if exists oficina_produtos_categoria_check;
alter table public.oficina_produtos add constraint oficina_produtos_categoria_check check(categoria in ('pecas','uso_consumo','revenda','obra','limpeza','ferramenta','outros'));
alter table public.oficina_produtos add column if not exists embalagem text;
alter table public.oficina_produtos add column if not exists qtd_embalagem numeric(12,3) not null default 1;
alter table public.oficina_produtos drop constraint if exists oficina_produtos_qtd_embalagem_check;
alter table public.oficina_produtos add constraint oficina_produtos_qtd_embalagem_check check(qtd_embalagem>0);
alter table public.oficina_produtos add column if not exists controla_lote boolean not null default false;
alter table public.oficina_produtos add column if not exists preco_venda numeric(12,2);
alter table public.oficina_movimentos add column if not exists lote text;
alter table public.oficina_movimentos add column if not exists destino text;
alter table public.oficina_movimentos drop constraint if exists oficina_movimentos_destino_check;
alter table public.oficina_movimentos add constraint oficina_movimentos_destino_check check(destino is null or destino in ('manutencao','uso_consumo','obra','revenda','perda'));
alter table public.oficina_movimentos add column if not exists destino_descricao text;
alter table public.oficina_movimentos add column if not exists valor_venda numeric(12,2);
create table if not exists public.oficina_operadores(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 nome text not null check(length(trim(nome)) between 3 and 120), cpf text not null check(cpf ~ '^[0-9]{11}$'),
 ativo boolean not null default true, criado_por uuid, criado_em timestamptz not null default now(), unique(empresa_id,cpf)
);
alter table public.oficina_operadores enable row level security;
revoke all on public.oficina_operadores from public,anon,authenticated;
alter table public.oficina_movimentos add column if not exists operador_id uuid references public.oficina_operadores(id);
alter table public.oficina_movimentos add column if not exists operador_nome text;

-- CPF válido (dígitos verificadores).
create or replace function public.oficina_cpf_valido(p_cpf text) returns boolean language plpgsql immutable set search_path='' as $f$
declare d text:=regexp_replace(coalesce(p_cpf,''),'\D','','g'); s int; r int; i int;
begin
 if length(d)<>11 or d ~ '^(\d)\1{10}$' then return false; end if;
 s:=0; for i in 1..9 loop s:=s+substr(d,i,1)::int*(11-i); end loop; r:=(s*10)%11; if r=10 then r:=0; end if; if r<>substr(d,10,1)::int then return false; end if;
 s:=0; for i in 1..10 loop s:=s+substr(d,i,1)::int*(12-i); end loop; r:=(s*10)%11; if r=10 then r:=0; end if; return r=substr(d,11,1)::int;
end $f$;

create or replace function public.oficina_operadores_lista(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'cpf_final',right(o.cpf,4),'ativo',o.ativo) order by o.ativo desc,o.nome) from public.oficina_operadores o where o.empresa_id=p_empresa),'[]'::jsonb);
end $$;
revoke all on function public.oficina_operadores_lista(uuid) from public,anon;
grant execute on function public.oficina_operadores_lista(uuid) to authenticated;

-- Administrador cadastra, edita ou desativa o funcionário do estoque.
create or replace function public.oficina_operador_salvar(p_empresa uuid,p_id uuid,p_nome text,p_cpf text,p_ativo boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d text:=regexp_replace(coalesce(p_cpf,''),'\D','','g'); r public.oficina_operadores;
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador cadastra funcionários do estoque.'; end if;
 if length(trim(coalesce(p_nome,'')))<3 then raise exception 'Informe o nome do funcionário.'; end if;
 if not public.oficina_cpf_valido(d) then raise exception 'CPF inválido.'; end if;
 if exists(select 1 from public.oficina_operadores where empresa_id=p_empresa and cpf=d and id is distinct from p_id) then raise exception 'Já existe um funcionário com este CPF.'; end if;
 if p_id is null then insert into public.oficina_operadores(empresa_id,nome,cpf,ativo,criado_por) values(p_empresa,trim(p_nome),d,coalesce(p_ativo,true),auth.uid()) returning * into r;
 else update public.oficina_operadores set nome=trim(p_nome),cpf=d,ativo=coalesce(p_ativo,ativo) where id=p_id and empresa_id=p_empresa returning * into r;
  if r.id is null then raise exception 'Funcionário não encontrado.'; end if; end if;
 return jsonb_build_object('id',r.id,'nome',r.nome,'cpf_final',right(r.cpf,4),'ativo',r.ativo);
end $$;
revoke all on function public.oficina_operador_salvar(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.oficina_operador_salvar(uuid,uuid,text,text,boolean) to authenticated;

-- Balcão: o funcionário digita o CPF; devolve o nome para confirmar.
create or replace function public.oficina_operador_identificar(p_empresa uuid,p_cpf text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.oficina_operadores;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into r from public.oficina_operadores where empresa_id=p_empresa and cpf=regexp_replace(coalesce(p_cpf,''),'\D','','g') and ativo;
 if r.id is null then raise exception 'CPF não cadastrado como funcionário do estoque.'; end if;
 return jsonb_build_object('id',r.id,'nome',r.nome);
end $$;
revoke all on function public.oficina_operador_identificar(uuid,text) from public,anon;
grant execute on function public.oficina_operador_identificar(uuid,text) to authenticated;

-- Confere o funcionário informado e devolve o nome (ou null quando não informado).
create or replace function public.oficina_operador_nome(p_empresa uuid,p_operador uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare n text;
begin
 if p_operador is null then return null; end if;
 select nome into n from public.oficina_operadores where id=p_operador and empresa_id=p_empresa and ativo;
 if n is null then raise exception 'Funcionário do estoque não encontrado ou inativo.'; end if;
 return n;
end $$;
revoke all on function public.oficina_operador_nome(uuid,uuid) from public,anon,authenticated;

-- Movimentos são o livro do estoque: ninguém altera nem apaga, nem pelas funções.
create or replace function public.oficina_movimentos_imutaveis() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Movimentos do estoque não podem ser alterados nem apagados. Faça um ajuste ou um novo lançamento.'; end $$;
drop trigger if exists oficina_movimentos_imutaveis on public.oficina_movimentos;
create trigger oficina_movimentos_imutaveis before update or delete on public.oficina_movimentos for each row execute function public.oficina_movimentos_imutaveis();

-- ===================== Cadastro do item =====================
create or replace function public.oficina_produto_salvar(p_empresa uuid,p_id uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_produtos; atual public.oficina_produtos; barras text:=nullif(trim(coalesce(p_dados->>'codigo_barras','')),''); interno text:=nullif(trim(coalesce(p_dados->>'codigo_interno','')),'');
 minimo numeric:=coalesce(nullif(p_dados->>'estoque_minimo','')::numeric,0); emb numeric; preco numeric; cat text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if length(trim(coalesce(p_dados->>'descricao',''))) not between 2 and 200 then raise exception 'Informe a descrição do item.'; end if;
 if not public.oficina_numero(minimo) then raise exception 'Estoque mínimo inválido.'; end if;
 if p_id is not null then select * into atual from public.oficina_produtos where id=p_id and empresa_id=p_empresa; if atual.id is null then raise exception 'Item não encontrado.'; end if; end if;
 cat:=coalesce(nullif(p_dados->>'categoria',''),atual.categoria,'pecas');
 if cat not in ('pecas','uso_consumo','revenda','obra','limpeza','ferramenta','outros') then raise exception 'Escolha a categoria do item.'; end if;
 emb:=coalesce(nullif(p_dados->>'qtd_embalagem','')::numeric,atual.qtd_embalagem,1);
 if not public.oficina_numero(emb,0.001) then raise exception 'Quantidade por embalagem inválida.'; end if;
 preco:=case when p_dados ? 'preco_venda' then nullif(p_dados->>'preco_venda','')::numeric else atual.preco_venda end;
 if preco is not null and (preco<0 or preco<>round(preco,2)) then raise exception 'Preço de venda inválido.'; end if;
 if barras is not null and exists(select 1 from public.oficina_produtos where empresa_id=p_empresa and codigo_barras=barras and id is distinct from p_id) then
  raise exception 'Já existe um item com o código de barras %.',barras;
 end if;
 if interno is not null and exists(select 1 from public.oficina_produtos where empresa_id=p_empresa and codigo_interno=interno and id is distinct from p_id) then
  raise exception 'Já existe um item com o código interno %.',interno;
 end if;
 if p_id is null then
  insert into public.oficina_produtos(empresa_id,codigo_barras,codigo_interno,descricao,unidade,marca,aplicacao,localizacao,estoque_minimo,categoria,embalagem,qtd_embalagem,controla_lote,preco_venda,criado_por)
  values(p_empresa,barras,interno,trim(p_dados->>'descricao'),upper(coalesce(nullif(trim(p_dados->>'unidade'),''),'UN')),
   nullif(trim(coalesce(p_dados->>'marca','')),''),nullif(trim(coalesce(p_dados->>'aplicacao','')),''),nullif(trim(coalesce(p_dados->>'localizacao','')),''),minimo,
   cat,nullif(upper(trim(coalesce(p_dados->>'embalagem',''))),''),emb,coalesce((p_dados->>'controla_lote')::boolean,false),preco,auth.uid())
  returning * into r;
 else
  update public.oficina_produtos set codigo_barras=coalesce(barras,case when p_dados ? 'codigo_barras' then null else codigo_barras end),
   codigo_interno=case when p_dados ? 'codigo_interno' then interno else codigo_interno end,descricao=trim(p_dados->>'descricao'),
   unidade=upper(coalesce(nullif(trim(p_dados->>'unidade'),''),unidade)),marca=case when p_dados ? 'marca' then nullif(trim(p_dados->>'marca'),'') else marca end,
   aplicacao=case when p_dados ? 'aplicacao' then nullif(trim(p_dados->>'aplicacao'),'') else aplicacao end,
   localizacao=case when p_dados ? 'localizacao' then nullif(trim(p_dados->>'localizacao'),'') else localizacao end,
   estoque_minimo=case when p_dados ? 'estoque_minimo' then minimo else estoque_minimo end,ativo=coalesce((p_dados->>'ativo')::boolean,ativo),
   categoria=cat,embalagem=case when p_dados ? 'embalagem' then nullif(upper(trim(p_dados->>'embalagem')),'') else embalagem end,qtd_embalagem=emb,
   controla_lote=coalesce((p_dados->>'controla_lote')::boolean,controla_lote),preco_venda=preco
  where id=p_id and empresa_id=p_empresa returning * into r;
 end if;
 return to_jsonb(r);
end $$;

-- ===================== Entrada com lote =====================
-- Itens: [{produto_id, quantidade (em unidades), custo_unitario, lote}]
drop function if exists public.oficina_entrada(uuid,uuid,jsonb,text,text,text);
create or replace function public.oficina_entrada(p_empresa uuid,p_operacao uuid,p_itens jsonb,p_documento text default null,p_fornecedor text default null,p_observacao text default null,p_operador uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.oficina_operacoes; pedido jsonb; item jsonb; p public.oficina_produtos; qtd numeric; custo numeric; v_lote text; vistos text[]:='{}'; saida jsonb:='[]'; v_operador text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 300
 or length(coalesce(p_documento,''))>100 or length(coalesce(p_fornecedor,''))>200 or length(coalesce(p_observacao,''))>1000 then
  raise exception 'Confira os itens da entrada.';
 end if;
 pedido:=jsonb_build_object('itens',p_itens,'documento',p_documento,'fornecedor',p_fornecedor,'observacao',p_observacao)||case when p_operador is null then '{}'::jsonb else jsonb_build_object('operador',p_operador) end;
 v_operador:=public.oficina_operador_nome(p_empresa,p_operador);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into anterior from public.oficina_operacoes where id=p_operacao;
 if found then
  if anterior.tipo<>'entrada' or anterior.pedido<>pedido or anterior.criado_por<>auth.uid() then raise exception 'Operação já utilizada com outros dados.'; end if;
  return anterior.resultado;
 end if;
 for item in select value from jsonb_array_elements(p_itens) order by value->>'produto_id' loop
  qtd:=(item->>'quantidade')::numeric; custo:=nullif(item->>'custo_unitario','')::numeric; v_lote:=nullif(trim(coalesce(item->>'lote','')),'');
  if not public.oficina_numero(qtd,0.001) then raise exception 'Quantidade inválida.'; end if;
  if custo is not null and not public.oficina_numero(custo) then raise exception 'Custo inválido.'; end if;
  if length(coalesce(v_lote,''))>60 then raise exception 'Lote muito longo.'; end if;
  select * into p from public.oficina_produtos where id=(item->>'produto_id')::uuid and empresa_id=p_empresa for update;
  if p.id is null then raise exception 'Item não encontrado nesta empresa.'; end if;
  if p.controla_lote and v_lote is null then raise exception 'Informe o lote de %.',p.descricao; end if;
  -- O mesmo item pode entrar em lotes diferentes na mesma operação, mas não repetido no mesmo lote.
  if (p.id::text||'|'||coalesce(v_lote,''))=any(vistos) then raise exception 'O item % aparece duas vezes no mesmo lote. Junte as quantidades.',p.descricao; end if;
  vistos:=array_append(vistos,p.id::text||'|'||coalesce(v_lote,''));
  update public.oficina_produtos set saldo=saldo+qtd,
   custo_medio=case when custo is null then custo_medio else round((saldo*custo_medio+qtd*custo)/(saldo+qtd),4) end
  where id=p.id returning * into p;
  insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,documento,fornecedor,observacao,lote,operacao_id,criado_por,operador_id,operador_nome)
  values(p_empresa,p.id,'entrada',qtd,p.saldo,custo,nullif(trim(coalesce(p_documento,'')),''),nullif(trim(coalesce(p_fornecedor,'')),''),nullif(trim(coalesce(p_observacao,'')),''),v_lote,p_operacao,auth.uid(),p_operador,v_operador);
  saida:=saida||jsonb_build_array(jsonb_build_object('produto_id',p.id,'descricao',p.descricao,'quantidade',qtd,'saldo',p.saldo,'lote',v_lote));
 end loop;
 insert into public.oficina_operacoes(id,empresa_id,tipo,pedido,resultado,criado_por) values(p_operacao,p_empresa,'entrada',pedido,saida,auth.uid());
 return saida;
end $$;

-- A nota fiscal também leva o lote de cada item (quando vier no XML ou for digitado).
do $$ declare def text; begin
 def:=pg_get_functiondef('public.oficina_nota_importar(uuid,uuid,jsonb,jsonb)'::regprocedure);
 if position('''lote''' in def)=0 then
  execute replace(def,'jsonb_build_object(''produto_id'',x->>''produto_id'',''quantidade'',x->''quantidade'',''custo_unitario'',x->''custo_unitario'')',
   'jsonb_build_object(''produto_id'',x->>''produto_id'',''quantidade'',x->''quantidade'',''custo_unitario'',x->''custo_unitario'',''lote'',x->>''lote'')');
 end if;
end $$;

-- ===================== Saída sem carro =====================
-- Uso e consumo, construção em andamento, revenda ou perda/descarte. Itens: [{produto_id, quantidade, valor_venda}]
create or replace function public.oficina_saida_avulsa(p_empresa uuid,p_operacao uuid,p_destino text,p_descricao text,p_itens jsonb,p_operador uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.oficina_operacoes; pedido jsonb; item jsonb; p public.oficina_produtos; qtd numeric; venda numeric; vistos uuid[]:='{}'; saida jsonb:='[]'; v_operador text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_destino not in ('uso_consumo','obra','revenda','perda') then raise exception 'Escolha para onde vai: uso e consumo, construção em andamento, revenda ou perda.'; end if;
 if length(trim(coalesce(p_descricao,''))) not between 3 and 300 then
  raise exception '%',case p_destino when 'obra' then 'Informe qual obra ou construção.' when 'revenda' then 'Informe para quem foi vendido.' when 'perda' then 'Explique a perda ou o descarte.' else 'Informe o setor ou o uso.' end;
 end if;
 if p_operacao is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 300 then raise exception 'Confira os itens da saída.'; end if;
 pedido:=jsonb_build_object('destino',p_destino,'descricao',trim(p_descricao),'itens',p_itens)||case when p_operador is null then '{}'::jsonb else jsonb_build_object('operador',p_operador) end;
 v_operador:=public.oficina_operador_nome(p_empresa,p_operador);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into anterior from public.oficina_operacoes where id=p_operacao;
 if found then
  if anterior.tipo<>'saida_avulsa' or anterior.pedido<>pedido or anterior.criado_por<>auth.uid() then raise exception 'Operação já utilizada com outros dados.'; end if;
  return anterior.resultado;
 end if;
 for item in select value from jsonb_array_elements(p_itens) order by value->>'produto_id' loop
  qtd:=(item->>'quantidade')::numeric; venda:=nullif(item->>'valor_venda','')::numeric;
  if not public.oficina_numero(qtd,0.001) then raise exception 'Quantidade inválida.'; end if;
  if venda is not null and (venda<0 or venda<>round(venda,2)) then raise exception 'Valor de venda inválido.'; end if;
  select * into p from public.oficina_produtos where id=(item->>'produto_id')::uuid and empresa_id=p_empresa for update;
  if p.id is null then raise exception 'Item não encontrado nesta empresa.'; end if;
  if p.id=any(vistos) then raise exception 'O item % aparece duas vezes. Junte as quantidades.',p.descricao; end if;
  vistos:=array_append(vistos,p.id);
  if p.saldo<qtd then raise exception 'Estoque insuficiente de %: tem %, pediu %.',p.descricao,trim(to_char(p.saldo,'FM999999990.###')),trim(to_char(qtd,'FM999999990.###')); end if;
  if p_destino='revenda' then venda:=coalesce(venda,p.preco_venda); end if;
  update public.oficina_produtos set saldo=saldo-qtd where id=p.id returning * into p;
  insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,destino,destino_descricao,valor_venda,observacao,operacao_id,criado_por,operador_id,operador_nome)
  values(p_empresa,p.id,'saida',-qtd,p.saldo,p.custo_medio,p_destino,trim(p_descricao),case when p_destino='revenda' then venda end,trim(p_descricao),p_operacao,auth.uid(),p_operador,v_operador);
  saida:=saida||jsonb_build_array(jsonb_build_object('produto_id',p.id,'descricao',p.descricao,'quantidade',qtd,'saldo',p.saldo));
 end loop;
 insert into public.oficina_operacoes(id,empresa_id,tipo,pedido,resultado,criado_por) values(p_operacao,p_empresa,'saida_avulsa',pedido,saida,auth.uid());
 return saida;
end $$;
revoke all on function public.oficina_saida_avulsa(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.oficina_saida_avulsa(uuid,uuid,text,text,jsonb,uuid) to authenticated;
revoke all on function public.oficina_entrada(uuid,uuid,jsonb,text,text,text,uuid) from public,anon;
grant execute on function public.oficina_entrada(uuid,uuid,jsonb,text,text,text,uuid) to authenticated;

-- ===================== Saída para carro com o funcionário =====================
drop function if exists public.oficina_saida(uuid,uuid,uuid,jsonb,text);
create or replace function public.oficina_saida(p_empresa uuid,p_operacao uuid,p_manutencao uuid,p_itens jsonb,p_observacao text default null,p_operador uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.oficina_operacoes; pedido jsonb; item jsonb; p public.oficina_produtos; m public.oficina_manutencoes; qtd numeric; nat text; vistos uuid[]:='{}'; saida jsonb:='[]'; v_operador text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 300 or length(coalesce(p_observacao,''))>1000 then
  raise exception 'Confira os itens da saída.';
 end if;
 pedido:=jsonb_build_object('manutencao',p_manutencao,'itens',p_itens,'observacao',p_observacao)||case when p_operador is null then '{}'::jsonb else jsonb_build_object('operador',p_operador) end;
 v_operador:=public.oficina_operador_nome(p_empresa,p_operador);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into anterior from public.oficina_operacoes where id=p_operacao;
 if found then
  if anterior.tipo<>'saida' or anterior.pedido<>pedido or anterior.criado_por<>auth.uid() then raise exception 'Operação já utilizada com outros dados.'; end if;
  return anterior.resultado;
 end if;
 if length(trim(coalesce(p_observacao,'')))<3 then raise exception 'Informe o motivo da retirada (por que a peça saiu).'; end if;
 m:=public.oficina_manutencao_editavel(p_empresa,p_manutencao);
 for item in select value from jsonb_array_elements(p_itens) order by value->>'produto_id' loop
  qtd:=(item->>'quantidade')::numeric; nat:=coalesce(nullif(item->>'natureza',''),m.tipo);
  if not public.oficina_numero(qtd,0.001) then raise exception 'Quantidade inválida.'; end if;
  if nat not in ('corretiva','preventiva') then raise exception 'Informe se a peça é para manutenção corretiva ou preventiva.'; end if;
  select * into p from public.oficina_produtos where id=(item->>'produto_id')::uuid and empresa_id=p_empresa for update;
  if p.id is null then raise exception 'Peça não encontrada nesta empresa.'; end if;
  if p.id=any(vistos) then raise exception 'A peça % aparece duas vezes. Junte as quantidades.',p.descricao; end if;
  vistos:=array_append(vistos,p.id);
  if p.saldo<qtd then raise exception 'Estoque insuficiente de %: tem %, pediu %.',p.descricao,trim(to_char(p.saldo,'FM999999990.###')),trim(to_char(qtd,'FM999999990.###')); end if;
  update public.oficina_produtos set saldo=saldo-qtd where id=p.id returning * into p;
  insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,manutencao_id,carro_id,placa,natureza,observacao,operacao_id,criado_por,operador_id,operador_nome)
  values(p_empresa,p.id,'saida',-qtd,p.saldo,p.custo_medio,m.id,m.carro_id,m.placa,nat,trim(p_observacao),p_operacao,auth.uid(),p_operador,v_operador);
  saida:=saida||jsonb_build_array(jsonb_build_object('movimento_id',(select x.id from public.oficina_movimentos x where x.operacao_id=p_operacao and x.produto_id=p.id),'produto_id',p.id,'descricao',p.descricao,'quantidade',qtd,'saldo',p.saldo,'natureza',nat));
 end loop;
 insert into public.oficina_operacoes(id,empresa_id,tipo,pedido,resultado,criado_por) values(p_operacao,p_empresa,'saida',pedido,saida,auth.uid());
 return saida;
end $$;
revoke all on function public.oficina_saida(uuid,uuid,uuid,jsonb,text,uuid) from public,anon;
grant execute on function public.oficina_saida(uuid,uuid,uuid,jsonb,text,uuid) to authenticated;

-- ===================== Relatório de movimentos =====================
create or replace function public.oficina_movimentos_relatorio(p_empresa uuid,p_de date,p_ate date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_de is null or p_ate is null or p_ate<p_de or p_ate-p_de>400 then raise exception 'Escolha um período de até 400 dias.'; end if;
 return coalesce((select jsonb_agg(q order by (q->>'criado_em') desc) from (
  select jsonb_build_object('id',x.id,'criado_em',x.criado_em,'tipo',x.tipo,
   'destino',coalesce(x.destino,case when x.tipo='saida' and x.manutencao_id is not null then 'manutencao' end),
   'destino_descricao',x.destino_descricao,'produto',p.descricao,'categoria',p.categoria,'unidade',p.unidade,'codigo',coalesce(p.codigo_barras,p.codigo_interno),
   'quantidade',x.quantidade,'saldo_depois',x.saldo_depois,'custo_unitario',x.custo_unitario,'valor',round(abs(x.quantidade)*coalesce(x.custo_unitario,0),2),'valor_venda',x.valor_venda,
   'lote',x.lote,'documento',x.documento,'fornecedor',x.fornecedor,'observacao',x.observacao,'natureza',x.natureza,'placa',x.placa,'manutencao',m.numero,
   'operador',x.operador_nome,'usuario',(select u.nome from public.usuarios_empresa u where u.auth_user_id=x.criado_por and u.empresa_id=p_empresa limit 1)) q
  from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id left join public.oficina_manutencoes m on m.id=x.manutencao_id
  where x.empresa_id=p_empresa and (x.criado_em at time zone 'America/Manaus')::date between p_de and p_ate
  order by x.criado_em desc limit 5000) z),'[]'::jsonb);
end $$;
revoke all on function public.oficina_movimentos_relatorio(uuid,date,date) from public,anon;
grant execute on function public.oficina_movimentos_relatorio(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Estoque com cadastro completo, lote, saídas sem carro e relatório de movimentos.' as resultado;
