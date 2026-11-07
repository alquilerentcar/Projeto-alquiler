# Perfil, senhas e e-mail dos usuários

Implementado: Meu perfil no menu e na seleção de módulos; consulta de nome, e-mail, empresa, perfil e módulos; troca de senha com validação da senha atual e confirmação; tela Esqueci minha senha; ação Alterar e-mail em Acessos e Controle.

## Ativação
1. Execute `perfil_usuarios.sql` no SQL Editor do projeto Supabase. O arquivo ainda não foi aplicado automaticamente. Ele autoriza o destino da alteração e sincroniza o e-mail do Auth com todos os vínculos na mesma transação. Não apaga usuários, dados ou permissões existentes.
2. Reinicie `server.js` e atualize o navegador com Ctrl+F5.
3. Teste Esqueci minha senha com uma conta sua e confira a entrega do e-mail. Não foi enviado e-mail real durante os testes.

Já configurado no painel em 01/10/2026: mínimo de 12 caracteres no Supabase Auth e retorno permitido `http://localhost:3000/redefinir-senha.html`. Para hospedar o sistema em outro endereço, inclua a URL correspondente no Supabase. Localhost só funciona no computador que executa o servidor. A entrega a usuários externos depende da configuração de e-mail/SMTP do projeto.

Em Acessos / Usuários, use Alterar e-mail. A alteração é imediata no login e não altera a senha nem as permissões; confirme o endereço com o usuário. A chave de serviço fica somente no servidor. Administradores da empresa não podem alterar contas da plataforma ou com vínculos a outras empresas; nesses casos use o Controle da BG SYSTEMS.

Testes locais: sintaxe JavaScript; mínimo de senha, confirmação e senha atual; autorização da API; isolamento por empresa; conta compartilhada; proteção de conta da plataforma; sincronização e rollback transacional no PostgreSQL via PGlite. As chamadas de autenticação dos testes foram simuladas; nenhuma senha ou conta real foi alterada.
