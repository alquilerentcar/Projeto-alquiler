-- Permite que somente a conta autorizada exclua certificados digitais.
grant delete on public.certificados_digitais to authenticated;

drop policy if exists certificados_delete on public.certificados_digitais;
create policy certificados_delete on public.certificados_digitais
  for delete to authenticated
  using ((select public.pode_gerenciar_certificados()));
