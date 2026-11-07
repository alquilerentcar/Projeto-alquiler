# Consultas cadastrais

Não há fornecedor contratado informado pelo responsável. Nenhuma consulta paga foi ativada e nenhuma mensagem de confirmação foi enviada.

| Dado | Disponível no código | Consulta adicional |
| --- | --- | --- |
| CPF/CNPJ | Máscara e cálculo dos dígitos verificadores, incluindo CNPJ alfanumérico | Consulta oficial exige fornecedor/credenciais; dígitos válidos não comprovam inscrição regular |
| CEP | ViaCEP: logradouro, bairro, município e UF | Não confirma onde a pessoa mora nem informa o número da casa |
| Telefone | Formato brasileiro e DDD no preenchimento | Estado da linha depende de serviço e cobertura; código por SMS verifica posse naquele momento |
| E-mail | Sintaxe | Confirmação por link/código exige envio ao destinatário |

## CPF oficial

A Consulta CPF do Serpro exige contratação e autenticação. A versão atual consulta CPF e data de nascimento e retorna nome, situação cadastral, nascimento e demais campos documentados. Não fornece automaticamente RG, filiação ou endereço residencial. As credenciais devem ficar exclusivamente no servidor.

- https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/pt/
- https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/pt/tipos_retornados/
- https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/pt/como_contratar/

## Telefone

Twilio Lookup é uma opção a avaliar com teste de cobertura e preço antes da contratação. O recurso Line Status está em beta e pode responder desconhecido ou não ter informação de certas redes. Uma linha ativa não comprova que pertença ao locatário. A confirmação por código exige uma etapa separada e envio autorizado.

- https://www.twilio.com/docs/lookup/v2-api/line-status
- https://www.twilio.com/docs/verify/api/verification

## CEP

ViaCEP é gratuito para consultas individuais. Não fazer consultas em massa; o serviço informa que uso excessivo pode ser bloqueado.

- https://viacep.com.br/
