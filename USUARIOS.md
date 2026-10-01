# Cadastro de usuários

O administrador encontra **Usuários** no menu lateral e na seleção de módulos. Novas contas entram com CNPJ, e-mail e senha. SAUGUSTO continua disponível para a conta original.

É necessário ter aplicado `multiempresa_setup.sql` no Supabase. A conta administradora deve possuir um vínculo ativo com `administrador=true` em `usuarios_empresa`.

No servidor, copie `.env.example` para `.env` se ainda não existir e preencha `SUPABASE_SERVICE_ROLE_KEY` com a chave service_role do projeto Supabase. Preserve as outras configurações existentes. Nunca compartilhe essa chave pelo chat nem a coloque no navegador. Reinicie `node server.js`. O servidor carrega `.env` automaticamente com Node.js 24.

A API valida a sessão e o vínculo administrativo em cada requisição. A empresa não é aceita sem verificar esse vínculo. Senhas são enviadas apenas ao Supabase Auth e não ficam no cadastro de perfis. Se o perfil não puder ser salvo, a nova conta é removida; falhas nessa compensação são informadas.

Operadores recebem acesso às páginas operacionais conforme as políticas atuais do banco. Esta implementação não cria permissões individuais por aba nem altera as políticas das tabelas operacionais. Contas novas dependem dessas políticas para ler e gravar dados.
