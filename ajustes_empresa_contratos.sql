begin;
alter table public.empresas add column if not exists cor_sidebar text not null default '#111e32' check(cor_sidebar ~ '^#[0-9a-fA-F]{6}$');
alter table public.empresas add column if not exists cor_fundo text not null default '#f5f7fb' check(cor_fundo ~ '^#[0-9a-fA-F]{6}$');
grant update(cor_sidebar,cor_fundo) on public.empresas to authenticated;
create table if not exists public.contrato_reaberturas (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),
 locacao_id uuid not null references public.locacoes(id),usuario_id uuid not null,
 motivo text not null,criado_em timestamptz not null default now(),transacao bigint not null default txid_current()
);
alter table public.contrato_reaberturas enable row level security;
revoke all on public.contrato_reaberturas from public,anon,authenticated;
grant select on public.contrato_reaberturas to authenticated;
drop policy if exists reaberturas_leitura on public.contrato_reaberturas;
create policy reaberturas_leitura on public.contrato_reaberturas for select to authenticated using(public.acesso_modulo(empresa_id,'locacao'));
create or replace function public.contrato_reabrir(p_empresa uuid,p_locacao uuid,p_motivo text)
returns void language plpgsql security definer set search_path=public as $$
declare r public.locacoes;
begin
 if auth.uid() is null or not coalesce(public.acesso_admin_empresa(p_empresa),false) then raise exception 'Somente o administrador pode reabrir um contrato.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 10 and 1000 then raise exception 'Informe um motivo entre 10 e 1000 caracteres.';end if;
 select * into r from public.locacoes where id=p_locacao and empresa_id=p_empresa for update;
 if r.id is null then raise exception 'Locação não encontrada.';end if;
 if r.status<>'Reservada' or r.contrato_gerado_em is null then raise exception 'Somente contratos definitivos de locações reservadas podem ser reabertos.';end if;
 if r.assinatura_referencia is not null or r.assinatura_cliente_em is not null or r.assinatura_locadora_em is not null
 or exists(select 1 from public.documentos_locacao where locacao_id=r.id and tipo='contrato_locacao' and (enviado_em is not null or assinado_em is not null or provedor_documento_id is not null or status in ('enviado','visualizado','assinado_parcial','assinado','validado')))
 then raise exception 'Contrato enviado ou assinado. Cancele o envio no fluxo de assinatura antes de substituir.';end if;
 insert into public.contrato_reaberturas(empresa_id,locacao_id,usuario_id,motivo) values(p_empresa,r.id,auth.uid(),trim(p_motivo));
 update public.locacoes set contrato_gerado_em=null,contrato_status='Rascunho' where id=r.id;
end $$;
create or replace function public.contrato_proteger_reabertura() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (old.assinatura_referencia is not null and new.assinatura_referencia is distinct from old.assinatura_referencia)
 or (old.assinatura_cliente_em is not null and new.assinatura_cliente_em is distinct from old.assinatura_cliente_em)
 or (old.assinatura_locadora_em is not null and new.assinatura_locadora_em is distinct from old.assinatura_locadora_em)
 then raise exception 'Não remova o vínculo ou a confirmação de assinatura para reabrir um contrato.';end if;
 if old.contrato_gerado_em is not null and new.contrato_gerado_em is null and not exists(select 1 from public.contrato_reaberturas where locacao_id=old.id and empresa_id=old.empresa_id and usuario_id=auth.uid() and transacao=txid_current()) then raise exception 'Use a reabertura autorizada pelo administrador.';end if;
 return new;
end $$;
drop trigger if exists contrato_reabertura_controlada on public.locacoes;
create trigger contrato_reabertura_controlada before update on public.locacoes for each row execute function public.contrato_proteger_reabertura();
revoke all on function public.contrato_reabrir(uuid,uuid,text),public.contrato_proteger_reabertura() from public,anon;
grant execute on function public.contrato_reabrir(uuid,uuid,text) to authenticated;
commit;
select 'Cores e reabertura de contratos ativadas' as resultado;
