-- Corrige a preparação dos termos sem alterar registros. Execute como postgres.
reset role;
begin;
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
 if p_fotos is null or p_fotos not between 1 and 20 then raise exception 'Selecione entre 1 e 20 fotos do veículo substituto.';end if;
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


notify pgrst,'reload schema';
commit;
select 'Preparação dos termos corrigida' as resultado;
