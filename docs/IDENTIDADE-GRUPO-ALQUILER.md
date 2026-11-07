# Grupo Alquiler — identidade e otimização de 21/10/2026

O nome público do aplicativo, login, Controle e ícones passam a Grupo Alquiler.
O símbolo e o logotipo horizontal derivam do arquivo de identidade fornecido pelo responsável.

As empresas continuam com sua identidade própria. A alteração não renomeia razões sociais,
contratos emitidos, usuários ou chaves de sessão. O `id` do manifesto permanece `/` para
preservar a identidade do aplicativo instalado. O service worker remove somente caches
antigos pertencentes ao aplicativo; dados autenticados e PDFs não entram no cache offline.

Em dispositivos já instalados, o sistema operacional pode demorar a atualizar nome e ícone.
Atualize o site e reabra o aplicativo. Se o ícone antigo persistir, remova o atalho e adicione-o
novamente pela opção de instalação do navegador.

## Histórico com consultas menores

`historico-data.mjs` consulta apenas os campos necessários das tabelas mais volumosas.
Os termos completos, fotos e detalhes de importação não são necessários à linha do tempo.
As páginas continuam com filtro de empresa e paginação de 500 linhas.

Medição de leitura na empresa operacional: JSON sem compressão de 3.596.948 para
886.531 bytes, redução de 75,4%. Eventos, indicadores, médias de KM e vínculos visíveis
foram comparados em 286 cadastros; 4.563 recebimentos importados foram preservados.
Isso mede transferência, não RAM nem tempo de carregamento de todos os dispositivos.

Os novos testes ZapSign recebem o nome Grupo Alquiler. Referências de testes antigos
continuam aceitas exclusivamente quando também pertencem ao sandbox e à mesma empresa.
Nenhum convite de assinatura foi enviado por esta alteração.

## Pendências principais

1. Homologar assinatura e retorno do PDF assinado com o provedor escolhido.
2. Implementar débitos extras e parcelamentos por locatário.
3. Corrigir o vínculo de reabertura na sequência de exclusão do PDF e da locação.
4. Conciliar diárias, recebimentos e saldos antes de considerar o financeiro concluído.

A marca não exige migração SQL. O relatório de consumo detalhado foi entregue separadamente.
