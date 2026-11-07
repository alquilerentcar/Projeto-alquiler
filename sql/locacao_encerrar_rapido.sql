-- Executar inteiro no SQL Editor com papel postgres. Encerra uma locação de contrato em um passo:
-- data real da devolução, motivo e situação do veículo. Não apaga cobranças, pagamentos nem documentos.
reset role;
begin;
create or replace function public.locacao_encerrar_rapido(p_empresa uuid,p_locacao uuid,p_fim timestamptz,p_motivo text,p_situacao text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.locacoes;veiculo uuid;dia date;posteriores integer;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso à empresa.';end if;
 if p_fim is null or not isfinite(p_fim) or p_fim>now() then raise exception 'Informe a data e hora reais da devolução, sem data futura.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 3 and 2000 then raise exception 'Informe o motivo do encerramento.';end if;
 if p_situacao is null or p_situacao not in ('Disponível','Indisponível','Manutenção','Revisão') then raise exception 'Escolha a situação do veículo após a devolução.';end if;
 perform pg_advisory_xact_lock(7261002);
 select carro_id into veiculo from public.locacoes where id=p_locacao and empresa_id=p_empresa;
 if veiculo is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 perform 1 from public.carros where id=veiculo and empresa_id=p_empresa for update;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.status<>'Ativa' then raise exception 'Somente locações ativas podem ser encerradas. Atualize a tela.';end if;
 if r.data_inicio is not null and p_fim<=r.data_inicio then raise exception 'A devolução não pode ser anterior ao início da locação.';end if;
 dia:=(p_fim at time zone 'America/Manaus')::date;
 -- A devolução fica registrada mesmo sem vistoria de retorno, marcada como encerramento rápido.
 if not exists(select 1 from public.locacao_eventos where locacao_id=r.id and acao='devolucao') then
  insert into public.locacao_eventos(empresa_id,locacao_id,acao,usuario_id,dados)
  values(p_empresa,r.id,'devolucao',auth.uid(),jsonb_build_object('observacoes',trim(p_motivo),'data_devolucao',p_fim,'encerramento_rapido',true,'locacao_snapshot',to_jsonb(r)));
 end if;
 insert into public.locacao_eventos(empresa_id,locacao_id,acao,usuario_id,dados)
 values(p_empresa,r.id,'encerramento',auth.uid(),jsonb_build_object('observacoes',trim(p_motivo),'data_devolucao',p_fim,'situacao_veiculo',p_situacao,'encerramento_rapido',true,'locacao_snapshot',to_jsonb(r)));
 update public.locacoes set status='Encerrada' where id=r.id;
 -- As diárias param no dia da devolução; um término anterior já definido é mantido.
 insert into public.frota_cobranca_limites(empresa_id,grupo_id,termino,alterado_por) values(p_empresa,r.id,dia,auth.uid())
 on conflict(empresa_id,grupo_id) do update set termino=least(coalesce(public.frota_cobranca_limites.termino,excluded.termino),excluded.termino),alterado_por=excluded.alterado_por,alterado_em=now();
 update public.carros set situacao=p_situacao,situacao_confirmada_em=now() where id=veiculo;
 select count(*) into posteriores from public.frota_cobrancas where empresa_id=p_empresa and grupo_id=r.id and competencia>dia;
 return jsonb_build_object('locacao',r.id,'devolucao',p_fim,'cobrancas_apos_devolucao',posteriores);
end $$;
revoke all on function public.locacao_encerrar_rapido(uuid,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.locacao_encerrar_rapido(uuid,uuid,timestamptz,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Encerramento rápido de locação preparado' as resultado;
