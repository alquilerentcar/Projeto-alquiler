// Ordem de serviço da oficina: relatório de entrada, peças e serviços, relatório de saída e assinaturas.
import {montarOrcamento} from './orcamento-core.mjs?v=20261117';

export const ITENS_VISTORIA={documento:'Documento (CRLV)',estepe:'Estepe',macaco:'Macaco',chave_roda:'Chave de roda',triangulo:'Triângulo',tapetes:'Tapetes',multimidia:'Rádio / multimídia',calotas:'Calotas',painel_ok:'Painel sem luz de alerta'};
export const COMBUSTIVEL=['Vazio','1/8','1/4','3/8','1/2','5/8','3/4','7/8','Cheio'];

const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Manaus'}):'—';
const km=v=>v==null?'—':Number(v).toLocaleString('pt-BR');

// Situação de cada relatório para a lista de manutenções.
export function situacaoVistorias(r){return r?{entrada:Boolean(r.entrada),saida:Boolean(r.saida)}:{entrada:false,saida:false};}

function blocoVistoria(titulo,v,urls){
 if(!v)return `<section class="bloco"><h2>${titulo}</h2><p class="falta">Relatório ainda não feito.</p></section>`;
 const itens=Object.entries(ITENS_VISTORIA).map(([k,l])=>`<li class="${v.itens?.[k]?'sim':'nao'}">${v.itens?.[k]?'✔':'✘'} ${esc(l)}</li>`).join('');
 const fotos=(v.fotos||[]).map(p=>urls[p]?`<img src="${esc(urls[p])}" alt="Foto do carro">`:'').join('');
 return `<section class="bloco"><h2>${titulo}</h2>
  <div class="grade"><div><b>Data</b>${esc(quando(v.atualizado_em||v.criado_em))}</div><div><b>KM</b>${esc(km(v.km))}</div><div><b>Combustível</b>${esc(COMBUSTIVEL[v.combustivel]??'—')}</div></div>
  <ul class="itens">${itens}</ul>
  ${v.avarias?`<p><b>Avarias:</b> ${esc(v.avarias)}</p>`:''}${v.observacao?`<p><b>Observação:</b> ${esc(v.observacao)}</p>`:''}
  ${fotos?`<div class="fotos">${fotos}</div>`:''}</section>`;
}

// Página pronta para imprimir (A4). urls: caminho da foto → endereço temporário assinado.
export function paginaOrdemServico({orcamento,vistorias=[],urls={}}){
 const o=montarOrcamento(orcamento),m=orcamento.manutencao,ent=vistorias.find(v=>v.tipo==='entrada'),sai=vistorias.find(v=>v.tipo==='saida');
 const cab=o.cabecalho.slice(1).map(([k,v])=>`<div><b>${esc(k)}</b>${esc(v)}</div>`).join('');
 const linhas=o.linhas.map(l=>`<tr><td>${esc(l.tipo)}</td><td>${esc(l.descricao)}</td><td>${esc(l.quantidade)}</td><td>${esc(l.unitario)}</td><td>${esc(l.total)}</td><td>${esc(l.natureza)}</td></tr>`).join('')||'<tr><td colspan="6">Nenhuma peça ou serviço lançado.</td></tr>';
 const totais=o.totais.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
 const status={aberta:'Aberta',aguardando_pecas:'Aguardando peças',concluida:'Concluída',cancelada:'Cancelada'}[m.status]||m.status;
 return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>OS ${esc(m.numero)} · ${esc(m.placa)}</title><style>
 @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:11px/1.4 Arial,sans-serif;color:#111;margin:0}
 header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d3fa8;padding-bottom:6px;margin-bottom:8px}
 header h1{font-size:18px;color:#1d3fa8;margin:0}header small{color:#555}.num{text-align:right;font-size:13px}
 .grade{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin:6px 0}.grade div b,.cab div b{display:block;font-size:9px;color:#555;text-transform:uppercase}
 .cab{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px;margin-bottom:8px}
 .bloco{border:1px solid #ccd;border-radius:6px;padding:6px 8px;margin:8px 0;break-inside:avoid}.bloco h2{font-size:12px;margin:0 0 4px;color:#1d3fa8}
 .itens{display:grid;grid-template-columns:repeat(3,1fr);list-style:none;padding:0;margin:4px 0}.itens .nao{color:#a33}
 .fotos{display:flex;flex-wrap:wrap;gap:4px}.fotos img{width:31%;height:110px;object-fit:cover;border:1px solid #ccd;border-radius:4px}
 table{width:100%;border-collapse:collapse;margin:4px 0}th{background:#1d3fa8;color:#fff;text-align:left;padding:4px}td{border-bottom:1px solid #e3e5ea;padding:4px}
 .totais{margin-left:auto;width:55%}.totais div{display:flex;justify-content:space-between;padding:2px 0}.falta{color:#a33}
 .assin{display:flex;gap:40px;margin-top:40px}.assin div{flex:1;border-top:1px solid #555;padding-top:4px;text-align:center;color:#555}
 </style></head><body>
 <header><div><h1>ORDEM DE SERVIÇO</h1><small>${esc(o.empresa)}</small></div><div class="num"><b>Nº ${esc(String(m.numero).padStart(5,'0'))}</b><br>${esc(status)} · aberta em ${esc(quando(m.entrada_em))}</div></header>
 <div class="cab">${cab}</div>
 ${blocoVistoria('Relatório de entrada',ent,urls)}
 <section class="bloco"><h2>Peças e serviços</h2><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Total</th><th>Natureza</th></tr></thead><tbody>${linhas}</tbody></table>
 <div class="totais">${totais}</div><p><small>${esc(o.regra)}</small></p></section>
 ${blocoVistoria('Relatório de saída',sai,urls)}
 <div class="assin"><div>Mecânico responsável</div><div>Locatário / cliente</div></div>
 </body></html>`;
}
