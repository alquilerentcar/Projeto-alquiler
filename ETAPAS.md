# Atualização — editor, subabas e contratos sincronizados

Aplicar etapa3_editor.sql depois de etapa3_modelos.sql. Reiniciar o servidor para registrar os novos scripts e o visualizador PDF local.

- Modelos agora têm editor visual com negrito, itálico, sublinhado, alinhamentos, lista e desfazer/refazer. A visualização no timbrado aparece abaixo, sem uma segunda prévia de texto sem timbrado.
- Salvar rascunho preserva o trabalho do administrador; Salvar e aplicar publica uma versão para a equipe.
- No uso do modelo, Contrato de locação liga o modelo à área Contratos. Apenas um modelo ativo desse tipo por empresa. A migração identifica um contrato existente pelo nome quando ainda não há um vinculado; outros modelos e versões são preservados.
- Rascunhos de Contratos consultam a versão publicada vigente ao abrir e ao retornar à página. O servidor impõe a empresa e o modelo, ignorando modelos enviados pelo navegador. A geração em PDF/Word usa a formatação publicada. PDFs emitidos continuam preservados.
- Modelos de uso Documento da locação ganham subabas no menu Locação após Salvar e aplicar. Cada subaba permite selecionar uma locação e consultar PDFs emitidos daquele modelo.
- Ver contrato mostra texto e timbrado diretamente no navegador, desenhando o PDF em páginas. A mesma composição é usada na emissão, que mantém a validação da vistoria e os anexos existentes.
- É necessário cadastrar o PDF de papel timbrado em Empresa. Na ausência, a tela informa isso e usa cabeçalho neutro, sem buscar o timbrado de outra empresa.
- PDF.js é distribuído localmente em pdfjs/, com licença Apache 2.0 preservada em pdfjs/LICENSE.

Validação: migração repetida em banco descartável, permissões, versão vigente e snapshots; API de Contratos consultando versões 1 e 2; Word com texto e estilos atualizados; PDF com alinhamentos; navegador com backend simulado para editor, publicação, subabas e emissão; prévia do contrato com timbrado desenhado em canvas, confirmada por inspeção visual e pixels.

---

# Plano de evolução — BG SYSTEMS / Locação

## Etapa 1 — estrutura de acesso (aplicada e validada pelo usuário)

- Login por e-mail e senha, sem CNPJ. SAUGUSTO permanece como atalho para a conta original.
- Uma empresa e um módulo: entrada direta em Locação. Mais empresas: seleção após autenticação.
- Desenvolvedor: entrada em `controle.html`, com identidade BG SYSTEMS e gestão de empresas/licenças.
- Administrador da empresa: `acessos.html` limitado à empresa selecionada, com criação e edição de usuários.
- Operador: sem acesso a Empresa, Acessos ou Controle, inclusive por URL direta.
- Empresa e Acessos ficam em Administração. Fornecedores sai do menu, preservando os registros existentes.
- Financeiro é uma área de Locação. As licenças e permissões antigas de Financeiro permanecem no banco como histórico, mas não são oferecidas como módulo independente na interface. Para usar a área financeira, a empresa e o usuário precisam de acesso a Locação.
- O administrador não pode suspender ou retirar seu próprio perfil administrativo nem alterar o vínculo de um desenvolvedor.
- A criação de contas novas ainda depende da chave `SUPABASE_SERVICE_ROLE_KEY` no `.env` do servidor. O sistema não pede essa chave pelo navegador.

### Como ativar esta etapa

1. Execute **somente `etapa1_acessos.sql`**, inteiro, no SQL Editor do projeto Supabase. Ele parte da ativação de Acessos já realizada. Não reaplique `multiempresa_setup.sql`, `acessos_setup.sql` ou `ativar_acessos_base_parcial.sql` depois dele.
2. Aguarde o resultado **Etapa 1 aplicada**. Se houver erro, a transação é desfeita; guarde a mensagem completa.
3. Preencha a chave administrativa no arquivo `.env` local se precisar criar contas. Não compartilhe essa chave pelo chat.
4. Reinicie `iniciar.bat`, saia da sessão antiga e entre novamente. O desenvolvedor será direcionado ao Controle da BG SYSTEMS.

A interface exige a versão desta migração para evitar o uso acidental das regras anteriores. Os testes foram realizados em banco local descartável e navegador com dados simulados; eles não confirmam a aplicação no Supabase real.

### Verificação funcional após ativação

- Desenvolvedor: verificar as empresas e abrir o sistema de uma delas.
- Administrador: ver somente seus usuários; criar um operador e editar suas permissões de módulo.
- Operador: entrar em Locação e confirmar ausência de Empresa/Acessos/Controle.
- Licença suspensa ou usuário inativo: verificar bloqueio de acesso.

Nesta etapa, as permissões operacionais continuam por módulo e perfil. A granularidade por aba e ação será implementada com os cadastros e fluxos correspondentes, sem apresentar botões de permissão sem efeito no banco.

## Etapa 2 — identidade e configurações por empresa

Etapa 2 aplicada no Supabase e confirmada pelo usuário.

- Dados cadastrais e logotipo por empresa; logo convertido em PNG para os documentos.
- Cor dos botões e itens selecionados, com contraste automático do texto. Controle mantém a identidade BG SYSTEMS.
- Upload privado de papel timbrado PDF, uma página A4 vertical, até 10 MB; prévia, troca e remoção pelo administrador.
- Contratos e recibos novos usam o timbrado da empresa; sem timbrado, usam cabeçalho neutro com os dados da empresa.
- Identificação da locadora vem do servidor após validar a empresa da sessão, inclusive na saída Word.
- Documentos já emitidos não são regenerados. PDFs anteriores do timbrado são mantidos para preservar referências.
- A prévia HTML do contrato mostra o texto sem o timbrado; o PDF final usa o arquivo cadastrado.

### Ativar a Etapa 2

1. Executar somente etapa2_empresa.sql, inteiro, no SQL Editor. Resultado esperado: Etapa 2 aplicada.
2. Reiniciar o servidor e atualizar a página.
3. Abrir Administração → Empresa, selecionar logo e cor, enviar o PDF e salvar.
4. Para manter o timbrado da Alquiler, enviar papel_timbrado_alquiler.pdf da pasta do projeto no cadastro dessa empresa.

A migração adiciona a cor e um bucket privado, com regras de acesso. Não apaga empresas ou documentos. Os testes são locais, com banco descartável e serviços simulados no navegador; a aplicação na produção depende do passo 1.

Filiais e parâmetros operacionais adicionais continuam previstos para a evolução dos cadastros. A edição das cláusulas e os modelos livres ficam na Etapa 3. O modelo legado conserva suas regras operacionais até essa revisão.

O servidor aceita PYTHON_PATH no .env; se ausente, tenta o Python do ambiente local e depois python no PATH.

## Etapa 3 — modelos e documentos

Código entregue; ativação no Supabase pendente.

- Modelos de texto no banco por empresa, com criação livre. Administradores editam, publicam e arquivam; operadores consultam os publicados e emitem documentos.
- Rascunho separado de versões publicadas; histórico recuperável como novo rascunho, com proteção contra gravações concorrentes.
- Prévia de texto e PDF com dados de exemplo e timbrado da empresa.
- Campos automáticos de empresa/cliente/veículo/locação; outros marcadores são preenchidos na emissão. Dados automáticos ausentes devem ser corrigidos no cadastro de origem.
- Nos Registros da locação, Documentos por modelo → Gerar documento lista os modelos publicados. A emissão guarda texto, valores, versão e identificação da empresa; o PDF fica em bucket privado sem alteração/exclusão por usuários.
- Numeração sequencial por empresa. Se o envio falhar após registrar a emissão, o autor pode usar Concluir PDF, mantendo número e conteúdo.
- Rascunhos antigos do navegador podem ser importados explicitamente; os originais são preservados. Não há migração automática dos modelos legados de outras tabelas.

### Ativar a Etapa 3

1. Executar somente etapa3_modelos.sql completo no Supabase. Aguardar Etapa 3 aplicada.
2. Reiniciar o servidor e atualizar o navegador.
3. Em Cadastros → Modelos de documentos, criar um modelo, salvar e publicar.
4. Nos Registros de uma locação, selecionar o modelo, preencher campos manuais, conferir e emitir.

Gerar um termo não altera veículo, encerra locação ou registra pagamento automaticamente; esses fluxos pertencem às etapas seguintes. A preparação do contrato e o recibo anteriores continuam disponíveis. Modelos publicados nesta etapa são usados no novo fluxo Documentos por modelo. Assinatura eletrônica dos novos documentos será integrada na Etapa 6. Documentos sem vínculo com uma locação, como compra e venda avulsa, ficam para o fluxo correspondente.

Testes locais: banco descartável com aplicação repetida do SQL, isolamento por empresa, autorizações, versões, conteúdo imutável, storage sem sobrescrita; PDF real com textos extensos; navegador com backend simulado para criação, publicação, histórico, operador, prévia e emissão. Não alteram o banco de produção.

## Etapa 4 — operação de locação

Preparação → reserva → conferência → assinatura → vistoria/entrega → acompanhamento → devolução → acerto/encerramento. Histórico de condutores, veículos, ocorrências, prorrogações e documentos.

## Etapa 5 — financeiro integrado

Contas a pagar/receber reais, parcelas, recebimentos parciais, caução, estornos, comprovantes e conciliação. As telas financeiras atuais ainda não constituem um financeiro operacional completo.

## Etapa 6 — assinatura eletrônica

Escolher/configurar provedor, completar envio, callbacks validados, situações, reenvios controlados e arquivo assinado com evidências.

## Etapa 7 — integrações e portal do locatário

Avaliar API de pagamentos, e-mail/notificações, fornecedor autorizado de dados veiculares e portal/aplicativo do locatário. Nenhum serviço externo é considerado pronto antes de configuração e teste reais.

## Testes da etapa 1

Instalar apenas para desenvolvimento: `npm install --prefix test-tools @electric-sql/pglite playwright`.

Executar: `node --test etapa1-api.test.cjs etapa1-db.test.cjs etapa1-ui.test.cjs`.

O teste de navegador usa o Microsoft Edge instalado. Os testes não criam usuários nem alteram o banco de produção.
