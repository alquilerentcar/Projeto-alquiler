-- Atualização operacional. Execute como postgres no SQL Editor.
-- Não apaga registros nem recria contas. Requer frota_operacao.sql já aplicado.

-- empresa_endereco.sql
-- Acrescenta campos; preserva o endereço e todos os registros existentes.
begin;
alter table public.empresas add column if not exists cep text;
alter table public.empresas add column if not exists numero text;
alter table public.empresas add column if not exists complemento text;
alter table public.empresas add column if not exists bairro text;
alter table public.empresas add column if not exists cidade text;
alter table public.empresas add column if not exists uf text;
notify pgrst, 'reload schema';
commit;


-- notificacoes-postagens.sql
begin;
create table if not exists public.notificacoes_postagens (
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id) on delete cascade,
 autor_id uuid references auth.users(id) on delete set null,
 autor_nome text not null,
 titulo text not null check(char_length(titulo) between 1 and 150),
 mensagem text not null check(char_length(mensagem) between 1 and 5000),
 criado_em timestamptz not null default now()
);
create index if not exists notificacoes_postagens_empresa_data on public.notificacoes_postagens(empresa_id,criado_em desc,id desc);
alter table public.notificacoes_postagens enable row level security;
revoke all on public.notificacoes_postagens from anon,authenticated;
grant select on public.notificacoes_postagens to authenticated;
drop policy if exists postagens_leitura_empresa on public.notificacoes_postagens;
create policy postagens_leitura_empresa on public.notificacoes_postagens for select to authenticated
 using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.notificacao_publicar(p_empresa uuid,p_titulo text,p_mensagem text)
returns uuid language plpgsql security definer set search_path='' as $$
declare nome text; novo uuid;
begin
 if auth.uid() is null or not public.acesso_modulo(p_empresa,'locacao') then raise exception using errcode='42501',message='Sem acesso à empresa.'; end if;
 select u.nome into nome from public.usuarios_empresa u where u.auth_user_id=auth.uid() and u.empresa_id=p_empresa and u.ativo;
 if nome is null then raise exception using errcode='42501',message='É necessário um usuário ativo nesta empresa para publicar.'; end if;
 if char_length(btrim(coalesce(p_titulo,''))) not between 1 and 150 or char_length(btrim(coalesce(p_mensagem,''))) not between 1 and 5000 then raise exception 'Informe título e mensagem dentro dos limites.'; end if;
 insert into public.notificacoes_postagens(empresa_id,autor_id,autor_nome,titulo,mensagem) values(p_empresa,auth.uid(),nome,btrim(p_titulo),btrim(p_mensagem)) returning id into novo;
 return novo;
end $$;
revoke all on function public.notificacao_publicar(uuid,text,text) from public,anon;
grant execute on function public.notificacao_publicar(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;


-- frota_levantamento.sql
begin;
create table if not exists public.frota_levantamento(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
 placa text not null,carro_id uuid references public.carros(id),cliente_id uuid references public.clientes(id),
 responsavel text not null,contato text not null,km bigint check(km>=0),km_data date,
 inicio timestamptz,diaria numeric(12,2) check(diaria>=0),ativo boolean not null default true,
 registrado_em timestamptz not null default now(),unique(empresa_id,placa)
);
alter table public.frota_levantamento enable row level security;
revoke all on public.frota_levantamento from anon,authenticated;
grant select on public.frota_levantamento to authenticated;
drop policy if exists levantamento_leitura on public.frota_levantamento;
create policy levantamento_leitura on public.frota_levantamento for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
commit;


-- frota_km.sql
-- Executar como postgres. Requer frota_operacao.sql e importar-ocupacoes-atuais.sql.
begin;
create table if not exists public.frota_km (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),carro_id uuid not null references public.carros(id),
 leitura_em timestamptz not null,km bigint not null check(km>=0),cliente_id uuid references public.clientes(id),responsavel text,ocupacao_chave text,
 observacoes text,criado_por uuid,criado_em timestamptz not null default now(),precisao_data text not null default 'hora' check(precisao_data in ('dia','hora')),origem text not null default 'manual',unique(empresa_id,carro_id,leitura_em)
);
alter table public.frota_km alter column criado_por drop not null;
alter table public.frota_km add column if not exists precisao_data text not null default 'hora' check(precisao_data in ('dia','hora'));
alter table public.frota_km add column if not exists origem text not null default 'manual';
alter table public.frota_km enable row level security;
revoke all on public.frota_km from public,anon,authenticated;
grant select on public.frota_km to authenticated;
drop policy if exists frota_km_leitura on public.frota_km;
create policy frota_km_leitura on public.frota_km for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.frota_registrar_km(p_empresa uuid,p_carro uuid,p_leitura timestamptz,p_km bigint,p_observacoes text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare novo uuid; pessoa uuid; nome text; chave text; candidatos integer;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.'; end if;
 if p_leitura is null or p_leitura>now() or p_km is null or p_km<0 or length(coalesce(p_observacoes,''))>2000 then raise exception 'Informe data real, KM positivo e observação de até 2000 caracteres.'; end if;
 if not exists(select 1 from public.carros where id=p_carro and empresa_id=p_empresa) and not exists(select 1 from public.frota_periodos where carro_id=p_carro and empresa_id=p_empresa) and not exists(select 1 from public.frota_levantamento where carro_id=p_carro and empresa_id=p_empresa and ativo) then raise exception 'Veículo não pertence à operação desta empresa.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_carro::text,0));
 if exists(select 1 from public.frota_km where carro_id=p_carro and ((leitura_em<p_leitura and km>p_km) or (leitura_em>p_leitura and km<p_km))) then raise exception 'KM incompatível com uma leitura anterior ou posterior.'; end if;
 -- Sobreposição entre fluxos deixa a leitura sem atribuição, em vez de escolher uma pessoa.
 select count(*) into candidatos from (
 select id from public.frota_periodos where empresa_id=p_empresa and carro_id=p_carro and inicio<=p_leitura and (fim is null or p_leitura<fim)
 union all select id from public.locacoes where empresa_id=p_empresa and carro_id=p_carro and status in ('Ativa','Encerrada') and data_inicio<=p_leitura and (data_fim is null or p_leitura<data_fim)
 ) x;
 if candidatos=1 then
  select p.cliente_id,coalesce(to_jsonb(c)->>'nome_completo',to_jsonb(c)->>'nome'),'periodo:'||p.id into pessoa,nome,chave from public.frota_periodos p left join public.clientes c on c.id=p.cliente_id where p.empresa_id=p_empresa and p.carro_id=p_carro and p.inicio<=p_leitura and (p.fim is null or p_leitura<p.fim);
  if chave is null then select l.cliente_id,coalesce(to_jsonb(c)->>'nome_completo',to_jsonb(c)->>'nome'),'locacao:'||l.id into pessoa,nome,chave from public.locacoes l left join public.clientes c on c.id=l.cliente_id where l.empresa_id=p_empresa and l.carro_id=p_carro and l.status in ('Ativa','Encerrada') and l.data_inicio<=p_leitura and (l.data_fim is null or p_leitura<l.data_fim); end if;
 elsif candidatos=0 then
  -- Levantamento sem início conhecido: só permite atribuição de leituras posteriores ao registro.
  select l.cliente_id,l.responsavel,'levantamento:'||l.id||':'||coalesce(l.cliente_id::text,l.responsavel) into pessoa,nome,chave from public.frota_levantamento l where l.empresa_id=p_empresa and l.carro_id=p_carro and l.ativo and p_leitura>=coalesce(l.inicio,l.registrado_em);
 end if;
 insert into public.frota_km(empresa_id,carro_id,leitura_em,km,cliente_id,responsavel,ocupacao_chave,observacoes,criado_por) values(p_empresa,p_carro,p_leitura,p_km,pessoa,nome,chave,nullif(trim(p_observacoes),''),auth.uid()) returning id into novo;
 return novo;
end $$;
revoke all on function public.frota_registrar_km(uuid,uuid,timestamptz,bigint,text) from public,anon;
grant execute on function public.frota_registrar_km(uuid,uuid,timestamptz,bigint,text) to authenticated;
commit;
select 'Histórico de KM preparado' as resultado;


-- fornecedores_manutencao.sql
-- Executar como postgres, após frota_operacao.sql e importar-ocupacoes-atuais.sql.
begin;
alter table public.fornecedores add column if not exists categoria_fornecedor text not null default 'outros' check(categoria_fornecedor in ('oficina','veiculos','ambos','outros'));
alter table public.frota_periodos add column if not exists fornecedor_id uuid references public.fornecedores(id);
create or replace function public.frota_registrar_manutencao(p_empresa uuid,p_carro uuid,p_fornecedor uuid,p_inicio timestamptz,p_previsao timestamptz default null,p_motivo text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare novo uuid:=gen_random_uuid(); local_nome text; dono uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.'; end if;
 if p_inicio is null or p_inicio>now() or (p_previsao is not null and p_previsao<p_inicio) then raise exception 'Confira a data real de entrada e a previsão de saída.'; end if;
 if length(trim(coalesce(p_motivo,'')))=0 or length(p_motivo)>2000 then raise exception 'Informe o motivo da manutenção (até 2000 caracteres).'; end if;
 select empresa_id into dono from public.carros where id=p_carro;
 if dono is null or not coalesce(public.acesso_modulo(dono,'locacao'),false) then raise exception 'Sem acesso ao veículo.'; end if;
 if dono<>p_empresa and not exists(select 1 from public.frota_levantamento where empresa_id=p_empresa and carro_id=p_carro and ativo) and not exists(select 1 from public.frota_periodos where empresa_id=p_empresa and carro_id=p_carro) then raise exception 'Veículo fora da operação desta empresa.'; end if;
 select coalesce(nullif(nome_fantasia,''),razao_social) into local_nome from public.fornecedores where id=p_fornecedor and empresa_id=p_empresa and coalesce(situacao,'Ativo')<>'Inativo' and categoria_fornecedor in ('oficina','ambos');
 if local_nome is null then raise exception 'Selecione uma oficina ativa desta empresa.'; end if;
 perform pg_advisory_xact_lock(7261002);
 if exists(select 1 from public.carros where id=p_carro and situacao='Inativo') then raise exception 'Veículo inativo.'; end if;
 if exists(select 1 from public.frota_periodos where carro_id=p_carro and tstzrange(inicio,fim,'[)') && tstzrange(p_inicio,null,'[)')) or exists(select 1 from public.locacoes where carro_id=p_carro and status='Ativa') or exists(select 1 from public.frota_levantamento where carro_id=p_carro and ativo) then raise exception 'Veículo ocupado. Registre a devolução ou a troca antes da manutenção.'; end if;
 insert into public.frota_periodos(id,grupo_id,empresa_id,carro_id,tipo,inicio,previsao,fornecedor_id,localizacao,observacoes,criado_por) values(novo,novo,p_empresa,p_carro,'manutencao',p_inicio,p_previsao,p_fornecedor,local_nome,trim(p_motivo),auth.uid());
 return novo;
end $$;
revoke all on function public.frota_registrar_manutencao(uuid,uuid,uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.frota_registrar_manutencao(uuid,uuid,uuid,timestamptz,timestamptz,text) to authenticated;
commit;
select 'Fornecedores e registros de manutenção preparados' as resultado;


-- km-hoje.sql
-- Após frota_km.sql. Leituras de 10/10/2026 confirmadas pelo usuário.
-- Precisão de dia: não inventa o horário da medição nem o início da locação.
begin;
insert into public.frota_km(empresa_id,carro_id,leitura_em,km,cliente_id,responsavel,ocupacao_chave,observacoes,criado_por,precisao_data,origem)
select l.empresa_id,l.carro_id,l.km_data::timestamp at time zone 'America/Manaus',l.km,l.cliente_id,l.responsavel,
 'levantamento:'||l.id||':'||coalesce(l.cliente_id::text,l.responsavel),
 'KM do levantamento confirmado para 10/10/2026. Horário da medição não informado.',null,'dia','levantamento_confirmado'
from public.frota_levantamento l
where l.empresa_id='71236d9a-d7aa-420b-a3a0-bdba2e9d8359' and l.ativo and l.carro_id is not null and l.km is not null and l.km_data='2026-10-10'
and not exists(select 1 from public.frota_km k where k.carro_id=l.carro_id and ((k.leitura_em<l.km_data::timestamp at time zone 'America/Manaus' and k.km>l.km) or (k.leitura_em>l.km_data::timestamp at time zone 'America/Manaus' and k.km<l.km)))
on conflict(empresa_id,carro_id,leitura_em) do nothing;
commit;
select count(*) as leituras_confirmadas from public.frota_km where origem='levantamento_confirmado' and (leitura_em at time zone 'America/Manaus')::date='2026-10-10';

notify pgrst, 'reload schema';
