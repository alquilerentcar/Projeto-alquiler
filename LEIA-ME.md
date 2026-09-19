# Sistema de cadastros · Alquiler Rent Car

Execute `iniciar.bat` e abra `http://localhost:3000`. Cada item do menu abre uma página HTML própria.

## Assistente IA

O botão **Assistente IA** aparece nas páginas de cadastros. Ele conversa sobre o sistema, consulta clientes por nome ou CPF e lê PDF, JPG, PNG ou WebP (até 8 MB) para preparar um rascunho. Após a leitura, clique em **Revisar no cadastro de clientes**, confira os campos e salve no formulário. O arquivo enviado para leitura não é anexado automaticamente ao cadastro; use os campos de documento do formulário se desejar guardá-lo.

Para ativar as respostas da OpenAI, execute `iniciar-com-ia.bat` e cole sua chave no terminal quando solicitado. A digitação fica oculta. A chave fica somente na memória do processo do servidor local durante essa sessão; não a coloque no HTML nem a envie pelo chat. É possível escolher o modelo com `OPENAI_MODEL`; o padrão é `gpt-5-mini`. Sem a chave, a interface mostra que a conexão ainda precisa ser configurada.

As mensagens recentes ficam somente na sessão do navegador. A consulta ao Supabase busca até cinco clientes por solicitação. Documentos e dados consultados são enviados à OpenAI quando o usuário solicita a leitura ou consulta; o servidor usa `store: false` na chamada da API.

## Acesso

- Clientes, fornecedores, carros e contratos estão configurados temporariamente sem login. As políticas aplicadas ao Supabase estão em `acesso_sem_login.sql`; `revogar_acesso_sem_login.sql` retira essas permissões quando você decidir restaurar o controle de acesso.
- Certificados digitais exigem o usuário confirmado `alquilerentcar@gmail.com` no Supabase Auth. A tabela e o bucket privados foram criados pelo script `certificados_digitais.sql`.
- Não coloque senhas de certificados, chaves privadas ou credenciais de API nos arquivos HTML ou JavaScript. A senha de um A1 não é armazenada pelo cadastro.

## Certificados digitais

A página `certificados.html` cadastra titular, tipo A1/A3, CPF ou CNPJ, emissor, número de série, datas de validade, finalidade e observações. Um certificado A1 exige arquivo `.pfx` ou `.p12` de até 10 MB. O arquivo fica no bucket privado `certificados-digitais` e só pode ser lido pela conta autorizada. O cadastro permite substituir ou baixar esse arquivo.

## Veículos e Senatran

A aba `carros.html` ainda usa o formulário manual. A consulta automática não foi ativada porque faltam autorização e credenciais da API Senatran/Serpro. Após a contratação, configure Consumer Key e Consumer Secret em um serviço de backend ou função protegida, nunca no navegador. Esse serviço consultará a API, mapeará os campos necessários e gravará os carros no Supabase. O arquivo do certificado A1, se exigido pelo fluxo contratado, deve ser acessado apenas no servidor.

Serviço oficial: https://www.gov.br/pt-br/servicos/contratar-consulta-denatran

## Arquivos principais

- `clientes.html` / `app.js`: clientes e documentos RG, CNH e comprovante.
- `fornecedores.html` / `pages.js`: fornecedores.
- `carros.html`, `contratos.html` / `fleet.js`: frota e contratos.
- `certificados.html` / `certificados.js`: certificados digitais.
- `server.js`: servidor local em `127.0.0.1:3000`.
- `assistente.js` / `assistente.css`: conversa, envio de documento e revisão do rascunho.
