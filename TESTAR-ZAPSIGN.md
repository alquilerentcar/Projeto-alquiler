# Teste de assinatura com você — ZapSign

## Configurar uma vez

1. Na conta sandbox da ZapSign, copie a chave em Configurações → Integrações → API ZapSign.
2. Na Vercel, dentro do projeto Projeto-alquiler, adicione a variável secreta ZAPSIGN_SANDBOX_API_TOKEN. O valor é a chave da conta sandbox. Se a variável for compartilhada, vincule-a ao projeto. Marque os ambientes em que deseja testar e faça redeploy.
3. Para uso local, coloque a mesma variável no .env e reinicie o servidor. Nunca envie o token ao GitHub ou pelo chat.

O token antigo ZAPSIGN_API_TOKEN continua aceito em desenvolvimento/Preview. No site de produção, seu uso exige ZAPSIGN_SANDBOX=true. A chave dedicada evita essa configuração adicional. Todas as chamadas deste teste usam exclusivamente https://sandbox.api.zapsign.com.br/api/v1/docs/ — nunca a API de produção.

## Fazer o teste

1. Entre no sistema como desenvolvedor e abra Assinaturas.
2. No painel “Teste de assinatura com você”, preencha seu nome e escolha código por e-mail ou SMS. Informe o respectivo contato. Não use dados de clientes.
3. Se quiser receber o convite por e-mail, marque “Enviar também o link do teste para meu e-mail”. Sem essa opção, o link aparecerá na tela; a verificação por código continua sendo solicitada ao assinar. O provedor também pode enviar notificações próprias do fluxo.
4. Confirme o uso dos seus dados e clique em Criar meu teste de assinatura. A janela de confirmação mostra o destinatário antes da chamada.
5. Abra o link retornado, preferencialmente no celular, para permitir o uso da câmera. Assine na tela, informe o código solicitado e siga as instruções de foto de documento e selfie do provedor.
6. Volte ao sistema e clique em Atualizar resultado. Quando o provedor confirmar status signed, o sistema disponibilizará o PDF assinado se o arquivo estiver pronto. Confira o relatório de assinaturas e as evidências dentro do PDF/painel.

## O que este teste comprova

- Criação de um documento fictício e retorno do link.
- Configuração de assinatura na tela + tokenEmail ou tokenSms, require_document_photo e require_selfie_photo.
- Consulta manual do andamento e obtenção do PDF assinado.
- Exibição dos indicadores de frente, verso e selfie somente quando a API retornar as respectivas evidências. A ausência de um campo não prova que a foto foi recusada; confira o PDF e o painel.

A coleta das fotos NÃO é verificação biométrica automática. Reconhecimento facial/liveness exige outro recurso e pode ter custo adicional. SMS e recursos de autenticação dependem da conta e da disponibilidade do sandbox; um teste bem-sucedido não confirma o plano ou preço de produção.

O documento é fictício, sem validade jurídica. Não é contrato de cliente, não altera locação, ocupação, pagamentos ou o banco operacional. A assinatura real só estará integrada após homologar esse teste e implementar o vínculo, os eventos e o armazenamento dos documentos reais.

## Falha ou demora

Se a criação não for confirmada, NÃO reenvie automaticamente. Confira a lista de documentos no painel sandbox. O teste guarda a referência na sessão do seu usuário e empresa para consultar depois, sem guardar nome, contato, fotos ou selfie no armazenamento do navegador. “Novo teste” exige nova confirmação e mantém o documento anterior no provedor.

O botão Atualizar resultado faz somente consulta. Links de PDF do provedor expiram; atualize para obter outro. Não há webhook deste teste, envio automático de WhatsApp, validação biométrica ou alteração de registros reais.

Documentação oficial:
- https://docs.zapsign.com.br/documentos/criar-documento
- https://docs.zapsign.com.br/documentos/detalhar-documento
- https://docs.zapsign.com.br/ambiente-de-testes
