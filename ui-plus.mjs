// Pacote visual 1 (comportamento): seleções coloridas pela situação, contador da busca e tabelas em cartões no celular.
// Só enfeita: não muda valores, não envia nada e funciona em telas criadas depois (observa a página).

// Palavras de situação → cor. A primeira regra que casar vence.
const TONS=[
 ['vermelho',/\b(indispon[ií]vel|atrasad|vencid|cancelad|reprovad|batida|avaria|perda|bloquead|inadimpl|sem estoque|recusad|negad)/i],
 ['laranja',/\b(manuten[cç][aã]o|revis[aã]o|pendente|aguardando|reservad|parcial|em elabora|precisa repor|rascunho|an[aá]lise|agendad)/i],
 ['cinza',/\b(encerrad|vendid|inativ|arquivad|devolvid)/i],
 ['azul',/\b(locad|ocupad|em andamento|aberta|em uso|enviad)/i],
 ['verde',/\b(dispon[ií]vel|ativ[ao]|pag[oa]|aprovad|conclu[ií]d|normal|recebid|quitad|confirmad|assinad|ok)\b/i]
];
export function tomDoTexto(t){const s=String(t||'').trim();if(!s||s.length>40)return '';for(const [tom,re] of TONS)if(re.test(s))return tom;return '';}

// Só colore seleções de situação: pelo menos metade das opções precisa ser uma situação conhecida.
function ehSelecaoDeSituacao(sel){if(sel.multiple||sel.size>1||sel.dataset.semCor!==undefined)return false;const ops=[...sel.options].filter(o=>o.value!==''||o.text.trim());if(ops.length<2)return false;const comTom=ops.filter(o=>tomDoTexto(o.text)).length;return comTom>=2&&comTom>=ops.length/2;}
function colorir(sel){if(!(sel instanceof HTMLSelectElement))return;if(sel.dataset.situacao===undefined)sel.dataset.situacao=ehSelecaoDeSituacao(sel)?'1':'0';if(sel.dataset.situacao!=='1')return;const tom=tomDoTexto(sel.selectedOptions[0]?.text);if(tom)sel.dataset.tom=tom;else delete sel.dataset.tom;}

// Contador da busca: mostra quantas linhas da tabela abaixo continuam aparecendo.
function tabelaDaBusca(inp){const area=inp.closest('section,.panel,.dialog-body,main')||document;return area.querySelector('table tbody');}
function contar(tb){const linhas=[...tb.rows].filter(r=>!(r.cells.length===1&&r.cells[0].colSpan>1));return {total:linhas.length,visiveis:linhas.filter(r=>!r.hidden&&r.style.display!=='none'&&r.offsetParent!==null).length};}
const contadores=new WeakMap();
function atualizarContador(inp){const tb=tabelaDaBusca(inp);let chip=contadores.get(inp);if(!tb||!inp.value.trim()){chip?.remove();contadores.delete(inp);return;}
 const {total,visiveis}=contar(tb);if(!chip){chip=document.createElement('span');chip.className='busca-contagem';chip.setAttribute('aria-live','polite');inp.after(chip);contadores.set(inp,chip);}
 chip.textContent=visiveis===0?'Nada encontrado':`${visiveis} de ${total}`;chip.classList.toggle('vazia',visiveis===0);}
let tempo=null;const agendar=inp=>{clearTimeout(tempo);tempo=setTimeout(()=>atualizarContador(inp),380);};

// Tabelas em cartões no celular: cada célula ganha o nome da coluna.
function rotular(table){if(!(table instanceof HTMLTableElement)||table.dataset.semCartoes!==undefined||!table.closest('.table-scroll'))return;const ths=[...(table.tHead?.rows[0]?.cells||[])].map(th=>th.textContent.trim());if(!ths.length)return;table.classList.add('em-cartoes');
 for(const tb of table.tBodies)for(const r of tb.rows){let col=0;for(const td of r.cells){const nome=ths[col]||'';if(td.dataset.label!==nome)td.dataset.label=nome;col+=td.colSpan||1;}}}

// Menu lateral que recolhe: botão no topo do menu; a escolha fica guardada neste aparelho.
const CHAVE='bgsys:menu-recolhido';
function botaoMenu(){const brand=document.querySelector('.sidebar .sidebar-brand');if(!brand||brand.querySelector('.menu-recolher'))return;const b=document.createElement('button');b.type='button';b.className='menu-recolher';
 b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
 const rotulo=()=>{const r=document.documentElement.classList.contains('menu-recolhido');b.setAttribute('aria-label',r?'Abrir o menu':'Recolher o menu');b.title=r?'Abrir o menu':'Recolher o menu';b.setAttribute('aria-expanded',String(!r));};
 const alternar=forcar=>{const h=document.documentElement;h.classList.add('menu-anima');const r=h.classList.toggle('menu-recolhido',forcar);try{localStorage.setItem(CHAVE,r?'1':'0');}catch{}rotulo();b.blur();setTimeout(()=>h.classList.remove('menu-anima'),260);};
 b.onclick=()=>alternar();rotulo();brand.append(b);
 // Recolhido: o nome aparece ao passar o mouse; abrir um grupo (Cadastros, Financeiro…) abre o menu.
 const sb=brand.closest('.sidebar');sb.querySelectorAll('.professional-menu :is(.menu-link,summary)').forEach(x=>{if(!x.title)x.title=x.textContent.trim();});
 sb.addEventListener('click',e=>{const s=e.target.closest('.professional-menu summary');if(s&&document.documentElement.classList.contains('menu-recolhido')){alternar(false);s.parentElement.open=true;e.preventDefault();}});}

function varrer(raiz){if(raiz.nodeType!==1)return;if(raiz.matches?.('select'))colorir(raiz);raiz.querySelectorAll?.('select').forEach(colorir);if(raiz.matches?.('table'))rotular(raiz);raiz.querySelectorAll?.('table').forEach(rotular);const t=raiz.closest?.('table');if(t)rotular(t);}

export function iniciar(){
 botaoMenu();varrer(document.body);
 document.addEventListener('change',e=>{if(e.target instanceof HTMLSelectElement)colorir(e.target);},true);
 document.addEventListener('input',e=>{const t=e.target;if(t instanceof HTMLInputElement&&t.type==='search')agendar(t);});
 document.addEventListener('search',e=>{const t=e.target;if(t instanceof HTMLInputElement&&t.type==='search')agendar(t);},true);
 let pend=new Set(),marcado=false;
 new MutationObserver(ms=>{for(const m of ms){if(m.type==='childList')m.addedNodes.forEach(n=>pend.add(n));else if(m.target instanceof HTMLSelectElement)pend.add(m.target);}
  if(!marcado){marcado=true;requestAnimationFrame(()=>{marcado=false;const lista=pend;pend=new Set();for(const n of lista)varrer(n);botaoMenu();
   document.querySelectorAll('input[type=search]').forEach(i=>{if(contadores.has(i))atualizarContador(i);});});}
 }).observe(document.body,{childList:true,subtree:true});
 // Valor escolhido pelo código (sem evento) também colore.
 const proto=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
 if(proto&&!HTMLSelectElement.prototype.__corSituacao){Object.defineProperty(HTMLSelectElement.prototype,'value',{configurable:true,get(){return proto.get.call(this);},set(v){proto.set.call(this,v);if(this.dataset.situacao==='1')colorir(this);}});HTMLSelectElement.prototype.__corSituacao=true;}
}
