# Recibo da caução e conversão de substituição

O recibo é o último anexo nas novas gerações de PDF e Word. Usa somente valor_caucao_pago, que deve representar o valor efetivamente recebido. Se for zero, não emite recibo; parcelas futuras não são declaradas recebidas. O documento reúne locadora/CNPJ/endereço cadastrado, locatário/CPF, valor por extenso e placa. Não gera outra movimentação financeira. PDFs já salvos ou assinados permanecem preservados.

Para ativar a conversão de temporária em permanente, execute substituicao_temporaria_permanente.sql como postgres, após os scripts de substituição já existentes. Essa atualização depende de frota_substituicoes, frota_periodos, locacoes, frota_levantamento e storage.objects. Se reinstalar uma versão antiga de substituicao_confirmar, reaplique a atualização da conversão por último.

Na tela Substituir veículo, localize o termo temporário confirmado e clique Tornar permanente. Informe a data e hora reais da decisão em Manaus. O sistema prepara novo aditivo, copia as fotos da entrega temporária e as identifica como originais. A conversão só é confirmada após o PDF e todas as fotos estarem salvos. O carro e a diária atuais são mantidos; não há nova entrega nem alteração retroativa dos períodos. O termo temporário ganha referência ao permanente, sem perder o conteúdo ou PDF anterior. Não há envio automático para assinatura.

Se o locatário já tiver mudado de carro ou se a conversão já estiver confirmada, a operação é recusada. Em falha de envio, conclua a preparação pelo histórico; ela retoma as fotos originais sem precisar registrar outra troca.

Testado em banco isolado: repetição segura, acesso por empresa, PDF obrigatório, preservação do termo anterior e ausência de mudança da diária/ocupação. Recibo testado em Word e no renderizador de PDF com dados fictícios. Nenhuma locação operacional foi alterada nesta revisão.
