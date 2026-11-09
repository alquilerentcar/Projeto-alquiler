> Atualização: consulte ETAPAS.md para a estrutura atual. A etapa 1 permite ao administrador da empresa gerenciar seus usuários; Controle é exclusivo da BG SYSTEMS e Financeiro integra Locação. As instruções históricas abaixo não devem ser reaplicadas após etapa1_acessos.sql.

# Acessos — administração da plataforma

## Base parcial identificada em 29/09/2026

Na sua base, existem `empresas` e `usuarios_empresa`, mas faltam as outras seis tabelas do controle multiempresa. Para esse estado, execute **somente `ativar_acessos_base_parcial.sql`**, inteiro, no SQL Editor. Ele substitui os passos 1 e 2 da ativação abaixo: completa a estrutura, preserva nomes e cadastros existentes e aplica o controle de acessos na mesma transação. Não execute `multiempresa_setup.sql` antes ou depois dele.

Ao concluir, a consulta final deve mostrar `Acessos ativados`, as quantidades de empresas e usuários e pelo menos um desenvolvedor ativo. Se houver erro, a transação é desfeita; copie a mensagem completa para diagnóstico.

O desenvolvedor administra todas as empresas em `acessos.html`: cadastro, módulos contratados, licença liberada/suspensa, data de validade e usuários. Cada usuário recebe somente os módulos licenciados para sua empresa. Administradores de empresas não têm acesso ao painel da plataforma.

## Ativação no Supabase

1. A estrutura de `multiempresa_setup.sql` precisa existir. Se esse arquivo ainda não foi aplicado, execute-o primeiro no SQL Editor do seu projeto. Não reaplique o arquivo antigo em uma base já configurada, pois ele contém dados iniciais e permissões anteriores.
2. Execute `acessos_setup.sql`. O script é transacional, pode ser reaplicado e mantém a empresa dos registros que já estão classificados. Registros antigos sem empresa pertencem à Alquiler, a única empresa da base anterior. Não execute outros scripts antigos de permissões depois dessa migração.
3. Confirme que sua conta existente está em `administradores_plataforma`, com `nivel = desenvolvedor` e `ativo = true`. O arquivo inicial já associa SAUGUSTO à conta original da plataforma. O novo código não dá privilégios de desenvolvedor por e-mail ou dados do navegador.
4. No arquivo `.env` ao lado de `server.js`, preencha `SUPABASE_SERVICE_ROLE_KEY` com a chave administrativa do projeto Supabase. Nunca compartilhe a chave pelo chat nem a coloque em arquivos do navegador. Essa configuração só é necessária para criar novas contas; empresas, licenças e permissões existentes usam sua sessão autenticada. Em hospedagem, configure a variável no ambiente do servidor.
5. Reinicie o servidor usando `iniciar.bat`, ou `"C:\Program Files\nodejs\node.exe" server.js`. Entre novamente e abra `http://localhost:3000/acessos.html`.

Sem a migração, o sistema informa a pendência e não libera dados com permissões antigas. Sem a chave, o painel permite gerenciar cadastros existentes e informa por que novas contas estão indisponíveis.

## Operação

- **Nova empresa:** nome, razão social, CNPJ, contato, licença, validade e módulos.
- **Usuários:** crie contas com e-mail e senha inicial ou edite usuários existentes. A identificação é cadastral; o login de novas contas usa e-mail. SAUGUSTO continua como atalho para a conta original.
- **Administrador da empresa:** pode editar dados cadastrais da própria empresa, conforme os módulos concedidos. Não pode liberar licenças nem criar contas. O controle de acessos fica com o desenvolvedor.
- **Permissões:** sem módulo marcado, o usuário não acessa páginas operacionais. Uma licença suspensa ou vencida bloqueia o uso dos módulos mesmo com uma sessão já aberta. Suspender um usuário bloqueia somente seu vínculo com a empresa.
- **Validade:** o último dia informado é inclusivo, segundo a data UTC do banco. Em branco significa sem vencimento.
- **Trocar de empresa:** use “Abrir sistema da empresa” ou a seleção em “Empresas e módulos”. A escolha fica na sessão da aba.
- **Módulos:** Locação e Financeiro são selecionáveis conforme as páginas existentes. Oficina, Compras e estoque e Relatórios continuam futuros. O controle de licenças não implementa funcionalidades que ainda estejam em desenvolvimento nesses módulos; a área financeira existente ainda é uma estrutura de telas.

## Proteções implementadas

As permissões são verificadas no banco em cada consulta. O usuário precisa de vínculo ativo, licença vigente, módulo da empresa e módulo do usuário. O desenvolvedor gerencia a plataforma independentemente de licenças, mas a navegação operacional também respeita a licença da empresa selecionada. Chaves administrativas nunca são enviadas ao navegador.

As tabelas operacionais recebem políticas por empresa e módulo. Referências entre registros de empresas diferentes são rejeitadas; alterações não podem transferir registros entre empresas. Arquivos nos buckets do sistema ficam privados e têm verificação de empresa. URLs temporárias de arquivos já emitidas podem funcionar até expirar; arquivos já baixados não podem ser revogados.

Salvar empresa/licença e salvar perfil/permissões são operações transacionais. Se o perfil falhar após criar uma conta de autenticação, a API tenta remover essa conta e informa qualquer falha de compensação. E-mails já cadastrados são recusados; vincular uma conta existente a outra empresa não faz parte desta tela.

Alterações de licenças e de acessos são registradas em `acessos_auditoria`, sem senhas.

Os modelos de documentos e papéis timbrados legados ainda precisam ser personalizados para cada nova empresa antes de emitir documentos. O módulo Acessos não transforma automaticamente os modelos existentes da Alquiler em modelos de outro cliente.

Referências: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [criação administrativa de contas](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

## Testes locais

`node --test access-api.test.cjs access-policy.test.cjs`

Os testes de banco e navegador usam dependências somente de desenvolvimento:

`npm install --prefix test-tools --no-audit --no-fund @electric-sql/pglite playwright`

`node --test access-db.test.cjs access-ui.test.cjs`

O banco do teste é descartável e local. Os testes de navegador usam dados simulados e o Microsoft Edge instalado. Nenhum desses testes cria contas ou modifica o Supabase real.
