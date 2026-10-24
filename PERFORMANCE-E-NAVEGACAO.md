# Desempenho e navegação — 23/10/2026

## O que mudou

- Tema da empresa aplicado na abertura do documento, usando apenas a configuração visual previamente salva. Permissões continuam verificadas pelo servidor.
- Menu, logotipo e identificação do usuário permanecem na estrutura central enquanto muda a área de trabalho.
- Cada tela existente mantém seu próprio contexto de execução. As telas de Clientes e Veículos podem ser reaproveitadas por até 30 segundos, após nova validação da sessão e do acesso. No máximo duas telas leves ficam mantidas; durante a abertura pode existir uma terceira provisória. Editores, contratos, financeiro e administração não entram nesse reaproveitamento.
- Alterações invalidam as telas reaproveitadas e o cache das listas, inclusive entre janelas do mesmo navegador. Respostas antigas não repovoam o cache depois de uma alteração.
- Ao voltar à tela de veículos, os dados operacionais da frota são consultados novamente. Listas cadastrais usam cache de até 60 segundos, separado por conta e empresa. O botão Atualizar solicita nova leitura. Alterações feitas em outro dispositivo podem exigir Atualizar para aparecer imediatamente.
- A verificação de acesso e a consulta dos modelos do menu podem ocorrer em paralelo quando a empresa já está selecionada. Falha ou mudança de empresa não reaproveita modelos de outra empresa.
- No servidor local, arquivos públicos JS/CSS/imagens usam ETag e revalidação. HTML, APIs e PDFs não recebem esse cache de recursos. O serviço offline continua guardando somente o aviso público de falta de conexão.

## TypeScript gradual

As regras da nova navegação estão em src/navigation.ts e src/shell-navigation.ts, com verificação estrita. Os arquivos de runtime/ são gerados e versionados. Os fluxos existentes de locação e financeiro continuam em JavaScript nesta etapa.

Instalação: npm ci. Compilação: npm run build:runtime. Verificação: npm run check:runtime. A Vercel executa a compilação no deploy.

## Verificação

Testes de rotas, cache HTTP, isolamento das listas, invalidação, consultas simultâneas, menu persistente, tema antecipado, retorno do navegador, alterações não salvas e acesso de operador/visitante foram exercitados com dados fictícios.

O teste local confirmou a reutilização da tela sem recriá-la, mantendo o menu. As consultas externas foram simuladas: os tempos do teste não representam uma promessa de latência em produção. A primeira abertura de uma tela ainda depende de rede, API e dispositivo.

- npm run test:runtime
- npm run test:http
- npm run test:browser

Os testes do navegador usam Edge no Windows. Em outro ambiente, instale o navegador do Playwright ou informe TEST_BROWSER_PATH. Capturas de revisão ficam em tmp/qa e não são publicadas no Git.

## Uso e diagnóstico

Não exige SQL. No servidor local, reinicie o processo para reconhecer a nova rota /app; enquanto ele não for reiniciado, a página continua no modo anterior. Favoritos e rotas antigas continuam aceitos.

Para abrir uma tela individual para diagnóstico, acrescente standalone=1 à query. Isso altera somente a navegação, sem retirar o login ou as permissões.

window.bgNavigationMetrics registra aberturas e reutilizações. window.bgPerformance registra tempos de operações HTTP sem corpos, tokens ou respostas. Ambos são registros locais em memória, com limite de tamanho.

Os dados e documentos operacionais não foram alterados por esta atualização. O ciclo completo de assinatura e conciliação financeira continua sendo uma validação separada.
