-- Execute como postgres. Preserva o termo temporário e não movimenta veículos.
begin;
create or replace function public.substituicao_permanente_preparar(p_empresa uuid,p_temporaria uuid,p_id uuid,p_data timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.frota_substituicoes; d public.frota_substituicoes; atual jsonb; txt text; blocos jsonb;
begin
 perform pg_advisory_xact_lock(7261002);
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.'; end if;
 select * into t from public.frota_substituicoes where id=p_temporaria and empresa_id=p_empresa for update;
 if not found or t.confirmado_em is null or t.valores->>'tipo_substituicao' is distinct from 'temporaria' then raise exception 'Selecione uma substituição temporária confirmada.'; end if;
 if p_id is null or p_data is null or not isfinite(p_data) or p_data<t.data_troca or p_data>now() then raise exception 'Confira a data real da decisão de tornar a substituição permanente.'; end if;
 select * into d from public.frota_substituicoes where id=p_id;
 if found then
  if d.empresa_id<>p_empresa or d.criado_por<>auth.uid() or d.valores->>'termo_temporario_id' is distinct from t.id::text then raise exception 'Preparação indisponível.'; end if;
  return to_jsonb(d);
 end if;
 if t.valores->>'permanente_confirmada_id' is not null then raise exception 'Esta substituição já foi tornada permanente.'; end if;
 select to_jsonb(p) into atual from public.frota_periodos p where p.empresa_id=p_empresa and p.cliente_id=t.cliente_id and p.carro_id=t.posterior_id and p.fim is null and p.tipo='locacao';
 if atual is null then select to_jsonb(p) into atual from public.locacoes p where p.empresa_id=p_empresa and p.cliente_id=t.cliente_id and p.carro_id=t.posterior_id and p.status='Ativa'; end if;
 if atual is null then select to_jsonb(p) into atual from public.frota_levantamento p where p.empresa_id=p_empresa and p.cliente_id=t.cliente_id and p.carro_id=t.posterior_id and p.ativo; end if;
 if atual is null or exists(select 1 from public.frota_substituicoes s where s.empresa_id=p_empresa and s.cliente_id=t.cliente_id and s.confirmado_em is not null and s.data_troca>t.data_troca and coalesce(s.valores->>'termo_temporario_id','')<>t.id::text) then raise exception 'A ocupação mudou. Confira o veículo atual antes de gerar o aditivo.'; end if;
 blocos:=jsonb_build_array(
 jsonb_build_object('align','center','runs',jsonb_build_array(jsonb_build_object('text','TERMO ADITIVO DE SUBSTITUIÇÃO PERMANENTE','bold',true,'size',13))),
 jsonb_build_object('align','justify','runs',jsonb_build_array(jsonb_build_object('text',concat('LOCADORA: ',t.snapshot#>>'{empresa,razao_social}',', CNPJ ',t.snapshot#>>'{empresa,cnpj}', '. LOCATÁRIO: ',t.snapshot#>>'{cliente,nome_completo}',', CPF ',t.snapshot#>>'{cliente,cpf}', '.'),'size',11))),
 jsonb_build_object('align','justify','runs',jsonb_build_array(jsonb_build_object('text','CLÁUSULA PRIMEIRA - DA CONVERSÃO EM SUBSTITUIÇÃO PERMANENTE','bold',true,'size',11))),
 jsonb_build_object('align','justify','runs',jsonb_build_array(jsonb_build_object('text',concat('As partes tornam permanente, a partir de ',to_char(p_data at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'),' (Manaus), a substituição temporária registrada no termo ',t.id,' de ',to_char(t.data_troca at time zone 'America/Manaus','DD/MM/YYYY HH24:MI'),'. O veículo original ',t.snapshot#>>'{anterior,placa}',' permanece substituído pelo veículo ',t.snapshot#>>'{posterior,placa}',', que já está com o locatário. Não ocorre nova entrega ou nova troca física neste ato. A previsão de retorno ao veículo original fica encerrada.'),'size',11))),
 jsonb_build_object('align','justify','runs',jsonb_build_array(jsonb_build_object('text','CLÁUSULA SEGUNDA - DA RATIFICAÇÃO','bold',true,'size',11))),
 jsonb_build_object('align','justify','runs',jsonb_build_array(jsonb_build_object('text','Permanecem as condições e a diária da ocupação atual. O termo temporário e os períodos anteriores ficam preservados. As fotos anexadas são as da entrega temporária original, não representam nova vistoria.','size',11))),
 jsonb_build_object('align','center','runs',jsonb_build_array(jsonb_build_object('text',E'________________________________\nLOCADORA\n\n________________________________\nLOCATÁRIO','size',11)))
 );
 select string_agg(b.value#>>'{runs,0,text}',E'\n\n' order by b.ordinality) into txt from jsonb_array_elements(blocos) with ordinality b;
 insert into public.frota_substituicoes(id,empresa_id,criado_por,origem_tipo,origem_id,cliente_id,anterior_id,posterior_id,data_troca,versao_id,snapshot,valores,texto,fotos)
 values(p_id,p_empresa,auth.uid(),t.origem_tipo,t.origem_id,t.cliente_id,t.anterior_id,t.posterior_id,p_data,t.versao_id,
 t.snapshot||jsonb_build_object('ocupacao_na_conversao',atual,'modelo',jsonb_build_object('formatacao',blocos),'complemento',null),
 t.valores||jsonb_build_object('tipo_substituicao','permanente','termo_temporario_id',t.id,'previsao_retorno',null,'conversao_sem_troca_fisica',true),txt,t.fotos) returning * into d;
 return to_jsonb(d);
end $$;

do $$begin
 if to_regprocedure('public.substituicao_confirmar_movimentacao(uuid)') is null then
  alter function public.substituicao_confirmar(uuid) rename to substituicao_confirmar_movimentacao;
 end if;
end $$;
revoke all on function public.substituicao_confirmar_movimentacao(uuid) from public,anon,authenticated;
create or replace function public.substituicao_confirmar(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.frota_substituicoes; t public.frota_substituicoes; i integer;
begin
 perform pg_advisory_xact_lock(7261002);
 select * into d from public.frota_substituicoes where id=p_id for update;
 if not found or auth.uid() is null or d.criado_por<>auth.uid() or not coalesce(public.acesso_modulo(d.empresa_id,'locacao'),false) then raise exception 'Sem acesso à troca.'; end if;
 if d.valores->>'conversao_sem_troca_fisica' is distinct from 'true' then return public.substituicao_confirmar_movimentacao(p_id); end if;
 if d.confirmado_em is not null then return to_jsonb(d); end if;
 select * into t from public.frota_substituicoes where id=(d.valores->>'termo_temporario_id')::uuid and empresa_id=d.empresa_id for update;
 if not found or t.confirmado_em is null or t.valores->>'tipo_substituicao' is distinct from 'temporaria' or t.valores->>'permanente_confirmada_id' is not null then raise exception 'Termo temporário indisponível ou já convertido.'; end if;
 if d.cliente_id<>t.cliente_id or d.anterior_id<>t.anterior_id or d.posterior_id<>t.posterior_id or d.versao_id<>t.versao_id or d.valores->>'tipo_substituicao' is distinct from 'permanente' or d.snapshot->'ocupacao_na_conversao' is null then raise exception 'Conversão incompatível com o termo original.'; end if;
 if exists(select 1 from public.frota_substituicoes s where s.empresa_id=d.empresa_id and s.cliente_id=d.cliente_id and s.confirmado_em is not null and s.data_troca>t.data_troca and s.id<>d.id and coalesce(s.valores->>'termo_temporario_id','')<>t.id::text) then raise exception 'Há outra substituição posterior. Confira a ocupação.'; end if;
 if not exists(select 1 from public.frota_periodos where empresa_id=d.empresa_id and cliente_id=d.cliente_id and carro_id=d.posterior_id and fim is null and tipo='locacao')
 and not exists(select 1 from public.locacoes where empresa_id=d.empresa_id and cliente_id=d.cliente_id and carro_id=d.posterior_id and status='Ativa')
 and not exists(select 1 from public.frota_levantamento where empresa_id=d.empresa_id and cliente_id=d.cliente_id and carro_id=d.posterior_id and ativo) then raise exception 'O locatário não está mais com o veículo substituto.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='substituicoes-frota' and name=d.empresa_id::text||'/'||d.id::text||'/termo.pdf') then raise exception 'Gere e envie o PDF antes de confirmar.'; end if;
 for i in 1..d.fotos loop
  if not exists(select 1 from storage.objects where bucket_id='substituicoes-frota' and name=d.empresa_id::text||'/'||d.id::text||'/foto-'||i||'.jpg') then raise exception 'Falta a foto % do termo original.',i; end if;
 end loop;
 update public.frota_substituicoes set confirmado_em=now() where id=d.id returning * into d;
 update public.frota_substituicoes set valores=valores||jsonb_build_object('permanente_confirmada_id',d.id,'permanente_confirmada_em',d.data_troca) where id=t.id;
 return to_jsonb(d);
end $$;
revoke all on function public.substituicao_permanente_preparar(uuid,uuid,uuid,timestamptz),public.substituicao_confirmar(uuid) from public,anon;
grant execute on function public.substituicao_permanente_preparar(uuid,uuid,uuid,timestamptz),public.substituicao_confirmar(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
