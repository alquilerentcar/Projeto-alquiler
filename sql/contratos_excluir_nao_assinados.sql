-- Aplicar como postgres. Não exclui nenhum contrato ao executar este arquivo.
reset role;
begin;
create table if not exists public.contratos_nao_assinados_excluidos(
 id uuid primary key,empresa_id uuid not null references public.empresas(id),locacao_id uuid not null,
 documento_id uuid not null,versao integer not null,autor uuid not null,criado_em timestamptz not null default now(),
 arquivos jsonb not null,arquivos_pendentes jsonb not null,limpeza_concluida boolean not null default false
);
alter table public.contratos_nao_assinados_excluidos enable row level security;
revoke all on public.contratos_nao_assinados_excluidos from public,anon,authenticated;
grant select on public.contratos_nao_assinados_excluidos to authenticated;
drop policy if exists contratos_excluidos_leitura on public.contratos_nao_assinados_excluidos;
create policy contratos_excluidos_leitura on public.contratos_nao_assinados_excluidos for select to authenticated
using(public.acesso_desenvolvedor() and public.acesso_modulo(empresa_id,'locacao'));

create or replace function public.contrato_excluir_nao_assinado(p_empresa uuid,p_locacao uuid,p_documento uuid,p_operacao uuid,p_confirmacao text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.locacoes;d public.documentos_locacao;remaining public.documentos_locacao;a public.contratos_nao_assinados_excluidos;files jsonb;
begin
 if auth.uid() is null or not coalesce(public.acesso_desenvolvedor(),false) or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Somente o desenvolvedor pode excluir contratos.';end if;
 if p_documento is null or p_operacao is null or p_confirmacao is distinct from 'EXCLUIR '||p_documento::text then raise exception 'Confirme o contrato selecionado.';end if;
 perform pg_advisory_xact_lock(7261002);
 select * into a from public.contratos_nao_assinados_excluidos where id=p_operacao;
 if a.id is not null then
  if a.empresa_id<>p_empresa or a.locacao_id<>p_locacao or a.documento_id<>p_documento or a.autor<>auth.uid() then raise exception 'Operação de exclusão inválida.';end if;
  return to_jsonb(a);
 end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.id is null then raise exception 'Locação não encontrada nesta empresa.';end if;
 select * into d from public.documentos_locacao where id=p_documento and locacao_id=p_locacao and tipo='contrato_locacao' for update;
 if d.id is null then raise exception 'Contrato não encontrado. Atualize a lista.';end if;
 if nullif(r.assinatura_cliente_em::text,'') is not null or nullif(r.assinatura_locadora_em::text,'') is not null
 or d.assinado_em is not null or d.validado_em is not null or nullif(d.arquivo_assinado_path,'') is not null
 or lower(coalesce(d.status,'')) in ('assinado','assinado_parcial','validado')
 or exists(select 1 from public.documento_signatarios s where s.documento_id=d.id and (s.assinado_em is not null or lower(s.status) like 'assina%'))
 then raise exception 'Existe assinatura registrada. Este contrato não pode ser excluído.';end if;
 if nullif(r.assinatura_referencia,'') is not null or d.enviado_em is not null or nullif(d.provedor_documento_id,'') is not null or lower(coalesce(d.status,'')) in ('enviado','visualizado')
 then raise exception 'Cancele e confirme o encerramento do envio na aba Assinaturas antes de excluir o contrato.';end if;
 if nullif(d.arquivo_original_path,'') is not null and left(d.arquivo_original_path,length(p_locacao::text)+1)<>p_locacao::text||'/' then raise exception 'O arquivo deste contrato precisa de conferência antes da exclusão.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)),'[]') into files from storage.objects o
 where o.bucket_id='documentos-contratuais' and o.name=d.arquivo_original_path;
 insert into public.contratos_nao_assinados_excluidos(id,empresa_id,locacao_id,documento_id,versao,autor,arquivos,arquivos_pendentes)
 values(p_operacao,p_empresa,p_locacao,d.id,d.versao,auth.uid(),files,files);
 delete from public.documentos_locacao where id=d.id;
 select * into remaining from public.documentos_locacao where locacao_id=p_locacao and tipo='contrato_locacao' order by versao desc limit 1;
 if remaining.id is null then
  insert into public.contrato_reaberturas(empresa_id,locacao_id,usuario_id,motivo) values(p_empresa,p_locacao,auth.uid(),'Exclusão confirmada de contrato não assinado, versão '||d.versao::text);
  update public.locacoes set contrato_gerado_em=null,contrato_status='Rascunho' where id=p_locacao and empresa_id=p_empresa;
 else
  update public.locacoes set contrato_gerado_em=coalesce(remaining.gerado_em,remaining.criado_em),contrato_status=case when remaining.assinado_em is not null then 'Assinado' else 'PDF gerado' end where id=p_locacao and empresa_id=p_empresa;
 end if;
 select * into a from public.contratos_nao_assinados_excluidos where id=p_operacao;
 return to_jsonb(a);
end $$;

create or replace function public.contrato_exclusao_limpeza(p_empresa uuid,p_operacao uuid,p_pendentes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare a public.contratos_nao_assinados_excluidos;
begin
 if auth.uid() is null or not coalesce(public.acesso_desenvolvedor(),false) or not coalesce(public.acesso_modulo(p_empresa,'locacao'),false) then raise exception using errcode='42501',message='Sem acesso.';end if;
 select * into a from public.contratos_nao_assinados_excluidos where id=p_operacao and empresa_id=p_empresa and autor=auth.uid() for update;
 if a.id is null or jsonb_typeof(p_pendentes) is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_pendentes) p where not a.arquivos @> jsonb_build_array(p)) then raise exception 'Limpeza inválida.';end if;
 update public.contratos_nao_assinados_excluidos set arquivos_pendentes=p_pendentes,limpeza_concluida=jsonb_array_length(p_pendentes)=0 where id=p_operacao;
end $$;
revoke all on function public.contrato_excluir_nao_assinado(uuid,uuid,uuid,uuid,text),public.contrato_exclusao_limpeza(uuid,uuid,jsonb) from public,anon;
grant execute on function public.contrato_excluir_nao_assinado(uuid,uuid,uuid,uuid,text),public.contrato_exclusao_limpeza(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Exclusão confirmada de contratos não assinados habilitada' as resultado;
