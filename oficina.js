import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
import {mountOficina} from './oficina.mjs?v=20261125';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
await requireAuth(db);bindLogout(db);
const params=new URLSearchParams(location.search),secao=params.get('secao')||'manutencoes';
const titulos={manutencoes:['Manutenções','Carros em manutenção, motivo, tipo e peças usadas.'],entrada:['Entrada de peças','Passe o leitor de código de barras para dar entrada no estoque.'],saida:['Retirar peça','Passe o leitor como no caixa: cada peça vai para um carro e só é concluída com as fotos.'],fotos:['Fotos pendentes','Peças retiradas aguardando a foto da peça nova e da antiga.'],notas:['Notas fiscais','Notas de compra com emissão, fornecedor, número, chave, valores e itens.'],aprovacoes:['Aprovações','Orçamentos aguardando o analista.'],movimentos:['Movimentos do estoque','Registro completo de entradas e saídas, com quem fez, lote, custo e destino.'],financeiro:['Financeiro da manutenção','Custos, parte do locatário e da empresa, e o que falta cobrar.'],estoque:['Estoque','Peças, saldo, mínimo e histórico de movimentos.'],servicos:['Serviços e ajustes','Catálogo de serviços, rateio, analistas e empresas atendidas.']};
const [t,d]=titulos[secao]||titulos.manutencoes;document.querySelector('#oficina-title').textContent=t;document.querySelector('#oficina-description').textContent=d;
await mountOficina({db,company:window.alquilerContext.company,host:document.querySelector('#oficina-host'),admin:Boolean(window.alquilerContext.canManageCompany),secao,params});
