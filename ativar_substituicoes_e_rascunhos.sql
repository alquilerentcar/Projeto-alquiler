-- Aplicar no SQL Editor do projeto, com papel postgres. Não exclui locações.
-- Somente habilita edição/exclusão confirmada dos rascunhos e termos de substituição.
reset role;
begin;
-- locacoes_rascunhos.sql
-- Execute como postgres. Habilita edição e exclusão de rascunhos sem excluir registros agora.

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
 if cliente is distinct from (original->>'cliente_id')::uuid and (coalesce((original->>'valor_pago')::numeric,0)>0 or coalesce((original->>'valor_caucao_pago')::numeric,0)>0 or exists(select 1 from public.pagamentos_locacao where locacao_id=p_locacao)) then raise exception 'Há valores registrados. Não transfira esse rascunho para outra pessoa.';end if;
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
 if coalesce((r->>'valor_pago')::numeric,0)>0 or coalesce((r->>'valor_caucao_pago')::numeric,0)>0
 or exists(select 1 from public.pagamentos_locacao where locacao_id=p_locacao)
 or exists(select 1 from public.frota_recebimentos where empresa_id=p_empresa and grupo_id=p_locacao)
 then raise exception 'Há pagamentos registrados. A exclusão de um rascunho não pode apagar movimentação financeira.';end if;
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



-- substituicao_frota.sql
-- Aplicar uma vez no SQL Editor como postgres. Não apaga contratos ou ocupações.

create table if not exists public.frota_substituicoes (
 id uuid primary key, empresa_id uuid not null references public.empresas(id),
 criado_por uuid not null, criado_em timestamptz not null default now(),
 confirmado_em timestamptz, origem_tipo text not null check(origem_tipo in ('levantamento','periodo','locacao')),
 origem_id uuid not null, cliente_id uuid not null references public.clientes(id),
 anterior_id uuid not null references public.carros(id), posterior_id uuid not null references public.carros(id),
 data_troca timestamptz not null, versao_id uuid not null references public.versoes_modelos_documentos(id),
 snapshot jsonb not null, valores jsonb not null, texto text not null, fotos integer not null check(fotos between 1 and 20),
 check(anterior_id<>posterior_id)
);
alter table public.frota_substituicoes drop constraint if exists frota_substituicoes_criado_por_fkey;
alter table public.frota_substituicoes enable row level security;
create index if not exists frota_substituicoes_cliente on public.frota_substituicoes(empresa_id,cliente_id,data_troca desc);
revoke all on public.frota_substituicoes from public,anon,authenticated;
grant select on public.frota_substituicoes to authenticated;
drop policy if exists substituicoes_leitura on public.frota_substituicoes;
create policy substituicoes_leitura on public.frota_substituicoes for select to authenticated
using(public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.substituicao_preparar(p_empresa uuid,p_id uuid,p_origem text,p_ocupacao uuid,p_carro uuid,p_data timestamptz,p_versao uuid,p_valores jsonb,p_fotos integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.frota_substituicoes; origem jsonb; anterior public.carros; posterior public.carros; tipo text; retorno timestamptz; diaria numeric; situacao text; complemento text;
 c public.clientes; e public.empresas; v public.versoes_modelos_documentos; campos jsonb; txt text; marker text[]; cid uuid; aid uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 select * into d from public.frota_substituicoes where id=p_id;
 if d.id is not null then
  if d.empresa_id<>p_empresa or d.criado_por<>auth.uid() then raise exception 'Preparação indisponível.';end if;
  return to_jsonb(d);
 end if;
 if p_id is null or p_data is null or p_data>now() or p_fotos is null or p_fotos not between 1 and 20
 or jsonb_typeof(p_valores) is distinct from 'object' or length(p_valores::text)>50000 then raise exception 'Confira data, fotos e dados da troca.';end if;
 tipo:=p_valores->>'tipo_substituicao';situacao:=p_valores->>'situacao_anterior';
 if tipo is null or tipo not in ('temporaria','permanente') then raise exception 'Informe se a substituição é temporária ou permanente.';end if;
 if situacao is null or situacao not in ('Disponível','Manutenção','Revisão','Indisponível') then raise exception 'Informe a situação do carro anterior.';end if;
 if tipo='temporaria' then retorno:=nullif(p_valores->>'previsao_retorno','')::timestamptz;
  if retorno is null or retorno<=p_data then raise exception 'A previsão de retorno deve ser posterior à troca.';end if;
 end if;
 diaria:=nullif(p_valores->>'diaria_substituto','')::numeric;
 if diaria is null or diaria<=0 or diaria>1000000 then raise exception 'Confira a diária do substituto.';end if;
 if p_origem='levantamento' then
  select to_jsonb(t) into origem from public.frota_levantamento t where id=p_ocupacao and empresa_id=p_empresa and ativo;
 elsif p_origem='periodo' then
  select to_jsonb(t) into origem from public.frota_periodos t where id=p_ocupacao and empresa_id=p_empresa and fim is null and tipo='locacao';
 elsif p_origem='locacao' then
  select to_jsonb(t) into origem from public.locacoes t where id=p_ocupacao and empresa_id=p_empresa and status='Ativa';
 else raise exception 'Origem inválida.';end if;
 if origem is null then raise exception 'Esta ocupação não está mais ativa. Atualize a frota.';end if;
 if p_data<=coalesce(nullif(origem->>'inicio','')::timestamptz,nullif(origem->>'data_inicio','')::timestamptz,'-infinity'::timestamptz) then raise exception 'A troca deve ser posterior ao início da ocupação.';end if;
 cid:=(origem->>'cliente_id')::uuid;aid:=(origem->>'carro_id')::uuid;
 select * into c from public.clientes where id=cid and empresa_id=p_empresa;
 select * into anterior from public.carros where id=aid;
 select * into posterior from public.carros where id=p_carro;
 if c.id is null or anterior.id is null then raise exception 'Vincule o cliente e o carro no cadastro da ocupação.';end if;
 if posterior.id is null or posterior.id=anterior.id or not coalesce(public.acesso_modulo(posterior.empresa_id,'locacao'),false) then raise exception 'Selecione outro veículo autorizado.';end if;
 if posterior.situacao<>'Disponível' then raise exception 'O substituto deve estar disponível para locação.';end if;
 select * into e from public.empresas where id=p_empresa;
 select vv.* into v from public.versoes_modelos_documentos vv join public.modelos_documentos m on m.id=vv.modelo_id
 where vv.id=p_versao and m.empresa_id=p_empresa and not m.arquivado and m.versao_publicada=vv.versao;
 if v.id is null or v.nome !~* '(substitui|altera)' then raise exception 'Selecione um modelo publicado de substituição de veículo.';end if;
 campos:=p_valores||jsonb_build_object('tipo_substituicao',tipo,'situacao_anterior',situacao,'previsao_retorno',retorno,'diaria_substituto',diaria,'empresa_razao_social',e.razao_social,'empresa_cnpj',e.cnpj,'empresa_endereco',e.endereco,
 'nome_locatario',c.nome_completo,'cpf',c.cpf,'cnh',c.cnh,'endereco',c.endereco,
 'veiculo_anterior',anterior.placa,'veiculo_placa',anterior.placa,'carro_anterior',anterior.placa,
 'veiculo_posterior',posterior.placa,'nova_placa',posterior.placa,'carro_posterior',posterior.placa,
 'dados_veiculo_anterior',concat_ws(' · ',anterior.placa,anterior.marca,anterior.modelo),
 'dados_veiculo_posterior',concat_ws(' · ',posterior.placa,posterior.marca,posterior.modelo),
 'data_troca',to_char(p_data at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'),
 'data_alteracao',to_char(p_data at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'),
 'data_inicio',case when coalesce(origem->>'inicio',origem->>'data_inicio') is null then null else to_char(coalesce(origem->>'inicio',origem->>'data_inicio')::timestamptz at time zone 'America/Manaus','DD/MM/YYYY') end);
 if nullif(trim(campos->>'motivo_alteracao'),'') is null then raise exception 'Informe o motivo da troca.';end if;
 txt:=v.conteudo;
 for marker in select regexp_matches(v.conteudo,'(\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\})','g') loop
  if nullif(trim(campos->>marker[2]),'') is null then raise exception 'Preencha o campo: %',marker[2];end if;
  txt:=replace(txt,marker[1],campos->>marker[2]);
 end loop;
 complemento:=concat('Substituição ',case when tipo='temporaria' then 'temporária' else 'permanente' end,'. Situação do veículo anterior: ',situacao,'. Diária acordada para o veículo substituto: R$ ',replace(to_char(diaria,'FM999999990.00'),'.',','),'.',case when retorno is not null then ' Retorno previsto: '||to_char(retorno at time zone 'America/Manaus','DD/MM/YYYY HH24:MI')||' (Manaus). O retorno depende de nova confirmação da entrega dos veículos.' else '' end);
 txt:=txt||E'\n\n'||complemento;
 insert into public.frota_substituicoes(id,empresa_id,criado_por,origem_tipo,origem_id,cliente_id,anterior_id,posterior_id,data_troca,versao_id,snapshot,valores,texto,fotos)
 values(p_id,p_empresa,auth.uid(),p_origem,p_ocupacao,cid,aid,p_carro,p_data,p_versao,
 jsonb_build_object('empresa',to_jsonb(e),'cliente',to_jsonb(c),'anterior',to_jsonb(anterior),'posterior',to_jsonb(posterior),'ocupacao',origem,'modelo',to_jsonb(v),'complemento',complemento),campos,txt,p_fotos) returning * into d;
 return to_jsonb(d);
end $$;

create or replace function public.substituicao_confirmar(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.frota_substituicoes; origem jsonb; novo uuid; i integer; car public.carros;
begin
 perform pg_advisory_xact_lock(7261002);
 select * into d from public.frota_substituicoes where id=p_id for update;
 if d.id is null or auth.uid() is null or d.criado_por<>auth.uid() or not coalesce(public.acesso_modulo(d.empresa_id,'locacao'),false) then raise exception 'Sem acesso à troca.';end if;
 if d.confirmado_em is not null then return to_jsonb(d);end if;
 if not exists(select 1 from storage.objects where bucket_id='substituicoes-frota' and name=d.empresa_id::text||'/'||d.id::text||'/termo.pdf') then raise exception 'Gere e envie o PDF antes de confirmar.';end if;
 for i in 1..d.fotos loop
  if not exists(select 1 from storage.objects where bucket_id='substituicoes-frota' and name=d.empresa_id::text||'/'||d.id::text||'/foto-'||i::text||'.jpg') then raise exception 'Falta a foto % do substituto.',i;end if;
 end loop;
 select * into car from public.carros where id=d.posterior_id for update;
 if car.situacao<>'Disponível' or not coalesce(public.acesso_modulo(car.empresa_id,'locacao'),false)
 or exists(select 1 from public.frota_levantamento where carro_id=d.posterior_id and ativo)
 or exists(select 1 from public.frota_periodos where carro_id=d.posterior_id and tstzrange(inicio,fim,'[)') && tstzrange(d.data_troca,null,'[)'))
 or exists(select 1 from public.locacoes where carro_id=d.posterior_id and status='Ativa') then raise exception 'O substituto já não está disponível. A troca não foi registrada.';end if;
 if d.origem_tipo='periodo' then
  select to_jsonb(t) into origem from public.frota_periodos t where id=d.origem_id and empresa_id=d.empresa_id and fim is null and cliente_id=d.cliente_id and carro_id=d.anterior_id for update;
 elsif d.origem_tipo='locacao' then
  select to_jsonb(t) into origem from public.locacoes t where id=d.origem_id and empresa_id=d.empresa_id and status='Ativa' and cliente_id=d.cliente_id and carro_id=d.anterior_id for update;
 else
  select to_jsonb(t) into origem from public.frota_levantamento t where id=d.origem_id and empresa_id=d.empresa_id and ativo and cliente_id=d.cliente_id and carro_id=d.anterior_id for update;
 end if;
 if origem is distinct from d.snapshot->'ocupacao' then raise exception 'A ocupação mudou durante a preparação. A troca não foi registrada.';end if;
 if exists(select 1 from public.frota_periodos where carro_id=d.anterior_id and fim is null and (d.origem_tipo<>'periodo' or id<>d.origem_id))
 or exists(select 1 from public.frota_levantamento where carro_id=d.anterior_id and ativo and (empresa_id<>d.empresa_id or cliente_id is distinct from d.cliente_id))
 or exists(select 1 from public.locacoes where carro_id=d.anterior_id and status='Ativa' and (d.origem_tipo<>'locacao' or id<>d.origem_id)) then raise exception 'Há outra ocupação ativa no carro anterior. Confira a frota.';end if;
 if d.origem_tipo='periodo' then
  novo:=public.frota_movimentar(d.empresa_id,jsonb_build_object('acao','trocar','periodo',d.origem_id,'carro',d.posterior_id,'data',d.data_troca,'diaria',coalesce(d.valores->>'diaria_substituto',origem->>'diaria'),'observacoes',d.valores->>'motivo_alteracao'));
 elsif d.origem_tipo='locacao' then
  update public.locacoes set carro_id=d.posterior_id,valor_diaria=coalesce(nullif(d.valores->>'diaria_substituto','')::numeric,valor_diaria) where id=d.origem_id;
  update public.frota_levantamento set ativo=false where carro_id=d.anterior_id and cliente_id=d.cliente_id and empresa_id=d.empresa_id and ativo;
 else
  update public.frota_substituicoes set snapshot=snapshot||jsonb_build_object('historico_anterior_substituto',(select to_jsonb(t) from public.frota_levantamento t where empresa_id=d.empresa_id and placa=car.placa)) where id=d.id;
  update public.frota_levantamento set ativo=false where id=d.origem_id;
  insert into public.frota_levantamento(empresa_id,placa,carro_id,cliente_id,responsavel,contato,inicio,diaria,ativo,km,km_data)
  values(d.empresa_id,car.placa,car.id,d.cliente_id,origem->>'responsavel',origem->>'contato',d.data_troca,coalesce(nullif(d.valores->>'diaria_substituto','')::numeric,(origem->>'diaria')::numeric),true,
   nullif(d.valores->>'quilometragem_posterior','')::bigint,(d.data_troca at time zone 'America/Manaus')::date)
  on conflict(empresa_id,placa) do update set carro_id=excluded.carro_id,cliente_id=excluded.cliente_id,responsavel=excluded.responsavel,contato=excluded.contato,inicio=excluded.inicio,diaria=excluded.diaria,ativo=true,km=excluded.km,km_data=excluded.km_data;
 end if;
 update public.frota_levantamento set ativo=false where empresa_id=d.empresa_id and carro_id=d.anterior_id and cliente_id=d.cliente_id and ativo;
 update public.carros set situacao='Locado' where id=d.posterior_id;
 update public.carros set situacao=coalesce(d.valores->>'situacao_anterior','Disponível'),observacoes=case when d.valores->>'situacao_anterior' in ('Manutenção','Revisão','Indisponível') then d.valores->>'motivo_alteracao' else observacoes end where id=d.anterior_id;
 update public.frota_substituicoes set confirmado_em=now() where id=d.id returning * into d;
 return to_jsonb(d);
end $$;

create or replace function public.substituicao_arquivo(p_nome text,p_escrita boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.frota_substituicoes d where public.acesso_modulo(d.empresa_id,'locacao')
 and (not p_escrita or (d.criado_por=auth.uid() and d.confirmado_em is null))
 and (p_nome=d.empresa_id::text||'/'||d.id::text||'/termo.pdf'
 or exists(select 1 from generate_series(1,d.fotos) i where p_nome=d.empresa_id::text||'/'||d.id::text||'/foto-'||i::text||'.jpg')));
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('substituicoes-frota','substituicoes-frota',false,52428800,array['application/pdf','image/jpeg']) on conflict(id) do nothing;
drop policy if exists substituicao_storage_limite on storage.objects;
create policy substituicao_storage_limite on storage.objects as restrictive for all to public
using(bucket_id<>'substituicoes-frota' or public.substituicao_arquivo(name,false))
with check(bucket_id<>'substituicoes-frota' or public.substituicao_arquivo(name,true));
drop policy if exists substituicao_storage_leitura on storage.objects;
create policy substituicao_storage_leitura on storage.objects for select to authenticated using(bucket_id='substituicoes-frota' and public.substituicao_arquivo(name,false));
drop policy if exists substituicao_storage_insercao on storage.objects;
create policy substituicao_storage_insercao on storage.objects for insert to authenticated with check(bucket_id='substituicoes-frota' and public.substituicao_arquivo(name,true));
drop policy if exists substituicao_storage_sem_edicao on storage.objects;
create policy substituicao_storage_sem_edicao on storage.objects as restrictive for update to public using(bucket_id<>'substituicoes-frota');
drop policy if exists substituicao_storage_sem_exclusao on storage.objects;
create policy substituicao_storage_sem_exclusao on storage.objects as restrictive for delete to public using(bucket_id<>'substituicoes-frota');
revoke all on function public.substituicao_preparar(uuid,uuid,text,uuid,uuid,timestamptz,uuid,jsonb,integer),public.substituicao_confirmar(uuid),public.substituicao_arquivo(text,boolean) from public,anon;
grant execute on function public.substituicao_preparar(uuid,uuid,text,uuid,uuid,timestamptz,uuid,jsonb,integer),public.substituicao_confirmar(uuid),public.substituicao_arquivo(text,boolean) to authenticated;
create or replace function public.substituicao_configuracao(p_empresa uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.';end if;
 return 2;
end $$;
revoke all on function public.substituicao_configuracao(uuid) from public,anon;
grant execute on function public.substituicao_configuracao(uuid) to authenticated;
notify pgrst,'reload schema';


notify pgrst,'reload schema';
commit;
select 'Rascunhos e substituições temporárias/permanentes habilitados' as resultado;
