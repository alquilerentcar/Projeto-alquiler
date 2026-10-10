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
