Leitura de certificados e tema — 03/10/2026

O botão Ler informações usa um Web Worker local e a distribuição browser node-forge 1.4.0. A senha é apagada do campo após iniciar a leitura; o worker devolve apenas metadados e é encerrado ao terminar ou após 30 segundos. O arquivo PFX/P12 não é enviado à API de leitura. Ao salvar, o arquivo original é enviado diretamente ao bucket privado certificados-digitais do Supabase, mantendo o caminho por empresa e as políticas existentes. A senha não é gravada no cadastro.

Arquivos necessários na publicação: certificados.js, certificado-reader.worker.js, forge.min.js, forge-LICENSE.txt, ui-theme.css, os HTMLs e server.js. Não é necessário PowerShell para o novo leitor. A biblioteca acompanha sua licença original. Não exige aplicar uma nova migração SQL.

Problemas corrigidos: referência a certificate-user removido pelo menu compartilhado; leitura dependente do Windows; lista que permanecia carregando em falhas de conexão; tentativa de enviar arquivo A1 ao escolher A3; mensagens e limpeza de arquivos após falha de cadastro.

O CSS compartilhado está aplicado aos 28 HTMLs com head, com menus, cartões, tabelas, campos, diálogos e login padronizados, cores da empresa e comportamento mobile. Os documentos mantêm sua própria formatação.

Validação feita com certificado fictício, sem utilizar arquivos ou senhas reais. O erro específico reportado em produção ainda depende da mensagem exata: permissões do Supabase ou configuração do bucket precisam ser conferidas se houver falha ao Salvar certificado. Estas alterações são locais; produção depende de publicação posterior.
