// Telas que o administrador pode escolher como tela inicial de cada usuário (mesma lista do banco).
export const TELAS_INICIAIS=[
 ['','Padrão do sistema (escolher módulo)'],
 ['dashboard.html','Locação · Painel'],
 ['locacoes.html','Locação · Locações'],
 ['financeiro.html','Locação · Financeiro'],
 ['oficina.html?secao=manutencoes','Mecânica · Manutenções'],
 ['oficina.html?secao=saida','Mecânica · Retirar peça'],
 ['oficina.html?secao=estoque','Mecânica · Estoque'],
 ['pdv-estoque.html','Mecânica · Balcão do estoque']
];
const VALIDAS=new Set(TELAS_INICIAIS.map(([v])=>v).filter(Boolean));
// Tela inicial de quem entrou naquela empresa, ou null (sem escolha, sem o módulo ou função ainda não criada no banco).
export async function minhaTelaInicial(db,empresa){
 if(!empresa)return null;
 try{const {data,error}=await db.rpc('acesso_minha_tela_inicial',{p_empresa:empresa});return !error&&VALIDAS.has(data)?data:null;}catch{return null;}
}
