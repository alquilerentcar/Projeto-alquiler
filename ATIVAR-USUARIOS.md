# Ativar manutenção de usuários

1. Execute `usuarios_manutencao.sql` completo no SQL Editor. Resultado: `Manutenção de usuários ativada`.
2. No Supabase, Authentication → URL Configuration → Redirect URLs, adicione `http://localhost:3000/redefinir-senha.html` para testes locais. Para usuários de outros computadores, use também a URL HTTPS pública do sistema terminando em `/redefinir-senha.html` e solicite a recuperação a partir desse site. Localhost aponta para o computador de quem abre o link.
3. Verifique a configuração de envio de e-mails do Supabase Auth/SMTP. O envio real depende dessa configuração e dos limites do serviço.
4. Reinicie o servidor e atualize o navegador com Ctrl+F5.

Em Acessos e Controle há Editar acesso, Redefinir senha e Excluir acesso. A exclusão remove o vínculo com a empresa selecionada; preserva a conta de autenticação e vínculos com outras empresas. São bloqueadas a exclusão do próprio acesso, do desenvolvedor e do último administrador ativo. As exclusões são registradas em auditoria.

No login, Esqueci minha senha envia uma solicitação ao e-mail informado. O usuário escolhe sua senha na página acessada pelo link de recuperação. Nenhuma senha é exibida ao administrador. Nome, cargo, perfil e módulos continuam editáveis; alteração de e-mail de login não faz parte desta entrega.

Os testes são locais, com banco e serviço de autenticação simulados. Nenhum usuário real foi excluído e nenhum e-mail real foi enviado nos testes.
