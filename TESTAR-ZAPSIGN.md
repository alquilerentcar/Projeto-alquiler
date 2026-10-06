# Teste ZapSign

Configure ZAPSIGN_API_TOKEN como Secret em Preview, vinculado a este projeto. Abra a implantação Preview da branch codex/zapsign-sandbox, entre como desenvolvedor e acesse Assinaturas → Teste da API ZapSign → Criar documento de teste. Abra o link retornado e assine o documento fictício.

O teste usa exclusivamente https://sandbox.api.zapsign.com.br/api/v1/docs/ e fica bloqueado quando VERCEL_ENV=production. Não envia e-mails, não contém dados reais e não altera o banco. Não repita uma solicitação com resultado incerto sem conferir o painel. O token nunca é retornado ao navegador.

Este teste inicial ainda não integra documentos reais, sincronização de status ou webhooks. PDFs enviados pelo endpoint de upload têm limite documentado de 10 MB.

Documentação: https://docs.zapsign.com.br/documentos/criar-documento e https://docs.zapsign.com.br/ambiente-de-testes
