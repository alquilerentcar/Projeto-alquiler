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
