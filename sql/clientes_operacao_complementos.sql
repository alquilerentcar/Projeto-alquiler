-- Execute no SQL Editor como postgres. Preserva dados existentes.
begin;
create table if not exists public.cliente_documentos (
 id uuid primary key,empresa_id uuid not null references public.empresas(id),cliente_id uuid not null references public.clientes(id),
 tipo text not null check(tipo in ('contrato','substituicao','orcamento','recibo','outro')),nome text not null,
 arquivo_path text not null,data_documento date,criado_em timestamptz not null default now(),criado_por uuid not null,
 unique(empresa_id,arquivo_path)
);
create table if not exists public.cliente_debitos (
 id uuid primary key,empresa_id uuid not null references public.empresas(id),cliente_id uuid not null references public.clientes(id),
 categoria text not null check(categoria in ('caucao','multa','manutencao','outro')),descricao text not null,
 valor_total numeric(12,2) not null check(valor_total>0),pago_anterior numeric(12,2) not null check(pago_anterior>=0 and pago_anterior<valor_total),
 pedido jsonb not null,criado_em timestamptz not null default now(),criado_por uuid not null
);
create table if not exists public.cliente_debito_parcelas (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),debito_id uuid not null references public.cliente_debitos(id),
 numero integer not null check(numero>0),vencimento date not null,valor numeric(12,2) not null check(valor>0),unique(debito_id,numero)
);
create table if not exists public.cliente_debito_recebimentos (
 id uuid primary key,empresa_id uuid not null references public.empresas(id),parcela_id uuid not null references public.cliente_debito_parcelas(id),
 valor numeric(12,2) not null check(valor>0),recebido_em timestamptz not null,observacao text,criado_em timestamptz not null default now(),criado_por uuid not null
);
create table if not exists public.vistoriadores (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),nome text not null,
 ativo boolean not null default true,criado_por uuid not null,criado_em timestamptz not null default now(),unique(empresa_id,nome)
);
create index if not exists cliente_documentos_empresa_cliente on public.cliente_documentos(empresa_id,cliente_id);
create index if not exists cliente_debitos_empresa_cliente on public.cliente_debitos(empresa_id,cliente_id);
create index if not exists cliente_parcelas_empresa_data on public.cliente_debito_parcelas(empresa_id,vencimento);
create index if not exists cliente_recebimentos_parcela on public.cliente_debito_recebimentos(parcela_id);
do $$declare t text;begin
 foreach t in array array['cliente_documentos','cliente_debitos','cliente_debito_parcelas','cliente_debito_recebimentos','vistoriadores'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('drop policy if exists leitura_empresa on public.%I',t);
 execute format('create policy leitura_empresa on public.%I for select to authenticated using(public.acesso_modulo(empresa_id,''locacao''))',t);
 end loop;
end $$;

create or replace function public.cliente_documento_registrar(p_empresa uuid,p_cliente uuid,p_id uuid,p_tipo text,p_nome text,p_path text,p_data date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.cliente_documentos;begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.';end if;
 if p_id is null or p_tipo not in ('contrato','substituicao','orcamento','recibo','outro') or length(trim(coalesce(p_nome,''))) not between 2 and 180
 or p_path !~ ('^'||p_cliente::text||'/arquivos/'||p_id::text||'\.(pdf|jpg|png|webp|docx)$')
 or not exists(select 1 from storage.objects where bucket_id='documentos-clientes' and name=p_path) then raise exception 'Confira o arquivo, tipo e descrição.';end if;
 insert into public.cliente_documentos(id,empresa_id,cliente_id,tipo,nome,arquivo_path,data_documento,criado_por)
 values(p_id,p_empresa,p_cliente,p_tipo,trim(p_nome),p_path,p_data,auth.uid()) on conflict(id) do nothing;
 select * into original from public.cliente_documentos where id=p_id;
 if original.empresa_id<>p_empresa or original.cliente_id<>p_cliente or original.arquivo_path<>p_path or original.tipo<>p_tipo or original.nome<>trim(p_nome) or original.data_documento is distinct from p_data then raise exception 'A referência já pertence a outro registro.';end if;
 return p_id;
end $$;

create or replace function public.cliente_debito_criar(p_empresa uuid,p_cliente uuid,p_operacao uuid,p_categoria text,p_descricao text,p_total numeric,p_pago_anterior numeric,p_parcelas integer,p_primeiro date,p_periodicidade text)
returns uuid language plpgsql security definer set search_path='' as $$
declare pedido jsonb;original public.cliente_debitos;centavos bigint;base bigint;resto bigint;i integer;venc date;begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador pode cadastrar débitos extras.';end if;
 if not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.';end if;
 if p_operacao is null or p_categoria is null or p_categoria not in ('caucao','multa','manutencao','outro') or length(trim(coalesce(p_descricao,''))) not between 3 and 1000
 or p_total is null or p_total::text in ('NaN','Infinity','-Infinity') or p_total<=0 or p_total>9999999999.99 or p_total<>round(p_total,2)
 or p_pago_anterior is null or p_pago_anterior::text in ('NaN','Infinity','-Infinity') or p_pago_anterior<0 or p_pago_anterior>=p_total or p_pago_anterior<>round(p_pago_anterior,2)
 or p_parcelas is null or p_parcelas not between 1 and 120 or p_primeiro is null or not isfinite(p_primeiro)
 or p_periodicidade is null or p_periodicidade not in ('diaria','semanal','mensal') then raise exception 'Confira descrição, valores, parcelas e vencimentos.';end if;
 centavos:=((p_total-p_pago_anterior)*100)::bigint;if centavos<p_parcelas then raise exception 'Cada parcela deve ter pelo menos R$ 0,01.';end if;
 pedido:=jsonb_build_object('cliente',p_cliente,'categoria',p_categoria,'descricao',trim(p_descricao),'total',p_total,'pago_anterior',p_pago_anterior,'parcelas',p_parcelas,'primeiro',p_primeiro,'periodicidade',p_periodicidade);
 -- A mesma operação não pode criar duas dívidas, inclusive com cliques concorrentes.
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into original from public.cliente_debitos where id=p_operacao;
 if found then if original.empresa_id<>p_empresa or original.pedido<>pedido then raise exception 'Operação já utilizada com outros dados.';end if;return original.id;end if;
 insert into public.cliente_debitos(id,empresa_id,cliente_id,categoria,descricao,valor_total,pago_anterior,pedido,criado_por)
 values(p_operacao,p_empresa,p_cliente,p_categoria,trim(p_descricao),p_total,p_pago_anterior,pedido,auth.uid());
 base:=centavos/p_parcelas;resto:=centavos%p_parcelas;
 for i in 1..p_parcelas loop
 venc:=case p_periodicidade when 'mensal' then (p_primeiro+make_interval(months=>i-1))::date when 'semanal' then p_primeiro+(i-1)*7 else p_primeiro+i-1 end;
 insert into public.cliente_debito_parcelas(empresa_id,debito_id,numero,vencimento,valor) values(p_empresa,p_operacao,i,venc,(base+case when i=p_parcelas then resto else 0 end)::numeric/100);
 end loop;
 return p_operacao;
end $$;

create or replace function public.cliente_debito_receber(p_empresa uuid,p_parcela uuid,p_operacao uuid,p_valor numeric,p_recebido_em timestamptz,p_observacao text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare parcela public.cliente_debito_parcelas;original public.cliente_debito_recebimentos;recebido numeric;begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 if p_operacao is null or p_valor is null or p_valor::text in ('NaN','Infinity','-Infinity') or p_valor<=0 or p_valor<>round(p_valor,2) or p_recebido_em is null or not isfinite(p_recebido_em) or p_recebido_em>now()+interval '5 minutes' or length(coalesce(p_observacao,''))>1000 then raise exception 'Confira valor e data real do recebimento.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_operacao::text,0));
 select * into original from public.cliente_debito_recebimentos where id=p_operacao;
 if found then if original.empresa_id<>p_empresa or original.parcela_id<>p_parcela or original.valor<>p_valor or original.recebido_em<>p_recebido_em or coalesce(original.observacao,'')<>coalesce(nullif(trim(p_observacao),''),'') then raise exception 'Operação já utilizada com outros dados.';end if;return original.id;end if;
 select * into parcela from public.cliente_debito_parcelas where id=p_parcela and empresa_id=p_empresa for update;
 if not found then raise exception 'Parcela não encontrada nesta empresa.';end if;
 select coalesce(sum(valor),0) into recebido from public.cliente_debito_recebimentos where parcela_id=p_parcela;
 if p_valor>parcela.valor-recebido then raise exception 'O valor excede o saldo da parcela.';end if;
 insert into public.cliente_debito_recebimentos(id,empresa_id,parcela_id,valor,recebido_em,observacao,criado_por)
 values(p_operacao,p_empresa,p_parcela,p_valor,p_recebido_em,nullif(trim(p_observacao),''),auth.uid());return p_operacao;
end $$;

create or replace function public.cliente_debitos_painel(p_empresa uuid,p_cliente uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.';end if;
 if p_cliente is not null and not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Locatário não encontrado nesta empresa.';end if;
 return jsonb_build_object(
 'debitos',coalesce((select jsonb_agg(to_jsonb(d)-'pedido') from public.cliente_debitos d where d.empresa_id=p_empresa and(p_cliente is null or d.cliente_id=p_cliente)),'[]'::jsonb),
 'parcelas',coalesce((select jsonb_agg(to_jsonb(q)) from(select p.*,d.cliente_id,d.categoria,d.descricao,c.nome_completo,coalesce((select sum(r.valor) from public.cliente_debito_recebimentos r where r.parcela_id=p.id),0) recebido from public.cliente_debito_parcelas p join public.cliente_debitos d on d.id=p.debito_id join public.clientes c on c.id=d.cliente_id where p.empresa_id=p_empresa and(p_cliente is null or d.cliente_id=p_cliente))q),'[]'::jsonb),
 'recebimentos',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('cliente_id',d.cliente_id,'nome_completo',c.nome_completo,'descricao',d.descricao)) from public.cliente_debito_recebimentos r join public.cliente_debito_parcelas p on p.id=r.parcela_id join public.cliente_debitos d on d.id=p.debito_id join public.clientes c on c.id=d.cliente_id where r.empresa_id=p_empresa and(p_cliente is null or d.cliente_id=p_cliente)),'[]'::jsonb));
end $$;

create or replace function public.vistoriador_salvar(p_empresa uuid,p_nome text,p_id uuid default null,p_ativo boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception using errcode='42501',message='Somente o administrador pode cadastrar vistoriadores.';end if;
 if length(trim(coalesce(p_nome,''))) not between 2 and 120 then raise exception 'Informe o nome do vistoriador.';end if;
 if p_id is null then insert into public.vistoriadores(empresa_id,nome,ativo,criado_por) values(p_empresa,upper(trim(p_nome)),coalesce(p_ativo,true),auth.uid()) on conflict(empresa_id,nome) do update set ativo=excluded.ativo returning id into result;
 else update public.vistoriadores set nome=upper(trim(p_nome)),ativo=coalesce(p_ativo,true) where id=p_id and empresa_id=p_empresa returning id into result;if not found then raise exception 'Vistoriador não encontrado nesta empresa.';end if;end if;
 return result;
end $$;

revoke all on function public.cliente_documento_registrar(uuid,uuid,uuid,text,text,text,date),public.cliente_debito_criar(uuid,uuid,uuid,text,text,numeric,numeric,integer,date,text),public.cliente_debito_receber(uuid,uuid,uuid,numeric,timestamptz,text),public.cliente_debitos_painel(uuid,uuid),public.vistoriador_salvar(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.cliente_documento_registrar(uuid,uuid,uuid,text,text,text,date),public.cliente_debito_criar(uuid,uuid,uuid,text,text,numeric,numeric,integer,date,text),public.cliente_debito_receber(uuid,uuid,uuid,numeric,timestamptz,text),public.cliente_debitos_painel(uuid,uuid),public.vistoriador_salvar(uuid,text,uuid,boolean) to authenticated;

-- Permite arquivar Word além dos formatos já aceitos; o bucket continua privado.
update storage.buckets set public=false,allowed_mime_types=case when allowed_mime_types is null then null else array(select distinct unnest(allowed_mime_types||array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])) end where id='documentos-clientes';
-- O envio confirmado inicia a ocupação; não representa assinatura concluída nem entrega física.
alter table public.locacao_eventos drop constraint if exists locacao_eventos_acao_check;
alter table public.locacao_eventos add constraint locacao_eventos_acao_check check(acao in ('entrega','devolucao','encerramento','assinatura_envio'));
create or replace function public.locacao_validar_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.status is distinct from 'Reservada' then raise exception 'Novas locações devem iniciar como Reservada.';end if;
 elsif new.status is distinct from old.status then
  if not exists(select 1 from public.locacao_eventos e where e.locacao_id=new.id and e.empresa_id=new.empresa_id
   and e.transacao=txid_current() and e.usuario_id=auth.uid()
   and ((old.status='Reservada' and new.status='Ativa' and e.acao in ('entrega','assinatura_envio')) or (old.status='Ativa' and new.status='Encerrada' and e.acao='encerramento')))
  then raise exception 'Use as ações do fluxo para alterar o status da locação.';end if;
 end if;
 if TG_OP='UPDATE' and (new.empresa_id is distinct from old.empresa_id or new.carro_id is distinct from old.carro_id or new.cliente_id is distinct from old.cliente_id)
  and (old.status<>'Reservada' or exists(select 1 from public.locacao_eventos where locacao_id=old.id))
 then raise exception 'Não altere empresa, cliente ou veículo após iniciar o fluxo.';end if;
 return new;
end $$;
revoke all on function public.locacao_validar_status() from public,anon,authenticated;
create or replace function public.locacao_ocupar_por_envio(p_empresa uuid,p_locacao uuid,p_referencia text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.locacoes;carro uuid;evento uuid;begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 select carro_id into carro from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 if carro is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 -- Mesmo bloqueio global das demais movimentações de frota, além da trava do carro.
 perform pg_advisory_xact_lock(7261002);
 perform 1 from public.carros where id=carro and empresa_id=p_empresa for update;
 if not found then raise exception 'Veículo não encontrado nesta empresa.';end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.carro_id is distinct from carro then raise exception 'O veículo mudou. Atualize a locação.';end if;
 select id into evento from public.locacao_eventos where locacao_id=r.id and acao='assinatura_envio';
 if evento is not null then
  if p_referencia is null or r.assinatura_referencia=p_referencia then return evento;end if;
  raise exception 'A referência de assinatura não corresponde ao envio registrado.';
 end if;
 if r.status<>'Reservada' or r.contrato_gerado_em is null then raise exception 'Gere o PDF de uma locação reservada antes de enviar.';end if;
 if exists(select 1 from public.locacoes where carro_id=carro and id<>r.id and status='Ativa')
 or exists(select 1 from public.frota_periodos where carro_id=carro and fim is null)
 or exists(select 1 from public.frota_levantamento where carro_id=carro and ativo)
 then raise exception 'Veículo já ocupado. Confira a frota antes de enviar o contrato.';end if;
 if exists(select 1 from public.carros where id=carro and situacao in ('Manutenção','Revisão','Indisponível','Vendido','Inativo')) then raise exception 'Veículo não está disponível para esta locação.';end if;
 if not exists(select 1 from public.documentos_locacao where locacao_id=r.id and empresa_id=p_empresa and tipo='contrato_locacao' and arquivo_original_path is not null) then raise exception 'PDF definitivo não encontrado.';end if;
 -- Chamada sem referência é apenas a verificação anterior ao envio.
 if p_referencia is null then return r.id;end if;
 if length(trim(p_referencia)) not between 3 and 200 or r.assinatura_referencia is distinct from p_referencia then raise exception 'Salve primeiro a confirmação recebida do provedor.';end if;
 insert into public.locacao_eventos(empresa_id,locacao_id,acao,usuario_id,dados)
 values(p_empresa,r.id,'assinatura_envio',auth.uid(),jsonb_build_object('observacoes','Ocupação iniciada pelo envio confirmado para assinatura.','referencia',p_referencia,'entrega_fisica_confirmada',false,'assinatura_concluida',false,'locacao_snapshot',to_jsonb(r))) returning id into evento;
 update public.locacoes set status='Ativa' where id=r.id;
 return evento;
end $$;
revoke all on function public.locacao_ocupar_por_envio(uuid,uuid,text) from public,anon;
grant execute on function public.locacao_ocupar_por_envio(uuid,uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
select 'Documentos externos, débitos e vistoriadores preparados' as resultado;
