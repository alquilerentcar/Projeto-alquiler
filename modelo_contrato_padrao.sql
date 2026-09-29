-- Estrutura dos modelos de contrato e seus marcadores.
alter table public.clientes add column if not exists nacionalidade text;
alter table public.clientes add column if not exists profissao text;
alter table public.clientes add column if not exists cnh text;

alter table public.locacoes add column if not exists valor_caucao numeric(12,2);
alter table public.locacoes add column if not exists numero_parcelas_caucao integer;
alter table public.locacoes add column if not exists valor_parcela_caucao numeric(12,2);
alter table public.locacoes add column if not exists texto_aditivo text;
alter table public.locacoes add column if not exists prazo_dias integer;
alter table public.locacoes add column if not exists multa_atraso_diaria numeric(12,2) default 30;
alter table public.locacoes add column if not exists cidade_foro text default 'Manaus';
alter table public.locacoes add column if not exists data_assinatura date;
alter table public.locacoes add column if not exists valor_caucao_pago numeric(12,2) not null default 0;
alter table public.locacoes add column if not exists saldo_caucao numeric(12,2) not null default 0;
alter table public.locacoes add column if not exists status_assinatura text not null default 'Pendente';
alter table public.locacoes add column if not exists assinatura_locadora_em timestamptz;
alter table public.locacoes add column if not exists assinatura_cliente_em timestamptz;
alter table public.locacoes add column if not exists assinatura_provedor text;
alter table public.locacoes add column if not exists assinatura_referencia text;
alter table public.locacoes add column if not exists documento_assinado_url text;

create table if not exists public.modelos_contrato (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  arquivo_nome text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.campos_modelo_contrato (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.modelos_contrato(id) on delete cascade,
  marcador text not null,
  descricao text not null,
  origem text not null,
  campo_origem text,
  valor_padrao text,
  ordem integer not null default 0,
  unique(modelo_id, marcador)
);

alter table public.modelos_contrato enable row level security;
alter table public.campos_modelo_contrato enable row level security;
grant select, insert, update on public.modelos_contrato, public.campos_modelo_contrato to authenticated;
revoke all on public.modelos_contrato, public.campos_modelo_contrato from anon;
drop policy if exists modelos_contrato_admin on public.modelos_contrato;
drop policy if exists campos_modelo_contrato_admin on public.campos_modelo_contrato;
create policy modelos_contrato_admin on public.modelos_contrato for all to authenticated using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));
create policy campos_modelo_contrato_admin on public.campos_modelo_contrato for all to authenticated using ((select public.pode_gerenciar_clientes())) with check ((select public.pode_gerenciar_clientes()));

insert into public.modelos_contrato (codigo, nome, arquivo_nome, ativo)
values ('LOCACAO_PADRAO', 'Contrato de locação padrão', 'modelo_contrato.docx', true)
on conflict (codigo) do update set nome=excluded.nome, arquivo_nome=excluded.arquivo_nome, ativo=true;

with modelo as (select id from public.modelos_contrato where codigo='LOCACAO_PADRAO')
insert into public.campos_modelo_contrato (modelo_id, marcador, descricao, origem, campo_origem, valor_padrao, ordem)
select modelo.id, v.marcador, v.descricao, v.origem, v.campo_origem, v.valor_padrao, v.ordem from modelo cross join (values
('{{ nome_locatario }}','Nome completo do locatário','clientes','nome_completo',null,1),
('{{ nacionalidade }}','Nacionalidade','clientes','nacionalidade','brasileiro(a)',2),
('{{ estado_civil }}','Estado civil','clientes','estado_civil',null,3),
('{{ profissao }}','Profissão','clientes','profissao',null,4),
('{{ cnh }}','Número da CNH','clientes','cnh',null,5),
('{{ cpf }}','CPF','clientes','cpf',null,6),
('{{ rg }}','RG','clientes','rg',null,7),
('{{ data_nascimento }}','Data de nascimento','clientes','data_nascimento',null,8),
('{{ endereco }}','Endereço completo','clientes','endereco',null,9),
('{{ cep }}','CEP','clientes','cep',null,10),
('{{ email }}','E-mail','clientes','email',null,11),
('{{ telefone_principal }}','Telefone principal','clientes','contato_1_numero',null,12),
('{{ contato_1_nome }}','Responsável do contato de emergência 1','clientes','contato_2_responsavel',null,13),
('{{ contato_1_telefone }}','Telefone de emergência 1','clientes','contato_2_numero',null,14),
('{{ contato_2_nome }}','Responsável do contato de emergência 2','clientes','contato_3_responsavel',null,15),
('{{ contato_2_telefone }}','Telefone de emergência 2','clientes','contato_3_numero',null,16),
('{{ contato_3_nome }}','Responsável do contato de emergência 3','clientes','contato_4_responsavel',null,17),
('{{ contato_3_telefone }}','Telefone de emergência 3','clientes','contato_4_numero',null,18),
('{{ veiculo_modelo }}','Modelo do carro','carros','modelo',null,19),
('{{ veiculo_marca }}','Marca do carro','carros','marca',null,20),
('{{ veiculo_cor }}','Cor do carro','carros','cor',null,21),
('{{ veiculo_placa }}','Placa','carros','placa',null,22),
('{{ veiculo_renavam }}','RENAVAM','carros','renavam',null,23),
('{{ veiculo_chassi }}','Chassi','carros','chassi',null,24),
('{{ veiculo_ano }}','Ano/modelo','carros','ano',null,25),
('{{ data_inicio }}','Data inicial','locacoes','data_inicio',null,26),
('{{ data_fim }}','Data final','locacoes','data_fim',null,27),
('{{ valor_caucao }}','Valor da caução','locacoes','valor_caucao',null,28),
('{{ numero_parcelas }}','Número de parcelas da caução','locacoes','numero_parcelas_caucao',null,29),
('{{ valor_parcela_caucao }}','Valor de cada parcela','locacoes','valor_parcela_caucao',null,30),
('{{ texto_aditivo }}','Texto do aditivo','locacoes','texto_aditivo','',31),
('{{ valor_diaria }}','Valor da diária','locacoes','valor_diaria',null,32),
('{{ valor_diaria_extenso }}','Valor da diária por extenso','calculado','valor_diaria',null,33),
('{{ prazo_dias }}','Prazo em dias','locacoes','prazo_dias',null,34),
('{{ prazo_dias_extenso }}','Prazo por extenso','calculado','prazo_dias',null,35),
('{{ multa_atraso_diaria }}','Multa diária por atraso','locacoes','multa_atraso_diaria','30,00',36),
('{{ cidade_foro }}','Cidade do contrato e foro','locacoes','cidade_foro','Manaus',37),
('{{ data_assinatura }}','Data da assinatura','locacoes','data_assinatura',null,38),
('{{ valor_caucao_pago }}','Valor já pago da caução','locacoes','valor_caucao_pago',null,39),
('{{ saldo_caucao }}','Saldo restante da caução','locacoes','saldo_caucao',null,40),
('{{ valor_diaria_com_caucao }}','Diária somada à parcela da caução','calculado','valor_parcela_caucao',null,41),
('{{ status_assinatura }}','Estado atual da assinatura','locacoes','status_assinatura','Pendente',42)
) as v(marcador,descricao,origem,campo_origem,valor_padrao,ordem)
on conflict (modelo_id, marcador) do update set descricao=excluded.descricao, origem=excluded.origem, campo_origem=excluded.campo_origem, valor_padrao=excluded.valor_padrao, ordem=excluded.ordem;

select count(*) as total_campos from public.campos_modelo_contrato c join public.modelos_contrato m on m.id=c.modelo_id where m.codigo='LOCACAO_PADRAO';
