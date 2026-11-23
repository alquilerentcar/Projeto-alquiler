-- SQL Editor, papel postgres. Rode depois de oficina_modulo.sql.
-- Carro que entra em manutenção na Locação vai sozinho para a Oficina.
-- Vale para os três caminhos da Locação:
--   1. situação do carro mudada para Manutenção ou Revisão (lista da Frota, encerramento, substituição);
--   2. período de manutenção aberto na Frota.
-- Abre a manutenção em cada oficina que atende a empresa do carro (Serviços e ajustes → Empresas atendidas),
-- com o motivo informado na Locação, o último KM e o locatário responsável. Revisão entra como preventiva;
-- Manutenção entra como corretiva (a oficina pode ajustar o tipo depois).
-- Se o carro já tem manutenção aberta na oficina, não abre outra.
-- Ao rodar, abre também as manutenções dos carros que já estão em Manutenção ou Revisão hoje.
begin;

create or replace function public.oficina_abrir_automatica(p_carro uuid,p_periodo uuid,p_motivo text,p_tipo text)
returns integer language plpgsql security definer set search_path='' as $$
declare c public.carros; o uuid; aberta uuid; v_motivo text; n integer:=0;
begin
 select * into c from public.carros where id=p_carro;
 if c.id is null or coalesce(c.situacao,'') in ('Vendido','Inativo') then return 0; end if;
 v_motivo:=left(trim(coalesce(p_motivo,'')),2000);
 if length(v_motivo)<3 then v_motivo:='Entrou em manutenção pela Locação.'; end if;
 for o in select distinct a.oficina_empresa_id from public.oficina_empresas_atendidas a
  where a.empresa_id=c.empresa_id or a.oficina_empresa_id=c.empresa_id loop
  select m.id into aberta from public.oficina_manutencoes m where m.carro_id=c.id and m.empresa_id=o and m.status in ('aberta','aguardando_pecas') limit 1;
  if aberta is not null then
   if p_periodo is not null then update public.oficina_manutencoes set periodo_id=p_periodo where id=aberta and periodo_id is null; end if;
   continue;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('oficina_numero'||o::text,0));
  insert into public.oficina_manutencoes(empresa_id,numero,carro_id,placa,veiculo,motivo,tipo,km,periodo_id,observacoes,criado_por)
  values(o,coalesce((select max(numero) from public.oficina_manutencoes where empresa_id=o),0)+1,c.id,c.placa,
   nullif(trim(coalesce(c.marca,'')||' '||coalesce(c.modelo,'')),''),v_motivo,case when p_tipo='preventiva' then 'preventiva' else 'corretiva' end,
   (select k.km from public.frota_km k where k.carro_id=c.id order by k.leitura_em desc limit 1),
   coalesce(p_periodo,(select p.id from public.frota_periodos p where p.carro_id=c.id and p.tipo='manutencao' and p.fim is null limit 1)),
   'Aberta automaticamente: o carro entrou em manutenção na Locação.',auth.uid());
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.oficina_abrir_automatica(uuid,uuid,text,text) from public,anon,authenticated;

-- 1. Situação do carro passou para Manutenção ou Revisão.
create or replace function public.carro_entrada_manutencao_oficina() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.situacao in ('Manutenção','Revisão') and (tg_op='INSERT' or old.situacao is distinct from new.situacao) then
  begin
   perform public.oficina_abrir_automatica(new.id,null,to_jsonb(new)->>'observacoes',case when new.situacao='Revisão' then 'preventiva' else 'corretiva' end);
  exception when others then
   -- A Locação nunca trava por causa da Oficina: o carro continua na fila "Carros em manutenção na Frota".
   raise warning 'Oficina: não abri a manutenção de % automaticamente: %',new.placa,sqlerrm;
  end;
 end if;
 return new;
end $$;
revoke all on function public.carro_entrada_manutencao_oficina() from public,anon,authenticated;
drop trigger if exists carro_entrada_manutencao_oficina on public.carros;
create trigger carro_entrada_manutencao_oficina after insert or update of situacao on public.carros for each row execute function public.carro_entrada_manutencao_oficina();

-- 2. Período de manutenção aberto na Frota.
create or replace function public.periodo_manutencao_oficina() returns trigger
language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new);
begin
 if new.tipo='manutencao' and new.fim is null then
  begin
   perform public.oficina_abrir_automatica(new.carro_id,new.id,
    concat_ws(' · ',nullif(trim(coalesce(j->>'observacoes','')),''),'Local: '||nullif(trim(coalesce(j->>'localizacao','')),'')),'corretiva');
  exception when others then
   raise warning 'Oficina: não abri a manutenção automaticamente: %',sqlerrm;
  end;
 end if;
 return new;
end $$;
revoke all on function public.periodo_manutencao_oficina() from public,anon,authenticated;
drop trigger if exists periodo_manutencao_oficina on public.frota_periodos;
create trigger periodo_manutencao_oficina after insert on public.frota_periodos for each row execute function public.periodo_manutencao_oficina();

-- 3. Carros que já estão em manutenção hoje.
do $$ declare r record; n integer:=0; begin
 for r in select c.id,c.situacao,(select p.id from public.frota_periodos p where p.carro_id=c.id and p.tipo='manutencao' and p.fim is null limit 1) periodo,
   coalesce((select to_jsonb(p)->>'observacoes' from public.frota_periodos p where p.carro_id=c.id and p.tipo='manutencao' and p.fim is null limit 1),to_jsonb(c)->>'observacoes') motivo
  from public.carros c
  where coalesce(c.situacao,'') not in ('Vendido','Inativo')
   and (c.situacao in ('Manutenção','Revisão') or exists(select 1 from public.frota_periodos p where p.carro_id=c.id and p.tipo='manutencao' and p.fim is null)) loop
  n:=n+public.oficina_abrir_automatica(r.id,r.periodo,r.motivo,case when r.situacao='Revisão' then 'preventiva' else 'corretiva' end);
 end loop;
 raise notice 'Oficina: % manutenção(ões) aberta(s) para carros que já estavam em manutenção.',n;
end $$;

notify pgrst,'reload schema';
commit;
select 'Entrada automática pronta: carro em manutenção na Locação abre manutenção na Oficina.' as resultado,
 (select count(*) from public.oficina_manutencoes where observacoes like 'Aberta automaticamente%') manutencoes_automaticas;
