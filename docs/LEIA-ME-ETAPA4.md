# Etapa 4 — confirmações da operação

1. Execute `etapa4_operacao.sql` completo no SQL Editor do projeto Supabase. Não execute novamente os scripts antigos de instalação.
2. Aguarde o resultado `Etapa 4: operação da locação ativada`.
3. Atualize a tela Locações com Ctrl+F5 e abra **Gerenciar etapas**.

## Regras

- Novas locações começam em Reservada. Registros anteriores não são convertidos pela migração.
- Entrega: exige vistoria de saída preenchida, PDF de contrato registrado e conferência manual de checklist, fotos e assinaturas. Altera o status para Ativa. Um veículo não pode ser entregue em duas locações ativas.
- Devolução: exige vistoria de retorno preenchida. Data e quilometragem não podem ser inferiores às da saída. Preserva o status Ativa enquanto aguarda encerramento.
- Encerramento: apenas o administrador da empresa, após devolução confirmada, com declaração de conferência dos valores finais e destinação da caução. Altera o status para Encerrada.
- O histórico preserva usuário, data, observações e cópias dos dados usados na confirmação. Não pode ser editado diretamente pelo usuário.
- Atualizações diretas de status passam a ser bloqueadas pelo banco; use as ações do fluxo. Cancelamento, reabertura e troca de veículo precisam de fluxos próprios e não estão incluídos nesta atualização.

## Limites desta entrega

A conferência de assinaturas é manual e não marca o documento como assinado na API. A conferência financeira não cria pagamentos, baixa dívidas, devolve caução ou gera distrato. Esses atos continuam exigindo seus registros e comprovantes próprios. O veículo deixa de bloquear nova entrega quando a locação é encerrada, não apenas ao registrar devolução.

## Validação local

Migração executada duas vezes em PostgreSQL de teste (PGlite); verificados status protegidos, restrição por empresa, requisitos de vistoria/PDF, dupla entrega, administrador no encerramento, histórico imutável e liberação após encerramento. Interface testada no Edge com dados simulados para entrega, devolução, encerramento e perfil de operador. Aplicação no Supabase real depende da execução do SQL acima.
