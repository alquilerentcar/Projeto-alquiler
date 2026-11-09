begin;
alter table public.modelos_documentos add column if not exists formatacao jsonb not null default '[]';
alter table public.modelos_documentos add column if not exists tipo text not null default 'outro';
alter table public.versoes_modelos_documentos add column if not exists formatacao jsonb not null default '[]';
alter table public.documentos_modelos_emitidos add column if not exists formatacao jsonb not null default '[]';
create unique index if not exists modelo_contrato_ativo_empresa on public.modelos_documentos(empresa_id) where tipo='contrato_locacao' and not arquivado;
-- Vincula um modelo de contrato já existente por empresa, sem alterar seu conteúdo.
with candidatos as (
 select distinct on (m.empresa_id) m.id from public.modelos_documentos m
 where not m.arquivado and m.nome ~* '^contrato (de )?loca' and not exists(select 1 from public.modelos_documentos x where x.empresa_id=m.empresa_id and x.tipo='contrato_locacao' and not x.arquivado)
 order by m.empresa_id,(m.versao_publicada>0) desc,m.atualizado_em desc,m.id
) update public.modelos_documentos set tipo='contrato_locacao' where id in(select id from candidatos);
create or replace function public.modelo_documento_salvar_editor(p_empresa uuid,p_id uuid,p_revisao integer,p_nome text,p_conteudo text,p_publicar boolean,p_arquivado boolean,p_formatacao jsonb,p_tipo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;mid uuid;
begin
 if not public.acesso_admin_empresa(p_empresa) then raise exception 'Somente o administrador pode editar modelos.'; end if;
 if p_tipo not in ('outro','contrato_locacao') or jsonb_typeof(p_formatacao) is distinct from 'array' or length(p_formatacao::text)>1000000 then raise exception 'Formatação inválida.'; end if;
 if jsonb_array_length(p_formatacao)>0 and (select string_agg(coalesce((select string_agg(coalesce(r.value->>'text',''),'' order by r.n) from jsonb_array_elements(b.value->'runs') with ordinality r(value,n)),''),E'\n' order by b.n) from jsonb_array_elements(p_formatacao) with ordinality b(value,n)) is distinct from p_conteudo then raise exception 'Texto e formatação não correspondem. Recarregue o editor.'; end if;
 if p_tipo='contrato_locacao' and not p_arquivado and exists(select 1 from public.modelos_documentos where empresa_id=p_empresa and tipo=p_tipo and not arquivado and id is distinct from p_id) then raise exception 'Já existe um modelo ativo de contrato. Edite esse modelo ou arquive-o antes de substituir.'; end if;
 result:=public.modelo_documento_salvar(p_empresa,p_id,p_revisao,p_nome,p_conteudo,p_publicar,p_arquivado);mid:=(result->>'id')::uuid;
 update public.modelos_documentos set formatacao=p_formatacao,tipo=p_tipo where id=mid returning to_jsonb(modelos_documentos.*) into result;
 if p_publicar then update public.versoes_modelos_documentos set formatacao=p_formatacao where modelo_id=mid and versao=(result->>'versao_publicada')::integer; end if;
 return result;
end $$;
create or replace function public.modelo_contrato_vigente(p_empresa uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(v) from public.modelos_documentos m join public.versoes_modelos_documentos v on v.modelo_id=m.id and v.versao=m.versao_publicada
 where m.empresa_id=p_empresa and m.tipo='contrato_locacao' and not m.arquivado and public.acesso_modulo(p_empresa,'locacao') limit 1;
$$;
create or replace function public.modelos_documentos_menu(p_empresa uuid)
returns table(id uuid,nome text,tipo text,versao integer) language sql stable security definer set search_path=public as $$
 select m.id,v.nome,m.tipo,v.versao from public.modelos_documentos m join public.versoes_modelos_documentos v on v.modelo_id=m.id and v.versao=m.versao_publicada
 where m.empresa_id=p_empresa and not m.arquivado and public.acesso_modulo(p_empresa,'locacao') order by v.nome;
$$;
create or replace function public.documento_preservar_formatacao() returns trigger language plpgsql security definer set search_path=public as $$
begin select formatacao into new.formatacao from public.versoes_modelos_documentos where id=new.versao_id and empresa_id=new.empresa_id;return new;end $$;
drop trigger if exists preservar_formatacao on public.documentos_modelos_emitidos;
create trigger preservar_formatacao before insert on public.documentos_modelos_emitidos for each row execute function public.documento_preservar_formatacao();
revoke all on function public.modelo_documento_salvar_editor(uuid,uuid,integer,text,text,boolean,boolean,jsonb,text),public.modelo_contrato_vigente(uuid),public.modelos_documentos_menu(uuid),public.documento_preservar_formatacao() from public,anon;
grant execute on function public.modelo_documento_salvar_editor(uuid,uuid,integer,text,text,boolean,boolean,jsonb,text),public.modelo_contrato_vigente(uuid),public.modelos_documentos_menu(uuid) to authenticated;
commit;
select 'Editor e documentos integrados' as resultado;
