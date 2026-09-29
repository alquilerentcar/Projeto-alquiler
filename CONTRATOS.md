# Módulo de contratos

## Telas

- `locacoes.html`: cria e altera a operação de locação.
- `contratos.html`: apresenta todos os contratos originados pelas locações.
- `contrato.html?locacao=<id>`: revisa um contrato específico, calcula a caução e gera o documento.
- `modelos-contrato.html`: apresenta o modelo Word e seus marcadores.

## Geração

1. O sistema lê cliente, carro e locação no Supabase.
2. `gerar_contrato_web.py` preenche `modelo_contrato.docx`.
3. O Word é convertido para PDF.
4. O PDF recebe número, versão, hash SHA-256 e caminho no bucket privado.
5. Uma nova linha é gravada em `contratos_gerados`.

## Conversão para PDF

O computador atual não possui LibreOffice. O Word está instalado, mas a automação em segundo plano não ficou disponível na sessão do servidor. Antes da assinatura em PDF, deve ser adotada uma destas opções:

1. Instalar LibreOffice e chamar `soffice --headless` no servidor local.
2. Executar a conversão em um serviço próprio que possua LibreOffice.
3. Gerar o PDF diretamente em Python, reconstruindo o papel timbrado.

A primeira opção preserva melhor o modelo Word atual.

## Assinatura recomendada

- **Locadora:** certificado A1 da empresa no backend.
- **Cliente:** link remoto de um provedor de assinatura, com e-mail ou telefone, selfie e documento quando necessário.
- **A3:** assinatura local, porque depende do dispositivo físico.

## Dados que não são digitados manualmente

Estes campos são preenchidos pela integração e ficam somente para consulta:

- referência externa do provedor;
- URL temporária do documento;
- horário real de cada assinatura;
- hash e número de série do certificado;
- estado retornado pelo provedor.

## Próxima entrega técnica

A próxima etapa deve criar a migração do banco e a geração versionada do PDF. A assinatura só deve ser ativada depois que a conversão produzir um PDF estável e armazenado no Supabase.
