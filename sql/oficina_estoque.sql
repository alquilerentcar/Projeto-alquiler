-- SQL Editor, papel postgres. Módulo Oficina, etapa 1: peças, estoque e manutenções.
-- Peças: cadastro com código de barras, estoque mínimo, saldo e custo médio.
-- Entradas: leitor de código de barras, quantidade e custo; atualiza saldo e custo médio.
-- Saídas: sempre ligadas a uma manutenção (carro + motivo), com corretiva ou preventiva em cada peça;
--         nunca deixam o saldo negativo.
-- Manutenções: carro da frota (de qualquer empresa do grupo que o usuário acessa) ou veículo de fora.
-- Não altera dados existentes.
begin;
-- Acesso: módulo Oficina; enquanto ele não estiver ativo para os usuários, vale o acesso à Locação.
create or replace function public.oficina_acesso(p_empresa uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coalesce(public.acesso_modulo(p_empresa,'oficina'),false) or coalesce(public.acesso_modulo(p_empresa,'locacao'),false))
$$;
revoke all on function public.oficina_acesso(uuid) from public,anon;
grant execute on function public.oficina_acesso(uuid) to authenticated;

create table if not exists public.oficina_produtos(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 codigo_barras text, codigo_interno text, descricao text not null check(length(trim(descricao)) between 2 and 200),
 unidade text not null default 'UN', marca text, aplicacao text, localizacao text,
 estoque_minimo numeric(12,3) not null default 0 check(estoque_minimo>=0),
 saldo numeric(12,3) not null default 0 check(saldo>=0), custo_medio numeric(12,4) not null default 0 check(custo_medio>=0),
 ativo boolean not null default true, criado_por uuid, criado_em timestamptz not null default now()
);
create unique index if not exists oficina_produtos_barras on public.oficina_produtos(empresa_id,codigo_barras) where codigo_barras is not null;
create unique index if not exists oficina_produtos_interno on public.oficina_produtos(empresa_id,codigo_interno) where codigo_interno is not null;

create table if not exists public.oficina_manutencoes(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 numero integer not null, carro_id uuid references public.carros(id), placa text not null, veiculo text,
 cliente_externo text, motivo text not null check(length(trim(motivo)) between 3 and 2000),
 tipo text not null check(tipo in ('corretiva','preventiva')), km bigint check(km>=0),
 status text not null default 'aberta' check(status in ('aberta','aguardando_pecas','concluida','cancelada')),
 periodo_id uuid, entrada_em timestamptz not null default now(), concluida_em timestamptz, observacoes text,
 operacao_id uuid unique, criado_por uuid, criado_em timestamptz not null default now(), unique(empresa_id,numero)
);
create index if not exists oficina_manutencoes_carro on public.oficina_manutencoes(carro_id,entrada_em);

create table if not exists public.oficina_movimentos(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 produto_id uuid not null references public.oficina_produtos(id), tipo text not null check(tipo in ('entrada','saida','ajuste')),
 quantidade numeric(12,3) not null check(quantidade<>0), saldo_depois numeric(12,3) not null,
 custo_unitario numeric(12,4), manutencao_id uuid references public.oficina_manutencoes(id),
 carro_id uuid references public.carros(id), placa text, natureza text check(natureza in ('corretiva','preventiva')),
 documento text, fornecedor text, observacao text, operacao_id uuid not null,
 criado_por uuid, criado_em timestamptz not null default now()
);
create index if not exists oficina_movimentos_produto on public.oficina_movimentos(produto_id,criado_em);
create index if not exists oficina_movimentos_manutencao on public.oficina_movimentos(manutencao_id);
create table if not exists public.oficina_operacoes(
 id uuid primary key, empresa_id uuid not null references public.empresas(id), tipo text not null,
 pedido jsonb not null, resultado jsonb not null, criado_por uuid not null, criado_em timestamptz not null default now()
);

do $$ declare t text; begin
 foreach t in array array['oficina_produtos','oficina_manutencoes','oficina_movimentos','oficina_operacoes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists %I on public.%I',t||'_leitura',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.oficina_acesso(empresa_id))',t||'_leitura',t);
 end loop;
end $$;

-- Confere quantidade e custo vindos da tela.
create or replace function public.oficina_numero(p numeric,p_min numeric default 0)
returns boolean language sql immutable set search_path='' as $$
 select p is not null and p::text not in ('NaN','Infinity','-Infinity') and p>=p_min and p<=999999 and p=round(p,3)
$$;

-- ===================== Peças =====================
create or replace function public.oficina_produto_salvar(p_empresa uuid,p_id uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_produtos; barras text:=nullif(trim(coalesce(p_dados->>'codigo_barras','')),''); interno text:=nullif(trim(coalesce(p_dados->>'codigo_interno','')),'');
 minimo numeric:=coalesce(nullif(p_dados->>'estoque_minimo','')::numeric,0);
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if length(trim(coalesce(p_dados->>'descricao',''))) not between 2 and 200 then raise exception 'Informe a descrição da peça.'; end if;
 if not public.oficina_numero(minimo) then raise exception 'Estoque mínimo inválido.'; end if;
 if barras is not null and exists(select 1 from public.oficina_produtos where empresa_id=p_empresa and codigo_barras=barras and id is distinct from p_id) then
  raise exception 'Já existe uma peça com o código de barras %.',barras;
 end if;
 if interno is not null and exists(select 1 from public.oficina_produtos where empresa_id=p_empresa and codigo_interno=interno and id is distinct from p_id) then
  raise exception 'Já existe uma peça com o código interno %.',interno;
 end if;
 if p_id is null then
  insert into public.oficina_produtos(empresa_id,codigo_barras,codigo_interno,descricao,unidade,marca,aplicacao,localizacao,estoque_minimo,criado_por)
  values(p_empresa,barras,interno,trim(p_dados->>'descricao'),upper(coalesce(nullif(trim(p_dados->>'unidade'),''),'UN')),
   nullif(trim(coalesce(p_dados->>'marca','')),''),nullif(trim(coalesce(p_dados->>'aplicacao','')),''),nullif(trim(coalesce(p_dados->>'localizacao','')),''),minimo,auth.uid())
  returning * into r;
 else
  update public.oficina_produtos set codigo_barras=barras,codigo_interno=interno,descricao=trim(p_dados->>'descricao'),
   unidade=upper(coalesce(nullif(trim(p_dados->>'unidade'),''),'UN')),marca=nullif(trim(coalesce(p_dados->>'marca','')),''),
   aplicacao=nullif(trim(coalesce(p_dados->>'aplicacao','')),''),localizacao=nullif(trim(coalesce(p_dados->>'localizacao','')),''),
   estoque_minimo=minimo,ativo=coalesce((p_dados->>'ativo')::boolean,ativo)
  where id=p_id and empresa_id=p_empresa returning * into r;
  if r.id is null then raise exception 'Peça não encontrada.'; end if;
 end if;
 return to_jsonb(r);
end $$;
revoke all on function public.oficina_produto_salvar(uuid,uuid,jsonb) from public,anon;
grant execute on function public.oficina_produto_salvar(uuid,uuid,jsonb) to authenticated;

-- Leitor de código de barras: procura pelo código de barras ou pelo código interno.
create or replace function public.oficina_produto_buscar(p_empresa uuid,p_codigo text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return (select to_jsonb(p) from public.oficina_produtos p where p.empresa_id=p_empresa and p.ativo
  and (p.codigo_barras=trim(p_codigo) or upper(p.codigo_interno)=upper(trim(p_codigo))) order by (p.codigo_barras=trim(p_codigo)) desc limit 1);
end $$;
revoke all on function public.oficina_produto_buscar(uuid,text) from public,anon;
grant execute on function public.oficina_produto_buscar(uuid,text) to authenticated;

-- ===================== Manutenções =====================
-- Veículos que podem entrar: frota das empresas do grupo que o usuário acessa.
create or replace function public.oficina_veiculos(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('carro_id',c.id,'placa',c.placa,'veiculo',trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,'')||coalesce(' '||c.ano,'')),
  'empresa',e.nome_fantasia,'situacao',c.situacao,
  'em_manutencao_frota',(select p.id from public.frota_periodos p where p.carro_id=c.id and p.tipo='manutencao' and p.fim is null limit 1),
  'ultimo_km',(select k.km from public.frota_km k where k.carro_id=c.id order by k.leitura_em desc limit 1)) order by c.placa)
  from public.carros c join public.empresas e on e.id=c.empresa_id
  where coalesce(c.situacao,'')<>'Vendido' and (c.empresa_id=p_empresa or public.acesso_modulo(c.empresa_id,'locacao'))),'[]'::jsonb);
end $$;
revoke all on function public.oficina_veiculos(uuid) from public,anon;
grant execute on function public.oficina_veiculos(uuid) to authenticated;

create or replace function public.oficina_manutencao_abrir(p_empresa uuid,p_operacao uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_manutencoes; c public.carros; carro uuid:=nullif(p_dados->>'carro_id','')::uuid; placa text; km bigint:=nullif(p_dados->>'km','')::bigint; periodo uuid;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null then raise exception 'Operação inválida.'; end if;
 select * into r from public.oficina_manutencoes where operacao_id=p_operacao;
 if r.id is not null then return to_jsonb(r); end if;
 if coalesce(p_dados->>'tipo','') not in ('corretiva','preventiva') then raise exception 'Informe se a manutenção é corretiva ou preventiva.'; end if;
 if length(trim(coalesce(p_dados->>'motivo',''))) not between 3 and 2000 then raise exception 'Informe o motivo da manutenção.'; end if;
 if km is not null and km<0 then raise exception 'KM inválido.'; end if;
 if carro is not null then
  select * into c from public.carros where id=carro;
  if c.id is null or not (c.empresa_id=p_empresa or coalesce(public.acesso_modulo(c.empresa_id,'locacao'),false)) then raise exception 'Veículo não encontrado.'; end if;
  placa:=c.placa;
  if exists(select 1 from public.oficina_manutencoes m where m.carro_id=carro and m.empresa_id=p_empresa and m.status in ('aberta','aguardando_pecas')) then
   raise exception 'O veículo % já tem uma manutenção aberta.',placa;
  end if;
  select p.id into periodo from public.frota_periodos p where p.carro_id=carro and p.tipo='manutencao' and p.fim is null limit 1;
 else
  placa:=upper(regexp_replace(coalesce(p_dados->>'placa',''),'[^A-Za-z0-9]','','g'));
  if length(placa) not between 7 and 8 then raise exception 'Informe a placa do veículo.'; end if;
  if length(trim(coalesce(p_dados->>'cliente_externo',''))) <2 then raise exception 'Informe o cliente do veículo de fora.'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('oficina_numero'||p_empresa::text,0));
 insert into public.oficina_manutencoes(empresa_id,numero,carro_id,placa,veiculo,cliente_externo,motivo,tipo,km,periodo_id,observacoes,operacao_id,criado_por)
 values(p_empresa,coalesce((select max(numero) from public.oficina_manutencoes where empresa_id=p_empresa),0)+1,carro,placa,
  coalesce(nullif(trim(coalesce(p_dados->>'veiculo','')),''),trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,''))),
  case when carro is null then trim(p_dados->>'cliente_externo') end,trim(p_dados->>'motivo'),p_dados->>'tipo',km,periodo,
  nullif(trim(coalesce(p_dados->>'observacoes','')),''),p_operacao,auth.uid())
 returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.oficina_manutencao_abrir(uuid,uuid,jsonb) from public,anon;
grant execute on function public.oficina_manutencao_abrir(uuid,uuid,jsonb) to authenticated;

create or replace function public.oficina_manutencao_status(p_empresa uuid,p_id uuid,p_status text,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.oficina_manutencoes;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_status not in ('aberta','aguardando_pecas','concluida','cancelada') then raise exception 'Situação inválida.'; end if;
 select * into r from public.oficina_manutencoes where id=p_id and empresa_id=p_empresa for update;
 if r.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if r.status in ('concluida','cancelada') then raise exception 'A manutenção % já foi encerrada.',r.numero; end if;
 if p_status='cancelada' and exists(select 1 from public.oficina_movimentos where manutencao_id=p_id) then
  raise exception 'Esta manutenção já tem peças lançadas. Conclua em vez de cancelar.';
 end if;
 update public.oficina_manutencoes set status=p_status,concluida_em=case when p_status in ('concluida','cancelada') then now() end,
  observacoes=coalesce(nullif(trim(coalesce(p_observacao,'')),''),observacoes) where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.oficina_manutencao_status(uuid,uuid,text,text) from public,anon;
grant execute on function public.oficina_manutencao_status(uuid,uuid,text,text) to authenticated;

-- ===================== Entradas e saídas =====================
-- Entrada: [{produto_id, quantidade, custo_unitario}] · atualiza saldo e custo médio ponderado.
create or replace function public.oficina_entrada(p_empresa uuid,p_operacao uuid,p_itens jsonb,p_documento text default null,p_fornecedor text default null,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior public.oficina_operacoes; pedido jsonb; item jsonb; p public.oficina_produtos; qtd numeric; custo numeric; vistos uuid[]:='{}'; saida jsonb:='[]';
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 if p_operacao is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 300
 or length(coalesce(p_documento,''))>100 or length(coalesce(p_fornecedor,''))>200 or length(coalesce(p_observacao,''))>1000 then
  raise exception 'Confira os itens da entrada.';
 end if;
 pedido:=jsonb_build_object('itens',p_itens,'documento',p_documento,'fornecedor',p_fornecedor,'observacao',p_observacao);
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into anterior from public.oficina_operacoes where id=p_operacao;
 if found then
  if anterior.tipo<>'entrada' or anterior.pedido<>pedido or anterior.criado_por<>auth.uid() then raise exception 'Operação já utilizada com outros dados.'; end if;
  return anterior.resultado;
 end if;
 for item in select value from jsonb_array_elements(p_itens) order by value->>'produto_id' loop
  qtd:=(item->>'quantidade')::numeric; custo:=nullif(item->>'custo_unitario','')::numeric;
  if not public.oficina_numero(qtd,0.001) then raise exception 'Quantidade inválida.'; end if;
  if custo is not null and not public.oficina_numero(custo) then raise exception 'Custo inválido.'; end if;
  select * into p from public.oficina_produtos where id=(item->>'produto_id')::uuid and empresa_id=p_empresa for update;
  if p.id is null then raise exception 'Peça não encontrada nesta empresa.'; end if;
  if p.id=any(vistos) then raise exception 'A peça % aparece duas vezes. Junte as quantidades.',p.descricao; end if;
  vistos:=array_append(vistos,p.id);
  update public.oficina_produtos set saldo=saldo+qtd,
   custo_medio=case when custo is null then custo_medio else round((saldo*custo_medio+qtd*custo)/(saldo+qtd),4) end
  where id=p.id returning * into p;
  insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,documento,fornecedor,observacao,operacao_id,criado_por)
  values(p_empresa,p.id,'entrada',qtd,p.saldo,custo,nullif(trim(coalesce(p_documento,'')),''),nullif(trim(coalesce(p_fornecedor,'')),''),nullif(trim(coalesce(p_observacao,'')),''),p_operacao,auth.uid());
  saida:=saida||jsonb_build_array(jsonb_build_object('produto_id',p.id,'descricao',p.descricao,'quantidade',qtd,'saldo',p.saldo));
 end loop;
 insert into public.oficina_operacoes(id,empresa_id,tipo,pedido,resultado,criado_por) values(p_operacao,p_empresa,'entrada',pedido,saida,auth.uid());
 return saida;
end $$;
revoke all on function public.oficina_entrada(uuid,uuid,jsonb,text,text,text) from public,anon;
grant execute on function public.oficina_entrada(uuid,uuid,jsonb,text,text,text) to authenticated;

-- Saída: [{produto_id, quantidade, natureza}] para uma manutenção aberta. Sem estoque suficiente, nada sai.
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
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa;
 if m.id is null then raise exception 'Escolha a manutenção (o carro) para onde a peça vai.'; end if;
 if m.status not in ('aberta','aguardando_pecas') then raise exception 'A manutenção % já foi encerrada.',m.numero; end if;
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
  values(p_empresa,p.id,'saida',-qtd,p.saldo,p.custo_medio,m.id,m.carro_id,m.placa,nat,nullif(trim(coalesce(p_observacao,'')),''),p_operacao,auth.uid());
  saida:=saida||jsonb_build_array(jsonb_build_object('produto_id',p.id,'descricao',p.descricao,'quantidade',qtd,'saldo',p.saldo,'natureza',nat));
 end loop;
 insert into public.oficina_operacoes(id,empresa_id,tipo,pedido,resultado,criado_por) values(p_operacao,p_empresa,'saida',pedido,saida,auth.uid());
 return saida;
end $$;
revoke all on function public.oficina_saida(uuid,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.oficina_saida(uuid,uuid,uuid,jsonb,text) to authenticated;

-- Ajuste de inventário (contagem física): só o administrador.
create or replace function public.oficina_ajuste(p_empresa uuid,p_operacao uuid,p_produto uuid,p_contado numeric,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.oficina_produtos; dif numeric;
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador ajusta o estoque.'; end if;
 if p_operacao is null or not public.oficina_numero(p_contado) or length(trim(coalesce(p_motivo,''))) not between 3 and 500 then raise exception 'Informe a quantidade contada e o motivo.'; end if;
 if exists(select 1 from public.oficina_movimentos where operacao_id=p_operacao) then return (select to_jsonb(x) from public.oficina_produtos x where id=p_produto); end if;
 select * into p from public.oficina_produtos where id=p_produto and empresa_id=p_empresa for update;
 if p.id is null then raise exception 'Peça não encontrada.'; end if;
 dif:=p_contado-p.saldo;
 if dif=0 then return to_jsonb(p); end if;
 update public.oficina_produtos set saldo=p_contado where id=p.id returning * into p;
 insert into public.oficina_movimentos(empresa_id,produto_id,tipo,quantidade,saldo_depois,custo_unitario,observacao,operacao_id,criado_por)
 values(p_empresa,p.id,'ajuste',dif,p.saldo,p.custo_medio,trim(p_motivo),p_operacao,auth.uid());
 return to_jsonb(p);
end $$;
revoke all on function public.oficina_ajuste(uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.oficina_ajuste(uuid,uuid,uuid,numeric,text) to authenticated;

-- ===================== Consultas =====================
create or replace function public.oficina_painel(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return jsonb_build_object(
  'produtos',coalesce((select jsonb_agg(to_jsonb(p) order by p.descricao) from public.oficina_produtos p where p.empresa_id=p_empresa),'[]'::jsonb),
  'manutencoes',coalesce((select jsonb_agg(to_jsonb(q) order by q.status='concluida',q.entrada_em desc) from (
   select m.*,(select count(*) from public.oficina_movimentos x where x.manutencao_id=m.id)::int pecas,
    coalesce((select sum(-x.quantidade*coalesce(x.custo_unitario,0)) from public.oficina_movimentos x where x.manutencao_id=m.id),0) custo_pecas
   from public.oficina_manutencoes m where m.empresa_id=p_empresa
   and (m.status in ('aberta','aguardando_pecas') or m.entrada_em>now()-interval '60 days')) q),'[]'::jsonb),
  -- Carros que a Frota colocou em manutenção e ainda não têm manutenção aberta aqui.
  'frota_em_manutencao',coalesce((select jsonb_agg(jsonb_build_object('periodo_id',p.id,'carro_id',c.id,'placa',c.placa,'veiculo',trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,'')),'desde',p.inicio,'empresa',e.nome_fantasia) order by p.inicio)
   from public.frota_periodos p join public.carros c on c.id=p.carro_id join public.empresas e on e.id=c.empresa_id
   where p.tipo='manutencao' and p.fim is null and (c.empresa_id=p_empresa or public.acesso_modulo(c.empresa_id,'locacao'))
   and not exists(select 1 from public.oficina_manutencoes m where m.carro_id=c.id and m.empresa_id=p_empresa and m.status in ('aberta','aguardando_pecas'))),'[]'::jsonb));
end $$;
revoke all on function public.oficina_painel(uuid) from public,anon;
grant execute on function public.oficina_painel(uuid) to authenticated;

-- Peças de uma manutenção, ou histórico de uma peça.
create or replace function public.oficina_movimentos_lista(p_empresa uuid,p_manutencao uuid default null,p_produto uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'quantidade',x.quantidade,'saldo_depois',x.saldo_depois,'custo_unitario',x.custo_unitario,
  'natureza',x.natureza,'placa',x.placa,'documento',x.documento,'fornecedor',x.fornecedor,'observacao',x.observacao,'criado_em',x.criado_em,
  'produto',p.descricao,'codigo_barras',p.codigo_barras,'unidade',p.unidade,'manutencao',m.numero) order by x.criado_em desc)
  from public.oficina_movimentos x join public.oficina_produtos p on p.id=x.produto_id left join public.oficina_manutencoes m on m.id=x.manutencao_id
  where x.empresa_id=p_empresa and (p_manutencao is null or x.manutencao_id=p_manutencao) and (p_produto is null or x.produto_id=p_produto)
  and (p_manutencao is not null or p_produto is not null or x.criado_em>now()-interval '30 days')),'[]'::jsonb);
end $$;
revoke all on function public.oficina_movimentos_lista(uuid,uuid,uuid) from public,anon;
grant execute on function public.oficina_movimentos_lista(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Oficina pronta: peças, estoque, entradas, saídas e manutenções. Nenhum dado existente foi alterado.' as resultado;
