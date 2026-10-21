# Cadastros e operação — 21/10/2026

## Ativação

No SQL Editor do projeto Supabase, selecione o papel **postgres** e execute `clientes_operacao_complementos.sql` inteiro. Não execute como `authenticated`. O script foi verificado em banco isolado, inclusive reaplicação e separação por empresa; ainda precisa ser aplicado no banco operacional.

Depende das estruturas existentes de acesso, clientes, locações, documentos definitivos e eventos da locação. Não substitui os scripts iniciais nem recria dados da empresa.

## Uso

- Clientes: CPF/CNPJ com máscara e verificação dos dígitos; nomes em maiúsculas; consulta individual de endereço pelo CEP. Número e complemento são preenchidos manualmente. Contato 1 é o próprio locatário; contatos 2 a 4 são referências.
- Em cada cliente, **Documentos e débitos** abre o arquivo privado de contratos externos, termos, orçamentos e outros documentos. PDF, DOCX e imagens, até 10 MB por arquivo.
- **Novo débito**: informe valor original, o que já foi pago, parcelas, frequência e primeiro vencimento. O pagamento anterior reduz o saldo sem gerar uma segunda entrada no caixa. O débito pertence ao locatário e permanece quando troca de carro.
- Financeiro → **Débitos extras** reúne as parcelas. Cada baixa registra valor e data/hora reais do recebimento. Administradores criam débitos; usuários autorizados registram recebimentos.
- Vistoriadores são cadastrados por empresa. Administradores gerenciam nomes ativos; usuários selecionam quem realizou a vistoria. Nomes antigos dos documentos permanecem preservados.
- O envio confirmado pelo provedor de assinatura inicia a ocupação de uma locação reservada, com registro no histórico. Isso não marca a assinatura nem a entrega física como concluídas. A verificação anterior ao envio não altera a ocupação. Conflitos de veículo são recusados.

## RECRUTA

A leitura usa imagem e texto do PDF, separa dados pessoais da CNH dos endereços do comprovante e mostra avisos para campos inválidos. A seleção de anexos continua aguardando o botão Enviar. Confira o original antes de salvar; os testes desta revisão não equivalem à validação de todas as CNHs reais.

## Verificações

Foram exercitados em ambiente isolado: permissões por empresa, parcelamento, pagamento parcial, repetição segura das operações, documentos privados, seleção de vistoriadores e ocupação após envio confirmado. O provedor de assinatura ainda precisa de teste completo com retorno do PDF assinado.
