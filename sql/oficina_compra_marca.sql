-- SQL Editor, papel postgres. Rode depois de oficina_estoque_fluxo.sql.
-- Compra de cada item: preço que pagou, fornecedor, nota e marca.
-- 1. Cada entrada (balcão, entrada manual ou nota fiscal XML) passa a guardar a marca do item.
-- 2. O item lembra a última compra: preço pago por unidade, fornecedor, nota e data.
--    A marca informada na entrada atualiza a marca do item.
-- 3. Os itens que já têm entradas recebem a última compra a partir do histórico.
-- Não altera nem apaga movimentos existentes (o livro do estoque continua imutável).
begin;
alter table public.oficina_movimentos add column if not exists marca text;
alter table public.oficina_produtos add column if not exists ultimo_custo numeric(12,4);
alter table public.oficina_produtos add column if not exists ultimo_fornecedor text;
alter table public.oficina_produtos add column if not exists ultimo_documento text;
alter table public.oficina_produtos add column if not exists ultima_compra_em timestamptz;

do $$
declare def text;
begin
 -- Entrada: grava a marca de cada item.
 def:=pg_get_functiondef('public.oficina_entrada(uuid,uuid,jsonb,text,text,text,uuid)'::regprocedure);
 if position('''marca''' in def)=0 then
  def:=replace(def,'operador_id,operador_nome,embalagens,custo_embalagem)','operador_id,operador_nome,embalagens,custo_embalagem,marca)');
  def:=replace(def,'nullif(item->>''custo_embalagem'','''')::numeric);','nullif(item->>''custo_embalagem'','''')::numeric,left(nullif(trim(coalesce(item->>''marca'','''')),''''),80));');
  if position('''marca''' in def)=0 then raise exception 'Não consegui atualizar a entrada. Confira se oficina_estoque_fluxo.sql foi aplicado.'; end if;
  execute def;
 end if;
 -- Nota fiscal: repassa a marca de cada item para a entrada.
 def:=pg_get_functiondef('public.oficina_nota_importar(uuid,uuid,jsonb,jsonb)'::regprocedure);
 if position('''marca''' in def)=0 then
  def:=replace(def,'''lote'',x->>''lote'')','''lote'',x->>''lote'',''marca'',x->>''marca'')');
  if position('''marca''' in def)=0 then raise exception 'Não consegui atualizar a nota fiscal. Confira se oficina_cadastro_movimentos.sql foi aplicado.'; end if;
  execute def;
 end if;
 -- Relatório de movimentos mostra a marca.
 def:=pg_get_functiondef('public.oficina_movimentos_relatorio(uuid,date,date)'::regprocedure);
 if position('''marca''' in def)=0 then
  def:=replace(def,'''operador'',x.operador_nome,','''operador'',x.operador_nome,''marca'',x.marca,');
  if position('''marca''' in def)=0 then raise exception 'Não consegui atualizar o relatório de movimentos.'; end if;
  execute def;
 end if;
end $$;

-- Cada entrada atualiza a última compra do item (e a marca, quando vier).
create or replace function public.oficina_produto_ultima_compra() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='entrada' then
  update public.oficina_produtos set
   ultimo_custo=coalesce(new.custo_unitario,ultimo_custo),
   ultimo_fornecedor=coalesce(new.fornecedor,ultimo_fornecedor),
   ultimo_documento=coalesce(new.documento,ultimo_documento),
   ultima_compra_em=new.criado_em,
   marca=coalesce(new.marca,marca)
  where id=new.produto_id;
 end if;
 return new;
end $$;
revoke all on function public.oficina_produto_ultima_compra() from public,anon,authenticated;
drop trigger if exists oficina_produto_ultima_compra on public.oficina_movimentos;
create trigger oficina_produto_ultima_compra after insert on public.oficina_movimentos for each row execute function public.oficina_produto_ultima_compra();

-- Itens que já têm entradas: última compra a partir do histórico.
update public.oficina_produtos p set ultimo_custo=u.custo,ultimo_fornecedor=u.fornecedor,ultimo_documento=u.documento,ultima_compra_em=u.criado_em
from (select distinct on (x.produto_id) x.produto_id,x.criado_em,
  (select y.custo_unitario from public.oficina_movimentos y where y.produto_id=x.produto_id and y.tipo='entrada' and y.custo_unitario is not null order by y.criado_em desc limit 1) custo,
  (select y.fornecedor from public.oficina_movimentos y where y.produto_id=x.produto_id and y.tipo='entrada' and y.fornecedor is not null order by y.criado_em desc limit 1) fornecedor,
  (select y.documento from public.oficina_movimentos y where y.produto_id=x.produto_id and y.tipo='entrada' and y.documento is not null order by y.criado_em desc limit 1) documento
 from public.oficina_movimentos x where x.tipo='entrada' order by x.produto_id,x.criado_em desc) u
where p.id=u.produto_id and p.ultima_compra_em is null;

notify pgrst,'reload schema';
commit;
select 'Compra pronta: cada entrada guarda a marca e o item mostra o último preço pago, o fornecedor e a nota.' as resultado;
