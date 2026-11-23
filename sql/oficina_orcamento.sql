-- SQL Editor, papel postgres. Rode depois de oficina_estoque.sql.
-- Oficina, etapa 2:
-- 1. Locatário responsável pela manutenção: o ocupante atual do carro (mesmo que deixe o carro na oficina sem substituto).
-- 2. Rateio por peça/serviço: corretiva 50% locatário / 50% empresa; preventiva 100% empresa (configurável por empresa).
-- 3. Serviços (internos ou de fora) lançados na manutenção, com catálogo nas 10 categorias.
-- 4. Importação de nota fiscal (NF-e): itens entram no estoque, sem importar a mesma nota duas vezes.
-- 5. Orçamento da manutenção e cobrança da parte do locatário no financeiro dele.
-- Não altera dados existentes.
begin;
-- ===================== Rateio =====================
create table if not exists public.oficina_regras_rateio(
 empresa_id uuid primary key references public.empresas(id),
 corretiva_locatario numeric(5,2) not null default 50 check(corretiva_locatario between 0 and 100),
 preventiva_locatario numeric(5,2) not null default 0 check(preventiva_locatario between 0 and 100),
 alterado_por uuid, alterado_em timestamptz not null default now()
);
create or replace function public.oficina_rateio(p_empresa uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('corretiva',coalesce((select corretiva_locatario from public.oficina_regras_rateio where empresa_id=p_empresa),50),
  'preventiva',coalesce((select preventiva_locatario from public.oficina_regras_rateio where empresa_id=p_empresa),0))
$$;
revoke all on function public.oficina_rateio(uuid) from public,anon,authenticated;
create or replace function public.oficina_rateio_salvar(p_empresa uuid,p_corretiva numeric,p_preventiva numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador muda o rateio.'; end if;
 if p_corretiva is null or p_preventiva is null or p_corretiva not between 0 and 100 or p_preventiva not between 0 and 100 then raise exception 'Informe percentuais entre 0 e 100.'; end if;
 insert into public.oficina_regras_rateio(empresa_id,corretiva_locatario,preventiva_locatario,alterado_por) values(p_empresa,p_corretiva,p_preventiva,auth.uid())
 on conflict(empresa_id) do update set corretiva_locatario=excluded.corretiva_locatario,preventiva_locatario=excluded.preventiva_locatario,alterado_por=excluded.alterado_por,alterado_em=now();
 return public.oficina_rateio(p_empresa);
end $$;
revoke all on function public.oficina_rateio_salvar(uuid,numeric,numeric) from public,anon;
grant execute on function public.oficina_rateio_salvar(uuid,numeric,numeric) to authenticated;

-- ===================== Locatário responsável =====================
alter table public.oficina_manutencoes add column if not exists responsavel_cliente_id uuid references public.clientes(id);
alter table public.oficina_manutencoes add column if not exists responsavel_nome text;
alter table public.oficina_manutencoes add column if not exists responsavel_empresa_id uuid references public.empresas(id);
alter table public.oficina_manutencoes add column if not exists cobranca_debito_id uuid;
alter table public.oficina_manutencoes add column if not exists cobrada_em timestamptz;

-- Ocupante atual do carro: contrato ativo, ocupação da frota ou levantamento.
create or replace function public.oficina_ocupante(p_carro uuid)
returns table(cliente_id uuid,nome text,empresa_id uuid)
language sql stable security definer set search_path='' as $$
 select q.cliente_id,c.nome_completo,c.empresa_id from (
  (select l.cliente_id,1 o from public.locacoes l where l.carro_id=p_carro and l.status='Ativa' order by l.data_inicio desc limit 1)
  union all (select p.cliente_id,2 from public.frota_periodos p where p.carro_id=p_carro and p.tipo='locacao' and p.fim is null and p.cliente_id is not null order by p.inicio desc limit 1)
  union all (select f.cliente_id,3 from public.frota_levantamento f where f.carro_id=p_carro and f.ativo and f.cliente_id is not null order by f.inicio desc nulls last limit 1)
 ) q join public.clientes c on c.id=q.cliente_id order by q.o limit 1
$$;
revoke all on function public.oficina_ocupante(uuid) from public,anon,authenticated;

create or replace function public.oficina_manutencao_definir_ocupante() returns trigger
language plpgsql security definer set search_path='' as $$
declare o record;
begin
 if new.carro_id is not null and new.responsavel_cliente_id is null then
  select * into o from public.oficina_ocupante(new.carro_id);
  new.responsavel_cliente_id:=o.cliente_id; new.responsavel_nome:=o.nome; new.responsavel_empresa_id:=o.empresa_id;
 end if;
 return new;
end $$;
drop trigger if exists oficina_manutencao_ocupante on public.oficina_manutencoes;
create trigger oficina_manutencao_ocupante before insert on public.oficina_manutencoes for each row execute function public.oficina_manutencao_definir_ocupante();

-- Sugestões de responsável: ocupante atual e locatários recentes do carro.
create or replace function public.oficina_responsaveis_sugeridos(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.oficina_manutencoes;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('cliente_id',x.cliente_id,'nome',c.nome_completo,'ultimo',x.ultimo,'atual',x.atual) order by x.atual desc,x.ultimo desc) from (
  select cliente_id,max(ultimo) ultimo,bool_or(atual) atual from (
   select l.cliente_id,coalesce(l.data_fim,now()) ultimo,(l.status='Ativa') atual from public.locacoes l where l.carro_id=m.carro_id
   union all select p.cliente_id,coalesce(p.fim,now()),(p.fim is null) from public.frota_periodos p where p.carro_id=m.carro_id and p.tipo='locacao' and p.cliente_id is not null
   union all select f.cliente_id,now(),f.ativo from public.frota_levantamento f where f.carro_id=m.carro_id and f.cliente_id is not null
  ) y where cliente_id is not null group by cliente_id order by bool_or(atual) desc,max(ultimo) desc limit 6) x
  join public.clientes c on c.id=x.cliente_id),'[]'::jsonb);
end $$;
revoke all on function public.oficina_responsaveis_sugeridos(uuid,uuid) from public,anon;
grant execute on function public.oficina_responsaveis_sugeridos(uuid,uuid) to authenticated;

-- Troca o responsável (ou deixa sem locatário: empresa paga tudo). Bloqueado depois da cobrança.
create or replace function public.oficina_manutencao_responsavel(p_empresa uuid,p_manutencao uuid,p_cliente uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; c public.clientes;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário.',m.numero; end if;
 if p_cliente is not null then
  select * into c from public.clientes where id=p_cliente;
  if c.id is null or not (c.empresa_id=p_empresa or coalesce(public.acesso_modulo(c.empresa_id,'locacao'),false)) then raise exception 'Locatário não encontrado.'; end if;
 end if;
 update public.oficina_manutencoes set responsavel_cliente_id=c.id,responsavel_nome=c.nome_completo,responsavel_empresa_id=c.empresa_id where id=m.id returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.oficina_manutencao_responsavel(uuid,uuid,uuid) from public,anon;
grant execute on function public.oficina_manutencao_responsavel(uuid,uuid,uuid) to authenticated;

-- ===================== Serviços =====================
create table if not exists public.oficina_servicos(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 descricao text not null check(length(trim(descricao)) between 2 and 200),
 categoria text not null check(categoria in ('mecanica','eletrica','ar_condicionado','suspensao','motor','lavagem','higienizacao','lanternagem','pintura','polimento')),
 valor_padrao numeric(12,2) not null default 0 check(valor_padrao>=0), ativo boolean not null default true,
 criado_por uuid, criado_em timestamptz not null default now()
);
create table if not exists public.oficina_manutencao_servicos(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 manutencao_id uuid not null references public.oficina_manutencoes(id), servico_id uuid references public.oficina_servicos(id),
 descricao text not null, categoria text not null, natureza text not null check(natureza in ('corretiva','preventiva')),
 quantidade numeric(12,3) not null default 1 check(quantidade>0), valor_unitario numeric(12,2) not null check(valor_unitario>=0),
 externo boolean not null default false, fornecedor text, documento text, observacao text,
 operacao_id uuid not null unique, removido_em timestamptz, removido_por uuid, criado_por uuid, criado_em timestamptz not null default now()
);
create index if not exists oficina_manutencao_servicos_m on public.oficina_manutencao_servicos(manutencao_id);
do $$ declare t text; begin
 foreach t in array array['oficina_regras_rateio','oficina_servicos','oficina_manutencao_servicos'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists %I on public.%I',t||'_leitura',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.oficina_acesso(empresa_id))',t||'_leitura',t);
 end loop;
end $$;

create or replace function public.oficina_servico_salvar(p_empresa uuid,p_id uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_servicos; valor numeric:=coalesce(nullif(p_dados->>'valor_padrao','')::numeric,0);
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if length(trim(coalesce(p_dados->>'descricao',''))) not between 2 and 200 then raise exception 'Informe a descrição do serviço.'; end if;
 if valor<0 or valor<>round(valor,2) then raise exception 'Valor inválido.'; end if;
 if p_id is null then
  insert into public.oficina_servicos(empresa_id,descricao,categoria,valor_padrao,criado_por) values(p_empresa,trim(p_dados->>'descricao'),p_dados->>'categoria',valor,auth.uid()) returning * into r;
 else
  update public.oficina_servicos set descricao=trim(p_dados->>'descricao'),categoria=p_dados->>'categoria',valor_padrao=valor,ativo=coalesce((p_dados->>'ativo')::boolean,ativo)
  where id=p_id and empresa_id=p_empresa returning * into r;
  if r.id is null then raise exception 'Serviço não encontrado.'; end if;
 end if;
 return to_jsonb(r);
exception when check_violation then raise exception 'Escolha uma das categorias de serviço.';
end $$;
revoke all on function public.oficina_servico_salvar(uuid,uuid,jsonb) from public,anon;
grant execute on function public.oficina_servico_salvar(uuid,uuid,jsonb) to authenticated;

-- Manutenção aceita lançamentos enquanto aberta e não cobrada.
create or replace function public.oficina_manutencao_editavel(p_empresa uuid,p_manutencao uuid)
returns public.oficina_manutencoes language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes;
begin
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Escolha a manutenção (o carro).'; end if;
 if m.status not in ('aberta','aguardando_pecas') then raise exception 'A manutenção % já foi encerrada.',m.numero; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário. Não aceita novos lançamentos.',m.numero; end if;
 return m;
end $$;
revoke all on function public.oficina_manutencao_editavel(uuid,uuid) from public,anon,authenticated;

create or replace function public.oficina_servico_lancar(p_empresa uuid,p_operacao uuid,p_manutencao uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_manutencao_servicos; m public.oficina_manutencoes; s public.oficina_servicos; qtd numeric:=coalesce(nullif(p_dados->>'quantidade','')::numeric,1); valor numeric:=nullif(p_dados->>'valor_unitario','')::numeric; nat text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null then raise exception 'Operação inválida.'; end if;
 select * into r from public.oficina_manutencao_servicos where operacao_id=p_operacao;
 if r.id is not null then return to_jsonb(r); end if;
 m:=public.oficina_manutencao_editavel(p_empresa,p_manutencao);
 if nullif(p_dados->>'servico_id','') is not null then
  select * into s from public.oficina_servicos where id=(p_dados->>'servico_id')::uuid and empresa_id=p_empresa and ativo;
  if s.id is null then raise exception 'Serviço não encontrado no catálogo.'; end if;
 end if;
 nat:=coalesce(nullif(p_dados->>'natureza',''),m.tipo);
 if nat not in ('corretiva','preventiva') then raise exception 'Informe se o serviço é corretivo ou preventivo.'; end if;
 valor:=coalesce(valor,s.valor_padrao);
 if valor is null or valor<0 or valor<>round(valor,2) or not public.oficina_numero(qtd,0.001) then raise exception 'Confira quantidade e valor do serviço.'; end if;
 if length(trim(coalesce(p_dados->>'descricao',s.descricao,''))) <2 then raise exception 'Informe a descrição do serviço.'; end if;
 if coalesce((p_dados->>'externo')::boolean,false) and length(trim(coalesce(p_dados->>'fornecedor','')))<2 then raise exception 'Informe quem fez o serviço de fora.'; end if;
 insert into public.oficina_manutencao_servicos(empresa_id,manutencao_id,servico_id,descricao,categoria,natureza,quantidade,valor_unitario,externo,fornecedor,documento,observacao,operacao_id,criado_por)
 values(p_empresa,m.id,s.id,trim(coalesce(nullif(p_dados->>'descricao',''),s.descricao)),coalesce(nullif(p_dados->>'categoria',''),s.categoria,'mecanica'),nat,qtd,valor,
  coalesce((p_dados->>'externo')::boolean,false),nullif(trim(coalesce(p_dados->>'fornecedor','')),''),nullif(trim(coalesce(p_dados->>'documento','')),''),nullif(trim(coalesce(p_dados->>'observacao','')),''),p_operacao,auth.uid())
 returning * into r;
 return to_jsonb(r);
exception when check_violation then raise exception 'Escolha uma das categorias de serviço.';
end $$;
revoke all on function public.oficina_servico_lancar(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.oficina_servico_lancar(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.oficina_servico_remover(p_empresa uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.oficina_manutencao_servicos;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into r from public.oficina_manutencao_servicos where id=p_id and empresa_id=p_empresa and removido_em is null;
 if r.id is null then raise exception 'Serviço não encontrado.'; end if;
 perform public.oficina_manutencao_editavel(p_empresa,r.manutencao_id);
 update public.oficina_manutencao_servicos set removido_em=now(),removido_por=auth.uid() where id=r.id;
end $$;
revoke all on function public.oficina_servico_remover(uuid,uuid) from public,anon;
grant execute on function public.oficina_servico_remover(uuid,uuid) to authenticated;

-- Saída de peças: agora exige o motivo e não aceita manutenção já cobrada.
create or replace function public.oficina_saida(p_empresa uuid,p_operacao uuid,p_manutencao uuid,p_itens jsonb,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.oficina_operacoes; pedido jsonb; item jsonb; p public.oficina_produtos; m public.oficina_manutencoes; qtd numeric; nat text; vistos uuid[]:='{}'; saida jsonb:='[]';
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 300 or length(coalesce(p_observacao,''))>1000 then
  raise exception 'Confira os itens da saída.';
 end if;
 pedido:=jsonb_build_object('manutencao',p_manutencao,'itens',p_itens,'observacao',p_observacao);
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
  insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,manutencao_id,carro_id,placa,natureza,observacao,operacao_id,criado_por)
  values(p_empresa,p.id,'saida',-qtd,p.saldo,p.custo_medio,m.id,m.carro_id,m.placa,nat,trim(p_observacao),p_operacao,auth.uid());
  saida:=saida||jsonb_build_array(jsonb_build_object('movimento_id',(select x.id from public.oficina_movimentos x where x.operacao_id=p_operacao and x.produto_id=p.id),'produto_id',p.id,'descricao',p.descricao,'quantidade',qtd,'saldo',p.saldo,'natureza',nat));
 end loop;
 insert into public.oficina_operacoes(id,empresa_id,tipo,pedido,resultado,criado_por) values(p_operacao,p_empresa,'saida',pedido,saida,auth.uid());
 return saida;
end $$;

-- ===================== Nota fiscal =====================
create table if not exists public.oficina_notas(
 id uuid primary key, empresa_id uuid not null references public.empresas(id), chave text, numero text, serie text,
 emitente_cnpj text, emitente_nome text, emissao date, valor_total numeric(14,2), itens jsonb not null,
 criado_por uuid not null, criado_em timestamptz not null default now()
);
create unique index if not exists oficina_notas_chave on public.oficina_notas(empresa_id,chave) where chave is not null;
-- Código do item na nota de cada fornecedor → peça do estoque (aprende na primeira importação).
create table if not exists public.oficina_produto_fornecedor(
 empresa_id uuid not null references public.empresas(id), emitente_cnpj text not null, codigo_fornecedor text not null,
 produto_id uuid not null references public.oficina_produtos(id), atualizado_em timestamptz not null default now(),
 primary key(empresa_id,emitente_cnpj,codigo_fornecedor)
);
do $$ declare t text; begin
 foreach t in array array['oficina_notas','oficina_produto_fornecedor'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists %I on public.%I',t||'_leitura',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.oficina_acesso(empresa_id))',t||'_leitura',t);
 end loop;
end $$;

-- Antes de importar: a nota já entrou? Quais itens o sistema já conhece deste fornecedor?
create or replace function public.oficina_nota_conferir(p_empresa uuid,p_chave text,p_cnpj text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return jsonb_build_object(
  'importada',(select jsonb_build_object('numero',n.numero,'criado_em',n.criado_em) from public.oficina_notas n where n.empresa_id=p_empresa and n.chave=nullif(trim(coalesce(p_chave,'')),'')),
  'codigos',coalesce((select jsonb_object_agg(f.codigo_fornecedor,f.produto_id) from public.oficina_produto_fornecedor f where f.empresa_id=p_empresa and f.emitente_cnpj=regexp_replace(coalesce(p_cnpj,''),'\D','','g')),'{}'::jsonb));
end $$;
revoke all on function public.oficina_nota_conferir(uuid,text,text) from public,anon;
grant execute on function public.oficina_nota_conferir(uuid,text,text) to authenticated;

-- Importa a nota: [{produto_id, quantidade, custo_unitario, codigo_fornecedor}] → entrada no estoque.
create or replace function public.oficina_nota_importar(p_empresa uuid,p_operacao uuid,p_nota jsonb,p_itens jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existente public.oficina_notas; v_chave text:=nullif(regexp_replace(coalesce(p_nota->>'chave',''),'\D','','g'),''); cnpj text:=regexp_replace(coalesce(p_nota->>'emitente_cnpj',''),'\D','','g'); v_resultado jsonb; item jsonb;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null or p_nota is null or v_chave is null or length(v_chave)<>44 then raise exception 'Nota fiscal sem chave de acesso válida.'; end if;
 select * into existente from public.oficina_notas where id=p_operacao;
 if existente.id is not null then return (select o.resultado from public.oficina_operacoes o where o.id=p_operacao); end if;
 perform pg_advisory_xact_lock(hashtextextended('nf'||p_empresa::text||v_chave,0));
 select * into existente from public.oficina_notas where empresa_id=p_empresa and oficina_notas.chave=v_chave;
 if existente.id is not null then raise exception 'A nota % já foi importada em %.',existente.numero,to_char(existente.criado_em at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'); end if;
 v_resultado:=public.oficina_entrada(p_empresa,p_operacao,(select jsonb_agg(jsonb_build_object('produto_id',x->>'produto_id','quantidade',x->'quantidade','custo_unitario',x->'custo_unitario')) from jsonb_array_elements(p_itens) x),
  'NF '||coalesce(p_nota->>'numero','')||coalesce(' série '||nullif(p_nota->>'serie',''),''),nullif(p_nota->>'emitente_nome',''),'Chave '||v_chave);
 insert into public.oficina_notas(id,empresa_id,chave,numero,serie,emitente_cnpj,emitente_nome,emissao,valor_total,itens,criado_por)
 values(p_operacao,p_empresa,v_chave,p_nota->>'numero',p_nota->>'serie',nullif(cnpj,''),p_nota->>'emitente_nome',nullif(p_nota->>'emissao','')::date,nullif(p_nota->>'valor_total','')::numeric,p_itens,auth.uid());
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

-- ===================== Orçamento e cobrança =====================
create or replace function public.oficina_orcamento(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.oficina_manutencoes; r jsonb:=public.oficina_rateio(p_empresa); linhas jsonb; tem boolean;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 tem:=m.responsavel_cliente_id is not null;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.tipo,q.data),'[]'::jsonb) into linhas from (
  select z.*,case when tem then (case z.natureza when 'preventiva' then (r->>'preventiva')::numeric else (r->>'corretiva')::numeric end) else 0 end pct_locatario from (
   select 'peca' tipo,x.id,p.descricao,coalesce(p.codigo_barras,p.codigo_interno) codigo,p.unidade,-x.quantidade quantidade,coalesce(x.custo_unitario,0) valor_unitario,
    round(-x.quantidade*coalesce(x.custo_unitario,0),2) total,x.natureza,x.observacao motivo,false externo,null::text fornecedor,null::text categoria,x.criado_em data
   from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id where x.manutencao_id=m.id and x.tipo='saida'
   union all
   select 'servico',s.id,s.descricao,null,'SV',s.quantidade,s.valor_unitario,round(s.quantidade*s.valor_unitario,2),s.natureza,s.observacao,s.externo,s.fornecedor,s.categoria,s.criado_em
   from public.oficina_manutencao_servicos s where s.manutencao_id=m.id and s.removido_em is null
  ) z
 ) q;
 select coalesce(jsonb_agg(l||jsonb_build_object('valor_locatario',round((l->>'total')::numeric*(l->>'pct_locatario')::numeric/100,2),
   'valor_empresa',(l->>'total')::numeric-round((l->>'total')::numeric*(l->>'pct_locatario')::numeric/100,2))),'[]'::jsonb) into linhas from jsonb_array_elements(linhas) l;
 return jsonb_build_object(
  'empresa',(select jsonb_build_object('razao_social',e.razao_social,'nome_fantasia',e.nome_fantasia,'cnpj',e.cnpj) from public.empresas e where e.id=p_empresa),
  'manutencao',to_jsonb(m),'rateio',r,
  'veiculo',(select jsonb_build_object('placa',c.placa,'marca',c.marca,'modelo',c.modelo,'ano',c.ano,'cor',c.cor) from public.carros c where c.id=m.carro_id),
  'responsavel',case when tem then (select jsonb_build_object('nome',c.nome_completo,'cpf',c.cpf,'telefone',coalesce(c.contato_1_numero,c.contato_2_numero)) from public.clientes c where c.id=m.responsavel_cliente_id) end,
  'linhas',linhas,
  'totais',jsonb_build_object(
   'pecas',coalesce((select sum((l->>'total')::numeric) from jsonb_array_elements(linhas) l where l->>'tipo'='peca'),0),
   'servicos',coalesce((select sum((l->>'total')::numeric) from jsonb_array_elements(linhas) l where l->>'tipo'='servico'),0),
   'geral',coalesce((select sum((l->>'total')::numeric) from jsonb_array_elements(linhas) l),0),
   'locatario',coalesce((select sum((l->>'valor_locatario')::numeric) from jsonb_array_elements(linhas) l),0),
   'empresa',coalesce((select sum((l->>'valor_empresa')::numeric) from jsonb_array_elements(linhas) l),0)));
end $$;
revoke all on function public.oficina_orcamento(uuid,uuid) from public,anon;
grant execute on function public.oficina_orcamento(uuid,uuid) to authenticated;

-- Lança a parte do locatário como débito no financeiro dele (Contas a receber). Uma vez só por manutenção.
create or replace function public.oficina_cobrar_locatario(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; o jsonb; valor numeric; novo uuid:=gen_random_uuid();
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.cobranca_debito_id is not null then raise exception 'A manutenção #% já foi cobrada do locatário.',m.numero; end if;
 if m.responsavel_cliente_id is null then raise exception 'Esta manutenção não tem locatário responsável.'; end if;
 o:=public.oficina_orcamento(p_empresa,p_manutencao); valor:=(o->'totais'->>'locatario')::numeric;
 if valor<=0 then raise exception 'Não há valor a cobrar do locatário.'; end if;
 -- Débito no cadastro do locatário, na empresa dele (a locadora). Exige administrador daquela empresa.
 perform public.cliente_debito_criar(m.responsavel_empresa_id,m.responsavel_cliente_id,novo,'manutencao',
  'Manutenção #'||m.numero||' · '||m.placa||' · '||(select string_agg(distinct case l->>'natureza' when 'preventiva' then 'preventiva '||(l->>'pct_locatario')::numeric::int||'%' else 'corretiva '||(l->>'pct_locatario')::numeric::int||'%' end,', ') from jsonb_array_elements(o->'linhas') l),
  valor,0,1,(now() at time zone 'America/Manaus')::date,'diaria');
 update public.oficina_manutencoes set cobranca_debito_id=novo,cobrada_em=now() where id=m.id;
 return jsonb_build_object('debito_id',novo,'valor',valor,'locatario',m.responsavel_nome);
end $$;
revoke all on function public.oficina_cobrar_locatario(uuid,uuid) from public,anon;
grant execute on function public.oficina_cobrar_locatario(uuid,uuid) to authenticated;

-- Painel: manutenções com responsável, total e situação da cobrança.
create or replace function public.oficina_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return jsonb_build_object(
  'rateio',public.oficina_rateio(p_empresa),
  'produtos',coalesce((select jsonb_agg(to_jsonb(p) order by p.descricao) from public.oficina_produtos p where p.empresa_id=p_empresa),'[]'::jsonb),
  'servicos',coalesce((select jsonb_agg(to_jsonb(s) order by s.categoria,s.descricao) from public.oficina_servicos s where s.empresa_id=p_empresa and s.ativo),'[]'::jsonb),
  'manutencoes',coalesce((select jsonb_agg(to_jsonb(q) order by q.status='concluida',q.entrada_em desc) from (
   select m.*,(select count(*) from public.oficina_movimentos x where x.manutencao_id=m.id)::int pecas,
    coalesce((select sum(-x.quantidade*coalesce(x.custo_unitario,0)) from public.oficina_movimentos x where x.manutencao_id=m.id),0) custo_pecas,
    coalesce((select sum(s.quantidade*s.valor_unitario) from public.oficina_manutencao_servicos s where s.manutencao_id=m.id and s.removido_em is null),0) valor_servicos
   from public.oficina_manutencoes m where m.empresa_id=p_empresa
   and (m.status in ('aberta','aguardando_pecas') or m.entrada_em>now()-interval '60 days')) q),'[]'::jsonb),
  'frota_em_manutencao',coalesce((select jsonb_agg(jsonb_build_object('periodo_id',p.id,'carro_id',c.id,'placa',c.placa,'veiculo',trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,'')),'desde',p.inicio,'empresa',e.nome_fantasia) order by p.inicio)
   from public.frota_periodos p join public.carros c on c.id=p.carro_id join public.empresas e on e.id=c.empresa_id
   where p.tipo='manutencao' and p.fim is null and (c.empresa_id=p_empresa or public.acesso_modulo(c.empresa_id,'locacao'))
   and not exists(select 1 from public.oficina_manutencoes m where m.carro_id=c.id and m.empresa_id=p_empresa and m.status in ('aberta','aguardando_pecas'))),'[]'::jsonb));
end $$;

-- Histórico da peça e da manutenção, agora com o responsável e o motivo.
create or replace function public.oficina_movimentos_lista(p_empresa uuid,p_manutencao uuid default null,p_produto uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'quantidade',x.quantidade,'saldo_depois',x.saldo_depois,'custo_unitario',x.custo_unitario,
  'natureza',x.natureza,'placa',x.placa,'documento',x.documento,'fornecedor',x.fornecedor,'observacao',x.observacao,'criado_em',x.criado_em,
  'produto',p.descricao,'codigo_barras',p.codigo_barras,'unidade',p.unidade,'manutencao',m.numero,'manutencao_id',m.id,'responsavel',m.responsavel_nome) order by x.criado_em desc)
  from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id left join public.oficina_manutencoes m on m.id=x.manutencao_id
  where x.empresa_id=p_empresa and (p_manutencao is null or x.manutencao_id=p_manutencao) and (p_produto is null or x.produto_id=p_produto)
  and (p_manutencao is not null or p_produto is not null or x.criado_em>now()-interval '30 days')),'[]'::jsonb);
end $$;
notify pgrst,'reload schema';
commit;
select 'Oficina etapa 2 pronta: responsável, rateio, serviços, nota fiscal, orçamento e cobrança.' as resultado;
