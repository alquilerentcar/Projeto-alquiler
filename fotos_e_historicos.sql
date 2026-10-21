-- Executar inteiro como postgres. Preserva fotos, documentos e operações existentes.
-- Requer as áreas de substituição, frota, fornecedores e KM já ativadas.
reset role;
begin;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.frota_substituicoes'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%fotos%' loop
  execute format('alter table public.frota_substituicoes drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.frota_substituicoes add constraint frota_substituicoes_fotos_limite_check check(fotos between 1 and 60);
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
 if p_id is null then raise exception 'Identificador da preparação ausente. Atualize a página.';end if;
 if p_data is null or not isfinite(p_data) then raise exception 'Informe a data e a hora reais da troca (Manaus).';end if;
 if p_data>now() then raise exception 'A data e a hora da troca estão no futuro. Informe a entrega real no horário de Manaus.';end if;
 if p_fotos is null or p_fotos not between 1 and 60 then raise exception 'Selecione entre 1 e 60 fotos do veículo substituto.';end if;
 if jsonb_typeof(p_valores) is distinct from 'object' then raise exception 'Formato dos dados da troca inválido. Atualize a página.';end if;
 if length(p_valores::text)>50000 then raise exception 'Reduza os textos e observações da troca.';end if;
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
  select to_jsonb(t) into origem from public.frota_periodos t where t.id=p_ocupacao and t.empresa_id=p_empresa and t.fim is null and t.tipo='locacao';
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
create or replace function public.substituicao_limite_fotos(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 return 60;
end $$;
revoke all on function public.substituicao_limite_fotos(uuid) from public,anon;
grant execute on function public.substituicao_limite_fotos(uuid) to authenticated;
alter table public.frota_periodos add column if not exists cliente_contexto_id uuid references public.clientes(id);
alter table public.frota_periodos add column if not exists manutencao_operacao uuid;
alter table public.frota_periodos add column if not exists km_entrada bigint check(km_entrada>=0);
alter table public.frota_periodos add column if not exists km_saida bigint check(km_saida>=0);
alter table public.frota_periodos add column if not exists custo_manutencao numeric(12,2) check(custo_manutencao>=0);
alter table public.frota_periodos add column if not exists conclusao_manutencao text;
alter table public.frota_periodos add column if not exists concluido_por uuid;
alter table public.frota_periodos add column if not exists conclusao_registrada_em timestamptz;
create unique index if not exists frota_manutencao_operacao_unica on public.frota_periodos(manutencao_operacao) where manutencao_operacao is not null;
create index if not exists frota_manutencao_cliente on public.frota_periodos(empresa_id,cliente_contexto_id,inicio) where tipo='manutencao';

create or replace function public.frota_historico_configuracao(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 return 1;
end $$;

create or replace function public.frota_manutencao_abrir(p_empresa uuid,p_operacao uuid,p_carro uuid,p_fornecedor uuid,p_inicio timestamptz,p_previsao timestamptz,p_motivo text,p_cliente uuid default null,p_km bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.frota_periodos; c public.carros; novo uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 if p_operacao is null or p_inicio is null or not isfinite(p_inicio) or p_inicio>now() or (p_previsao is not null and not isfinite(p_previsao)) or nullif(trim(p_motivo),'') is null or length(p_motivo)>2000 or p_km<0 then raise exception 'Confira a entrada real, o motivo e o KM da manutenção.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into p from public.frota_periodos where manutencao_operacao=p_operacao for update;
 if p.id is not null then
  if p.empresa_id<>p_empresa or p.carro_id<>p_carro or p.criado_por<>auth.uid() or p.inicio<>p_inicio or p.fornecedor_id is distinct from p_fornecedor or p.observacoes is distinct from trim(p_motivo) or p.previsao is distinct from p_previsao or p.km_entrada is distinct from p_km or p.cliente_contexto_id is distinct from p_cliente then raise exception 'Esta operação já foi registrada com outros dados. Atualize o histórico.';end if;
  return p.id;
 end if;
 select * into c from public.carros where id=p_carro and empresa_id=p_empresa for update;
 if c.id is null or c.situacao in ('Vendido','Inativo') then raise exception 'Selecione um veículo ativo desta empresa.';end if;
 if p_cliente is not null and not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'O locatário relacionado deve pertencer a esta empresa.';end if;
 novo:=public.frota_registrar_manutencao(p_empresa,p_carro,p_fornecedor,p_inicio,p_previsao,p_motivo);
 update public.frota_periodos set manutencao_operacao=p_operacao,cliente_contexto_id=p_cliente,km_entrada=p_km where id=novo;
 update public.carros set situacao='Manutenção',situacao_confirmada_em=now(),observacoes=trim(p_motivo) where id=c.id;
 if p_km is not null then perform public.frota_registrar_km(p_empresa,c.id,p_inicio,p_km,'Entrada em manutenção: '||trim(p_motivo));end if;
 return novo;
end $$;

create or replace function public.frota_manutencao_concluir(p_empresa uuid,p_periodo uuid,p_fim timestamptz,p_conclusao text,p_custo numeric default null,p_km bigint default null,p_situacao text default 'Disponível',p_cliente uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.frota_periodos;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 if p_fim is null or not isfinite(p_fim) or p_fim>now() or nullif(trim(p_conclusao),'') is null or length(p_conclusao)>2000 or p_custo<0 or p_custo>999999999.99 or p_km<0 or p_situacao is null or p_situacao not in ('Disponível','Indisponível') then raise exception 'Confira a saída real, a conclusão, o custo e o KM.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into p from public.frota_periodos where id=p_periodo and empresa_id=p_empresa and tipo='manutencao' for update;
 if p.id is null then raise exception 'Manutenção não encontrada nesta empresa.';end if;
 if not exists(select 1 from public.carros where id=p.carro_id and coalesce(public.acesso_modulo(empresa_id,'locacao'),false)) then raise exception using errcode='42501',message='Sem acesso à empresa responsável pelo veículo.';end if;
 if p.fim is not null then
  if p.fim=p_fim and p.conclusao_manutencao=trim(p_conclusao) and p.custo_manutencao is not distinct from p_custo and p.km_saida is not distinct from p_km and (p_cliente is null or p.cliente_contexto_id=p_cliente) then return p.id;end if;
  raise exception 'A manutenção já foi concluída. Consulte o histórico antes de alterar.';
 end if;
 if p_fim<=p.inicio or p_km<p.km_entrada then raise exception 'A saída e o KM devem ser posteriores à entrada.';end if;
 if p_cliente is not null and not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'O locatário relacionado deve pertencer a esta empresa.';end if;
 if exists(select 1 from public.locacoes where carro_id=p.carro_id and status='Ativa') or exists(select 1 from public.frota_levantamento where carro_id=p.carro_id and ativo) or exists(select 1 from public.frota_periodos where carro_id=p.carro_id and id<>p.id and fim is null) then raise exception 'Há uma ocupação conflitante no veículo. Confira antes de concluir a manutenção.';end if;
 perform public.frota_movimentar(p_empresa,jsonb_build_object('acao','encerrar','periodo',p.id,'data',p_fim));
 update public.frota_periodos set conclusao_manutencao=trim(p_conclusao),custo_manutencao=p_custo,km_saida=p_km,cliente_contexto_id=coalesce(p_cliente,cliente_contexto_id),concluido_por=auth.uid(),conclusao_registrada_em=now() where id=p.id;
 update public.carros set situacao=p_situacao,situacao_confirmada_em=now(),observacoes=trim(p_conclusao) where id=p.carro_id;
 if p_km is not null then perform public.frota_registrar_km(p_empresa,p.carro_id,p_fim,p_km,'Saída de manutenção: '||trim(p_conclusao));end if;
 return p.id;
end $$;
revoke all on function public.frota_historico_configuracao(uuid),public.frota_manutencao_abrir(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,bigint),public.frota_manutencao_concluir(uuid,uuid,timestamptz,text,numeric,bigint,text,uuid) from public,anon;
grant execute on function public.frota_historico_configuracao(uuid),public.frota_manutencao_abrir(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,bigint),public.frota_manutencao_concluir(uuid,uuid,timestamptz,text,numeric,bigint,text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
select 'Até 60 fotos e históricos de manutenção preparados' as resultado;
