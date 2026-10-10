# Atualização operacional

Execute atualizacao_operacional.sql como postgres no SQL Editor do Supabase após frota_operacao.sql. O script acrescenta endereço da empresa, mural, esquema de ocupações, KM e tipos de fornecedor/manutenção. Preserva registros. O levantamento com nomes e contatos de clientes permanece somente local; este pacote não inclui esses dados.

A migração de KM datados importa somente as leituras confirmadas em 10/10/2026 já existentes no levantamento, sem inventar horário ou início de locação.

Depois da atualização, recarregue o navegador. Fornecedores aparecem em Cadastros; manutenção pode ser registrada pela Frota ou proposta pelo RECRUTA e salva após revisão.
