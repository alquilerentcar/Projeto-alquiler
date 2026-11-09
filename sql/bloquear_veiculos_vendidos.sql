begin;
create or replace function public.impedir_ocupacao_veiculo_vendido()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.carros where id=new.carro_id and situacao='Vendido') then
  if tg_table_name='locacoes' then
   if new.status in ('Ativa','Reservada') then raise exception 'Veículo vendido: não pode iniciar ou reservar uma locação.';end if;
  elsif new.fim is null then raise exception 'Veículo vendido: não pode receber uma ocupação atual.';end if;
 end if;
 return new;
end $$;
drop trigger if exists bloquear_vendido_locacoes on public.locacoes;
create trigger bloquear_vendido_locacoes before insert or update on public.locacoes for each row execute function public.impedir_ocupacao_veiculo_vendido();
drop trigger if exists bloquear_vendido_periodos on public.frota_periodos;
create trigger bloquear_vendido_periodos before insert or update on public.frota_periodos for each row execute function public.impedir_ocupacao_veiculo_vendido();
revoke all on function public.impedir_ocupacao_veiculo_vendido() from public,anon,authenticated;
commit;
