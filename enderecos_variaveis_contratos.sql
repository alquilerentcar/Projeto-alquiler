-- Execute como postgres. Acrescenta variáveis sem modificar documentos já emitidos.
begin;
create or replace function public.documento_endereco_campos(p_empresa jsonb,p_cliente jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'; source jsonb; prefix text; parts jsonb;street text;address text;full_address text;k text;v text;
begin
 for prefix,source in select 'empresa_'::text,coalesce(p_empresa,'{}'::jsonb) union all select '',coalesce(p_cliente,'{}'::jsonb) loop
  street:=coalesce(trim(source->>'endereco'),'');
  address:=concat_ws(', ',nullif(street,''),nullif(trim(source->>'numero'),''),nullif(trim(source->>'complemento'),''),nullif(trim(source->>'bairro'),''),nullif(trim(source->>'cidade'),''),nullif(trim(source->>'uf'),''));
  full_address:=concat_ws(', ',nullif(address,''),case when nullif(trim(source->>'cep'),'') is not null then 'CEP '||trim(source->>'cep') end);
  parts:=jsonb_build_object(prefix||'logradouro',street,prefix||'endereco',case when prefix='empresa_' then full_address else address end,prefix||'endereco_completo',full_address);
  foreach k in array array['numero','complemento','bairro','cidade','uf','cep'] loop
   parts:=parts||jsonb_build_object(prefix||k,coalesce(trim(source->>k),''));
  end loop;
  result:=result||parts;
  if prefix='' then for k,v in select * from jsonb_each_text(parts) loop result:=result||jsonb_build_object('locatario_'||k,v);end loop;end if;
 end loop;
 return result;
end $$;
revoke all on function public.documento_endereco_campos(jsonb,jsonb) from public,anon,authenticated;
do $$
declare target regprocedure:=to_regprocedure('public.documento_modelo_preparar(uuid,uuid,uuid,jsonb,boolean,uuid)');definition text;
begin
 if target is null then raise exception 'Aplique a estrutura de modelos de documentos antes desta atualização.';end if;
 definition:=pg_get_functiondef(target);
 if definition ~ 'public\.documento_endereco_campos\s*\(\s*to_jsonb\s*\(\s*e\s*\)\s*,\s*c\s*\)' then return;end if;
 if definition !~ 'txt\s*:=\s*v\.conteudo\s*;' then raise exception 'A função de emissão mudou. Preserve a versão atual e revise a integração das variáveis.';end if;
 execute regexp_replace(definition,'txt\s*:=\s*v\.conteudo\s*;','fields:=fields||public.documento_endereco_campos(to_jsonb(e),c); txt:=v.conteudo;');
end $$;
notify pgrst,'reload schema';
commit;
select 'Variáveis de endereço da empresa e do locatário habilitadas nos modelos' as resultado;
