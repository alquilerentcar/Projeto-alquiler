-- SQL Editor, papel postgres. Rode depois de oficina_fotos_aprovacao.sql e oficina_orcamento_telefone.sql.
-- Ordem de serviço completa:
-- 1. Relatório de ENTRADA do carro na oficina: KM, combustível, itens conferidos, avarias e fotos.
-- 2. Relatório de SAÍDA: KM, combustível, itens conferidos, observações e fotos.
-- 3. A manutenção só conclui com: pelo menos uma peça ou serviço lançado, os dois relatórios
--    e as fotos de cada peça trocada (antes/depois, que já era exigido).
-- Fotos no mesmo armazenamento das fotos de peças: oficina-fotos/<empresa>/vistoria/<manutenção>/...
-- Não altera dados existentes.
begin;
create table if not exists public.oficina_vistorias(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 manutencao_id uuid not null references public.oficina_manutencoes(id), tipo text not null check(tipo in ('entrada','saida')),
 km bigint not null check(km>=0), combustivel smallint not null check(combustivel between 0 and 8),
 itens jsonb not null default '{}'::jsonb, avarias text, observacao text, fotos text[] not null default '{}',
 criado_por uuid, criado_em timestamptz not null default now(), atualizado_por uuid, atualizado_em timestamptz,
 unique(manutencao_id,tipo)
);
alter table public.oficina_vistorias enable row level security;
revoke all on public.oficina_vistorias from public,anon,authenticated;
grant select on public.oficina_vistorias to authenticated;
drop policy if exists oficina_vistorias_leitura on public.oficina_vistorias;
create policy oficina_vistorias_leitura on public.oficina_vistorias for select to authenticated using(public.oficina_acesso(empresa_id));

-- Salva (ou refaz, enquanto a manutenção está aberta) o relatório de entrada ou de saída.
-- p_dados: {km, combustivel (0 a 8 oitavos), itens:{documento:true,...}, avarias, observacao, fotos:[caminhos]}
create or replace function public.oficina_vistoria_salvar(p_empresa uuid,p_manutencao uuid,p_tipo text,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.oficina_manutencoes; v public.oficina_vistorias; ent public.oficina_vistorias; v_km bigint; v_comb int; fotos text[]; f text;
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 select * into m from public.oficina_manutencoes where id=p_manutencao and empresa_id=p_empresa for update;
 if m.id is null then raise exception 'Manutenção não encontrada.'; end if;
 if m.status in ('concluida','cancelada') then raise exception 'A manutenção #% já foi encerrada.',m.numero; end if;
 if p_tipo not in ('entrada','saida') then raise exception 'Informe se é o relatório de entrada ou de saída.'; end if;
 select * into ent from public.oficina_vistorias where manutencao_id=m.id and tipo='entrada';
 if p_tipo='saida' and ent.id is null then raise exception 'Faça primeiro o relatório de entrada do carro.'; end if;
 begin v_km:=nullif(regexp_replace(coalesce(p_dados->>'km',''),'\D','','g'),'')::bigint; exception when others then v_km:=null; end;
 if v_km is null then raise exception 'Informe o KM do carro.'; end if;
 if p_tipo='saida' and v_km<ent.km then raise exception 'O KM de saída (%) é menor que o de entrada (%).',v_km,ent.km; end if;
 v_comb:=nullif(p_dados->>'combustivel','')::int;
 if v_comb is null or v_comb not between 0 and 8 then raise exception 'Informe o nível de combustível.'; end if;
 select coalesce(array_agg(x),'{}') into fotos from jsonb_array_elements_text(coalesce(p_dados->'fotos','[]'::jsonb)) x;
 if cardinality(fotos)<1 then raise exception 'Envie pelo menos uma foto do carro na %.',case when p_tipo='entrada' then 'entrada' else 'saída' end; end if;
 if cardinality(fotos)>30 then raise exception 'No máximo 30 fotos por relatório.'; end if;
 foreach f in array fotos loop
  if f not like p_empresa::text||'/vistoria/'||m.id::text||'/%' or f like '%..%' then raise exception 'Arquivo de foto inválido.'; end if;
 end loop;
 if jsonb_typeof(coalesce(p_dados->'itens','{}'::jsonb))<>'object' or length(coalesce(p_dados->>'avarias',''))>2000 or length(coalesce(p_dados->>'observacao',''))>2000 then
  raise exception 'Confira os itens, as avarias e a observação.';
 end if;
 insert into public.oficina_vistorias(empresa_id,manutencao_id,tipo,km,combustivel,itens,avarias,observacao,fotos,criado_por)
 values(p_empresa,m.id,p_tipo,v_km,v_comb,coalesce(p_dados->'itens','{}'::jsonb),nullif(trim(coalesce(p_dados->>'avarias','')),''),nullif(trim(coalesce(p_dados->>'observacao','')),''),fotos,auth.uid())
 on conflict(manutencao_id,tipo) do update set km=excluded.km,combustivel=excluded.combustivel,itens=excluded.itens,avarias=excluded.avarias,
  observacao=excluded.observacao,fotos=excluded.fotos,atualizado_por=auth.uid(),atualizado_em=now()
 returning * into v;
 if p_tipo='entrada' then update public.oficina_manutencoes o set km=v.km where o.id=m.id and o.km is null; end if;
 return to_jsonb(v);
end $$;
revoke all on function public.oficina_vistoria_salvar(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.oficina_vistoria_salvar(uuid,uuid,text,jsonb) to authenticated;

-- Relatórios de uma manutenção.
create or replace function public.oficina_vistorias(p_empresa uuid,p_manutencao uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.tipo) from public.oficina_vistorias v where v.empresa_id=p_empresa and v.manutencao_id=p_manutencao),'[]'::jsonb);
end $$;
revoke all on function public.oficina_vistorias(uuid,uuid) from public,anon;
grant execute on function public.oficina_vistorias(uuid,uuid) to authenticated;

-- Quais manutenções já têm relatório de entrada e de saída (para a lista).
create or replace function public.oficina_vistorias_resumo(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.oficina_acesso(p_empresa) then raise exception using errcode='42501',message='Sem acesso à Oficina.'; end if;
 return coalesce((select jsonb_object_agg(z.manutencao_id::text,jsonb_build_object('entrada',z.entrada,'saida',z.saida))
  from (select v.manutencao_id,bool_or(v.tipo='entrada') entrada,bool_or(v.tipo='saida') saida
   from public.oficina_vistorias v where v.empresa_id=p_empresa group by v.manutencao_id) z),'{}'::jsonb);
end $$;
revoke all on function public.oficina_vistorias_resumo(uuid) from public,anon;
grant execute on function public.oficina_vistorias_resumo(uuid) to authenticated;

-- Concluir: além das fotos das peças, exige peça ou serviço lançado e os dois relatórios.
do $$ declare def text; alvo text:='if pend>0 then raise exception ''Faltam as fotos de % peça(s) retirada(s) para concluir.'',pend; end if;'; begin
 def:=pg_get_functiondef('public.oficina_manutencao_status(uuid,uuid,text,text)'::regprocedure);
 if position('relatório de entrada' in def)=0 then
  if position(alvo in def)=0 then raise exception 'Não encontrei a regra de conclusão. Confira se oficina_fotos_aprovacao.sql foi aplicado.'; end if;
  execute replace(def,alvo,alvo||'
  if not exists(select 1 from public.oficina_movimentos x where x.manutencao_id=p_id and x.tipo=''saida'')
   and not exists(select 1 from public.oficina_manutencao_servicos s where s.manutencao_id=p_id and s.removido_em is null) then
   raise exception ''Lance pelo menos uma peça ou serviço antes de concluir a manutenção #%.'',r.numero;
  end if;
  if not exists(select 1 from public.oficina_vistorias v where v.manutencao_id=p_id and v.tipo=''entrada'') then raise exception ''Falta o relatório de entrada do carro para concluir.''; end if;
  if not exists(select 1 from public.oficina_vistorias v where v.manutencao_id=p_id and v.tipo=''saida'') then raise exception ''Falta o relatório de saída do carro para concluir.''; end if;');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
select 'Ordem de serviço pronta: relatórios de entrada e saída, e conclusão só com peça/serviço e os dois relatórios.' as resultado;
