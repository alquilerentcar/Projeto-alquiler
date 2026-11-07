begin;
alter table public.carros add column if not exists situacao_confirmada_em timestamptz;
-- Marca apenas as placas cuja situação atual foi confirmada pelo usuário.
update public.carros set situacao_confirmada_em=now() where situacao_confirmada_em is null and placa in ('QZA2J29','PHZ6I89','QZY6G35','TSB7F05','PHS1B59','QZA6E65','QZZ7H18','RFS7G81','PHW0B78','QZI1C37','UTP3B48','QZS8C37');
notify pgrst,'reload schema';
commit;
