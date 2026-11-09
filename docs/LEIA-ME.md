# BG SYS · Módulo Locação

Sistema multiempresa desenvolvido pela BG Soluções Tecnológicas. O módulo atual administra clientes, fornecedores, veículos, locações, contratos, documentos e o financeiro da locadora.

## Executar no computador

Execute `iniciar.bat` e abra `http://localhost:3000`. Para usar a IA, execute `iniciar-com-ia.bat`.

## Assistente IA

O botão **Assistente IA** aparece nas páginas de cadastros. Ele conversa sobre o sistema, consulta clientes por nome ou CPF e lê PDF, JPG, PNG ou WebP (até 8 MB) para preparar um rascunho. Após a leitura, clique em **Revisar no cadastro de clientes**, confira os campos e salve no formulário. O arquivo enviado para leitura não é anexado automaticamente ao cadastro; use os campos de documento do formulário se desejar guardá-lo.

Para ativar as respostas do Gemini, execute `iniciar-com-ia.bat` e cole sua chave no terminal quando solicitado. A digitação fica oculta. A chave fica somente na memória do processo do servidor local durante essa sessão; não a coloque no HTML nem a envie pelo chat. É possível escolher o modelo com `GEMINI_MODEL`; o padrão é `gemini-3.5-flash-lite`. Sem a chave, a interface informa que a conexão ainda precisa ser configurada.

As mensagens recentes ficam somente na sessão do navegador. A consulta ao Supabase busca até cinco clientes por solicitação. Documentos e dados consultados são enviados ao Gemini quando o usuário solicita a leitura ou consulta.

## Repositório e publicação

Mantenha o repositório privado. Nunca envie arquivos `.pfx`, `.p12`, `.env`, senhas, documentos de clientes ou exportações reais do banco.

O repositório contém `vercel.json` e uma função em `api/[...path].js`. Na Vercel, use o preset **Other** e deixe os comandos de build e diretório de saída vazios. As integrações privadas devem ser cadastradas em **Settings → Environment Variables**:

- `GEMINI_API_KEY`: assistente e leitura de documentos;
- `GEMINI_MODEL`: modelo utilizado, quando desejar substituir o padrão;
- `AUTENTIQUE_API_TOKEN`: envio de contratos para assinatura;
- `AUTENTIQUE_SANDBOX`: `true` durante os testes;
- `AUTENTIQUE_CLIENT_VERIFICATION`: método de verificação do cliente.

Cada atualização enviada à branch `main` poderá gerar uma nova publicação automática.

## Acesso

- O sistema abre primeiro a tela de login. O Supabase Auth confirma a conta e `usuarios_empresa` define a empresa, o usuário e suas permissões.
- O script `revogar_acesso_sem_login.sql` remove as permissões anônimas temporárias das tabelas e dos documentos. O script `certificados_digitais.sql` cria a tabela e o bucket privados dos certificados.
- Não coloque senhas de certificados, chaves privadas ou credenciais de API nos arquivos HTML ou JavaScript. A senha de um A1 não é armazenada pelo cadastro.

## Certificados digitais

A página `certificados.html` cadastra titular, tipo A1/A3, CPF ou CNPJ, emissor, número de série, datas de validade, finalidade e observações. Um certificado A1 exige arquivo `.pfx` ou `.p12` de até 10 MB. O arquivo fica no bucket privado `certificados-digitais` e só pode ser lido pela conta autorizada. O cadastro permite substituir ou baixar esse arquivo.

## Veículos e Senatran

A aba `carros.html` ainda usa o formulário manual. A consulta automática não foi ativada porque faltam autorização e credenciais da API Senatran/Serpro. Após a contratação, configure Consumer Key e Consumer Secret em um serviço de backend ou função protegida, nunca no navegador. Esse serviço consultará a API, mapeará os campos necessários e gravará os carros no Supabase. O arquivo do certificado A1, se exigido pelo fluxo contratado, deve ser acessado apenas no servidor.

Serviço oficial: https://www.gov.br/pt-br/servicos/contratar-consulta-denatran

## Arquivos principais

- `clientes.html` / `app.js`: clientes e documentos RG, CNH e comprovante.
- `fornecedores.html` / `pages.js`: fornecedores.
- `carros.html` / `fleet.js`: frota.
- `locacoes.html` / `locacoes.js`: criação e histórico das locações.
- `contratos.html`, `contrato.html`: contratos, vistoria, anexos e PDF.
- `financeiro.html` / `financeiro.js`: estrutura financeira da locação.
- `sidebar.js`: menu único, empresa, logo e usuário em todas as telas.
- `certificados.html` / `certificados.js`: certificados digitais.
- `server.js`: servidor local em `127.0.0.1:3000`.
- `assistente.js` / `assistente.css`: conversa, envio de documento e revisão do rascunho.
