-- Executar como postgres, após frota_operacao.sql e importar-ocupacoes-atuais.sql.
begin;
alter table public.fornecedores add column if not exists categoria_fornecedor text not null default 'outros' check(categoria_fornecedor in ('oficina','veiculos','ambos','outros'));
alter table public.frota_periodos add column if not exists fornecedor_id uuid references public.fornecedores(id);
create or replace function public.frota_registrar_manutencao(p_empresa uuid,p_carro uuid,p_fornecedor uuid,p_inicio timestamptz,p_previsao timestamptz default null,p_motivo text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare novo uuid:=gen_random_uuid(); local_nome text; dono uuid;
begin
 if auth.uid() is null or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception 'Sem acesso à empresa.'; end if;
 if p_inicio is null or p_inicio>now() or (p_previsao is not null and p_previsao<p_inicio) then raise exception 'Confira a data real de entrada e a previsão de saída.'; end if;
 if length(trim(coalesce(p_motivo,'')))=0 or length(p_motivo)>2000 then raise exception 'Informe o motivo da manutenção (até 2000 caracteres).'; end if;
 select empresa_id into dono from public.carros where id=p_carro;
 if dono is null or not coalesce(public.acesso_modulo(dono,'locacao'),false) then raise exception 'Sem acesso ao veículo.'; end if;
 if dono<>p_empresa and not exists(select 1 from public.frota_levantamento where empresa_id=p_empresa and carro_id=p_carro and ativo) and not exists(select 1 from public.frota_periodos where empresa_id=p_empresa and carro_id=p_carro) then raise exception 'Veículo fora da operação desta empresa.'; end if;
 select coalesce(nullif(nome_fantasia,''),razao_social) into local_nome from public.fornecedores where id=p_fornecedor and empresa_id=p_empresa and coalesce(situacao,'Ativo')<>'Inativo' and categoria_fornecedor in ('oficina','ambos');
 if local_nome is null then raise exception 'Selecione uma oficina ativa desta empresa.'; end if;
 perform pg_advisory_xact_lock(7261002);
 if exists(select 1 from public.carros where id=p_carro and situacao='Inativo') then raise exception 'Veículo inativo.'; end if;
 if exists(select 1 from public.frota_periodos where carro_id=p_carro and tstzrange(inicio,fim,'[)') && tstzrange(p_inicio,null,'[)')) or exists(select 1 from public.locacoes where carro_id=p_carro and status='Ativa') or exists(select 1 from public.frota_levantamento where carro_id=p_carro and ativo) then raise exception 'Veículo ocupado. Registre a devolução ou a troca antes da manutenção.'; end if;
 insert into public.frota_periodos(id,grupo_id,empresa_id,carro_id,tipo,inicio,previsao,fornecedor_id,localizacao,observacoes,criado_por) values(novo,novo,p_empresa,p_carro,'manutencao',p_inicio,p_previsao,p_fornecedor,local_nome,trim(p_motivo),auth.uid());
 return novo;
end $$;
revoke all on function public.frota_registrar_manutencao(uuid,uuid,uuid,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.frota_registrar_manutencao(uuid,uuid,uuid,timestamptz,timestamptz,text) to authenticated;
commit;
select 'Fornecedores e registros de manutenção preparados' as resultado;
