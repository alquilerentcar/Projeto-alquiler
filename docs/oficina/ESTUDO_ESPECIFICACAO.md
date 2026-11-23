# Estudo da especificação de Manutenção, Vistoria e Telemetria

Análise do pacote enviado pela diretoria em 11/11/2026: PDF de 45 páginas, especificação geral (seções 0 a 31), módulo de telemetria (TEL-00 a TEL-19), plano de execução e instruções. O material é uma **especificação**. Nada nele está implementado, e nenhuma integração externa foi feita.

---

## 1. Resposta à pergunta central do documento

> "Qual é o nome da plataforma de locação que já está em funcionamento?"

A plataforma de locação é o **Sistema de Gestão Grupo Alquiler**, desenvolvido internamente:

| Item | Valor |
|---|---|
| Código | repositório `alquilerentcar/Projeto-alquiler` no GitHub |
| Publicação | Vercel, em `projeto-alquiler.vercel.app` |
| Banco de dados | Supabase (PostgreSQL), com várias empresas no mesmo sistema (Alquiler Rent a Car, Tempo da Mecânica…) |
| Acesso | login do Supabase Auth, com permissão por empresa e por módulo (`acesso_modulo`) |

**Consequência para a arquitetura:** o documento supõe uma plataforma de terceiros, a ser acessada por API, webhooks e filas de sincronização (seções 3 e 5 do texto). **Isso não se aplica aqui.** O módulo de manutenção pode morar **no mesmo sistema e no mesmo banco**, e mesmo assim cumprir a regra principal do chefe:

- **Cadastros oficiais:** clientes, veículos e contratos continuam nas tabelas atuais (`clientes`, `carros`, `locacoes`, `frota_periodos`), identificados pelos **códigos originais**. A manutenção só guarda referências, como `carro_id`, e nunca cria um cadastro paralelo.
- **Quem altera o quê:** a manutenção só altera as tabelas que são dela, como ordens de serviço e estoque. Mudanças na locação, como a disponibilidade comercial, acontecem por **funções autorizadas** do próprio banco, com registro de quem fez.
- **O que não é necessário:** API externa, fila de sincronização e "vínculo de identificador externo". Esses itens só existiriam se a locação estivesse em outro sistema. Com isso, deixam de existir as falhas de sincronização e a duplicação de cadastros que essa parte do documento tenta evitar.

O que **continua valendo e será seguido**:

- Cada informação tem uma fonte oficial, sem cadastro duplicado.
- O veículo é sempre obrigatório. O contrato é opcional, porque um carro pode estar em manutenção sem estar locado.
- **Concluir uma OS não deixa o carro disponível para locação sozinho.** A liberação comercial é um passo separado.
- Toda autorização é conferida no banco de dados, e não na tela, e toda operação importante fica registrada com autor e horário.
- Operações repetidas, como dois cliques ou queda de internet, não duplicam nada.
- Todos os testes usam dados fictícios. Nada é publicado sem autorização.

---

## 2. O que já existe hoje (conferido no código e nos testes)

| Área | Situação | Onde |
|---|---|---|
| Cadastros de clientes, veículos e contratos | Em produção | `clientes`, `carros`, `locacoes` |
| Frota: ocupação, período de manutenção, KM | Em produção | `frota_periodos` (tipo `manutencao`), `frota_km` |
| Vistoria de saída e de devolução do contrato | Em produção (simples) | `vistorias_locacao` |
| Fornecedores e oficinas | Em produção | `fornecedores` |
| Módulos "Oficina" e "Compras e estoque" | Reservados no banco ("Módulo futuro") | tabela `modulos` |
| **Oficina, etapa 1**: manutenção com motivo e tipo, peças com código de barras, entrada, saída por carro, estoque, custo médio, ajuste de inventário | **Pronta no localhost, testada com dados fictícios, SQL ainda não aplicado** | `sql/oficina_estoque.sql`, `oficina.html` |
| Financeiro do locatário: contas a receber, caução, baixa, levantamento | Pronto no localhost | `sql/contas_receber_baixa.sql`, `sql/levantamento_saldo_inicial.sql` |
| Base do app do locatário | SQL pronto e testado; repositório do app criado | `sql/app_locatario.sql`, repositório `app-locatario-alquiler` |

---

## 3. Requisitos do documento × situação atual

| Requisito (seção do documento) | Situação | Observação |
|---|---|---|
| Cadastros sem duplicação, identificados pelo código original (§3) | **Atende** | A Oficina já usa o `carro_id` da frota. Um veículo de fora entra só com placa e cliente. |
| Estados separados do veículo: contrato, custódia, condição técnica, manutenção, disponibilidade (§4.3) | Parcial | Hoje há só a "situação" do carro e o período da Frota. Falta separar a condição técnica da disponibilidade comercial. |
| Eventos do veículo: entrada e saída de manutenção, saída para locação, devolução, troca… (§4) | Parcial | A locação já registra saída e devolução, e a Frota registra a troca. Falta um registro único de eventos com numeração `EV-AAAA-NNNNNN`. |
| Entrada para manutenção, telas EM-01 a EM-07: identificação pela placa, motivo, quem entregou e recebeu, KM, combustível, acessórios (§5) | Parcial | Já existem placa, motivo, tipo e KM. Faltam entregador e recebedor, chaves, combustível, acessórios, segurança na chegada e foto do hodômetro. |
| Câmera com gabarito e checklist com fotos, EM-08 a EM-10 (§5, §6) | **Falta** | O documento já prevê: primeiro a foto guiada **manual**; o disparo automático por IA só depois de um piloto. |
| Ocorrência → orçamento com versões → aprovação → OS numerada → execução → inspeção final (§8 a §10) | **Falta** | Hoje a "manutenção" cumpre o papel de OS simplificada, com peças lançadas direto. Precisa evoluir para esse fluxo. |
| Dez categorias de serviço: mecânica, elétrica, ar, suspensão, motor, lavagem, higienização, lanternagem, pintura, polimento (§1.3) | **Falta** | Simples de incluir como cadastro configurável. |
| Peças: código de barras, saldo, mínimo, custo médio, histórico que não se apaga (§11, §12.2) | **Atende** | Etapa 1 da Oficina. |
| Saldo físico × reservado × disponível; reserva para a OS; entrega ao mecânico ≠ consumo; devolução; quarentena (§12.2, §12.3) | Parcial | Hoje a saída já é o consumo. Faltam reserva, entrega, devolução e quarentena. |
| Depósitos e endereços (prateleira, corredor), lotes e séries, pneus (§12.1) | Parcial | Hoje existe só o campo "localização". |
| Ferramentas: patrimônio, retirada e devolução, calibração (§12.3, item 11) | **Falta** | Próxima etapa já combinada. |
| Compras: requisição, cotação, pedido, recebimento parcial, garantia (§13) | **Falta** | A entrada de peças hoje é direta, sem pedido de compra. |
| Componentes instalados no veículo e ciclo de vida da peça (§11) | **Falta** | Depende de a OS confirmar a instalação. |
| Preventiva por tempo e KM (§14.1, TEL-07 e TEL-08) | **Falta** | Dá para começar com o KM que já existe em `frota_km`, sem rastreador. |
| Telemetria do rastreador (TEL-02 a TEL-06) | **Falta** | O documento proíbe integrar antes de levantar os rastreadores (TEL-03 e TEL-19). |
| App do locatário: contrato, vistoria remota, pedido de manutenção (§15) | Parcial | A base está pronta, mas sem vistoria remota nem pedido de manutenção. |
| PDFs com numeração própria: entrada, OS emitida, OS encerrada (§10, §17) | **Falta** | O sistema já gera o PDF de contrato e o timbrado, e dá para reaproveitar. |
| Central de automações (§16) e indicadores (§18) | **Falta** | Fica para o fim. |

---

## 4. O que precisa ser ajustado no que já fizemos

Pontos em que a etapa 1 da Oficina segue um caminho diferente do documento:

1. **Saída de peças = consumo imediato.** O documento separa *reserva* (OS aprovada), *entrega ao mecânico* e *consumo/instalação*. **Proposta:** manter a saída simples para peças miúdas e criar a etapa "reservar → entregar → confirmar instalação" quando a OS completa existir. O histórico atual continua válido.
2. **"Manutenção" faz o papel de OS.** O documento quer ocorrência → orçamento → aprovação → **OS-AAAA-NNNNNN**. **Proposta:** a manutenção atual vira o **evento de entrada (EV)**, e as OS passam a nascer de orçamentos aprovados.
3. **Corretiva/preventiva** já está como o documento pede no campo de tipo. O documento lista outros tipos: diagnóstico, garantia, recall, sinistro, preparação. Vamos ampliar a lista.
4. **Concluir a manutenção** ainda não mexe na Frota. Isso está **certo** segundo o documento (§4.3, "OS encerrada não libera o carro"). A liberação será um passo próprio.

---

## 5. Plano de implantação proposto

Entregas pequenas, cada uma testada com dados fictícios e liberada só com aprovação.

| Fase | Entrega | Inclui |
|---|---|---|
| **1A** | Recebimento do veículo | Central de recebimentos (EM-01) e telas EM-02 a EM-07: placa puxando o carro, o último contrato e o último KM; motivo e tipo ampliados; entregador e recebedor; chaves; KM com foto; combustível; acessórios; segurança na chegada. Eventos numerados `EV-AAAA-NNNNNN`, estados separados (custódia e condição técnica) e as 10 categorias. |
| **1B** | Ocorrência, orçamento e OS | Ocorrência (OC) ligada ao evento; orçamento com versões e aprovação; **OS-AAAA-NNNNNN**; situações da OS (emitida, em execução, aguardando peças, inspeção final, encerrada); horas de mão de obra; inspeção final; PDF da OS. |
| **2** | Almoxarifado completo e ferramentas | Saldo físico, reservado e disponível; reserva por OS; entrega ao mecânico; consumo; devolução; quarentena; depósitos e endereços; inventário com segunda contagem; **ferramentas** (patrimônio, retirada e devolução, calibração); pneus. |
| **3** | Checklist com fotos guiadas | Modelos de checklist por evento e categoria; foto guiada manual com gabarito; foto original guardada sem alteração; comparação com a vistoria anterior. Captura automática por IA **só depois de um piloto**. |
| **4** | Compras e garantias | Requisição a partir do estoque mínimo ou da OS; cotações; pedido; recebimento parcial com conferência; garantia de peça e serviço. |
| **5** | Preventiva por KM e tempo | Planos por modelo (Tera, Polo, Gol) e componente; vencimento por KM e por data; previsão pela média diária usando o KM que já existe; sugestão → diagnóstico → OC (nunca direto para orçamento). |
| **6** | Telemetria | **Antes:** levantar os rastreadores (modelos, fornecedor, API, contrato). **Depois:** um adaptador por fornecedor, separando o KM do GPS e o hodômetro, e tratando "sem dados" de forma diferente de "0 km". |
| **7** | App do locatário, automações e indicadores | Vistoria remota, pedido de manutenção, notificações, regras automáticas com aprovação e painel de custos. |

**Fora do escopo por regra do próprio documento:**
- bloqueio remoto de veículo;
- cobrança automática;
- rescisão automática;
- diagnóstico por IA sem um técnico;
- reconhecimento facial.

---

## 6. Decisões que precisam da diretoria

1. **Mesmo sistema e mesmo banco** para a manutenção, como recomendado no item 1? A alternativa é um sistema separado com API, que dá mais trabalho e cria risco de dados duplicados.
2. **Estoque oficial:** o estoque fica só na Tempo da Mecânica? Existe algum outro sistema ou planilha que hoje é a referência?
3. **Quem aprova o quê:** quem aprova orçamento (e até que valor), compra, foto com exceção e liberação do carro para locação?
4. **Cliente de fora na Tempo da Mecânica:** ele recebe orçamento e cobrança pelo sistema? Precisa de nota fiscal?
5. **Rastreadores:** quais modelos e fornecedores estão instalados hoje? Eles têm API ou exportação de dados?
6. **Responsabilidade pelo custo:** quais regras do contrato dizem quando o reparo é do locatário? Franquia? Caução? Os valores devem vir do contrato, e não ficar fixos no sistema.
7. **Fotos:** por quanto tempo guardar? Quem pode ver as fotos de contratos anteriores?
8. **Unidades:** existe mais de uma oficina ou pátio que precise de controle separado?

---

## 7. Próximo passo sugerido

Começar pela **Fase 1A (Recebimento do veículo)**, usando a etapa 1 da Oficina que já está pronta. Ela entrega a primeira parte do que a diretoria pediu (EM-01 a EM-07) e prepara a ocorrência, o orçamento e a OS da Fase 1B, sem depender de nenhuma integração externa.
