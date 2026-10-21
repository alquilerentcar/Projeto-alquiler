# Históricos conectados e fotos da substituição

## Ativar uma vez

Execute **fotos_e_historicos.sql**, inteiro, no SQL Editor do Supabase como postgres. A base deve ter as áreas de Frota, KM, Fornecedores e Substituição já ativadas. Não é necessário reaplicar os arquivos antigos de configuração.

Resultado esperado: **Até 60 fotos e históricos de manutenção preparados**.

Este arquivo prepara campos e funções; não cria manutenções, não altera ocupações e não gera cobranças ao executar. Fotos e PDFs existentes são preservados. Até a ativação, o formulário conserva o limite anterior de 20 fotos e os novos registros de manutenção ficam desabilitados; a consulta dos históricos já existentes continua disponível.

## Fotos do termo

- Até 60 imagens JPG, PNG ou WebP, de até 10 MB cada antes do processamento.
- É possível adicionar fotos em várias seleções e remover itens antes de confirmar. Seleções repetidas com o mesmo nome, tamanho e data de modificação são ignoradas.
- As fotos são reduzidas antes da emissão. O termo mantém o timbrado e apresenta as fotos anexadas; seu tamanho final depende do conteúdo.
- PDFs já emitidos não são modificados. A ampliação vale para novas preparações.
- Na criação, a lista informa o limite efetivamente habilitado no banco. A frota só muda após a conclusão do envio do termo e das fotos.

## Onde consultar

- Menu **Históricos**: escolha Locatário ou Veículo e selecione o cadastro.
- Clientes: botão **Histórico**.
- Veículos: botão **Histórico completo**.
- Frotas e ocupações: **Histórico completo** do veículo e **Histórico do locatário**. O painel anterior de Histórico / KM continua disponível para as leituras semanais.

Os filtros incluem datas, tipo de operação e busca por texto. Sem datas, a consulta mostra todo o histórico disponível na empresa selecionada. Há links entre as fichas, os registros da locação e os termos de substituição.

São consultados períodos, ocupações atuais, snapshots das trocas/encerramentos, manutenções, correções de vínculo, operações da locação, documentos, KM e recebimentos, inclusive os importados quando vinculados ao cliente ou veículo. Fontes indisponíveis são indicadas; a tela não inventa registros para preencher lacunas.

## Manutenção

Em **Registrar manutenção**, informe veículo sem ocupação ativa, oficina, data/hora real da entrada, problema e previsão opcional. Pode informar KM e um locatário relacionado. Para um carro ocupado, faça a troca ou devolução antes da entrada na oficina.

O campo de locatário é um **vínculo de contexto**, não uma atribuição de culpa. É ele que permite mostrar uma manutenção posterior à devolução também na ficha daquela pessoa. Manutenções que coincidam com um período de uso podem aparecer como coincidência temporal, com identificação explícita de que não há atribuição de responsabilidade.

Em **Concluir manutenção**, informe a saída real, serviços realizados, custo e KM opcionais e a situação posterior. O sistema guarda a duração e libera o carro conforme a situação escolhida. O custo é apenas informativo: **não gera dívida, conta a pagar, baixa ou recebimento**.

Manutenções antigas sem data de entrada continuam identificadas como incompletas. Mudanças de situação antigas mostram a data do registro; essa data não é apresentada como entrada real na oficina nem somada como tempo confirmado de manutenção.

## KM e limites da leitura histórica

As médias são calculadas separadamente por veículo, com leituras atribuídas à mesma ocupação. Intervalos entre locatários diferentes e intervalos interrompidos por manutenção não são atribuídos como uso seguro de uma pessoa.

Reservas aparecem como reservas, sem serem contadas como uso efetivo. Quando há vistoria de devolução confirmada, sua data encerra a utilização, independentemente da previsão original do contrato.

As fichas não corrigem automaticamente datas antigas ou vínculos faltantes. É necessário completar o cadastro/operação de origem para melhorar o histórico.

## Validação realizada

Testes com dados fictícios: migração repetida de 20 para 60 fotos; seleção em lotes; emissão real de PDF com 25 fotos; entrada e saída de manutenção; isolamento por empresa; idempotência; preservação financeira; filtros; reconstrução dos veículos anteriores a trocas; KM sem mistura entre veículos; paginação acima de mil registros; navegação móvel.

Nenhuma manutenção, troca, locação ou cobrança de produção foi criada pelos testes. A ativação no Supabase operacional depende da execução do SQL pelo responsável.
