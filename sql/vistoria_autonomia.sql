-- SQL Editor, papel postgres. Vistoria da locação: guarda a autonomia mostrada no painel (km), junto do nível de combustível.
-- Só acrescenta uma coluna opcional; não altera nem apaga dados.
alter table public.vistorias_locacao add column if not exists autonomia_km integer check (autonomia_km is null or autonomia_km between 0 and 2000);
notify pgrst,'reload schema';
select 'Autonomia na vistoria pronta.' as resultado;
