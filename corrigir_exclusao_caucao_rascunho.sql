-- Execute no SQL Editor como postgres. Não exclui registros ao aplicar.
reset role;
-- Execute como postgres. Habilita edição e exclusão de rascunhos sem excluir registros agora.
begin;
-- A tabela de pagamentos legada não foi instalada em todas as bases.
-- As tabelas financeiras atuais continuam sendo verificadas obrigatoriamente.
create or replace function public.locacao_rascunho_tem_pagamentos(p_empresa uuid,p_locacao uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare legado boolean:=false;
begin
 if to_regclass('public.pagamentos_locacao') is not null then
  execute 'select exists(select 1 from public.pagamentos_locacao where locacao_id=$1)' into legado using p_locacao;
 end if;
 return legado or exists(select 1 from public.frota_recebimentos where empresa_id=p_empresa and grupo_id=p_locacao);
end $$;
revoke all on function public.locacao_rascunho_tem_pagamentos(uuid,uuid) from public,anon,authenticated;
alter table public.locacoes add column if not exists revisao_rascunho integer not null default 0;
create or replace function public.locacao_revisao_rascunho() returns trigger language plpgsql set search_path='' as $$
begin new.revisao_rascunho:=old.revisao_rascunho+1;return new;end $$;
revoke all on function public.locacao_revisao_rascunho() from public,anon,authenticated;
drop trigger if exists locacao_revisao_rascunho on public.locacoes;
create trigger locacao_revisao_rascunho before update on public.locacoes for each row execute function public.locacao_revisao_rascunho();

create or replace function public.locacao_conferir_rascunho(p_empresa uuid,p_locacao uuid,p_revisao integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.locacoes;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.id is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 if p_revisao is null or r.revisao_rascunho<>p_revisao then raise exception 'A locação mudou. Atualize a lista antes de continuar.';end if;
 if r.status<>'Reservada' or nullif(to_jsonb(r)->>'contrato_gerado_em','') is not null
 or lower(coalesce(to_jsonb(r)->>'contrato_status','')) not in ('','rascunho','pendente')
 or nullif(to_jsonb(r)->>'assinatura_referencia','') is not null
 or nullif(to_jsonb(r)->>'assinatura_cliente_em','') is not null or nullif(to_jsonb(r)->>'assinatura_locadora_em','') is not null
 or exists(select 1 from public.locacao_eventos where locacao_id=r.id)
 or exists(select 1 from public.documentos_locacao d where d.locacao_id=r.id and
 (lower(coalesce(d.status,'')) not in ('','rascunho','pendente') or nullif(to_jsonb(d)->>'arquivo_original_path','') is not null or nullif(to_jsonb(d)->>'provedor_documento_id','') is not null
 or nullif(to_jsonb(d)->>'arquivo_assinado_path','') is not null or nullif(to_jsonb(d)->>'assinado_em','') is not null or nullif(to_jsonb(d)->>'enviado_em','') is not null))
 or exists(select 1 from public.documentos_modelos_emitidos where locacao_id=r.id)
 then raise exception 'Esta locação já avançou para emissão, assinatura ou operação. Não pode ser tratada como rascunho.';end if;
 return to_jsonb(r);
end $$;
revoke all on function public.locacao_conferir_rascunho(uuid,uuid,integer) from public,anon,authenticated;

create or replace function public.locacao_editar_rascunho(p_empresa uuid,p_locacao uuid,p_revisao integer,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original jsonb;result jsonb;cliente uuid;carro uuid;inicio timestamptz;fim timestamptz;diaria numeric;caucao numeric;pago numeric;partes integer;parcela numeric;multa numeric;
begin
 perform pg_advisory_xact_lock(7261002);
 original:=public.locacao_conferir_rascunho(p_empresa,p_locacao,p_revisao);
 if jsonb_typeof(p_dados) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_dados) k where k not in
 ('cliente_id','carro_id','data_inicio','data_fim','valor_diaria','status','valor_caucao','valor_caucao_pago','saldo_caucao','numero_parcelas_caucao','valor_parcela_caucao','multa_atraso_percentual','observacoes')) then raise exception 'Campos de edição inválidos.';end if;
 cliente:=(p_dados->>'cliente_id')::uuid;carro:=(p_dados->>'carro_id')::uuid;
 inicio:=(p_dados->>'data_inicio')::timestamptz;fim:=nullif(p_dados->>'data_fim','')::timestamptz;
 diaria:=(p_dados->>'valor_diaria')::numeric;caucao:=coalesce((p_dados->>'valor_caucao')::numeric,0);pago:=coalesce((p_dados->>'valor_caucao_pago')::numeric,0);
 partes:=coalesce((p_dados->>'numero_parcelas_caucao')::integer,100);parcela:=coalesce((p_dados->>'valor_parcela_caucao')::numeric,0);multa:=coalesce((p_dados->>'multa_atraso_percentual')::numeric,11);
 if inicio is null or not isfinite(inicio) or (fim is not null and (not isfinite(fim) or fim<=inicio)) or diaria is null or diaria<=0 or diaria>99999999.99
 or caucao<0 or caucao>99999999.99 or pago<0 or pago>caucao or partes not between 1 and 3650 or parcela<0 or parcela>caucao-pago or multa not between 0 and 100 or length(coalesce(p_dados->>'observacoes',''))>4000
 then raise exception 'Confira as datas, diária e valores da caução.';end if;
 if not exists(select 1 from public.clientes where id=cliente and empresa_id=p_empresa and situacao='Ativo') then raise exception 'Selecione um cliente ativo desta empresa.';end if;
 if not exists(select 1 from public.carros where id=carro and empresa_id=p_empresa and situacao not in ('Vendido','Inativo')) then raise exception 'Selecione um veículo desta empresa.';end if;
 if carro is distinct from (original->>'carro_id')::uuid and (
  exists(select 1 from public.locacoes where carro_id=carro and id<>p_locacao and status in ('Reservada','Ativa'))
  or exists(select 1 from public.frota_periodos p where p.carro_id=carro and p.fim is null)
  or exists(select 1 from public.frota_levantamento where carro_id=carro and ativo)) then raise exception 'O veículo escolhido já está ocupado ou reservado.';end if;
 if cliente is distinct from (original->>'cliente_id')::uuid and (coalesce((original->>'valor_pago')::numeric,0)>0 or coalesce((original->>'valor_caucao_pago')::numeric,0)>0 or public.locacao_rascunho_tem_pagamentos(p_empresa,p_locacao)) then raise exception 'Há valores registrados. Não transfira esse rascunho para outra pessoa.';end if;
 update public.locacoes set cliente_id=cliente,carro_id=carro,data_inicio=inicio,data_fim=fim,valor_diaria=round(diaria,2),valor_caucao=round(caucao,2),valor_caucao_pago=round(pago,2),saldo_caucao=round(caucao-pago,2),numero_parcelas_caucao=partes,valor_parcela_caucao=round(parcela,2),multa_atraso_percentual=multa,observacoes=nullif(trim(p_dados->>'observacoes'),'') where id=p_locacao and empresa_id=p_empresa returning to_jsonb(locacoes.*) into result;
 return result;
end $$;

create table if not exists public.locacoes_rascunhos_excluidos(
 id uuid primary key,empresa_id uuid not null references public.empresas(id),locacao_id uuid not null,
 autor uuid not null,criado_em timestamptz not null default now(),arquivos jsonb not null,arquivos_pendentes jsonb not null,
 limpeza_concluida boolean not null default false
);
alter table public.locacoes_rascunhos_excluidos enable row level security;
revoke all on public.locacoes_rascunhos_excluidos from public,anon,authenticated;
grant select on public.locacoes_rascunhos_excluidos to authenticated;
drop policy if exists rascunhos_excluidos_leitura on public.locacoes_rascunhos_excluidos;
create policy rascunhos_excluidos_leitura on public.locacoes_rascunhos_excluidos for select to authenticated using(public.acesso_desenvolvedor() and public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.locacao_excluir_rascunho(p_empresa uuid,p_locacao uuid,p_revisao integer,p_operacao uuid,p_confirmacao text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;files jsonb;existing public.locacoes_rascunhos_excluidos;
begin
 if auth.uid() is null or not coalesce(public.acesso_desenvolvedor(),false) or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Somente o desenvolvedor pode excluir rascunhos.';end if;
 if p_operacao is null or p_confirmacao is distinct from 'EXCLUIR '||p_locacao::text then raise exception 'Confirme a exclusão do rascunho selecionado.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into existing from public.locacoes_rascunhos_excluidos where id=p_operacao;
 if existing.id is not null then
  if existing.empresa_id<>p_empresa or existing.locacao_id<>p_locacao or existing.autor<>auth.uid() then raise exception 'Operação de exclusão inválida.';end if;
  return to_jsonb(existing);
 end if;
 r:=public.locacao_conferir_rascunho(p_empresa,p_locacao,p_revisao);
 -- Valores digitados no formulário não comprovam recebimento.
 -- Somente lançamentos financeiros vinculados impedem a exclusão.
 if public.locacao_rascunho_tem_pagamentos(p_empresa,p_locacao)
 then raise exception 'Há recebimentos lançados no financeiro para esta locação. Confira ou estorne os lançamentos antes de excluir. A caução apenas preenchida no rascunho não bloqueia a exclusão.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)),'[]') into files from storage.objects
 where bucket_id in ('documentos-locacao','documentos-contratuais') and name like p_locacao::text||'/%';
 insert into public.locacoes_rascunhos_excluidos(id,empresa_id,locacao_id,autor,arquivos,arquivos_pendentes) values(p_operacao,p_empresa,p_locacao,auth.uid(),files,files);
 delete from public.anexos_locacao where locacao_id=p_locacao;
 delete from public.vistorias_locacao where locacao_id=p_locacao;
 delete from public.documentos_locacao where locacao_id=p_locacao;
 delete from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 select * into existing from public.locacoes_rascunhos_excluidos where id=p_operacao;
 return to_jsonb(existing);
end $$;
create or replace function public.locacao_exclusao_limpeza(p_empresa uuid,p_operacao uuid,p_pendentes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item public.locacoes_rascunhos_excluidos;
begin
 if auth.uid() is null or not coalesce(public.acesso_desenvolvedor(),false) or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso.';end if;
 select * into item from public.locacoes_rascunhos_excluidos where id=p_operacao and empresa_id=p_empresa and autor=auth.uid() for update;
 if item.id is null or jsonb_typeof(p_pendentes) is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_pendentes) p where not item.arquivos @> jsonb_build_array(p)) then raise exception 'Limpeza inválida.';end if;
 update public.locacoes_rascunhos_excluidos set arquivos_pendentes=p_pendentes,limpeza_concluida=jsonb_array_length(p_pendentes)=0 where id=p_operacao;
end $$;
revoke all on function public.locacao_editar_rascunho(uuid,uuid,integer,jsonb),public.locacao_excluir_rascunho(uuid,uuid,integer,uuid,text),public.locacao_exclusao_limpeza(uuid,uuid,jsonb) from public,anon;
grant execute on function public.locacao_editar_rascunho(uuid,uuid,integer,jsonb),public.locacao_excluir_rascunho(uuid,uuid,integer,uuid,text),public.locacao_exclusao_limpeza(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Edição e exclusão confirmada de rascunhos habilitadas' as resultado;
