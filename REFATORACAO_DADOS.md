# Plano de refatoração dos dados

Este documento organiza as melhorias propostas sem apagar ou recriar tabelas que já possuem dados.

## Decisões

### 1. Clientes e fornecedores continuam separados

O sistema já diferencia os dois cadastros e essa separação será mantida. `clientes` representa locatários e condutores. `fornecedores` representa empresas e pessoas que prestam serviços ou vendem produtos.

Não será criado `tipo_cadastro = cliente/fornecedor/ambos` dentro de `clientes`.

### 2. A locação é a fonte da operação

`locacoes` guarda reserva, execução, datas, carro e valores contratados.

`contratos_gerados` guarda cada documento emitido, com número, versão, snapshot dos dados, arquivo e hash. A tabela antiga `contratos` deixa de receber novos registros depois da migração.

### 3. Cálculos financeiros têm uma única fonte

- Pagamentos entram em `locacao_pagamentos`.
- O total pago e a caução paga são somados pelo banco.
- Saldo e parcela da caução são calculados por uma view ou função do banco.
- O navegador apenas apresenta uma prévia do cálculo.

### 4. Certificados

- O arquivo A1 permanece em bucket privado.
- A senha é solicitada a cada assinatura e usada somente em memória.
- Não será armazenada senha, senha criptografada ou hash da senha. Um hash não permite assinar e ainda cria uma falsa expectativa de recuperação.
- A3 exige o dispositivo físico na máquina do titular.

## Modelo alvo

### Cadastro de clientes

`clientes` mantém identidade e habilitação:

- tipo de pessoa;
- nome, CPF ou CNPJ;
- nascimento, RG e filiação;
- CNH, categoria, primeira habilitação e validade;
- e-mail principal;
- situação, origem e datas de auditoria.

Tabelas relacionadas:

- `cliente_contatos`: quantidade livre de telefones e contatos de emergência;
- `cliente_enderecos`: residencial, comercial e cobrança;
- `cliente_documentos`: CNH, RG e comprovantes com metadados;
- `clientes_historico`: alterações relevantes.

### Operação de locação

- `locacoes`: fonte da reserva e execução;
- `locacao_condutores`: condutor principal e até dois adicionais;
- `locacao_pagamentos`: diária, caução, multa, avaria, combustível e estorno;
- `anexos_locacao`: vistoria, fotos e termos;
- `contratos_gerados`: documentos versionados;
- `assinaturas_contrato`: evidências e auditoria de cada assinatura.

## Estados padronizados

### Locação

- `Reservada`
- `Ativa`
- `Encerrada`
- `Cancelada`
- `Inadimplente`

### Documento

- `Rascunho`
- `Gerado`
- `Enviado`
- `Assinado`
- `Arquivado`
- `Cancelado`

### Assinatura

- `Pendente`
- `Aguardando locadora`
- `Aguardando cliente`
- `Assinado`
- `Recusado`
- `Expirado`
- `Cancelado`

## Regras essenciais

1. Um carro não pode ter períodos sobrepostos enquanto a locação estiver reservada ou ativa.
2. Uma locação assinada não pode ser alterada; correções geram nova versão do contrato.
3. O contrato guarda um snapshot, portanto alterações futuras no cliente ou veículo não mudam documentos antigos.
4. Cada pagamento possui data, valor, tipo, forma e eventual comprovante.
5. A devolução registra data real, caução restituída, retenções e motivo.
6. A CNH precisa estar válida; a regra de dois anos de habilitação deve ser configurável.

## Migração segura

### Fase 1 — diagnóstico

- contar registros e duplicidades;
- identificar CPF, CNPJ, telefone e endereço inválidos;
- verificar locações sobrepostas já existentes;
- criar backup exportável antes de adicionar restrições.

### Fase 2 — estrutura paralela

- criar tabelas relacionadas sem remover colunas antigas;
- copiar contatos, endereços e documentos para as novas tabelas;
- comparar totais e produzir relatório de inconsistências.

### Fase 3 — compatibilidade

- atualizar a aplicação para ler e escrever nas novas tabelas;
- manter temporariamente as colunas antigas somente para leitura;
- centralizar cálculos de caução e pagamentos no banco.

### Fase 4 — contratos

- criar `contratos_gerados` e armazenamento privado;
- gerar número, versão, snapshot e hash;
- alterar `contratos.js` para consultar documentos reais;
- bloquear edição depois da assinatura.

### Fase 5 — restrições

- adicionar validação de documento depois de corrigir os dados existentes;
- ativar a regra de não sobreposição;
- adicionar checks de estados e datas;
- remover colunas antigas somente depois da conferência final.

## Ordem recomendada

1. Corrigir cadastros inválidos e fazer backup.
2. Criar `contratos_gerados` e versionamento.
3. Impedir sobreposição de carros.
4. Criar pagamentos e centralizar caução.
5. Normalizar contatos, endereços e documentos.
6. Adicionar condutores, anexos e restituição de caução.
7. Ativar auditoria e validações rígidas.

Nenhuma etapa deve usar `DROP TABLE clientes` ou recriar `locacoes` diretamente no banco de produção.
