-- SQL Editor, papel postgres. Avisos automáticos da operação (aparecem em Notificações e no contador do menu).
-- Gera, sem repetir: devolução amanhã, devolução atrasada, CNH vencendo (30 dias) e CNH vencida.
-- Acrescenta a validade da CNH no cadastro do locatário (campo opcional). Não altera nem apaga dados existentes.
begin;
alter table public.clientes add column if not exists cnh_validade date;

create table if not exists public.avisos(
 id uuid primary key default gen_random_uuid(),
 empresa_id uuid not null references public.empresas(id),
 tipo text not null check(tipo in ('devolucao_amanha','devolucao_atrasada','cnh_vencendo','cnh_vencida')),
 chave text not null,
 nivel text not null default 'info' check(nivel in ('info','atencao','urgente')),
 titulo text not null, mensagem text not null, link text,
 cliente_id uuid, carro_id uuid, locacao_id uuid,
 criado_em timestamptz not null default now(),
 resolvido_em timestamptz, resolvido_por uuid,
 unique(empresa_id,chave)
);
create index if not exists avisos_empresa_abertos on public.avisos(empresa_id) where resolvido_em is null;
alter table public.avisos enable row level security;
revoke all on public.avisos from public,anon,authenticated;

-- Gera os avisos de uma empresa (interno: sem checagem de usuário; chamado pelas funções abaixo).
create or replace function public.avisos_gerar_empresa(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Manaus')::date; n integer:=0; k integer;
begin
 -- Devolução amanhã.
 insert into public.avisos(empresa_id,tipo,chave,nivel,titulo,mensagem,link,cliente_id,carro_id,locacao_id)
 select l.empresa_id,'devolucao_amanha','devolucao_amanha:'||l.id||':'||(l.data_fim at time zone 'America/Manaus')::date,'info',
  'Devolução amanhã · '||coalesce(c.placa,'carro'),
  coalesce(cl.nome_completo,'Locatário')||' devolve '||coalesce(c.placa,'o carro')||' amanhã às '||to_char(l.data_fim at time zone 'America/Manaus','HH24:MI')||'. Confirme se vai renovar.',
  'locacao-painel.html?locacao='||l.id,l.cliente_id,l.carro_id,l.id
 from public.locacoes l left join public.carros c on c.id=l.carro_id left join public.clientes cl on cl.id=l.cliente_id
 where l.empresa_id=p_empresa and l.status='Ativa' and l.data_fim is not null and (l.data_fim at time zone 'America/Manaus')::date=hoje+1
 on conflict(empresa_id,chave) do nothing;get diagnostics k=row_count;n:=n+k;
 -- Devolução atrasada (um aviso por dia de atraso).
 insert into public.avisos(empresa_id,tipo,chave,nivel,titulo,mensagem,link,cliente_id,carro_id,locacao_id)
 select l.empresa_id,'devolucao_atrasada','devolucao_atrasada:'||l.id||':'||hoje,'urgente',
  'Devolução atrasada · '||coalesce(c.placa,'carro'),
  coalesce(cl.nome_completo,'Locatário')||' deveria ter devolvido '||coalesce(c.placa,'o carro')||' em '||to_char(l.data_fim at time zone 'America/Manaus','DD/MM "às" HH24:MI')||' ('||greatest(1,hoje-(l.data_fim at time zone 'America/Manaus')::date)||' dia(s)). Renove o contrato ou registre a devolução.',
  'locacao-painel.html?locacao='||l.id,l.cliente_id,l.carro_id,l.id
 from public.locacoes l left join public.carros c on c.id=l.carro_id left join public.clientes cl on cl.id=l.cliente_id
 where l.empresa_id=p_empresa and l.status='Ativa' and l.data_fim is not null and l.data_fim<now()
 on conflict(empresa_id,chave) do nothing;get diagnostics k=row_count;n:=n+k;
 -- Avisos de atraso de dias anteriores saem da lista quando chega o de hoje ou a locação deixa de estar ativa.
 update public.avisos a set resolvido_em=now() where a.empresa_id=p_empresa and a.tipo in ('devolucao_atrasada','devolucao_amanha') and a.resolvido_em is null
  and (not exists(select 1 from public.locacoes l where l.id=a.locacao_id and l.status='Ativa')
   or (a.tipo='devolucao_atrasada' and a.chave<>'devolucao_atrasada:'||a.locacao_id||':'||hoje));
 -- CNH vencendo em até 30 dias e CNH vencida (só de quem está com carro hoje).
 insert into public.avisos(empresa_id,tipo,chave,nivel,titulo,mensagem,link,cliente_id)
 select cl.empresa_id,case when cl.cnh_validade<hoje then 'cnh_vencida' else 'cnh_vencendo' end,
  case when cl.cnh_validade<hoje then 'cnh_vencida:' else 'cnh_vencendo:' end||cl.id||':'||cl.cnh_validade,
  case when cl.cnh_validade<hoje then 'urgente' else 'atencao' end,
  case when cl.cnh_validade<hoje then 'CNH vencida · ' else 'CNH vencendo · ' end||cl.nome_completo,
  case when cl.cnh_validade<hoje then 'A CNH de '||cl.nome_completo||' venceu em '||to_char(cl.cnh_validade,'DD/MM/YYYY')||'. Peça a CNH renovada antes de renovar a locação.'
   else 'A CNH de '||cl.nome_completo||' vence em '||to_char(cl.cnh_validade,'DD/MM/YYYY')||' ('||(cl.cnh_validade-hoje)||' dia(s)). Peça a CNH renovada.' end,
  'clientes.html',cl.id
 from public.clientes cl
 where cl.empresa_id=p_empresa and cl.cnh_validade is not null and cl.cnh_validade<=hoje+30
  and (exists(select 1 from public.locacoes l where l.cliente_id=cl.id and l.status='Ativa')
   or exists(select 1 from public.frota_levantamento f where f.cliente_id=cl.id and f.ativo)
   or exists(select 1 from public.frota_periodos p where p.cliente_id=cl.id and p.fim is null and p.tipo='locacao'))
 on conflict(empresa_id,chave) do nothing;get diagnostics k=row_count;n:=n+k;
 -- CNH renovada (validade mudou ou passou de 30 dias) encerra o aviso antigo.
 update public.avisos a set resolvido_em=now() where a.empresa_id=p_empresa and a.tipo in ('cnh_vencendo','cnh_vencida') and a.resolvido_em is null
  and not exists(select 1 from public.clientes cl where cl.id=a.cliente_id and cl.cnh_validade is not null and cl.cnh_validade<=hoje+30 and a.chave like '%:'||cl.cnh_validade);
 return n;
end $$;
revoke all on function public.avisos_gerar_empresa(uuid) from public,anon,authenticated;

-- Rotina diária (Vercel Cron, com a chave de serviço): gera para todas as empresas.
create or replace function public.avisos_gerar_todas()
returns integer language plpgsql security definer set search_path='' as $$
declare e uuid; n integer:=0;
begin
 for e in select id from public.empresas loop n:=n+public.avisos_gerar_empresa(e); end loop;
 return n;
end $$;
revoke all on function public.avisos_gerar_todas() from public,anon,authenticated;
grant execute on function public.avisos_gerar_todas() to service_role;

-- Para a tela: atualiza e lista os avisos em aberto da empresa.
create or replace function public.avisos_listar(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso.'; end if;
 perform public.avisos_gerar_empresa(p_empresa);
 return coalesce((select jsonb_agg(to_jsonb(a) order by case a.nivel when 'urgente' then 0 when 'atencao' then 1 else 2 end,a.criado_em desc)
  from public.avisos a where a.empresa_id=p_empresa and a.resolvido_em is null),'[]'::jsonb);
end $$;
revoke all on function public.avisos_listar(uuid) from public,anon;
grant execute on function public.avisos_listar(uuid) to authenticated;

create or replace function public.avisos_resolver(p_empresa uuid,p_aviso uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso.'; end if;
 update public.avisos set resolvido_em=now(),resolvido_por=auth.uid() where id=p_aviso and empresa_id=p_empresa and resolvido_em is null;
end $$;
revoke all on function public.avisos_resolver(uuid,uuid) from public,anon;
grant execute on function public.avisos_resolver(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Avisos automáticos prontos.' as resultado;
