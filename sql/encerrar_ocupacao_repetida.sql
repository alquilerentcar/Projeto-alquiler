-- SQL Editor, papel postgres. Permite encerrar de novo uma ocupação da frota que voltou a ficar ativa.
-- Motivo: a ocupação importada (frota_levantamento) é uma linha por placa; quando o carro recebe um novo
-- locatário, a mesma linha volta a ficar ativa. A regra "um encerramento por ocupação" barrava o segundo
-- encerramento ("duplicate key ... frota_ocupacoes_encerradas_origem_origem_id_key").
-- Continua impedido encerrar duas vezes a mesma ocupação ativa: a função trava, confere se está ativa e a desativa.
-- Não altera nem apaga nenhum registro.
begin;
alter table public.frota_ocupacoes_encerradas drop constraint if exists frota_ocupacoes_encerradas_origem_origem_id_key;
create index if not exists frota_ocupacoes_encerradas_origem_idx on public.frota_ocupacoes_encerradas(origem,origem_id);
commit;
select 'Encerramento repetido liberado.' as resultado;
