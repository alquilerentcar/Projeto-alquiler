-- SQL Editor, papel postgres. Rode depois de avisos_automaticos.sql.
-- CRLV de cada veículo em arquivo privado, com validade e aviso de vencimento.
-- Quando uma locação ou ocupação começa (ou o carro é trocado), o CRLV do carro entra na fila e vai sozinho para o e-mail do locatário.
-- Registro dos envios. Não altera nem apaga dados existentes.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documentos-veiculos','documentos-veiculos',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false;

create table if not exists public.carro_documentos(
 id uuid primary key,
 empresa_id uuid not null references public.empresas(id),
 carro_id uuid not null references public.carros(id),
 tipo text not null check(tipo in ('crlv','seguro','ipva','laudo','outro')),
 nome text not null check(length(trim(nome)) between 2 and 180),
 arquivo_path text not null unique,
 validade date,
 criado_em timestamptz not null default now(), criado_por uuid not null,
 arquivado_em timestamptz, arquivado_por uuid
);
create index if not exists carro_documentos_carro on public.carro_documentos(empresa_id,carro_id) where arquivado_em is null;
alter table public.carro_documentos enable row level security;
revoke all on public.carro_documentos from public,anon,authenticated;
grant select on public.carro_documentos to authenticated;
drop policy if exists leitura_empresa on public.carro_documentos;
create policy leitura_empresa on public.carro_documentos for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));

create table if not exists public.carro_documento_envios(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 carro_id uuid not null references public.carros(id),
 cliente_id uuid not null references public.clientes(id),
 email text not null, documentos uuid[] not null, motivo text,
 enviado_em timestamptz not null default now(), enviado_por uuid
);
alter table public.carro_documento_envios enable row level security;
revoke all on public.carro_documento_envios from public,anon,authenticated;
grant select on public.carro_documento_envios to authenticated;
drop policy if exists leitura_empresa on public.carro_documento_envios;
create policy leitura_empresa on public.carro_documento_envios for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));

-- Arquivos: pasta <empresa>/<carro>/<documento>.<ext>; só quem tem Locação naquela empresa.
create or replace function public.acesso_doc_veiculo(p_nome text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e uuid;
begin
 begin e:=split_part(p_nome,'/',1)::uuid; exception when others then return false; end;
 return auth.uid() is not null and coalesce(public.acesso_modulo(e,'locacao'),false);
end $$;
revoke all on function public.acesso_doc_veiculo(text) from public,anon;
grant execute on function public.acesso_doc_veiculo(text) to authenticated;
drop policy if exists docs_veiculos_ler on storage.objects;
create policy docs_veiculos_ler on storage.objects for select to authenticated using(bucket_id='documentos-veiculos' and public.acesso_doc_veiculo(name));
drop policy if exists docs_veiculos_enviar on storage.objects;
create policy docs_veiculos_enviar on storage.objects for insert to authenticated with check(bucket_id='documentos-veiculos' and public.acesso_doc_veiculo(name));

create or replace function public.carro_documento_registrar(p_empresa uuid,p_carro uuid,p_id uuid,p_tipo text,p_nome text,p_path text,p_validade date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.carro_documentos;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 if not exists(select 1 from public.carros where id=p_carro and empresa_id=p_empresa) then raise exception 'Veículo não encontrado nesta empresa.'; end if;
 if p_id is null or p_tipo not in ('crlv','seguro','ipva','laudo','outro') or length(trim(coalesce(p_nome,''))) not between 2 and 180
  or p_path !~ ('^'||p_empresa::text||'/'||p_carro::text||'/'||p_id::text||'\.(pdf|jpg|png|webp)$')
  or not exists(select 1 from storage.objects where bucket_id='documentos-veiculos' and name=p_path) then raise exception 'Confira o arquivo, o tipo e a descrição.'; end if;
 insert into public.carro_documentos(id,empresa_id,carro_id,tipo,nome,arquivo_path,validade,criado_por)
 values(p_id,p_empresa,p_carro,p_tipo,trim(p_nome),p_path,p_validade,auth.uid()) on conflict(id) do nothing;
 select * into o from public.carro_documentos where id=p_id;
 if o.empresa_id<>p_empresa or o.carro_id<>p_carro or o.arquivo_path<>p_path then raise exception 'A referência já pertence a outro registro.'; end if;
 return p_id;
end $$;
revoke all on function public.carro_documento_registrar(uuid,uuid,uuid,text,text,text,date) from public,anon;
grant execute on function public.carro_documento_registrar(uuid,uuid,uuid,text,text,text,date) to authenticated;

-- Validade pode ser corrigida; documento substituído vai para o arquivo (não é apagado).
create or replace function public.carro_documento_atualizar(p_empresa uuid,p_id uuid,p_validade date,p_arquivar boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 update public.carro_documentos set validade=p_validade,
  arquivado_em=case when p_arquivar then coalesce(arquivado_em,now()) else arquivado_em end,
  arquivado_por=case when p_arquivar then coalesce(arquivado_por,auth.uid()) else arquivado_por end
 where id=p_id and empresa_id=p_empresa;
 if not found then raise exception 'Documento não encontrado.'; end if;
end $$;
revoke all on function public.carro_documento_atualizar(uuid,uuid,date,boolean) from public,anon;
grant execute on function public.carro_documento_atualizar(uuid,uuid,date,boolean) to authenticated;

-- Quem está com o carro agora (para sugerir o destinatário do e-mail).
create or replace function public.carro_ocupante_atual(p_empresa uuid,p_carro uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 select cliente_id into c from public.locacoes where carro_id=p_carro and empresa_id=p_empresa and status='Ativa' limit 1;
 if c is null then select cliente_id into c from public.frota_periodos where carro_id=p_carro and empresa_id=p_empresa and fim is null and tipo='locacao' limit 1; end if;
 if c is null then select cliente_id into c from public.frota_levantamento where carro_id=p_carro and empresa_id=p_empresa and ativo limit 1; end if;
 return (select jsonb_build_object('cliente_id',cl.id,'nome',cl.nome_completo,'email',cl.email) from public.clientes cl where cl.id=c);
end $$;
revoke all on function public.carro_ocupante_atual(uuid,uuid) from public,anon;
grant execute on function public.carro_ocupante_atual(uuid,uuid) to authenticated;

-- Registro do envio (chamado pelo servidor depois que o e-mail sai, com a sessão do usuário).
create or replace function public.carro_documento_envio_registrar(p_empresa uuid,p_carro uuid,p_cliente uuid,p_email text,p_documentos uuid[],p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 insert into public.carro_documento_envios(empresa_id,carro_id,cliente_id,email,documentos,motivo,enviado_por)
 values(p_empresa,p_carro,p_cliente,lower(trim(p_email)),p_documentos,nullif(trim(coalesce(p_motivo,'')),''),auth.uid()) returning id into r;
 return r;
end $$;
revoke all on function public.carro_documento_envio_registrar(uuid,uuid,uuid,text,uuid[],text) from public,anon;
grant execute on function public.carro_documento_envio_registrar(uuid,uuid,uuid,text,uuid[],text) to authenticated;

-- Avisos: documento do veículo vencendo (30 dias) ou vencido, para carros que não foram vendidos.
alter table public.avisos drop constraint if exists avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check(tipo in ('devolucao_amanha','devolucao_atrasada','cnh_vencendo','cnh_vencida','documento_vencendo','documento_vencido','crlv_pendente'));
create or replace function public.avisos_documentos_veiculo(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Manaus')::date; k integer;
 nomes constant jsonb:='{"crlv":"CRLV / licenciamento","seguro":"Seguro","ipva":"IPVA","laudo":"Laudo","outro":"Documento"}';
begin
 insert into public.avisos(empresa_id,tipo,chave,nivel,titulo,mensagem,link,carro_id)
 select d.empresa_id,case when d.validade<hoje then 'documento_vencido' else 'documento_vencendo' end,
  case when d.validade<hoje then 'documento_vencido:' else 'documento_vencendo:' end||d.id||':'||d.validade,
  case when d.validade<hoje then 'urgente' else 'atencao' end,
  (nomes->>d.tipo)||case when d.validade<hoje then ' vencido · ' else ' vencendo · ' end||c.placa,
  (nomes->>d.tipo)||' do '||c.placa||case when d.validade<hoje then ' venceu em '||to_char(d.validade,'DD/MM/YYYY')||'. Renove e anexe o novo documento.'
   else ' vence em '||to_char(d.validade,'DD/MM/YYYY')||' ('||(d.validade-hoje)||' dia(s)).' end,
  'carros.html',d.carro_id
 from public.carro_documentos d join public.carros c on c.id=d.carro_id
 where d.empresa_id=p_empresa and d.arquivado_em is null and d.validade is not null and d.validade<=hoje+30 and coalesce(c.situacao,'')<>'Vendido'
 on conflict(empresa_id,chave) do nothing;get diagnostics k=row_count;
 update public.avisos a set resolvido_em=now() where a.empresa_id=p_empresa and a.tipo in ('documento_vencendo','documento_vencido') and a.resolvido_em is null
  and not exists(select 1 from public.carro_documentos d join public.carros c on c.id=d.carro_id where a.chave like '%:'||d.id||':'||d.validade and d.arquivado_em is null and d.validade<=hoje+30 and coalesce(c.situacao,'')<>'Vendido');
 return k;
end $$;
revoke all on function public.avisos_documentos_veiculo(uuid) from public,anon,authenticated;
do $do$
declare d text;
begin
 d:=pg_get_functiondef('public.avisos_gerar_empresa(uuid)'::regprocedure);
 if position('avisos_documentos_veiculo' in d)=0 then
  if position(' return n;' in d)=0 then raise exception 'Não achei o fim de avisos_gerar_empresa.'; end if;
  execute replace(d,' return n;',' n:=n+public.avisos_documentos_veiculo(p_empresa);'||chr(10)||' return n;');
 end if;
end $do$;

-- ===================== Envio automático do CRLV =====================
-- Fila: um envio por carro + locatário + dia (locação ativada, ocupação iniciada ou carro trocado no mesmo dia mandam um e-mail só).
create table if not exists public.crlv_envios_fila(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 carro_id uuid not null references public.carros(id),
 cliente_id uuid not null references public.clientes(id),
 origem text not null check(origem in ('locacao','ocupacao','substituicao')),
 referencia_id uuid,
 dia date not null default (now() at time zone 'America/Manaus')::date,
 criado_em timestamptz not null default now(),
 enviado_em timestamptz, tentativas integer not null default 0, erro text,
 unique(empresa_id,carro_id,cliente_id,dia)
);
create index if not exists crlv_fila_pendentes on public.crlv_envios_fila(empresa_id) where enviado_em is null;
alter table public.crlv_envios_fila enable row level security;
revoke all on public.crlv_envios_fila from public,anon,authenticated;

-- Colocar na fila nunca atrapalha a operação: qualquer erro aqui é ignorado.
create or replace function public.crlv_enfileirar(p_empresa uuid,p_carro uuid,p_cliente uuid,p_origem text,p_ref uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_empresa is null or p_carro is null or p_cliente is null then return; end if;
 insert into public.crlv_envios_fila(empresa_id,carro_id,cliente_id,origem,referencia_id) values(p_empresa,p_carro,p_cliente,p_origem,p_ref)
 on conflict(empresa_id,carro_id,cliente_id,dia) do nothing;
exception when others then null;
end $$;
revoke all on function public.crlv_enfileirar(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;

create or replace function public.crlv_gatilho()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='locacoes' then
  if new.status='Ativa' and (tg_op='INSERT' or old.status is distinct from 'Ativa') then perform public.crlv_enfileirar(new.empresa_id,new.carro_id,new.cliente_id,'locacao',new.id); end if;
 elsif tg_table_name='frota_periodos' then
  if new.tipo='locacao' and new.fim is null then perform public.crlv_enfileirar(new.empresa_id,new.carro_id,new.cliente_id,'ocupacao',new.id); end if;
 elsif tg_table_name='frota_levantamento' then
  if new.ativo and (tg_op='INSERT' or not old.ativo or old.cliente_id is distinct from new.cliente_id or old.carro_id is distinct from new.carro_id) then perform public.crlv_enfileirar(new.empresa_id,new.carro_id,new.cliente_id,'ocupacao',new.id); end if;
 elsif tg_table_name='frota_substituicoes' then
  if new.confirmado_em is not null and (tg_op='INSERT' or old.confirmado_em is null) then perform public.crlv_enfileirar(new.empresa_id,new.posterior_id,new.cliente_id,'substituicao',new.id); end if;
 end if;
 return null;
end $$;
revoke all on function public.crlv_gatilho() from public,anon,authenticated;
drop trigger if exists crlv_envio on public.locacoes;
create trigger crlv_envio after insert or update of status on public.locacoes for each row execute function public.crlv_gatilho();
drop trigger if exists crlv_envio on public.frota_periodos;
create trigger crlv_envio after insert on public.frota_periodos for each row execute function public.crlv_gatilho();
drop trigger if exists crlv_envio on public.frota_levantamento;
create trigger crlv_envio after insert or update on public.frota_levantamento for each row execute function public.crlv_gatilho();
drop trigger if exists crlv_envio on public.frota_substituicoes;
create trigger crlv_envio after insert or update of confirmado_em on public.frota_substituicoes for each row execute function public.crlv_gatilho();

-- O que falta enviar (últimos 7 dias, até 5 falhas do serviço), já com o CRLV atual do carro e o e-mail do locatário.
create or replace function public.crlv_fila_itens(p_empresa uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'empresa_id',f.empresa_id,'carro_id',f.carro_id,'cliente_id',f.cliente_id,'origem',f.origem,
  'placa',c.placa,'veiculo',trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,'')),'nome',cl.nome_completo,'email',cl.email,
  'documento',(select jsonb_build_object('id',d.id,'nome',d.nome,'arquivo_path',d.arquivo_path) from public.carro_documentos d
    where d.carro_id=f.carro_id and d.tipo='crlv' and d.arquivado_em is null order by d.criado_em desc limit 1)) order by f.criado_em),'[]'::jsonb)
 from public.crlv_envios_fila f join public.carros c on c.id=f.carro_id join public.clientes cl on cl.id=f.cliente_id
 where (p_empresa is null or f.empresa_id=p_empresa) and f.enviado_em is null and f.tentativas<5 and f.criado_em>now()-interval '7 days'
$$;
revoke all on function public.crlv_fila_itens(uuid) from public,anon,authenticated;

create or replace function public.crlv_fila_pendentes(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 return public.crlv_fila_itens(p_empresa);
end $$;
revoke all on function public.crlv_fila_pendentes(uuid) from public,anon;
grant execute on function public.crlv_fila_pendentes(uuid) to authenticated;
create or replace function public.crlv_fila_pendentes_todas()
returns jsonb language sql stable security definer set search_path='' as $$ select public.crlv_fila_itens(null) $$;
revoke all on function public.crlv_fila_pendentes_todas() from public,anon,authenticated;
grant execute on function public.crlv_fila_pendentes_todas() to service_role;

-- Resultado do envio. Falta de CRLV ou de e-mail não gasta tentativa: assim que o dado for cadastrado, o próximo ciclo envia.
create or replace function public.crlv_fila_resultado_item(p_id uuid,p_ok boolean,p_motivo text,p_documento uuid,p_por uuid)
returns void language plpgsql security definer set search_path='' as $$
declare f public.crlv_envios_fila; c public.carros; cl public.clientes;
begin
 select * into f from public.crlv_envios_fila where id=p_id for update;
 if f.id is null or f.enviado_em is not null then return; end if;
 select * into c from public.carros where id=f.carro_id;select * into cl from public.clientes where id=f.cliente_id;
 if p_ok then
  update public.crlv_envios_fila set enviado_em=now(),erro=null where id=f.id;
  insert into public.carro_documento_envios(empresa_id,carro_id,cliente_id,email,documentos,motivo,enviado_por)
  values(f.empresa_id,f.carro_id,f.cliente_id,lower(trim(cl.email)),array[p_documento],case f.origem when 'locacao' then 'Envio automático: locação ativada' when 'substituicao' then 'Envio automático: substituição de veículo' else 'Envio automático: ocupação iniciada' end,p_por);
  update public.avisos set resolvido_em=now() where empresa_id=f.empresa_id and chave='crlv_pendente:'||f.id and resolvido_em is null;
 else
  update public.crlv_envios_fila set erro=left(coalesce(p_motivo,'falha'),300),tentativas=tentativas+case when p_motivo in ('sem_crlv','sem_email') then 0 else 1 end where id=f.id;
  insert into public.avisos(empresa_id,tipo,chave,nivel,titulo,mensagem,link,cliente_id,carro_id)
  values(f.empresa_id,'crlv_pendente','crlv_pendente:'||f.id,'atencao','CRLV não enviado · '||c.placa,
   case p_motivo when 'sem_crlv' then 'O '||c.placa||' está sem CRLV anexado. Anexe em Veículos → Documentos que o envio para '||cl.nome_completo||' sai sozinho.'
    when 'sem_email' then cl.nome_completo||' está sem e-mail no cadastro. Cadastre o e-mail que o CRLV do '||c.placa||' sai sozinho.'
    else 'O serviço de e-mail falhou ao enviar o CRLV do '||c.placa||' para '||cl.nome_completo||'. O sistema vai tentar de novo.' end,
   case p_motivo when 'sem_email' then 'clientes.html' else 'carros.html' end,f.cliente_id,f.carro_id)
  on conflict(empresa_id,chave) do update set mensagem=excluded.mensagem,link=excluded.link;
 end if;
end $$;
revoke all on function public.crlv_fila_resultado_item(uuid,boolean,text,uuid,uuid) from public,anon,authenticated;
create or replace function public.crlv_fila_resultado(p_empresa uuid,p_id uuid,p_ok boolean,p_motivo text,p_documento uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem permissão.'; end if;
 if not exists(select 1 from public.crlv_envios_fila where id=p_id and empresa_id=p_empresa) then raise exception 'Envio não encontrado.'; end if;
 perform public.crlv_fila_resultado_item(p_id,p_ok,p_motivo,p_documento,auth.uid());
end $$;
revoke all on function public.crlv_fila_resultado(uuid,uuid,boolean,text,uuid) from public,anon;
grant execute on function public.crlv_fila_resultado(uuid,uuid,boolean,text,uuid) to authenticated;
create or replace function public.crlv_fila_resultado_servico(p_id uuid,p_ok boolean,p_motivo text,p_documento uuid)
returns void language sql security definer set search_path='' as $$ select public.crlv_fila_resultado_item(p_id,p_ok,p_motivo,p_documento,null) $$;
revoke all on function public.crlv_fila_resultado_servico(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.crlv_fila_resultado_servico(uuid,boolean,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
select 'CRLV dos veículos e envio automático prontos.' as resultado;
