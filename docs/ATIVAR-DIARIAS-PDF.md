# Vínculo contratual das diárias

Executar locacao_pdf_diarias.sql no SQL Editor como postgres. A migração não ativa PDFs antigos nem altera pagamentos existentes. Até ativar, a geração mantém o fluxo antigo e informa a pendência de configuração.

Novos PDFs definitivos: ativam a locação já cadastrada, não criam uma segunda locação. Geram um plano vinculado à primeira versão do PDF. Repetir a confirmação retorna o mesmo plano.

Regra confirmada: usa valor_caucao_pago (entrada efetivamente informada), não o valor total da caução. Abaixo de R$ 1.000, incluindo zero, primeira diária na Data do contrato. R$ 1.000 ou mais: plano aguarda a entrega física; em Gerenciar etapas, conferir as assinaturas, vistoria e informar data/hora reais. Primeira diária no dia seguinte, em Manaus. Vencimento 18h e multa única 11% continuam pelas regras existentes. O saldo futuro é previsão, materializado quando o dia chega e o controle é consultado.

O PDF não é uma assinatura nem confirmação de entrega. Entrada da caução e geração de recibo não criam um recebimento de caixa automaticamente. Extras e baixas continuam manuais. Registre o dinheiro efetivamente recebido uma única vez no Financeiro.

Não muda o início das ocupações antigas já cadastradas. Uma nova locação não pode ocupar veículo que já tenha outro período ou locatário ativo. Falha de ativação preserva o PDF; use Concluir ativação da locação e das diárias na visualização para retomar, sem gerar outro arquivo.

Recibo da caução no último anexo e recibo avulso exigem papel timbrado cadastrado em Administração → Empresa. Documentos já emitidos não são reescritos.

Testes: npm run test:pdf-diarias. Utilizam banco isolado em memória e arquivos fictícios, sem alterar o banco operacional.
