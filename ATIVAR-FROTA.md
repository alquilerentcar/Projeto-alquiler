# Controle operacional inicial da frota

Alterações locais; nenhuma publicação ou importação de dados reais foi feita.

1. No SQL Editor do Supabase, papel postgres, aplicar `frota_operacao.sql`. Não reaplicar os setups antigos.
2. Reiniciar o servidor local e acessar `/locacao/frota`.
3. Em Administração / Empresa, habilitar Oficina somente na Tempo da Mecânica. Alquiler mantém locação.
4. Em Cadastros / Veículos, informar proprietário e localização. Nome do proprietário não muda a empresa do cadastro.
5. Registrar as ocupações já em andamento com cliente, veículo, início real e diária acordada. Não exige contrato ou assinatura.
6. Conferir a previsão de diárias da data escolhida. Recebimentos manuais permitem valores parciais, sem ultrapassar o saldo.

## Regras e limites desta entrega

- Empresa responsável pela ocupação é a empresa selecionada. Trocar para carro de outra empresa exige acesso às duas; o carro mantém a empresa proprietária e a ocupação mantém a empresa responsável. Não há transferência automática de dinheiro ou contrato.
- Na troca no mesmo dia, a previsão usa a última diária desse dia, uma vez por grupo. A regra é diária por dia civil em America/Manaus, sem cálculo proporcional por horas.
- Não inclui caução, multas, descontos, adiantamentos, conciliação bancária, estorno de recebimentos ou assinatura.
- Recebimentos já registrados impedem retroagir para antes das competências pagas. Troca que muda diária já paga no dia exige conferência; não altera silenciosamente recebimentos.
- Locações Ativas do fluxo anterior aparecem na frota e têm previsão adicional separada. Recebimentos delas continuam fora deste novo controle, até integração do financeiro. Não registrar essas locações novamente.
- Finalização de locações do fluxo de contratos continua nos Registros. A nova tela finaliza somente seus períodos operacionais.
- Fotos e documentos pessoais continuam no cadastro atual de clientes; os cartões novos exibem iniciais. Importação de CNHs em lote e anexos por período ainda não foram implementados.
- Ordens de serviço completas, peças, custos de oficina e histórico importado da planilha serão próximos incrementos; esta entrega registra período de manutenção, local e observações.
- Planilhas e CNHs ainda não importadas. Conferir 40 IDs Alquiler e 12 placas Tempo antes de importar. Não usar a disponibilidade calculada na planilha vazia como prova da situação real.

## Aparência

Administração / Empresa permite principal, sidebar, fundo e painéis. Cor do texto é ajustada por contraste. Documentos preservam seus próprios estilos e timbrados. Menu mobile abre em painel; tabelas podem rolar horizontalmente.
