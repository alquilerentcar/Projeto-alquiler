# Entradas por locatário

Financeiro → Entradas do dia agrupa pelo ID do cliente, sem unir nomes iguais sem vínculo. Clique no nome para ver diárias, caução contratual, parcelas e registrar recebimentos.

O previsto do dia soma apenas diárias e parcelas financeiras com vencimento na data selecionada. Valores recebidos nessas cobranças podem ter sido recebidos em outra data; o histórico Recebimentos continua filtrando a data real do dinheiro. Parcelas vencidas de outros dias e futuras ficam no detalhamento.

Caução informada no contrato aparece como referência, sem gerar dívida ou dinheiro automaticamente. O parcelamento financeiro é cadastrado no detalhamento (Novo débito, Caução complementar), verificando se já existe. Isso preserva a regra de extras manuais e evita duplicar pagamentos. Os valores contratuais não são atualizados pelas baixas financeiras.

Não exige nova migração. Os recursos de débitos dependem de clientes_operacao_complementos.sql já instalado; a divisão atômica diária + extras depende de pagamentos_compostos.sql. Erros de consulta são mostrados, sem presumir saldo zero confirmado.
