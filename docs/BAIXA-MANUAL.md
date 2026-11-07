# Baixa manual por locatário

Ativação: executar pagamentos_compostos.sql no SQL Editor do Supabase com papel postgres. Não altera baixas antigas. Recarregar a página após ativar. Antes da ativação, permanece a baixa simples de diária.

Financeiro → Entradas do dia → Registrar recebimento. Informar total e data/hora reais em Manaus. Sugerir divisão: diária primeiro e parcelas de caução vencidas até o dia da diária, por ordem de vencimento. A sugestão pode ser ajustada. Multas de infração e outras parcelas são escolhas explícitas. A multa de atraso da própria diária continua calculada pelas regras existentes; optar por não incluí-la no pagamento não perdoa o saldo.

Nenhum excedente vira caução sem uma parcela existente ou um novo plano informado pelo administrador. O novo plano pede valor de cada parcela diária, quantidade restante, primeiro vencimento, valor já pago anteriormente e referência do contrato. Mostra o término previsto; pagamentos atrasados não mudam automaticamente o cronograma.

Exemplo: R$ 170 recebidos = R$ 145 diária + R$ 25 parcela da caução, quando não há multa de atraso a quitar. Confirmar a divisão somente depois de revisar. É possível registrar somente extras mesmo se a diária estiver paga.

A baixa é uma transação única com identificador de tentativa: confirma tudo ou desfaz tudo. Reenvio idêntico retorna a mesma baixa. Valores acima do saldo, parcelas de outro cliente/empresa e composição diferente do total são recusados no banco. O histórico existente soma os lançamentos componentes; a tabela financeiro_baixas guarda o vínculo e a composição, sem duplicar dinheiro no total de recebimentos. A tela do locatário continua vendo as mesmas parcelas e seus saldos atualizados.

Não cria recibo assinado nem modifica contrato automaticamente. Não há aplicativo ou login de locatário nesta alteração. Um portal futuro deverá consultar os pagamentos/documentos por identidade verificada e permissões próprias; não deve receber permissões de operador da locadora.

Testes: npm run test:payments (PostgreSQL isolado em memória e navegador com dados fictícios). Não acessam o banco real.
