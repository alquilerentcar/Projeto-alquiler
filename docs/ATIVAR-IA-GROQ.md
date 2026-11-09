# Ativar GroqCloud
Crie uma conta Free em https://console.groq.com e uma chave em https://console.groq.com/keys.
No .env do servidor local, configure:

AI_PROVIDER=groq
GROQ_API_KEY=sua_chave
GROQ_MODEL=qwen/qwen3.8-27b

Reinicie server.js. Na Vercel use as mesmas variáveis no projeto e publique a alteração quando autorizado. Não coloque a chave no HTML, Git ou conversa.
A integração lê fotos e PDFs de até três páginas, convertidos no navegador. Acima disso informa o limite, sem truncar silenciosamente.
O assistente recebe até três arquivos por cliente, mostra os dados por arquivo, reúne os campos para revisão e cadastra com originais no Storage privado ao clicar Cadastrar e anexar ou digitar pode cadastrar. CPF existente: completa campos vazios e preserva anexos anteriores. Falhas parciais permitem concluir os anexos sem duplicar o cliente. Pendências ficam na memória desta página; navegar ou recarregar antes de salvar descarta os arquivos. Não cria locações nem envia assinaturas.
O plano gratuito possui cotas; erros de limite são exibidos sem mudar para um provedor pago. A qualidade da leitura precisa ser validada com documentos reais depois de configurar a chave.
