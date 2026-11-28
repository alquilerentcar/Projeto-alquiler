import {lerQuantidade,lerValor,normalizarCodigo,adicionarItem,situacaoEstoque,conferirItens,itensEntrada,itensSaida,fmtQtd,STATUS,rotuloManutencao,SITUACOES_SAIDA} from './oficina-core.mjs?v=20261124';
import {lerNFe,casarItens} from './nfe-core.mjs?v=20261123b';
import {ITENS_VISTORIA,COMBUSTIVEL,paginaOrdemServico} from './ordem-servico.mjs?v=20261128b';
import {montarOrcamento,resumoSaidas,CATEGORIAS,NATUREZA} from './orcamento-core.mjs?v=20261128b';
import {paginaEtiquetas,ean13Valido,FORMATOS} from './etiqueta-core.mjs?v=20261118b';
import {serialSuportado,portaAutorizada,conectarImpressora,imprimirSerial} from './impressora-serial.mjs?v=20261118';
const FORMATO_USB='usb';
const fmtCnpj=c=>String(c||'').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Manaus'}):'—';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,cls='btn btn-quiet')=>{const b=el('button',text,cls);b.type='button';return b;};
// Só a função que falta no banco vira o aviso de configuração; outros erros (ex.: coluna que não existe) aparecem como são.
const missing=e=>e?.code==='PGRST202'||/Could not find the function|schema cache|function .* does not exist/i.test(e?.message||'');
const SETUP='Sem acesso à Oficina. Confira se o módulo Oficina está liberado para a empresa e para o seu usuário em Acessos (e se sql/oficina_modulo.sql foi aplicado).';
const ORC_STATUS={em_elaboracao:'Em elaboração',aguardando_aprovacao:'Aguardando aprovação',aprovado:'Aprovado',reprovado:'Reprovado'};
const ABAS=[['manutencoes','Manutenções'],['saida','Retirar peça'],['fotos','Fotos pendentes'],['entrada','Entrada de peças'],['notas','Notas fiscais'],['estoque','Estoque'],['aprovacoes','Aprovações'],['financeiro','Financeiro'],['movimentos','Movimentos'],['servicos','Serviços e ajustes']];
const CAT_ITEM={pecas:'Peças',uso_consumo:'Uso e consumo',revenda:'Revenda',obra:'Construção em andamento',limpeza:'Material de limpeza',ferramenta:'Ferramenta',outros:'Outros'};
const DESTINO={manutencao:'Carro (manutenção)',uso_consumo:'Uso e consumo',obra:'Construção em andamento',revenda:'Revenda',perda:'Perda / descarte'};
const CSS='#oficina section.panel{padding:22px 26px;margin-bottom:16px}#oficina .ofi-linha{display:flex;flex-wrap:wrap;gap:12px;align-items:end}#oficina .ofi-linha label{display:flex;flex-direction:column;gap:4px}#oficina .ofi-scan{font-size:1.25rem;padding:12px 14px;width:min(520px,100%)}#oficina table input,#oficina table select{width:110px}#oficina .table-actions select{width:auto;min-width:170px}#oficina .ofi-alerta{color:#b42318;font-weight:600}#oficina .ofi-ok{color:#067647;font-weight:600}#oficina .ofi-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}#oficina .ofi-tabs a{padding:8px 14px;border-radius:8px;border:1px solid #dfe2e8;text-decoration:none;color:inherit;background:#fbfbfc}#oficina .ofi-tabs a[aria-current=page]{background:#1d3fa8;color:#fff;border-color:#1d3fa8}#oficina .ofi-erro{color:#b42318}.ofi-sem-valor{color:#b42318;font-weight:600}#oficina textarea{width:100%;min-height:80px}#oficina-dialog .ofi-linha{display:flex;flex-wrap:wrap;gap:12px;align-items:end}#oficina-dialog .ofi-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px 14px;border:1px solid var(--line,#d8dce3);border-radius:8px;padding:8px 12px;margin:10px 0}#oficina-dialog .ofi-checks legend{font-weight:600;padding:0 4px}#oficina-dialog .ofi-linha label{display:flex;flex-direction:column;gap:4px}#oficina-dialog .ofi-totais{display:grid;grid-template-columns:auto auto;gap:4px 24px;justify-content:end;margin-top:12px}#oficina-dialog .ofi-totais strong{text-align:right}#oficina-dialog .ofi-erro{color:#b42318}#oficina-dialog{max-width:min(1100px,96vw)}#oficina-dialog[open]{display:flex;flex-direction:column}#oficina-dialog>.dialog-header,#oficina-dialog>.dialog-footer{flex:none}#oficina-dialog>.dialog-body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding-bottom:16px}#oficina-dialog>.client-form{min-height:0}#oficina .ofi-nf td select{width:220px}#oficina .ofi-foto,#oficina-dialog .ofi-foto{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #e3e5ea}#oficina .ofi-foto .ok,#oficina-dialog .ofi-foto .ok{color:#067647;font-weight:600}.ofi-badge{display:inline-block;padding:2px 10px;border-radius:999px;background:#eef1f8;font-size:.85em}.ofi-badge.aprovado{background:#dcfae6;color:#067647}.ofi-badge.reprovado{background:#fee4e2;color:#b42318}.ofi-badge.aguardando_aprovacao{background:#fef0c7;color:#93370d}';

// Oficina: manutenções dos carros, entrada e saída de peças pelo leitor de código de barras e estoque.
export async function mountOficina({db,company,host,admin,secao='manutencoes',params=new URLSearchParams()}){
 if(!document.querySelector('#oficina-styles')){const st=el('style');st.id='oficina-styles';st.textContent=CSS;document.head.append(st);}
 host.replaceChildren();const wrap=el('div');wrap.id='oficina';host.append(wrap);
 const tabs=el('nav',null,'ofi-tabs');tabs.setAttribute('aria-label','Áreas da oficina');
 for(const [k,l] of ABAS){const a=el('a',l);a.href='oficina.html?secao='+k;if(k===secao)a.setAttribute('aria-current','page');tabs.append(a);}
 const status=el('p',null,'flow-note');status.setAttribute('aria-live','polite');const body=el('div');wrap.append(status,body);// Navegação só pelo menu lateral (igual ao resto do sistema): as abas não aparecem mais.
 const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)throw Error(missing(r.error)?SETUP:r.error.message);return r.data;};
 let painel={produtos:[],servicos:[],manutencoes:[],frota_em_manutencao:[],rateio:{corretiva:50,preventiva:0,margem_corretiva:40},analista:false};
 const regraTexto=()=>{const r=painel.rateio,mg=Number(r.margem_corretiva??0);return `Corretiva: ${mg?'peça pelo custo da nota +'+String(mg).replace('.',',')+'%, ':''}${r.corretiva}% locatário e ${100-r.corretiva}% empresa. Preventiva: ${Number(r.preventiva)?r.preventiva+'% locatário e '+(100-r.preventiva)+'% empresa':'100% empresa'}. Batida / avaria: 100% locatário.`;};
 const RELATORIOS_CARRO=false;
 async function carregar(){painel=await rpc('oficina_painel',{p_empresa:company.id});painel.vistorias=null;if(RELATORIOS_CARRO)try{painel.vistorias=await rpc('oficina_vistorias_resumo',{p_empresa:company.id});}catch{}}
 try{await carregar();}catch(e){status.textContent=e.message;return;}
 const abertas=()=>painel.manutencoes.filter(m=>['aberta','aguardando_pecas'].includes(m.status));
 const campo=(host,label,input)=>{const l=el('label');l.append(el('span',label),input);host.append(l);return input;};
 const input=(type='text')=>{const i=el('input');i.type=type;return i;};
 const badge=st=>el('span',ORC_STATUS[st]||st,'ofi-badge '+st);
 // Etiquetas com código de barras: impressora de cupom (bobina 80/58 mm) ou folha A4.
 const lerFormato=()=>{try{return localStorage.getItem('oficina-etiqueta-formato')||'bobina80';}catch{return 'bobina80';}};
 function imprimirEtiquetas(itens){
  const validos=itens.filter(i=>ean13Valido(i.codigo));
  if(!validos.length)return alert('Esta peça usa um código de barras do fabricante fora do padrão EAN-13. Use a etiqueta original ou gere um código interno.');
  dialog.replaceChildren();const form=el('form',null,'client-form'),head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');
  head.append(el('h2','Imprimir etiqueta'));const g=el('div',null,'ofi-linha'),fmt=el('select');if(serialSuportado()){const o=el('option','Impressora de cupom no USB · direto, sem driver (Bematech MP-4200 TH)');o.value=FORMATO_USB;fmt.append(o);}for(const [k,f] of Object.entries(FORMATOS)){const o=el('option',f.nome);o.value=k;fmt.append(o);}fmt.value=[...fmt.options].some(o=>o.value===lerFormato())?lerFormato():fmt.options[0].value;campo(g,'Impressora',fmt);
  const qtds=validos.map(i=>{const q=input('number');q.min='1';q.max='200';q.value=String(i.copias||1);campo(g,'Cópias · '+i.descricao,q);return q;});
  box.append(g,el('p','Na impressora de cupom sai uma etiqueta por vez: corte na linha e cole com fita na peça ou na prateleira.','section-note'));
  const cancel=btn('Cancelar'),ok=el('button','Imprimir','btn btn-primary');ok.type='submit';cancel.onclick=()=>dialog.close();foot.append(cancel,ok);form.append(head,box,foot);dialog.append(form);
  const erroImp=el('p',null,'ofi-erro');box.append(erroImp);
  form.onsubmit=async e=>{e.preventDefault();try{localStorage.setItem('oficina-etiqueta-formato',fmt.value);}catch{}
   const lista=validos.map((i,k)=>({...i,copias:Number(qtds[k].value)||1}));
   if(fmt.value===FORMATO_USB){erroImp.textContent='';try{if(!await portaAutorizada())await conectarImpressora();await imprimirSerial(lista);dialog.close();status.textContent='Etiqueta enviada para a impressora.';}catch(err){erroImp.textContent=err.name==='NotFoundError'?'Nenhuma porta escolhida. Clique em Imprimir de novo e escolha a impressora (porta COM).':'Não foi possível imprimir: '+err.message;}return;}
   const html=paginaEtiquetas(lista,{empresa:company.nome_fantasia||'',formato:fmt.value});
   const w=window.open('','_blank');if(!w)return alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.');
   w.document.open();w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);dialog.close();};
  if(!dialog.open)dialog.showModal();
 }
 // Fotos da peça retirada: nova funcionando e antiga (ou justificativa). Sem as duas, a operação fica pendente.
 function fotoPeca(x,onOk){
  const linha=el('div',null,'ofi-foto'),info=el('span',`${x.produto}${x.quantidade?' · '+fmtQtd(x.quantidade)+' '+(x.unidade||''):''} · ${x.placa} · manutenção #${x.manutencao}`);linha.append(info);
  const estado={nova:Boolean(x.tem_nova),antiga:Boolean(x.tem_antiga)};
  const pronto=()=>{if(estado.nova&&estado.antiga){linha.replaceChildren(info,el('span','Fotos completas','ok'));onOk?.();}};
  for(const [tipo,label] of [['nova','Foto da peça nova funcionando'],['antiga','Foto da peça antiga']]){
   if(estado[tipo]){linha.append(el('span',label+': enviada','ok'));continue;}
   const l=el('label',null,'btn btn-quiet'),f=input('file');f.accept='image/*';f.setAttribute('capture','environment');f.hidden=true;f.setAttribute('aria-label',label+' · '+x.produto);l.append(document.createTextNode(label),f);
   f.onchange=async()=>{const arq=f.files[0];f.value='';if(!arq)return;l.classList.add('is-loading');
    try{const ext=(arq.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'jpg',caminho=`${company.id}/${x.movimento_id}/${tipo}-${crypto.randomUUID()}.${ext}`;
     const up=await db.storage.from('oficina-fotos').upload(caminho,arq,{contentType:arq.type||'image/jpeg',upsert:false});if(up.error)throw Error(up.error.message);
     await rpc('oficina_foto_registrar',{p_empresa:company.id,p_movimento:x.movimento_id,p_tipo:tipo,p_path:caminho,p_justificativa:null});estado[tipo]=true;l.replaceWith(el('span',label+': enviada','ok'));pronto();}
    catch(e){alert('Não foi possível enviar a foto: '+e.message);}finally{l.classList.remove('is-loading');}};
   linha.append(l);
   if(tipo==='antiga'){const sem=btn('Não há peça antiga');sem.onclick=async()=>{const j=prompt('Explique por que não há foto da peça antiga (ex.: item novo, fluido descartado):');if(!j)return;
    try{await rpc('oficina_foto_registrar',{p_empresa:company.id,p_movimento:x.movimento_id,p_tipo:'antiga',p_path:null,p_justificativa:j});estado.antiga=true;l.replaceWith(el('span','Peça antiga: '+j,'ok'));sem.remove();pronto();}catch(e){alert(e.message);}};linha.append(sem);}
  }
  pronto();return linha;
 }

 // Leitor de código de barras: campo sempre focado; Enter procura a peça.
 function leitor(onPeca){
  const box=el('div',null,'ofi-linha'),scan=input('search');scan.className='ofi-scan';scan.placeholder='Passe o leitor ou digite o código e aperte Enter';scan.setAttribute('aria-label','Código de barras');scan.autocomplete='off';
  const msg=el('p',null,'section-note');box.append(scan);
  scan.addEventListener('keydown',async e=>{if(e.key!=='Enter')return;e.preventDefault();const codigo=normalizarCodigo(scan.value);scan.value='';if(!codigo)return;
   msg.textContent='Procurando '+codigo+'…';
   try{const p=await rpc('oficina_produto_buscar',{p_empresa:company.id,p_codigo:codigo});msg.textContent='';await onPeca(p,codigo);}catch(err){msg.textContent=err.message;}
   scan.focus();});
  return {box,scan,msg};
 }
 function listaPecas(itens,{saida}){
  const t=el('table'),th=el('thead'),tr=el('tr'),tb=el('tbody');
  for(const h of saida?['Peça','Código','Em estoque','Quantidade','Corretiva / preventiva','']:['Peça','Código','Em estoque','Quantidade','Preço de compra (R$)','Marca',''])tr.append(el('th',h));th.append(tr);t.append(th,tb);
  const desenhar=()=>{tb.replaceChildren();if(!itens.length){const r=el('tr'),d=el('td','Nenhuma peça lida ainda.');d.colSpan=saida?6:7;r.append(d);tb.append(r);}
   for(const i of itens){const r=el('tr'),q=input();q.inputMode='decimal';q.value=fmtQtd(i.quantidade);q.setAttribute('aria-label','Quantidade de '+i.produto.descricao);q.oninput=()=>{i.quantidade=lerQuantidade(q.value);};
    const estoque=el('td',fmtQtd(i.produto.saldo)+' '+i.produto.unidade);if(saida&&Number(i.produto.saldo)<=0)estoque.className='ofi-alerta';
    r.append(el('td',i.produto.descricao+(i.produto.marca?' · '+i.produto.marca:'')),el('td',i.produto.codigo_barras||i.produto.codigo_interno||'—'),estoque);const tq=el('td');tq.append(q);r.append(tq);
    const extra=el('td');if(saida){const s=el('select');for(const [v,l] of [['','Igual à manutenção'],['corretiva','Corretiva'],['preventiva','Preventiva'],['avaria','Batida / avaria (100% locatário)']]){const o=el('option',l);o.value=v;s.append(o);}s.value=i.natureza||'';s.setAttribute('aria-label','Corretiva ou preventiva · '+i.produto.descricao);s.onchange=()=>{i.natureza=s.value||null;};extra.append(s);}
    else{const c=input();c.inputMode='decimal';c.placeholder=Number(i.produto.custo_medio)>0?String(i.produto.custo_medio).replace('.',','):'';c.value=i.custo==null?'':String(i.custo).replace('.',',');c.setAttribute('aria-label','Custo de '+i.produto.descricao);c.oninput=()=>{i.custo=lerValor(c.value);};extra.append(c);}
    const rem=btn('Tirar');rem.onclick=()=>{itens.splice(itens.indexOf(i),1);desenhar();};const tr2=el('td');tr2.append(rem);r.append(extra);
    if(!saida){const mc=input(),tm=el('td');if(i.marca==null)i.marca=i.produto.marca||'';mc.value=i.marca;mc.placeholder='Ex.: Bosch';mc.setAttribute('aria-label','Marca de '+i.produto.descricao);mc.oninput=()=>{i.marca=mc.value;};tm.append(mc);r.append(tm);}
    r.append(tr2);tb.append(r);}};
  desenhar();const w=el('div',null,'table-scroll');w.append(t);return {node:w,desenhar};
 }
 // Peça nova com o código lido.
 // Código de barras digitado ou lido pelo leitor: só números (6 a 14) e não pode repetir outra peça.
 function erroCodigo(c,ignorar=null){if(!c)return '';if(!/^\d{6,14}$/.test(c))return 'O código de barras tem só números (de 6 a 14 dígitos).';
  const outra=painel.produtos.find(p=>p.codigo_barras===c&&p.id!==ignorar);return outra?`O código ${c} já é da peça "${outra.descricao}". Escolha essa peça na lista ou use outro código.`:'';}
 function novaPeca(codigo,onSalvar){
  const box=el('section',null,'panel'),linha=el('div',null,'ofi-linha');box.append(el('h3',codigo?'Peça não cadastrada: '+codigo:'Peça nova: informe o código de barras ou deixe em branco para o sistema gerar um'),el('p','Cadastre agora para dar entrada.','section-note'),linha);
  const desc=campo(linha,'Descrição',input()),cb=campo(linha,'Código de barras',input()),un=campo(linha,'Unidade',input()),min=campo(linha,'Estoque mínimo',input()),loc=campo(linha,'Localização',input()),marca=campo(linha,'Marca',input());un.value='UN';min.inputMode='decimal';
  cb.inputMode='numeric';cb.value=/^\d{6,14}$/.test(codigo)?codigo:'';cb.placeholder=codigo&&!/^\d{6,14}$/.test(codigo)?'Código '+codigo+' (interno)':'Passe o leitor ou deixe em branco';
  const salvar=btn('Cadastrar peça','btn btn-primary'),erro=el('p',null,'ofi-erro');linha.append(salvar);box.append(erro);
  salvar.onclick=async()=>{erro.textContent='';const barras=cb.value.trim(),err=erroCodigo(barras);if(err){erro.textContent=err;return;}
   try{const p=await rpc('oficina_produto_salvar',{p_empresa:company.id,p_id:null,p_dados:{descricao:desc.value,codigo_barras:barras||null,codigo_interno:codigo&&!/^\d{6,14}$/.test(codigo)?codigo:null,unidade:un.value,estoque_minimo:lerQuantidade(min.value)||0,localizacao:loc.value,marca:marca.value}});painel.produtos.push(p);box.remove();onSalvar(p);}catch(e){erro.textContent=e.message;}};
  setTimeout(()=>desc.focus(),0);return box;
 }

 // ---------- Manutenções ----------
 function abaManutencoes(){
  const frota=el('section',null,'panel');frota.append(el('h2','Carros em manutenção na Frota'));
  if(!painel.frota_em_manutencao.length)frota.append(el('p','Nenhum carro aguardando abertura de manutenção.','section-note'));
  for(const c of painel.frota_em_manutencao){const l=el('div',null,'ofi-linha'),b=btn('Abrir manutenção','btn btn-primary');b.onclick=()=>formulario({carro_id:c.carro_id,placa:c.placa,veiculo:c.veiculo});l.append(el('strong',c.placa),el('span',(c.veiculo||'')+' · '+c.empresa+' · desde '+quando(c.desde)),b);frota.append(l);}
  const lista=el('section',null,'panel'),top=el('div',null,'ofi-linha'),nova=btn('Nova manutenção','btn btn-primary');top.append(el('h2','Manutenções'),nova);lista.append(top);nova.onclick=()=>formulario({});
  const fl=el('div',null,'ofi-linha'),pesq=input('search'),stF=el('select'),contagem=el('span',null,'section-note');pesq.placeholder='Buscar placa, nº, locatário, motivo…';pesq.setAttribute('aria-label','Buscar manutenção');
  for(const [k,l] of [['','Todas as situações'],['abertas','Em aberto'],...Object.entries(STATUS)]){const op=el('option',l);op.value=k;stF.append(op);}stF.setAttribute('aria-label','Situação');fl.append(pesq,stF,contagem);lista.append(fl);
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const h of ['Nº','Veículo','Locatário','Tipo','Motivo','Entrada','Situação','Orçamento','Total',''])hr.append(el('th',h));th.append(hr);t.append(th,tb);const w=el('div',null,'table-scroll');w.append(t);lista.append(w);
  if(!painel.manutencoes.length){const r=el('tr'),d=el('td','Nenhuma manutenção registrada.');d.colSpan=10;r.append(d);tb.append(r);}
  const vazio=el('tr'),vd=el('td','Nenhuma manutenção encontrada.');vd.colSpan=10;vazio.append(vd);vazio.hidden=true;const linhas=[];
  const filtrar=()=>{const q=norm(pesq.value).replace(/[\s#-]/g,''),qs=norm(pesq.value).trim();let n=0;for(const {r,m,txt} of linhas){const okS=!stF.value||(stF.value==='abertas'?['aberta','aguardando_pecas'].includes(m.status):m.status===stF.value);const okQ=!qs||txt.includes(qs)||txt.replace(/[\s#-]/g,'').includes(q);r.hidden=!(okS&&okQ);if(!r.hidden)n++;}vazio.hidden=n>0||!linhas.length;contagem.textContent=linhas.length?n+' de '+linhas.length:'';};
  pesq.oninput=filtrar;stF.onchange=filtrar;
  for(const m of painel.manutencoes){const r=el('tr'),acoes=el('td',null,'table-actions'),vs=painel.vistorias?.[m.id]||{},emAberto=['aberta','aguardando_pecas'].includes(m.status);
   r.append(el('td','#'+m.numero),el('td',m.placa+(m.veiculo?' · '+m.veiculo:'')),el('td',m.responsavel_nome||(m.cliente_externo?m.cliente_externo+' (cliente)':'Empresa')),el('td',NATUREZA[m.tipo]||'Corretiva'),el('td',m.motivo),el('td',quando(m.entrada_em)),el('td',(STATUS[m.status]||m.status)+(m.fotos_pendentes?` · ${m.fotos_pendentes} foto(s) pendente(s)`:'')+(painel.vistorias&&emAberto?(!vs.entrada?' · falta relatório de entrada':!vs.saida?' · falta relatório de saída':''):'')),(()=>{const td=el('td');td.append(badge(m.orcamento_status||'em_elaboracao'));if(m.cobrada_em)td.append(el('small',' · cobrado'));return td;})(),el('td',brl(Number(m.custo_pecas)+Number(m.valor_servicos||0))));
   const ver=btn('Orçamento');ver.onclick=()=>orcamento(m);acoes.append(ver);
   {if(painel.vistorias&&emAberto){const be=btn(vs.entrada?'Entrada ✓':'Relatório de entrada',vs.entrada?'btn btn-quiet':'btn btn-primary');be.onclick=()=>vistoria(m,'entrada');acoes.append(be);
     if(vs.entrada){const bs=btn(vs.saida?'Saída ✓':'Relatório de saída');bs.onclick=()=>vistoria(m,'saida');acoes.append(bs);}}
    const bo=btn('Imprimir OS');bo.onclick=()=>imprimirOS(m);acoes.append(bo);}
   if(emAberto&&!m.cobranca_debito_id){const bt=btn('Mudar tipo');bt.onclick=()=>mudarTipo(m);acoes.append(bt);}
   if(['aberta','aguardando_pecas'].includes(m.status)){const lan=el('a','Lançar peça','btn btn-quiet');lan.href='oficina.html?secao=saida&manutencao='+m.id;acoes.append(lan);
    const st=el('select');st.setAttribute('aria-label','Situação da manutenção '+m.numero);for(const [v,l] of [['','Mudar situação…'],['aberta','Aberta'],['aguardando_pecas','Aguardando peças'],['concluida','Concluir'],['cancelada','Cancelar']]){if(v===m.status)continue;const o=el('option',l);o.value=v;st.append(o);}
    st.onchange=async()=>{const v=st.value;if(!v)return;if(['concluida','cancelada'].includes(v)&&!confirm((v==='concluida'?'Concluir':'Cancelar')+' a manutenção #'+m.numero+' do '+m.placa+'?')){st.value='';return;}
     try{await rpc('oficina_manutencao_status',{p_empresa:company.id,p_id:m.id,p_status:v,p_observacao:null});await recarregar('Manutenção #'+m.numero+': '+STATUS[v]+'.');}catch(e){alert(e.message);st.value='';}};acoes.append(st);}
   r.append(acoes);tb.append(r);linhas.push({r,m,txt:norm(['#'+m.numero,m.numero,m.placa,m.veiculo,m.responsavel_nome,m.cliente_externo,m.motivo,NATUREZA[m.tipo],STATUS[m.status]].join(' '))});}
  tb.append(vazio);filtrar();
  body.append(frota,lista);
 }
 const dialog=el('dialog',null,'client-dialog');dialog.id='oficina-dialog';document.body.append(dialog);
 // Muda corretiva / preventiva / batida da manutenção aberta. Peças e serviços já lançados acompanham.
 function mudarTipo(m){
  dialog.replaceChildren();const form=el('form',null,'client-form'),head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');
  head.append(el('h2','Mudar tipo · '+rotuloManutencao(m)));
  const g=el('div',null,'form-grid'),tipo=el('select');for(const [v,l] of [['corretiva','Corretiva (consertar defeito)'],['preventiva','Preventiva (revisão, troca programada)'],['avaria','Batida / avaria (100% do locatário)']]){const op=el('option',l);op.value=v;tipo.append(op);}tipo.value=m.tipo||'corretiva';campo(g,'Novo tipo',tipo);
  const mot=input();mot.required=true;mot.placeholder='Ex.: na verdade foi batida, não defeito';campo(g,'Por que mudou',mot);
  const aviso=el('p','Todas as peças e serviços já lançados nesta manutenção passam para o novo tipo, e a divisão entre locatário e empresa é recalculada.'+(['aguardando_aprovacao','aprovado'].includes(m.orcamento_status)?' O orçamento volta para elaboração e precisa ser enviado de novo ao analista.':''),'section-note');
  const erro=el('p',null,'ofi-erro');box.append(g,aviso,el('p',regraTexto(),'section-note'),erro);
  const cancel=btn('Cancelar'),ok=el('button','Mudar tipo','btn btn-primary');ok.type='submit';cancel.onclick=()=>dialog.close();foot.append(cancel,ok);form.append(head,box,foot);dialog.append(form);
  form.onsubmit=async e=>{e.preventDefault();erro.textContent='';if(tipo.value===m.tipo){dialog.close();return;}ok.disabled=true;
   try{await rpc('oficina_manutencao_tipo',{p_empresa:company.id,p_manutencao:m.id,p_tipo:tipo.value,p_motivo:mot.value});dialog.close();await recarregar('Manutenção #'+m.numero+' agora é '+NATUREZA[tipo.value].toLowerCase()+'.');}
   catch(err){erro.textContent=err.message;}finally{ok.disabled=false;}};
  dialog.showModal();tipo.focus();
 }
 async function formulario(pre){
  dialog.replaceChildren();const form=el('form',null,'client-form'),head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');head.append(el('h2','Nova manutenção'));
  let veiculos=[];try{veiculos=await rpc('oficina_veiculos',{p_empresa:company.id});}catch(e){alert(e.message);return;}
  const g=el('div',null,'form-grid'),placa=campo(g,'Placa do veículo',input()),lista=el('datalist');lista.id='oficina-placas';placa.setAttribute('list',lista.id);placa.required=true;
  for(const v of veiculos){const o=el('option');o.value=v.placa;o.label=v.veiculo+' · '+v.empresa;lista.append(o);}
  const info=el('p',null,'section-note'),forabox=el('div',null,'form-grid'),cliente=campo(forabox,'Cliente (veículo de fora)',input()),modelo=campo(forabox,'Veículo (modelo e ano)',input());forabox.hidden=true;
  const tipo=el('select');for(const [v,l] of [['corretiva','Corretiva (consertar defeito)'],['preventiva','Preventiva (revisão, troca programada)'],['avaria','Batida / avaria (100% do locatário)']]){const o=el('option',l);o.value=v;tipo.append(o);}campo(g,'Tipo de manutenção',tipo);
  const km=campo(g,'KM na entrada',input());km.inputMode='numeric';const motivo=el('textarea');motivo.required=true;motivo.placeholder='Por que o carro está em manutenção? Ex.: barulho na suspensão, revisão de 20.000 km';const lm=el('label');lm.append(el('span','Motivo'),motivo);
  const erro=el('p',null,'ofi-erro');box.append(g,lista,info,forabox,lm,erro);
  let escolhido=null;const achar=()=>{const p=placa.value.toUpperCase().replace(/[^A-Z0-9]/g,'');escolhido=veiculos.find(v=>v.placa.replace(/[^A-Z0-9]/g,'')===p)||null;forabox.hidden=Boolean(escolhido)||!p;
   info.textContent=escolhido?`${escolhido.veiculo} · ${escolhido.empresa}${escolhido.ultimo_km?' · último KM '+Number(escolhido.ultimo_km).toLocaleString('pt-BR'):''}`:p.length>=7?'Veículo de fora da frota: informe o cliente e o modelo.':'';if(escolhido&&!km.value&&escolhido.ultimo_km)km.placeholder=String(escolhido.ultimo_km);};
  placa.oninput=achar;if(pre.placa){placa.value=pre.placa;achar();}
  const cancel=btn('Cancelar'),save=el('button','Abrir manutenção','btn btn-primary');save.type='submit';cancel.onclick=()=>dialog.close();foot.append(cancel,save);form.append(head,box,foot);dialog.append(form);
  const operacao=crypto.randomUUID();
  form.onsubmit=async e=>{e.preventDefault();erro.textContent='';if(!form.reportValidity())return;
   const dados={carro_id:escolhido?.carro_id||null,placa:placa.value,tipo:tipo.value,motivo:motivo.value,km:km.value.replace(/\D/g,'')||null,cliente_externo:escolhido?null:cliente.value,veiculo:escolhido?null:modelo.value};
   save.disabled=true;try{const m=await rpc('oficina_manutencao_abrir',{p_empresa:company.id,p_operacao:operacao,p_dados:dados});dialog.close();await recarregar('Manutenção #'+m.numero+' aberta para '+m.placa+'.');}catch(err){erro.textContent=err.message;}finally{save.disabled=false;}};
  dialog.showModal();(pre.placa?motivo:placa).focus();
 }
 // ---------- Entrada ----------
 function abaEntrada(){
  const itens=[],sec=el('section',null,'panel');sec.append(el('h2','Entrada de peças'),el('p','Passe o leitor de código de barras em cada peça. Ler a mesma peça de novo soma 1.','section-note'));
  const tabela=listaPecas(itens,{saida:false}),novaHost=el('div');
  const {box,scan,msg}=leitor(async(p,codigo)=>{if(!p){novaHost.replaceChildren(novaPeca(codigo,np=>{adicionarItem(itens,np);tabela.desenhar();scan.focus();}));return;}adicionarItem(itens,p);tabela.desenhar();});
  // Nota sem XML (papel): com o número, a nota fica registrada em Notas fiscais com todos os dados e itens.
  const doc=el('div',null,'ofi-linha'),nf=campo(doc,'Nº da nota fiscal',input()),serie=campo(doc,'Série',input()),emissao=campo(doc,'Emissão da nota',input('date')),forn=campo(doc,'Fornecedor',input()),
   cnpjI=campo(doc,'CNPJ do fornecedor',input()),chaveI=campo(doc,'Chave de acesso (se tiver)',input()),totalI=campo(doc,'Valor total da nota (R$)',input()),obs=campo(doc,'Observação',input());
  serie.style.width='5rem';cnpjI.inputMode='numeric';chaveI.inputMode='numeric';chaveI.placeholder='44 números';totalI.inputMode='decimal';
  const docNota=el('p','Tem nota? Preencha o número, a emissão e o fornecedor: a nota fica guardada em Notas fiscais com todos os itens. Sem número, é só uma entrada no estoque.','section-note');
  const erro=el('p',null,'ofi-erro'),salvar=btn('Registrar entrada','btn btn-primary');let operacao=crypto.randomUUID();
  salvar.onclick=async()=>{erro.textContent='';const erros=conferirItens(itens);if(erros.length){erro.textContent=erros.join(' ');return;}
   const temNota=nf.value.trim()!=='',chave=chaveI.value.replace(/\D/g,''),total=totalI.value.trim()?lerValor(totalI.value):null;
   if(temNota){const falta=[];if(!emissao.value)falta.push('a data de emissão');if(forn.value.trim().length<2)falta.push('o fornecedor');if(falta.length){erro.textContent='Para lançar a nota, informe '+falta.join(' e ')+'.';return;}
    const semPreco=itens.filter(i=>i.custo==null||Number.isNaN(i.custo));if(semPreco.length){erro.textContent='Informe o preço de compra (por unidade) de: '+semPreco.map(i=>i.produto.descricao).join(', ')+'.';return;}
    if(chave&&chave.length!==44){erro.textContent='A chave de acesso tem 44 números (foram digitados '+chave.length+').';return;}
    if(total!=null&&Number.isNaN(total)){erro.textContent='Confira o valor total da nota.';return;}}
   salvar.disabled=true;
   try{const base=itensEntrada(itens).map((x,k)=>({...x,marca:String(itens[k].marca??itens[k].produto.marca??'').trim()||null}));let r;
    if(temNota){const soma=Math.round(base.reduce((s,x)=>s+x.quantidade*x.custo_unitario,0)*100)/100;
     r=await rpc('oficina_nota_importar',{p_empresa:company.id,p_operacao:operacao,p_nota:{origem:'manual',numero:nf.value.trim(),serie:serie.value.trim()||null,emissao:emissao.value,emitente_nome:forn.value.trim(),emitente_cnpj:cnpjI.value.replace(/\D/g,'')||null,chave:chave||null,valor_total:total??soma,valor_produtos:soma,observacao:obs.value.trim()||null},
      p_itens:base.map((x,k)=>({...x,descricao:itens[k].produto.descricao,unidade:itens[k].produto.unidade,ean:itens[k].produto.codigo_barras||null,valor_unitario:x.custo_unitario,valor_total:Math.round(x.quantidade*x.custo_unitario*100)/100}))});}
    else r=await rpc('oficina_entrada',{p_empresa:company.id,p_operacao:operacao,p_itens:base,p_documento:null,p_fornecedor:forn.value||null,p_observacao:obs.value||null});
    const numero=nf.value.trim();operacao=crypto.randomUUID();itens.length=0;tabela.desenhar();for(const c of [nf,serie,emissao,forn,cnpjI,chaveI,totalI,obs])c.value='';await carregar();
    status.textContent=(temNota?'NF '+numero+' lançada: ':'Entrada registrada: ')+r.map(x=>x.descricao+' +'+fmtQtd(x.quantidade)+' (estoque '+fmtQtd(x.saldo)+')').join(' · ');}
   catch(e){erro.textContent=e.message;}finally{salvar.disabled=false;scan.focus();}};
  const nfLabel=el('label',null,'btn btn-quiet'),nfArquivo=input('file');nfArquivo.accept='.xml,text/xml,application/xml';nfArquivo.hidden=true;nfLabel.append(document.createTextNode('Importar nota fiscal (XML)'),nfArquivo);
  const nfHost=el('div');nfArquivo.onchange=async()=>{const f=nfArquivo.files[0];nfArquivo.value='';if(!f)return;try{const xml=await f.text();nfHost.replaceChildren(await painelNota(lerNFe(xml),xml));}catch(e){nfHost.replaceChildren(el('p',e.message,'ofi-erro'));}};
  const semCod=btn('Nova peça (digitar o código)');semCod.onclick=()=>{novaHost.replaceChildren(novaPeca('',async np=>{if(np.codigo_barras){adicionarItem(itens,np);tabela.desenhar();msg.textContent=np.descricao+' cadastrada com o código '+np.codigo_barras+'.';return;}try{const g=await rpc('oficina_produto_gerar_codigo',{p_empresa:company.id,p_produto:np.id});Object.assign(np,g);adicionarItem(itens,np);tabela.desenhar();
   msg.textContent=`Código ${g.codigo_barras} gerado para ${g.descricao}. Ajuste a quantidade e imprima as etiquetas.`;imprimirEtiquetas([{descricao:g.descricao,codigo:g.codigo_barras,local:g.localizacao,copias:1}]);}catch(e){msg.textContent=e.message;}}));};
  const topo=el('div',null,'ofi-linha');topo.append(nfLabel,semCod,el('span','Nota em papel ou sem nota? Passe o leitor nas peças abaixo.','section-note'));
  sec.append(topo,nfHost,box,msg,novaHost,tabela.node,docNota,doc,erro,salvar);body.append(sec);setTimeout(()=>scan.focus(),0);
 }
 // Nota fiscal: confere se já entrou, liga cada item a uma peça (ou cadastra) e dá entrada de tudo de uma vez.
 async function painelNota(nf,xml=null){
  const box=el('section',null,'panel ofi-nf'),conf=await rpc('oficina_nota_conferir',{p_empresa:company.id,p_chave:nf.chave,p_cnpj:nf.emitente_cnpj});
  box.append(el('h3',`NF ${nf.numero}${nf.serie?' série '+nf.serie:''} · ${nf.emitente_nome||''}`),el('p',`Emissão ${nf.emissao?nf.emissao.split('-').reverse().join('/'):'—'} · ${nf.itens.length} item(ns) · total ${brl(nf.valor_total)}`,'section-note'),
   el('p',`Fornecedor: ${nf.emitente_nome||'—'}${nf.emitente_cnpj?' · CNPJ '+fmtCnpj(nf.emitente_cnpj):''}`,'section-note'),
   el('p',`Chave de acesso: ${nf.chave||'—'}${nf.natureza_operacao?' · '+nf.natureza_operacao:''}`,'section-note'),
   el('p',`Produtos ${brl(nf.valor_produtos??nf.valor_total)}${Number(nf.frete)?' · frete '+brl(nf.frete):''}${Number(nf.desconto)?' · desconto '+brl(nf.desconto):''} · total da nota ${brl(nf.valor_total)}`,'section-note'));
  if(conf.importada){box.append(el('p',`Esta nota já foi importada em ${quando(conf.importada.criado_em)}. Nada a fazer.`,'ofi-alerta'));return box;}
  if(!nf.chave){box.append(el('p','O XML não tem a chave de acesso de 44 dígitos.','ofi-alerta'));return box;}
  const itens=casarItens(nf.itens,painel.produtos,conf.codigos||{}),t=el('table'),tb=el('tbody'),hr=el('tr');for(const h of ['Item da nota','Código / barras','Quantidade','Preço de compra por unidade (R$)','Total do item','Marca','Peça no estoque','Já saiu para o carro'])hr.append(el('th',h));const th=el('thead');th.append(hr);t.append(th,tb);
  for(const i of itens){const r=el('tr'),s=el('select');s.setAttribute('aria-label','Peça para '+i.descricao);
   const nova=el('option','Cadastrar como peça nova');nova.value='';s.append(nova);for(const p of painel.produtos){const o=el('option',p.descricao+(p.codigo_barras?' · '+p.codigo_barras:''));o.value=p.id;s.append(o);}
   const cst=input(),mc=input();cst.inputMode='decimal';i.custoTexto=i.valor_unitario==null?'':String(Math.round(Number(i.valor_unitario)*10000)/10000).replace('.',',');cst.value=i.custoTexto;cst.setAttribute('aria-label','Preço de compra de '+i.descricao);const ttot=el('td');const totItem=()=>{const v=lerValor(i.custoTexto);ttot.textContent=v==null||Number.isNaN(v)?'—':brl(v*Number(i.quantidade));};totItem();cst.oninput=()=>{i.custoTexto=cst.value;totItem();};
   i.marca=i.produto?.marca||'';mc.value=i.marca;mc.placeholder='Ex.: Bosch';mc.setAttribute('aria-label','Marca de '+i.descricao);mc.oninput=()=>{i.marca=mc.value;};
   const cbN=input();cbN.inputMode='numeric';cbN.placeholder='Código de barras (passe o leitor)';cbN.setAttribute('aria-label','Código de barras da peça nova '+i.descricao);
   i.codigoNovo=i.ean&&!painel.produtos.some(x=>x.codigo_barras===i.ean)?i.ean:'';cbN.value=i.codigoNovo;cbN.oninput=()=>{i.codigoNovo=cbN.value.trim();};
   cbN.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};
   s.value=i.produto?.id||'';const mostrarCb=()=>{cbN.hidden=Boolean(s.value);};s.onchange=()=>{i.produto=painel.produtos.find(p=>p.id===s.value)||null;mostrarCb();if(!mc.value.trim()&&i.produto?.marca){mc.value=i.marca=i.produto.marca;}};mostrarCb();
   const tc=el('td'),tmc=el('td');tc.append(cst);tmc.append(mc);
   const td=el('td');td.append(s,cbN);if(i.como!=='nova')td.append(el('small',i.como==='codigo'?' já usado nas notas deste fornecedor':' pelo código de barras','ofi-ok'));
   // Unidades que já foram usadas num carro: saem do estoque junto com a entrada da nota.
   const tsai=el('td'),sq=input(),sm=el('select');sq.inputMode='decimal';sq.placeholder='Qtd';sq.style.maxWidth='5rem';sq.setAttribute('aria-label','Quantidade que já saiu de '+i.descricao);sq.oninput=()=>{i.saiuTexto=sq.value;};
   const s0=el('option','Nenhuma saiu');s0.value='';sm.append(s0);for(const m of abertas()){const op=el('option',rotuloManutencao(m));op.value=m.id;sm.append(op);}
   sm.style.maxWidth='13rem';sm.setAttribute('aria-label','Carro que usou '+i.descricao);sm.onchange=()=>{i.saiuManutencao=sm.value;if(sm.value&&!sq.value.trim()){sq.value='1';i.saiuTexto='1';}};tsai.append(sq,sm);
   r.append(el('td',i.descricao),el('td',[i.codigo,i.ean].filter(Boolean).join(' · ')),el('td',fmtQtd(i.quantidade)+' '+i.unidade),tc,ttot,tmc,td,tsai);tb.append(r);}
  const w=el('div',null,'table-scroll');w.append(t);const erro=el('p',null,'ofi-erro'),ok=btn('Dar entrada da nota no estoque','btn btn-primary'),operacao=crypto.randomUUID();
  ok.onclick=async()=>{erro.textContent='';const ruins=itens.filter(i=>{const v=lerValor(i.custoTexto);return v==null||Number.isNaN(v);});if(ruins.length){erro.textContent='Informe o preço de compra de: '+ruins.map(i=>i.descricao).join(', ')+'.';return;}
   const saidas=[];for(const i of itens){const q=String(i.saiuTexto||'').trim()?lerQuantidade(i.saiuTexto):0;
    if(q==null||Number.isNaN(q)||q<0){erro.textContent='Confira a quantidade que já saiu de '+i.descricao+'.';return;}
    if(q>0&&!i.saiuManutencao){erro.textContent='Escolha o carro que usou '+i.descricao+'.';return;}
    if(q>Number(i.quantidade)){erro.textContent='Saiu mais '+i.descricao+' do que veio na nota ('+fmtQtd(i.quantidade)+').';return;}
    if(q>0)saidas.push({item:i,quantidade:q,manutencao:i.saiuManutencao});}
   ok.disabled=true;
   const novos=itens.filter(i=>!i.produto),repetido=novos.map(i=>i.codigoNovo).filter(Boolean).find((c,k,a)=>a.indexOf(c)!==k);
   for(const i of novos){const err=erroCodigo(String(i.codigoNovo||'').trim());if(err){erro.textContent=i.descricao+': '+err;ok.disabled=false;return;}}
   if(repetido){erro.textContent='O código '+repetido+' foi informado em duas peças novas.';ok.disabled=false;return;}
   try{for(const i of itens)if(!i.produto){const p=await rpc('oficina_produto_salvar',{p_empresa:company.id,p_id:null,p_dados:{descricao:i.descricao,codigo_barras:String(i.codigoNovo||'').trim()||null,unidade:i.unidade,marca:String(i.marca||'').trim()||null}});painel.produtos.push(p);i.produto=p;}
    const r=await rpc('oficina_nota_importar',{p_empresa:company.id,p_operacao:operacao,p_nota:{origem:'xml',chave:nf.chave,numero:nf.numero,serie:nf.serie,emitente_cnpj:nf.emitente_cnpj,emitente_nome:nf.emitente_nome,emissao:nf.emissao,valor_total:nf.valor_total,valor_produtos:nf.valor_produtos,frete:nf.frete,desconto:nf.desconto,natureza_operacao:nf.natureza_operacao,xml},
     p_itens:itens.map(i=>({produto_id:i.produto.id,quantidade:i.quantidade,custo_unitario:lerValor(i.custoTexto),marca:String(i.marca||'').trim()||null,codigo_fornecedor:i.codigo,
     n:i.n,descricao:i.descricao,ean:i.ean,ncm:i.ncm,unidade:i.unidade,valor_unitario:i.valor_unitario,valor_total:i.valor_total}))});
    let aviso='NF '+nf.numero+' importada: '+r.map(x=>x.descricao+' +'+fmtQtd(x.quantidade)+' (estoque '+fmtQtd(x.saldo)+')').join(' · ');
    // A nota já entrou; agora lança no carro o que já foi usado (uma saída por manutenção).
    for(const mid of [...new Set(saidas.map(s=>s.manutencao))]){const m=painel.manutencoes.find(x=>x.id===mid),grupo=saidas.filter(s=>s.manutencao===mid);
     try{await rpc('oficina_saida',{p_empresa:company.id,p_operacao:crypto.randomUUID(),p_manutencao:mid,p_itens:itensSaida(grupo.map(s=>({produto:s.item.produto,quantidade:s.quantidade})),m?.tipo||'corretiva'),p_observacao:'Já tinha saído: lançada junto da NF '+nf.numero+'.'});
      aviso+=' · Saída para '+(m?.placa||'o carro')+': '+grupo.map(s=>s.item.produto.descricao+' -'+fmtQtd(s.quantidade)).join(', ');}
     catch(e){aviso+=' · ATENÇÃO: a nota entrou, mas a saída para '+(m?.placa||'o carro')+' falhou ('+e.message+'). Lance pela aba Retirar peça.';}}
    await recarregar(aviso);}
   catch(e){erro.textContent=e.message;ok.disabled=false;}};
  box.append(w,erro,ok);return box;
 }

 // ---------- Saída ----------
 function abaSaida(){
  const itens=[],sec=el('section',null,'panel');sec.append(el('h2','Retirar peça'),el('p','1) Escolha o carro. 2) Passe o leitor em cada peça, como no caixa do supermercado. 3) Informe o motivo e registre. 4) Envie a foto da peça nova funcionando e da peça antiga: só então a operação fica concluída.','section-note'));
  const linha=el('div',null,'ofi-linha'),sel=el('select');sel.setAttribute('aria-label','Manutenção');const o0=el('option','Escolha a manutenção…');o0.value='';sel.append(o0);
  for(const m of abertas()){const o=el('option',rotuloManutencao(m)+' · '+m.motivo.slice(0,40));o.value=m.id;sel.append(o);}
  const DEST_OF={manutencao:'Carro (manutenção)',uso_consumo:'Uso e consumo',obra:'Construção em andamento',perda:'Perda / descarte'},PED={uso_consumo:'Setor ou uso (ex.: limpeza da oficina, ferramenta do box 2)',obra:'Qual obra ou construção',perda:'O que aconteceu (ex.: vazou, quebrou)'};
  const dest=el('select');dest.setAttribute('aria-label','Para onde vai');for(const [k,l] of Object.entries(DEST_OF)){const op=el('option',l);op.value=k;dest.append(op);}campo(linha,'Para onde vai',dest);
  sel.value=params.get('manutencao')||'';const lCarro=campo(linha,'Para qual carro',sel).closest('label')||sel.parentElement;
  const dd=input();dd.setAttribute('aria-label','Descrição do destino');const lDest=campo(linha,'Descrição',dd).closest('label')||dd.parentElement;lDest.hidden=true;
  const quemPaga=el('p',null,'section-note');const info=()=>{const m=abertas().find(x=>x.id===sel.value);if(dest.value!=='manutencao'){quemPaga.textContent='Sai do estoque como '+DEST_OF[dest.value].toLowerCase()+': não entra em orçamento nem é cobrado de locatário.';return;}quemPaga.textContent=!m?'':m.responsavel_nome?`Locatário responsável: ${m.responsavel_nome}. ${regraTexto()}`:'Sem locatário responsável: o custo fica com a empresa.';};sel.addEventListener('change',info);dest.onchange=()=>{const carro=dest.value==='manutencao';lCarro.hidden=!carro;lDest.hidden=carro;dd.placeholder=PED[dest.value]||'';info();};info();
  if(!abertas().length)linha.append(el('p','Nenhuma manutenção aberta. Para carro, abra uma na aba Manutenções; para uso e consumo, escolha acima.','ofi-alerta'));
  const tabela=listaPecas(itens,{saida:true});
  const {box,scan,msg}=leitor(async(p,codigo)=>{if(!p){msg.textContent='Peça '+codigo+' não cadastrada. Cadastre na Entrada de peças.';return;}if(Number(p.saldo)<=0){msg.textContent=p.descricao+' está sem estoque.';return;}adicionarItem(itens,p);tabela.desenhar();msg.textContent=p.descricao+' · em estoque: '+fmtQtd(p.saldo)+' '+p.unidade;});
  const obs=el('div',null,'ofi-linha'),ob=campo(obs,'Motivo da retirada (por que a peça saiu)',input()),erro=el('p',null,'ofi-erro'),salvar=btn('Registrar saída','btn btn-primary');ob.style.minWidth='min(460px,100%)';ob.placeholder='Ex.: sensor de combustível com defeito, troca na revisão';let operacao=crypto.randomUUID();
  salvar.onclick=async()=>{erro.textContent='';
   if(dest.value!=='manutencao'){const erros=conferirItens(itens,{saida:true});if(dd.value.trim().length<3)erros.push('Informe '+(PED[dest.value]||'o destino').split(' (')[0].toLowerCase()+'.');if(erros.length){erro.textContent=erros.join(' ');return;}salvar.disabled=true;
    try{const r=await rpc('oficina_saida_avulsa',{p_empresa:company.id,p_operacao:operacao,p_destino:dest.value,p_descricao:[dd.value.trim(),ob.value.trim()].filter(Boolean).join(' · ').slice(0,300),p_itens:itens.map(i=>({produto_id:i.produto.id,quantidade:i.quantidade}))});
     operacao=crypto.randomUUID();itens.length=0;tabela.desenhar();ob.value='';dd.value='';await carregar();status.textContent='Saída para '+DEST_OF[dest.value].toLowerCase()+' registrada'+(Array.isArray(r)?': '+r.map(x=>x.descricao+' −'+fmtQtd(x.quantidade)).join(' · '):'')+'.';}
    catch(e){erro.textContent=e.message;}finally{salvar.disabled=false;scan.focus();}return;}
   const m=abertas().find(x=>x.id===sel.value);const erros=m?conferirItens(itens,{saida:true}):['Escolha para qual carro as peças vão.'];if(m&&ob.value.trim().length<3)erros.push('Informe o motivo da retirada.');if(erros.length){erro.textContent=erros.join(' ');return;}salvar.disabled=true;
   try{const r=await rpc('oficina_saida',{p_empresa:company.id,p_operacao:operacao,p_manutencao:m.id,p_itens:itensSaida(itens,m.tipo),p_observacao:ob.value||null});
    operacao=crypto.randomUUID();itens.length=0;tabela.desenhar();ob.value='';await carregar();status.textContent='Saída registrada para '+m.placa+': '+r.map(x=>x.descricao+' −'+fmtQtd(x.quantidade)+' (restam '+fmtQtd(x.saldo)+')').join(' · ')+'. Agora envie as fotos.';
    fotosHost.replaceChildren(el('h3','Fotos desta retirada'),...r.map(x=>fotoPeca({movimento_id:x.movimento_id,produto:x.descricao,quantidade:x.quantidade,placa:m.placa,manutencao:m.numero})));}
   catch(e){erro.textContent=e.message;}finally{salvar.disabled=false;scan.focus();}};
  const fotosHost=el('div');sec.append(linha,quemPaga,box,msg,tabela.node,obs,erro,salvar,fotosHost);body.append(sec);setTimeout(()=>scan.focus(),0);
 }

 // ---------- Estoque ----------
 const ultimaCompra=p=>p.ultima_compra_em?[p.ultimo_custo==null?null:brl(p.ultimo_custo),p.ultimo_fornecedor,p.ultimo_documento,new Date(p.ultima_compra_em).toLocaleDateString('pt-BR',{timeZone:'America/Manaus'})].filter(Boolean).join(' · '):'—';
 function abaEstoque(){
  const sec=el('section',null,'panel'),top=el('div',null,'ofi-linha'),busca=input('search'),filtro=el('select'),nova=btn('Nova peça','btn btn-primary'),rel=btn('Relatório em PDF');busca.placeholder='Buscar peça, código ou local';busca.setAttribute('aria-label','Buscar peça');
  for(const [v,l] of [['','Todos os itens'],['repor','Precisa repor'],...Object.entries(CAT_ITEM).map(([k,l])=>['cat:'+k,l])]){const o=el('option',l);o.value=v;filtro.append(o);}filtro.setAttribute('aria-label','Filtro do estoque');top.append(busca,filtro,nova,rel);
  const repor=painel.produtos.filter(p=>p.ativo&&situacaoEstoque(p)!=='Normal');
  sec.append(el('h2','Estoque'),el('p',`${painel.produtos.length} peça(s) cadastrada(s) · ${repor.length} precisando repor · valor em estoque ${brl(painel.produtos.reduce((s,p)=>s+Number(p.saldo)*Number(p.custo_medio),0))}`,'section-note'),top);
  const t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const h of ['Item','Categoria','Código','Local','Em estoque','Mínimo','Situação','Custo médio','Última compra',''])hr.append(el('th',h));th.append(hr);t.append(th,tb);const w=el('div',null,'table-scroll');w.append(t);sec.append(w);
  // Mesmo filtro da tabela vale para o relatório em PDF.
  const passa=p=>{const q=busca.value.toLocaleLowerCase('pt-BR').trim(),sit=situacaoEstoque(p);if(filtro.value==='repor'&&sit==='Normal')return false;if(filtro.value.startsWith('cat:')&&(p.categoria||'pecas')!==filtro.value.slice(4))return false;return !q||(p.descricao+' '+(p.codigo_barras||'')+' '+(p.codigo_interno||'')+' '+(p.localizacao||'')+' '+(p.marca||'')+' '+(p.ultimo_fornecedor||'')).toLocaleLowerCase('pt-BR').includes(q);};
  rel.onclick=async()=>{rel.disabled=true;const antes=rel.textContent;rel.textContent='Gerando…';try{const {gerarEstoquePdf}=await import('./estoque-pdf.mjs?v=20261128b');
    const filtroTxt=[filtro.options[filtro.selectedIndex]?.text,busca.value.trim()?'busca: '+busca.value.trim():''].filter(Boolean).join(' · ');
    const bytes=await gerarEstoquePdf({db,company,produtos:painel.produtos.filter(passa),categorias:CAT_ITEM,filtro:filtroTxt});
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=el('a');a.href=url;a.download=`estoque-${new Date(Date.now()-4*3600000).toISOString().slice(0,10)}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Relatório do estoque gerado.';}
   catch(e){status.textContent='Não foi possível gerar o relatório: '+e.message;}finally{rel.disabled=false;rel.textContent=antes;}};
  const desenhar=()=>{tb.replaceChildren();
   for(const p of painel.produtos){if(!passa(p))continue;const sit=situacaoEstoque(p);
    const r=el('tr'),s=el('td',sit,sit==='Normal'?'ofi-ok':'ofi-alerta'),a=el('td',null,'table-actions'),hist=btn('Histórico');hist.onclick=()=>historico(p);a.append(hist);const ed=btn('Editar');ed.onclick=()=>editarItem(p);a.append(ed);
    if(!p.codigo_barras){const gc=btn('Gerar código de barras');gc.onclick=async()=>{try{const np=await rpc('oficina_produto_gerar_codigo',{p_empresa:company.id,p_produto:p.id});await recarregar('Código '+np.codigo_barras+' gerado para '+p.descricao+'.');imprimirEtiquetas([{descricao:np.descricao,codigo:np.codigo_barras,local:np.localizacao,copias:Math.max(1,Math.ceil(Number(np.saldo))||1)}]);}catch(e){alert(e.message);}};a.append(gc);}
    else{const et=btn('Imprimir etiqueta');et.onclick=()=>imprimirEtiquetas([{descricao:p.descricao,codigo:p.codigo_barras,local:p.localizacao,copias:1}]);a.append(et);}
    if(admin){const aj=btn('Ajustar contagem');aj.onclick=async()=>{const c=prompt('Quantidade contada de '+p.descricao+' (estoque atual: '+fmtQtd(p.saldo)+'):');if(c==null)return;const n=lerQuantidade(c);if(Number.isNaN(n))return alert('Quantidade inválida.');const mot=prompt('Motivo do ajuste:','Contagem de inventário');if(!mot)return;
     try{await rpc('oficina_ajuste',{p_empresa:company.id,p_operacao:crypto.randomUUID(),p_produto:p.id,p_contado:n,p_motivo:mot});await recarregar('Estoque de '+p.descricao+' ajustado para '+fmtQtd(n)+'.');}catch(e){alert(e.message);}};a.append(aj);}
    r.append(el('td',p.descricao+(p.marca?' · '+p.marca:'')+(Number(p.qtd_embalagem)>1?` · ${p.embalagem||'CX'} c/ ${fmtQtd(p.qtd_embalagem)}`:'')+(p.controla_lote?' · lote':'')),el('td',CAT_ITEM[p.categoria||'pecas']),el('td',p.codigo_barras||p.codigo_interno||'—'),el('td',p.localizacao||'—'),el('td',fmtQtd(p.saldo)+' '+p.unidade),el('td',fmtQtd(p.estoque_minimo)),s,el('td',brl(p.custo_medio)),el('td',ultimaCompra(p)),a);tb.append(r);}
   if(!tb.children.length){const r=el('tr'),d=el('td',painel.produtos.length?'Nenhuma peça corresponde à busca.':'Nenhuma peça cadastrada. Use a Entrada de peças para cadastrar lendo o código de barras.');d.colSpan=9;r.append(d);tb.append(r);}};
  busca.oninput=desenhar;filtro.onchange=desenhar;nova.onclick=()=>{const cod=prompt('Código de barras ou código interno da peça nova:');if(cod)sec.prepend(novaPeca(normalizarCodigo(cod),async p=>{await recarregar('Peça '+p.descricao+' cadastrada.');}));};
  desenhar();body.append(sec);
  resumoEstoque();
 }
 // Resumo do estoque: patrimônio por categoria, o que entrou e saiu no período e o resultado da revenda.
 let resumoCache=null;
 async function resumoEstoque(){
  const sec=el('section',null,'panel'),f=el('div',null,'ofi-linha'),de=campo(f,'De',input('date')),ate=campo(f,'Até',input('date')),ver=btn('Atualizar','btn btn-primary'),host=el('div');f.append(ver);
  const hoje=new Date(Date.now()-4*3600000);ate.value=hoje.toISOString().slice(0,10);de.value=new Date(hoje.getTime()-30*86400000).toISOString().slice(0,10);
  if(resumoCache){[de.value,ate.value]=resumoCache.chave.split('|');}de.setAttribute('aria-label','Resumo de');ate.setAttribute('aria-label','Resumo até');
  sec.append(el('h2','Resumo do estoque'),el('p','Quanto há guardado (patrimônio), quanto entrou e saiu no período e quanto a revenda deu de lucro.','section-note'),f,host);body.prepend(sec);
  const tabela=(cols,rows)=>{const t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const c of cols)hr.append(el('th',c));th.append(hr);t.append(th,tb);for(const r of rows){const tr=el('tr');for(const v of r)tr.append(el('td',v));tb.append(tr);}if(!rows.length){const tr=el('tr'),td=el('td','Nada no período.');td.colSpan=cols.length;tr.append(td);tb.append(tr);}const w=el('div',null,'table-scroll');w.append(t);return w;};
  const mostrarResumo=r=>{host.replaceChildren();
    const totC=r.patrimonio.reduce((s,x)=>s+Number(x.valor_custo||0),0);
    const m=el('div',null,'metrics dashboard-metrics'),met=(l,v)=>{const d=el('div',null,'metric');d.append(el('span',l),el('strong',v));return d;};
    const ent=r.periodo.filter(x=>x.tipo==='entrada').reduce((s,x)=>s+Number(x.valor_custo||0),0),sai=r.periodo.filter(x=>x.tipo==='saida').reduce((s,x)=>s+Number(x.valor_custo||0),0);
    const rec=r.revenda.reduce((s,x)=>s+Number(x.receita||0),0),luc=r.revenda.reduce((s,x)=>s+Number(x.lucro||0),0);
    m.append(met('Patrimônio em estoque (a custo)',brl(totC)),met('Entrou no período',brl(ent)),met('Saiu no período (a custo)',brl(sai)),met('Vendido (revenda)',brl(rec)),met('Lucro da revenda',brl(luc)));host.append(m);
    host.append(el('h3','Patrimônio por categoria'),tabela(['Categoria','Itens','Unidades','Valor a custo','Valor a preço de venda'],r.patrimonio.map(x=>[CAT_ITEM[x.categoria]||x.categoria,String(x.itens),fmtQtd(x.unidades),brl(x.valor_custo),x.valor_venda==null?'—':brl(x.valor_venda)+(x.sem_preco?` (${x.sem_preco} sem preço)`:'')])));
    host.append(el('h3','Entradas e saídas do período'),tabela(['Movimento','Situação','Lançamentos','Unidades','Valor a custo','Valor vendido'],r.periodo.map(x=>[x.tipo==='entrada'?'Entrada':x.tipo==='saida'?'Saída':'Ajuste',x.tipo==='saida'?(SITUACOES_SAIDA[x.situacao]||'Outra'):'—',String(x.movimentos),fmtQtd(x.unidades),brl(x.valor_custo),x.valor_venda==null?'—':brl(x.valor_venda)])));
    host.append(el('h3','Revenda'),tabela(['Item','Entrou','Vendido','Em estoque','Custo médio','Preço de venda','Margem','Vendido (R$)','Lucro'],r.revenda.map(x=>{const mg=Number(x.preco_venda)>0?Math.round((1-Number(x.custo_medio)/Number(x.preco_venda))*100)+'%':'—';return [x.produto,fmtQtd(x.entrou),fmtQtd(x.vendido),fmtQtd(x.saldo)+' '+x.unidade,brl(x.custo_medio),x.preco_venda==null?'sem preço':brl(x.preco_venda),mg,brl(x.receita),brl(x.lucro)];})));};
  const chave=()=>de.value+'|'+ate.value;
  async function carregarResumo(){if(resumoCache?.chave===chave())mostrarResumo(resumoCache.r);else host.replaceChildren(el('p','Carregando…','section-note'));ver.disabled=true;
   try{const r=await rpc('oficina_estoque_resumo',{p_empresa:company.id,p_de:de.value,p_ate:ate.value});resumoCache={chave:chave(),r};mostrarResumo(r);}
   catch(e){host.replaceChildren(el('p',/oficina_estoque_resumo|Could not find|schema cache/i.test(e.message)?'Aplique sql/oficina_estoque_fluxo.sql no Supabase para ver o resumo.':e.message,'ofi-erro'));}finally{ver.disabled=false;}}
  ver.onclick=carregarResumo;await carregarResumo();
 }
 // Cadastro completo do item: categoria, como vem, lote, preço de venda.
 function editarItem(p){
  dialog.replaceChildren();const form=el('form',null,'client-form'),head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');head.append(el('h2','Editar item'));
  const g=el('div',null,'form-grid'),f=(l,v,t='text')=>{const i=input(t);i.value=v??'';campo(g,l,i);return i;};
  const desc=f('Identificação do item',p.descricao),cbE=f('Código de barras',p.codigo_barras);cbE.inputMode='numeric';cbE.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};const cat=el('select');for(const [k,l] of Object.entries(CAT_ITEM)){const o=el('option',l);o.value=k;cat.append(o);}cat.value=p.categoria||'pecas';campo(g,'Categoria',cat);
  const un=f('Unidade',p.unidade),emb=f('Vem em (embalagem)',p.embalagem),qe=f('Unidades por embalagem',fmtQtd(p.qtd_embalagem||1)),min=f('Estoque mínimo',fmtQtd(p.estoque_minimo)),loc=f('Local',p.localizacao),marca=f('Marca',p.marca),pv=f('Preço de venda (R$)',p.preco_venda==null?'':String(p.preco_venda).replace('.',','));
  const lt=input('checkbox');lt.checked=Boolean(p.controla_lote);const ll=el('label');ll.style.flexDirection='row';ll.style.alignItems='center';ll.append(lt,document.createTextNode(' Controla lote (pede o lote em toda entrada)'));
  const erro=el('p',null,'ofi-erro');box.append(g,ll,el('p','Código: '+(p.codigo_barras||p.codigo_interno||'sem código'),'section-note'),el('p','Última compra: '+ultimaCompra(p),'section-note'),erro);
  const cancel=btn('Cancelar'),ok=el('button','Salvar','btn btn-primary');ok.type='submit';cancel.onclick=()=>dialog.close();foot.append(cancel,ok);form.append(head,box,foot);dialog.append(form);
  form.onsubmit=async e=>{e.preventDefault();erro.textContent='';const barras=cbE.value.trim(),errC=erroCodigo(barras,p.id);if(errC){erro.textContent=errC;return;}
   try{await rpc('oficina_produto_salvar',{p_empresa:company.id,p_id:p.id,p_dados:{descricao:desc.value,codigo_barras:barras||null,categoria:cat.value,unidade:un.value,embalagem:emb.value,qtd_embalagem:lerQuantidade(qe.value)||1,estoque_minimo:lerQuantidade(min.value)||0,localizacao:loc.value,marca:marca.value,preco_venda:pv.value.trim()?lerValor(pv.value):null,controla_lote:lt.checked}});
    dialog.close();await recarregar(desc.value+' atualizado.');}catch(err){erro.textContent=err.message;}};
  dialog.showModal();desc.focus();
 }
 async function historico(p){
  dialog.replaceChildren();const head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),fechar=btn('Fechar');fechar.onclick=()=>dialog.close();head.append(el('h2',p.descricao),fechar);dialog.append(head,box);box.append(el('p','Carregando…'));dialog.showModal();
  try{const movs=await rpc('oficina_movimentos_lista',{p_empresa:company.id,p_manutencao:null,p_produto:p.id});box.replaceChildren();
   const res=resumoSaidas(movs);box.append(el('p',`Em estoque: ${fmtQtd(p.saldo)} ${p.unidade} · Saíram ${fmtQtd(res.total)} para ${res.carros.length} carro(s).`));
   if(res.carros.length){const ul=el('ul');for(const c of res.carros){const li=el('li');li.append(el('strong',c.placa),document.createTextNode(` · ${fmtQtd(c.quantidade)} ${p.unidade} · `+c.usos.map(u=>`manutenção #${u.manutencao} em ${quando(u.criado_em)} (${(NATUREZA[u.natureza]||'Corretiva').toLowerCase()}${u.responsavel?', '+u.responsavel:''})`).join('; ')));ul.append(li);}box.append(ul);}
   const t=el('table'),tb=el('tbody'),h=el('tr');for(const x of ['Quando','Movimento','Quantidade','Estoque depois','Carro / documento'])h.append(el('th',x));const th=el('thead');th.append(h);t.append(th,tb);
   for(const x of movs){const r=el('tr'),tipo=x.tipo==='entrada'?'Entrada':x.tipo==='saida'?'Saída · '+(NATUREZA[x.natureza]||'Corretiva').toLowerCase():'Ajuste';
    r.append(el('td',quando(x.criado_em)),el('td',tipo),el('td',(x.quantidade>0?'+':'')+fmtQtd(x.quantidade)),el('td',fmtQtd(x.saldo_depois)),el('td',x.tipo==='saida'?x.placa+' · manutenção #'+x.manutencao+(x.observacao?' · '+x.observacao:''):[x.documento,x.fornecedor,x.observacao].filter(Boolean).join(' · ')||'—'));tb.append(r);}
   if(!movs.length){const r=el('tr'),d=el('td','Sem movimentos.');d.colSpan=5;r.append(d);tb.append(r);}const w=el('div',null,'table-scroll');w.append(t);box.append(w);}catch(e){box.textContent=e.message;}
 }

 // ---------- Serviços ----------
 function abaServicos(){
  const sec=el('section',null,'panel'),form=el('div',null,'ofi-linha'),desc=campo(form,'Serviço',input()),cat=el('select'),valor=campo(form,'Valor padrão (R$)',input()),salvar=btn('Cadastrar serviço','btn btn-primary'),erro=el('p',null,'ofi-erro');
  for(const [k,l] of Object.entries(CATEGORIAS)){const o=el('option',l);o.value=k;cat.append(o);}campo(form,'Categoria',cat);form.append(salvar);valor.inputMode='decimal';
  sec.append(el('h2','Catálogo de serviços'),el('p','Serviços que a oficina faz, com valor padrão. Na manutenção dá para mudar o valor e lançar serviços de fora.','section-note'),form,erro);
  salvar.onclick=async()=>{erro.textContent='';const v=lerValor(valor.value);if(Number.isNaN(v))return erro.textContent='Valor inválido.';
   try{await rpc('oficina_servico_salvar',{p_empresa:company.id,p_id:null,p_dados:{descricao:desc.value,categoria:cat.value,valor_padrao:v||0}});await recarregar('Serviço cadastrado.');}catch(e){erro.textContent=e.message;}};
  const t=el('table'),tb=el('tbody'),hr=el('tr');for(const h of ['Serviço','Categoria','Valor padrão'])hr.append(el('th',h));const th=el('thead');th.append(hr);t.append(th,tb);
  for(const s of painel.servicos){const r=el('tr');r.append(el('td',s.descricao),el('td',CATEGORIAS[s.categoria]||s.categoria),el('td',brl(s.valor_padrao)));tb.append(r);}
  if(!painel.servicos.length){const r=el('tr'),d=el('td','Nenhum serviço cadastrado.');d.colSpan=3;r.append(d);tb.append(r);}
  const w=el('div',null,'table-scroll');w.append(t);sec.append(w);body.append(sec);
  const regra=el('section',null,'panel'),rf=el('div',null,'ofi-linha'),cor=campo(rf,'Corretiva: % do locatário',input()),pre=campo(rf,'Preventiva: % do locatário',input()),mgI=campo(rf,'Corretiva: % sobre o custo da peça',input()),gr=btn('Salvar rateio','btn btn-primary'),re=el('p',null,'ofi-erro');
  cor.value=painel.rateio.corretiva;pre.value=painel.rateio.preventiva;mgI.value=String(painel.rateio.margem_corretiva??0).replace('.',',');cor.inputMode=pre.inputMode=mgI.inputMode='decimal';
  regra.append(el('h2','Rateio entre locatário e empresa'),el('p','Hoje: '+regraTexto(),'section-note'),el('p','Na corretiva, cada peça entra no orçamento pelo custo da nota fiscal mais a porcentagem acima, e esse valor é dividido entre locatário e empresa. Na batida / avaria a peça leva a mesma porcentagem e o locatário paga 100%. Preventiva e serviços não levam essa porcentagem.','section-note'));
  if(admin){rf.append(gr);regra.append(rf,re);gr.onclick=async()=>{re.textContent='';try{await rpc('oficina_rateio_salvar',{p_empresa:company.id,p_corretiva:lerQuantidade(cor.value),p_preventiva:lerQuantidade(pre.value)});const mg=lerQuantidade(mgI.value);if(mg!==Number(painel.rateio.margem_corretiva??0))await rpc('oficina_margem_salvar',{p_empresa:company.id,p_margem:mg});await recarregar('Rateio atualizado.');}catch(e){re.textContent=e.message;}};}
  body.append(regra);
  // Impressora de etiquetas: etiqueta de teste para ajustar a impressora de cupom.
  const imp=el('section',null,'panel'),il=el('div',null,'ofi-linha'),teste=btn('Imprimir etiqueta de teste','btn btn-primary');il.append(teste);
  imp.append(el('h2','Impressora de etiquetas'),el('p','Use uma etiqueta de teste para conferir a impressora antes de imprimir as peças. Na janela de impressão: escolha a impressora, margens Nenhuma, escala 100% e desmarque cabeçalhos e rodapés.','section-note'),il);
  teste.onclick=()=>imprimirEtiquetas([{descricao:'TESTE DE IMPRESSORA',codigo:'2000000000015',local:'Leia com o leitor: 2000000000015',copias:1}]);body.append(imp);
  if(serialSuportado()){const con=btn('Conectar impressora USB'),est=el('span',null,'section-note');il.prepend(con);il.append(est);
   const ver=async()=>{est.textContent=await portaAutorizada()?'Impressora USB conectada a este navegador.':'Impressora USB ainda não conectada.';};ver();
   con.onclick=async()=>{try{await conectarImpressora();try{localStorage.setItem('oficina-etiqueta-formato',FORMATO_USB);}catch{}await ver();status.textContent='Impressora conectada. Agora imprima a etiqueta de teste.';}catch(err){if(err.name!=='NotFoundError')alert(err.message);}};
   imp.append(el('p','Impressora ligada no USB que aparece como porta COM (como a Bematech MP-4200 TH): clique em Conectar impressora USB, escolha a porta da impressora na lista do navegador e permita. O sistema imprime direto, com o código de barras feito pela impressora e corte automático, sem driver.','section-note'));}
  else imp.append(el('p','Para imprimir direto no USB, sem driver, use o Google Chrome ou o Microsoft Edge.','section-note'));
  // Empresas atendidas pela oficina (ex.: a Tempo da Mecânica atende a Alquiler).
  const ea=el('section',null,'panel'),eal=el('div');ea.append(el('h2','Empresas atendidas pela oficina'),el('p','A oficina vê os carros e os locatários dessas empresas e lança a parte do locatário no financeiro da locação. Só quem administra as duas empresas pode ligar ou desligar.','section-note'),eal);body.append(ea);
  rpc('oficina_empresas_atendidas_lista',{p_empresa:company.id}).then(l=>{if(!l.length)eal.append(el('p','Nenhuma empresa disponível para ligar.','section-note'));for(const e of l){const lb=el('label'),c=input('checkbox');c.checked=e.atendida;c.disabled=!e.pode_alterar;c.setAttribute('aria-label','Atende · '+e.nome);
   c.onchange=async()=>{try{await rpc('oficina_empresa_atendida_definir',{p_empresa:company.id,p_atendida:e.empresa_id,p_ligar:c.checked});status.textContent=(c.checked?'A oficina agora atende ':'A oficina não atende mais ')+e.nome+'.';}catch(err){alert(err.message);c.checked=!c.checked;}};
   lb.style.display='flex';lb.style.flexDirection='row';lb.style.alignItems='center';lb.style.gap='8px';lb.append(c,document.createTextNode(e.nome));eal.append(lb);}}).catch(err=>eal.append(el('p',err.message,'ofi-erro')));
  // Funcionários do estoque: identificam-se pelo CPF no balcão.
  const fsec=el('section',null,'panel'),flista=el('div'),ff=el('div',null,'ofi-linha'),fn=campo(ff,'Nome',input()),fc=campo(ff,'CPF',input()),fadd=btn('Cadastrar funcionário','btn btn-primary'),ferr=el('p',null,'ofi-erro');fc.inputMode='numeric';
  fsec.append(el('h2','Funcionários do estoque'),el('p','No balcão do estoque, cada entrada e saída é registrada no nome do funcionário que digitar o CPF.','section-note'),flista);if(admin){ff.append(fadd);fsec.append(ff,ferr);}body.append(fsec);
  const carregarOps=()=>rpc('oficina_operadores_lista',{p_empresa:company.id}).then(l=>{flista.replaceChildren();if(!l.length)flista.append(el('p','Nenhum funcionário cadastrado.','section-note'));
   for(const o of l){const li=el('div',null,'ofi-linha');li.append(el('span',`${o.nome} · CPF final ${o.cpf_final}${o.ativo?'':' · inativo'}`));
    if(admin){const t=btn(o.ativo?'Desativar':'Reativar');t.onclick=async()=>{const cpf=prompt('Para confirmar, digite o CPF completo de '+o.nome+':');if(!cpf)return;try{await rpc('oficina_operador_salvar',{p_empresa:company.id,p_id:o.id,p_nome:o.nome,p_cpf:cpf,p_ativo:!o.ativo});carregarOps();}catch(e){alert(e.message);}};li.append(t);}flista.append(li);}}).catch(e=>flista.append(el('p',e.message,'ofi-erro')));
  carregarOps();fadd.onclick=async()=>{ferr.textContent='';try{await rpc('oficina_operador_salvar',{p_empresa:company.id,p_id:null,p_nome:fn.value,p_cpf:fc.value,p_ativo:true});fn.value=fc.value='';status.textContent='Funcionário cadastrado.';carregarOps();}catch(e){ferr.textContent=e.message;}};
  if(admin){const an=el('section',null,'panel'),lista=el('div');an.append(el('h2','Analistas (aprovam orçamento)'),el('p','Marque quem pode aprovar ou reprovar orçamentos. O administrador também aprova.','section-note'),lista);body.append(an);
   rpc('oficina_aprovadores_lista',{p_empresa:company.id}).then(us=>{for(const u of us){const l=el('label'),c=input('checkbox');c.checked=u.analista||u.administrador;c.disabled=u.administrador;c.setAttribute('aria-label','Analista · '+u.nome);
    c.onchange=async()=>{try{await rpc('oficina_aprovador_definir',{p_empresa:company.id,p_usuario:u.auth_user_id,p_analista:c.checked});status.textContent=u.nome+(c.checked?' agora aprova orçamentos.':' não aprova mais orçamentos.');}catch(e){alert(e.message);c.checked=!c.checked;}};
    l.style.flexDirection='row';l.style.alignItems='center';l.style.display='flex';l.style.gap='8px';l.append(c,document.createTextNode(u.nome+(u.cargo?' · '+u.cargo:'')+(u.administrador?' (administrador)':'')));lista.append(l);}}).catch(e=>lista.append(el('p',e.message,'ofi-erro')));}
 }
 // ---------- Financeiro da manutenção ----------
 async function abaFinanceiro(){
  const sec=el('section',null,'panel'),f=el('div',null,'ofi-linha'),de=campo(f,'De',input('date')),ate=campo(f,'Até',input('date')),ver=btn('Atualizar','btn btn-primary');f.append(ver);
  const hoje=new Date(Date.now()-4*3600000);ate.value=hoje.toISOString().slice(0,10);de.value=new Date(hoje.getTime()-30*86400000).toISOString().slice(0,10);
  const resumo=el('div',null,'metrics dashboard-metrics'),porCarro=el('div'),tabela=el('div',null,'table-scroll'),erro=el('p',null,'ofi-erro');
  sec.append(el('h2','Financeiro da manutenção'),el('p','Quanto as manutenções custaram, quanto ficou com o locatário e com a empresa, o que já foi lançado na locação e o que falta cobrar.','section-note'),f,erro,resumo,tabela,porCarro);body.append(sec);
  const metric=(l,v)=>{const m=el('div',null,'metric');m.append(el('span',l),el('strong',v));return m;};
  async function carregarFin(){erro.textContent='';ver.disabled=true;
   try{const rows=await rpc('oficina_financeiro',{p_empresa:company.id,p_de:de.value,p_ate:ate.value}),soma=k=>rows.reduce((s,r)=>s+Number(r.totais?.[k]||0),0);
    const aCobrar=rows.filter(r=>!r.cobrada_em&&Number(r.totais?.locatario)>0),externos=rows.filter(r=>r.cliente_externo);
    resumo.replaceChildren(metric('Total das manutenções',brl(soma('geral'))),metric('Peças',brl(soma('pecas'))),metric('Margem sobre o custo das peças',brl(rows.reduce((s,r)=>s+(r.totais?.custo_pecas==null?0:Number(r.totais.pecas)-Number(r.totais.custo_pecas)),0))),metric('Serviços',brl(soma('servicos'))),metric('Parte dos locatários',brl(soma('locatario'))),metric('Parte da empresa',brl(rows.filter(r=>!r.cliente_externo).reduce((s,r)=>s+Number(r.totais.empresa),0))),
     metric('Já lançado na locação',brl(rows.filter(r=>r.cobrada_em).reduce((s,r)=>s+Number(r.totais.locatario),0))),metric('Falta cobrar do locatário',brl(aCobrar.reduce((s,r)=>s+Number(r.totais.locatario),0))),metric('Clientes de fora',brl(externos.reduce((s,r)=>s+Number(r.totais.geral),0))));
    const t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const h of ['Nº','Entrada','Veículo','Locatário / cliente','Tipo','Orçamento','Total','Locatário','Empresa','Cobrança'])hr.append(el('th',h));th.append(hr);t.append(th,tb);
    for(const r of rows){const tr=el('tr');tr.append(el('td','#'+r.numero),el('td',quando(r.entrada_em)),el('td',r.placa+(r.veiculo?' · '+r.veiculo:'')),el('td',r.responsavel||(r.cliente_externo?r.cliente_externo+' (cliente de fora)':'Empresa')),el('td',NATUREZA[r.tipo]||r.tipo),(()=>{const td=el('td');td.append(badge(r.orcamento_status||'em_elaboracao'));return td;})(),
     el('td',brl(r.totais.geral)),el('td',brl(r.cliente_externo?r.totais.geral:r.totais.locatario)),el('td',brl(r.cliente_externo?0:r.totais.empresa)),el('td',r.cobrada_em?'Lançado em '+quando(r.cobrada_em):Number(r.totais.locatario)>0?'Falta lançar':'—'));tr.onclick=()=>orcamento(r);tr.style.cursor='pointer';tb.append(tr);}
    if(!rows.length){const tr=el('tr'),td=el('td','Nenhuma manutenção no período.');td.colSpan=10;tr.append(td);tb.append(tr);}
    tabela.replaceChildren(t);
    const carros=new Map();for(const r of rows){const c=carros.get(r.placa)||{placa:r.placa,qtd:0,total:0,empresa:0};c.qtd++;c.total+=Number(r.totais.geral);c.empresa+=r.cliente_externo?0:Number(r.totais.empresa);carros.set(r.placa,c);}
    porCarro.replaceChildren(el('h3','Custo por veículo'));const ul=el('ul');for(const c of [...carros.values()].sort((a,b)=>b.total-a.total))ul.append(el('li',`${c.placa} · ${c.qtd} manutenção(ões) · total ${brl(c.total)} · empresa ${brl(c.empresa)}`));porCarro.append(ul);}
   catch(e){erro.textContent=e.message;}finally{ver.disabled=false;}}
  ver.onclick=carregarFin;await carregarFin();
 }
 // ---------- Notas fiscais: o registro de cada nota de compra, com os itens ----------
 async function abaNotas(){
  const sec=el('section',null,'panel'),f=el('div',null,'ofi-linha'),de=campo(f,'Emissão de',input('date')),ate=campo(f,'Até',input('date')),busca=input('search'),ver=btn('Atualizar','btn btn-primary'),csv=btn('Baixar planilha'),nova=el('a','+ Lançar nota','btn btn-quiet');
  busca.placeholder='Fornecedor, número, chave, item…';busca.setAttribute('aria-label','Buscar nota');nova.href='oficina.html?secao=entrada';f.append(busca,ver,csv,nova);
  const hoje=new Date(Date.now()-4*3600000);ate.value=hoje.toISOString().slice(0,10);de.value=hoje.toISOString().slice(0,8)+'01';
  const resumo=el('div',null,'metrics dashboard-metrics'),w=el('div',null,'table-scroll'),detalhe=el('div'),erro=el('p',null,'ofi-erro');
  sec.append(el('h2','Notas fiscais de compra'),el('p','Cada nota lançada fica guardada com emissão, fornecedor, número, chave, valores e os itens, e cada item ligado à peça do estoque. Notas por XML guardam também o arquivo original.','section-note'),f,erro,resumo,w,detalhe);body.append(sec);
  const metric=(l,v)=>{const m=el('div',null,'metric');m.append(el('span',l),el('strong',v));return m;};
  let rows=[];const norm=t=>String(t??'').toLocaleLowerCase('pt-BR');
  const visiveis=()=>{const q=norm(busca.value).trim();return rows.filter(n=>!q||norm([n.emitente_nome,n.emitente_cnpj,n.numero,n.chave,...(n.itens||[]).map(i=>[i.descricao,i.produto,i.codigo_fornecedor,i.ean].join(' '))].join(' ')).includes(q));};
  const dataBr=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'—';
  const valorItem=i=>Number(i.valor_total??(Number(i.quantidade)*Number(i.custo_unitario??i.valor_unitario??0)));
  function abrir(n){detalhe.replaceChildren();const box=el('section',null,'panel ofi-nf');
   box.append(el('h3',`NF ${n.numero}${n.serie?' série '+n.serie:''} · ${n.emitente_nome||''}`),
    el('p',`Emissão ${dataBr(n.emissao)} · Fornecedor ${n.emitente_nome||'—'}${n.emitente_cnpj?' · CNPJ '+fmtCnpj(n.emitente_cnpj):''}`,'section-note'),
    el('p',`Chave de acesso: ${n.chave||'— (nota lançada sem chave)'}${n.natureza_operacao?' · '+n.natureza_operacao:''}`,'section-note'),
    el('p',`Produtos ${brl(n.valor_produtos??n.valor_total)}${Number(n.frete)?' · frete '+brl(n.frete):''}${Number(n.desconto)?' · desconto '+brl(n.desconto):''} · total da nota ${brl(n.valor_total)}`,'section-note'),
    el('p',`Lançada em ${quando(n.criado_em)}${n.criado_por?' por '+n.criado_por:''} · ${n.origem==='manual'?'digitada (sem XML)':'importada do XML'}${n.observacao?' · '+n.observacao:''}`,'section-note'));
   const t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const h of ['#','Item da nota','Código / barras','Peça no estoque','Marca','Quantidade','Unitário','Total'])hr.append(el('th',h));th.append(hr);t.append(th,tb);
   (n.itens||[]).forEach((i,k)=>{const tr=el('tr');tr.append(el('td',String(i.n||k+1)),el('td',i.descricao||i.produto||'—'),el('td',[i.codigo_fornecedor,i.ean].filter(Boolean).join(' · ')||'—'),el('td',i.produto||'—'),el('td',i.marca||'—'),
    el('td',fmtQtd(i.quantidade)+' '+(i.unidade||i.unidade_estoque||'')),el('td',brl(i.custo_unitario??i.valor_unitario)),el('td',brl(valorItem(i))));tb.append(tr);});
   const tw=el('div',null,'table-scroll');tw.append(t);box.append(tw);const acoes=el('div',null,'ofi-linha');
   if(n.tem_xml){const bx=btn('Baixar XML');bx.onclick=async()=>{try{const x=await rpc('oficina_nota_xml',{p_empresa:company.id,p_nota:n.id});const a=el('a');a.href=URL.createObjectURL(new Blob([x],{type:'application/xml'}));a.download=`NFe-${n.chave||n.numero}.xml`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){alert(e.message);}};acoes.append(bx);}
   if(n.chave){const bc=btn('Copiar chave');bc.onclick=async()=>{try{await navigator.clipboard.writeText(n.chave);bc.textContent='Chave copiada';}catch{prompt('Chave de acesso',n.chave);}};acoes.append(bc);}
   const fechar=btn('Fechar');fechar.onclick=()=>detalhe.replaceChildren();acoes.append(fechar);box.append(acoes);detalhe.append(box);box.scrollIntoView?.({behavior:'smooth',block:'start'});}
  const desenharNotas=()=>{const v=visiveis(),t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const h of ['Emissão','Nota','Fornecedor','Itens','Valor da nota','Origem','Lançada em',''])hr.append(el('th',h));th.append(hr);t.append(th,tb);
   for(const n of v){const tr=el('tr'),a=el('td',null,'table-actions'),b=btn('Ver itens');b.onclick=()=>abrir(n);a.append(b);
    tr.append(el('td',dataBr(n.emissao)),el('td',n.numero+(n.serie?' / '+n.serie:'')),el('td',(n.emitente_nome||'—')+(n.emitente_cnpj?' · '+fmtCnpj(n.emitente_cnpj):'')),el('td',String((n.itens||[]).length)),el('td',brl(n.valor_total)),el('td',n.origem==='manual'?'Digitada':'XML'),el('td',quando(n.criado_em)),a);tb.append(tr);}
   if(!v.length){const tr=el('tr'),td=el('td','Nenhuma nota no período.');td.colSpan=8;tr.append(td);tb.append(tr);}
   w.replaceChildren(t);const forns=new Set(v.map(n=>n.emitente_cnpj||n.emitente_nome));
   resumo.replaceChildren(metric('Notas',String(v.length)),metric('Total das notas',brl(v.reduce((s,n)=>s+Number(n.valor_total||0),0))),metric('Fornecedores',String(forns.size)),metric('Itens comprados',String(v.reduce((s,n)=>s+(n.itens||[]).length,0))));};
  async function carregarNotas(){erro.textContent='';ver.disabled=true;detalhe.replaceChildren();try{rows=await rpc('oficina_notas_lista',{p_empresa:company.id,p_de:de.value||null,p_ate:ate.value||null});desenharNotas();}catch(e){erro.textContent=e.message;}finally{ver.disabled=false;}}
  csv.onclick=()=>{const cel=x=>{const t=String(x??'');return /[;"\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;},num=x=>x==null||x===''?'':String(Math.round(Number(x)*100)/100).replace('.',',');
   const linhas=[['Emissão','Número','Série','Fornecedor','CNPJ','Chave','Valor da nota','Item','Código','Código de barras','Peça no estoque','Marca','Quantidade','Unidade','Unitário','Total do item'].join(';')];
   for(const n of visiveis())for(const i of (n.itens||[]))linhas.push([dataBr(n.emissao),n.numero,n.serie,n.emitente_nome,n.emitente_cnpj,n.chave,num(n.valor_total),i.descricao||i.produto,i.codigo_fornecedor,i.ean,i.produto,i.marca,String(i.quantidade).replace('.',','),i.unidade||i.unidade_estoque,num(i.custo_unitario??i.valor_unitario),num(valorItem(i))].map(cel).join(';'));
   const a=el('a');a.href=URL.createObjectURL(new Blob(['﻿'+linhas.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));a.download=`notas-fiscais-${de.value}-a-${ate.value}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  ver.onclick=carregarNotas;busca.oninput=desenharNotas;await carregarNotas();
 }
 // ---------- Movimentos: registro completo de entradas e saídas ----------
 async function abaMovimentos(){
  const sec=el('section',null,'panel'),f=el('div',null,'ofi-linha'),de=campo(f,'De',input('date')),ate=campo(f,'Até',input('date')),tipo=el('select'),busca=input('search'),ver=btn('Atualizar','btn btn-primary'),csv=btn('Baixar planilha'),marcas={};
  const chk=el('fieldset',null,'ofi-checks');chk.append(el('legend','Mostrar'));for(const [k,l] of [['entrada','Entradas'],['saida','Saídas'],['ajuste','Ajustes']]){const c=input('checkbox');c.checked=k!=='ajuste';c.setAttribute('aria-label',l);marcas[k]=c;const lb=el('label');lb.style.flexDirection='row';lb.style.alignItems='center';lb.append(c,document.createTextNode(' '+l));chk.append(lb);c.onchange=()=>desenharMov();}f.append(chk);
  for(const [k,l] of [['','Qualquer destino'],...Object.entries(DESTINO).map(([k,l])=>['d:'+k,l])]){const o=el('option',l);o.value=k;tipo.append(o);}
  campo(f,'Saídas para',tipo);busca.placeholder='Item, placa, lote, funcionário…';busca.setAttribute('aria-label','Buscar movimento');f.append(busca,ver,csv);
  const hoje=new Date(Date.now()-4*3600000);ate.value=hoje.toISOString().slice(0,10);de.value=new Date(hoje.getTime()-30*86400000).toISOString().slice(0,10);
  const info=el('p',null,'section-note'),w=el('div',null,'table-scroll'),erro=el('p',null,'ofi-erro');sec.append(el('h2','Movimentos do estoque'),el('p','Todas as entradas e saídas ficam registradas e não podem ser apagadas. Correção é feita com um novo lançamento ou ajuste.','section-note'),f,erro,info,w);body.append(sec);
  let rows=[],cob=new Map();const SIT={cobrado:'Já cobrado',aprovado:'Aprovado, falta cobrar',aguardando_aprovacao:'Com o analista',em_elaboracao:'Orçamento em elaboração',empresa:'Custo da empresa',cancelada:'Cancelada'};
  const visiveis=()=>{const q=busca.value.toLocaleLowerCase('pt-BR').trim();return rows.filter(r=>marcas[r.tipo]?.checked&&(!tipo.value||r.tipo!=='saida'||r.destino===tipo.value.slice(2))&&(!q||[r.produto,r.placa,r.lote,r.operador,r.usuario,r.destino_descricao,r.documento,r.fornecedor,r.codigo].join(' ').toLocaleLowerCase('pt-BR').includes(q)));};
  const texto=r=>({quando:quando(r.criado_em),movimento:r.tipo==='entrada'?'Entrada':r.tipo==='ajuste'?'Ajuste':'Saída · '+(DESTINO[r.destino]||'—'),item:r.produto,categoria:CAT_ITEM[r.categoria]||r.categoria,quantidade:(r.quantidade>0?'+':'')+fmtQtd(r.quantidade)+' '+r.unidade,lote:r.lote||'',
   custo:brl(r.valor),para:r.tipo==='saida'?(r.placa?r.placa+' · manutenção #'+r.manutencao:r.destino_descricao||''):[r.documento,r.fornecedor].filter(Boolean).join(' · '),
   como:r.tipo!=='saida'?'':cob.get(r.id)?NATUREZA[cob.get(r.id).natureza]||'':r.destino==='revenda'?'Venda':DESTINO[r.destino]||'',
   cobrado:r.tipo!=='saida'?'':cob.get(r.id)?(cob.get(r.id).responsavel?brl(cob.get(r.id).valor_locatario)+' de '+cob.get(r.id).responsavel+' ('+Number(cob.get(r.id).pct_locatario).toLocaleString('pt-BR')+'% de '+brl(cob.get(r.id).total)+')':'Empresa paga '+brl(cob.get(r.id).total)):r.valor_venda!=null?'Venda '+brl(Math.abs(Number(r.quantidade))*Number(r.valor_venda)):'—',
   situacao:cob.get(r.id)?SIT[cob.get(r.id).situacao]||'':'',
   quem:r.operador||r.usuario||'',estoque:fmtQtd(r.saldo_depois)});
  const COLS=[['quando','Quando'],['movimento','Movimento'],['item','Item'],['categoria','Categoria'],['quantidade','Quantidade'],['lote','Lote'],['custo','Custo'],['para','Para onde / documento'],['como','Como saiu'],['cobrado','Será cobrado'],['situacao','Cobrança'],['quem','Quem fez'],['estoque','Estoque depois']];
  const desenharMov=()=>{const v=visiveis(),t=el('table'),th=el('thead'),hr=el('tr'),tb=el('tbody');for(const [,l] of COLS)hr.append(el('th',l));th.append(hr);t.append(th,tb);
   for(const r of v){const x=texto(r),tr=el('tr');for(const [k] of COLS)tr.append(el('td',x[k]));tb.append(tr);}
   if(!v.length){const tr=el('tr'),td=el('td','Nenhum movimento no período.');td.colSpan=COLS.length;tr.append(td);tb.append(tr);}
   const ent=v.filter(r=>r.tipo==='entrada').reduce((s,r)=>s+Number(r.valor),0),sai=v.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor),0);
   const aCobrar=v.filter(r=>r.tipo==='saida'&&cob.get(r.id)&&cob.get(r.id).situacao!=='cobrado'&&cob.get(r.id).situacao!=='cancelada').reduce((s,r)=>s+Number(cob.get(r.id).valor_locatario||0),0),cobrado=v.filter(r=>cob.get(r.id)?.situacao==='cobrado').reduce((s,r)=>s+Number(cob.get(r.id).valor_locatario||0),0);
   info.textContent=`${v.length} movimento(s) · entradas ${brl(ent)} · saídas ${brl(sai)} (custo) · locatários: ${brl(aCobrar)} a cobrar e ${brl(cobrado)} já cobrado`;w.replaceChildren(t);};
  async function carregarMov(){erro.textContent='';ver.disabled=true;try{const [m1,m2]=await Promise.all([rpc('oficina_movimentos_relatorio',{p_empresa:company.id,p_de:de.value,p_ate:ate.value}),rpc('oficina_movimentos_cobranca',{p_empresa:company.id,p_de:de.value,p_ate:ate.value}).catch(()=>[])]);rows=m1;cob=new Map((m2||[]).map(x=>[x.id,x]));desenharMov();}catch(e){erro.textContent=e.message;}finally{ver.disabled=false;}}
  csv.onclick=()=>{const v=visiveis(),cel=x=>{const t=String(x??'');return /[;"\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
   const linhas=[COLS.map(c=>c[1]).join(';'),...v.map(r=>{const x=texto(r);return COLS.map(([k])=>cel(x[k])).join(';');})].join('\r\n');
   const a=el('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+linhas+'\r\n'],{type:'text/csv;charset=utf-8'}));a.download=`movimentos-estoque-${de.value}-a-${ate.value}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  ver.onclick=carregarMov;tipo.onchange=desenharMov;busca.oninput=desenharMov;await carregarMov();
 }
 // ---------- Fotos pendentes ----------
 async function abaFotos(){
  const sec=el('section',null,'panel');sec.append(el('h2','Fotos pendentes'),el('p','Peças retiradas que ainda não têm a foto da peça nova funcionando e a da peça antiga. A manutenção só é concluída e o orçamento só vai para aprovação com todas as fotos.','section-note'));body.append(sec);
  try{const l=await rpc('oficina_fotos_pendentes',{p_empresa:company.id,p_manutencao:null});if(!l.length)sec.append(el('p','Nenhuma foto pendente.','ofi-ok'));for(const x of l)sec.append(fotoPeca(x));}catch(e){sec.append(el('p',e.message,'ofi-erro'));}
 }
 // ---------- Aprovações ----------
 function abaAprovacoes(){
  const sec=el('section',null,'panel'),fila=painel.manutencoes.filter(m=>m.orcamento_status==='aguardando_aprovacao');
  sec.append(el('h2','Orçamentos aguardando aprovação'),el('p',painel.analista?'Você é analista: abra o orçamento para aprovar ou reprovar.':'Somente o analista aprova. Você pode acompanhar a fila.','section-note'));
  if(!fila.length)sec.append(el('p','Nenhum orçamento aguardando aprovação.','ofi-ok'));
  for(const m of fila){const l=el('div',null,'ofi-linha'),b=btn('Abrir orçamento','btn btn-primary');b.onclick=()=>orcamento(m);l.append(el('strong','#'+m.numero+' · '+m.placa),el('span',(m.responsavel_nome||'Empresa')+' · '+m.motivo+' · '+brl(Number(m.custo_pecas)+Number(m.valor_servicos||0))),b);sec.append(l);}
  body.append(sec);
 }
 // ---------- Orçamento da manutenção ----------
 // ---------- Ordem de serviço: relatórios de entrada e saída do carro ----------
 async function vistoria(m,tipo){
  let lista=[];try{lista=await rpc('oficina_vistorias',{p_empresa:company.id,p_manutencao:m.id});}catch(e){alert(e.message);return;}
  dialog.replaceChildren();const form=el('form',null,'client-form'),head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),foot=el('div',null,'dialog-footer');
  head.append(el('h2',(tipo==='entrada'?'Relatório de entrada':'Relatório de saída')+' · '+rotuloManutencao(m)));
  const atual=lista.find(v=>v.tipo===tipo),ent=lista.find(v=>v.tipo==='entrada'),erro=el('p',null,'ofi-erro');
  const g=el('div',null,'form-grid'),kmI=campo(g,'KM',input());kmI.inputMode='numeric';
  kmI.value=atual?.km==null?'':String(atual.km);kmI.placeholder=tipo==='saida'&&ent?.km!=null?'Na entrada: '+Number(ent.km).toLocaleString('pt-BR'):(m.km?String(m.km):'KM do painel (opcional)');
  const comb=el('select');const o0=el('option','Escolha…');o0.value='';comb.append(o0);COMBUSTIVEL.forEach((l,i)=>{const op=el('option',l);op.value=String(i);comb.append(op);});comb.value=atual?String(atual.combustivel):'';campo(g,'Combustível',comb);
  const itensBox=el('fieldset',null,'ofi-checks');itensBox.append(el('legend','Itens conferidos'));const marc={};
  for(const [k,l] of Object.entries(ITENS_VISTORIA)){const c=input('checkbox');c.checked=Boolean(atual?atual.itens?.[k]:ent?.itens?.[k]);marc[k]=c;const lb=el('label');lb.style.flexDirection='row';lb.style.alignItems='center';lb.append(c,document.createTextNode(' '+l));itensBox.append(lb);}
  const av=el('textarea');av.value=atual?.avarias||'';av.placeholder=tipo==='entrada'?'Riscos, amassados, vidros, pneus… (em branco se não houver)':'Alguma avaria nova desde a entrada?';const lav=el('label');lav.append(el('span','Avarias'),av);
  const ob=el('textarea');ob.value=atual?.observacao||'';ob.placeholder=tipo==='saida'?'O que foi feito, recomendações ao locatário…':'';const lob=el('label');lob.append(el('span','Observação'),ob);
  const fotos=[...(atual?.fotos||[])],fl=el('p',null,'section-note'),fi=input('file');fi.accept='image/*';fi.multiple=true;fi.setAttribute('capture','environment');fi.hidden=true;fi.setAttribute('aria-label','Fotos do carro');
  const flab=el('label',null,'btn btn-quiet');flab.append(document.createTextNode('Tirar / enviar fotos do carro'),fi);
  const mostrar=()=>{fl.textContent=fotos.length?fotos.length+' foto(s) do carro enviada(s).':'Nenhuma foto ainda: envie pelo menos uma (frente, laterais, traseira, painel).';};mostrar();
  fi.onchange=async()=>{const arqs=[...fi.files];fi.value='';if(!arqs.length)return;flab.classList.add('is-loading');erro.textContent='';
   try{for(const arq of arqs){const ext=(arq.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'jpg',caminho=`${company.id}/vistoria/${m.id}/${tipo}-${crypto.randomUUID()}.${ext}`;
     const up=await db.storage.from('oficina-fotos').upload(caminho,arq,{contentType:arq.type||'image/jpeg',upsert:false});if(up.error)throw Error(up.error.message);fotos.push(caminho);mostrar();}}
   catch(e){erro.textContent='Não foi possível enviar a foto: '+e.message;}finally{flab.classList.remove('is-loading');}};
  box.append(g,itensBox,lav,lob,flab,fl,erro);
  const cancel=btn('Cancelar'),ok=el('button','Salvar relatório','btn btn-primary');ok.type='submit';cancel.onclick=()=>dialog.close();foot.append(cancel,ok);form.append(head,box,foot);dialog.append(form);
  form.onsubmit=async e=>{e.preventDefault();erro.textContent='';ok.disabled=true;
   try{await rpc('oficina_vistoria_salvar',{p_empresa:company.id,p_manutencao:m.id,p_tipo:tipo,p_dados:{km:kmI.value,combustivel:comb.value===''?null:Number(comb.value),itens:Object.fromEntries(Object.entries(marc).map(([k,c])=>[k,c.checked])),avarias:av.value,observacao:ob.value,fotos}});
    dialog.close();await recarregar((tipo==='entrada'?'Relatório de entrada':'Relatório de saída')+' da manutenção #'+m.numero+' salvo.');}
   catch(err){erro.textContent=err.message;}finally{ok.disabled=false;}};
  dialog.showModal();kmI.focus();
 }
 async function imprimirOS(m){
  const w=window.open('','_blank');if(!w)return alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.');w.document.write('<p style="font:14px Arial">Montando a ordem de serviço…</p>');
  try{const [o,vs]=await Promise.all([rpc('oficina_orcamento',{p_empresa:company.id,p_manutencao:m.id}),rpc('oficina_vistorias',{p_empresa:company.id,p_manutencao:m.id})]);
   const paths=vs.flatMap(v=>v.fotos||[]),urls={};
   if(paths.length){const r=await db.storage.from('oficina-fotos').createSignedUrls(paths,3600);if(!r.error)for(const x of r.data||[])if(x.signedUrl)urls[x.path]=x.signedUrl;}
   w.document.open();w.document.write(paginaOrdemServico({orcamento:o,vistorias:vs,urls}));w.document.close();w.focus();setTimeout(()=>w.print(),800);}
  catch(e){w.close();alert(e.message);}
 }
 async function orcamento(m){
  dialog.replaceChildren();const head=el('div',null,'dialog-header'),box=el('div',null,'dialog-body'),fechar=btn('Fechar');fechar.onclick=()=>dialog.close();head.append(el('h2','Orçamento · '+rotuloManutencao(m)),fechar);dialog.append(head,box);
  box.append(el('p','Carregando…'));if(!dialog.open)dialog.showModal();
  let o;try{o=await rpc('oficina_orcamento',{p_empresa:company.id,p_manutencao:m.id});}catch(e){box.replaceChildren(el('p',e.message,'ofi-erro'));return;}
  box.replaceChildren();const mm=o.manutencao,st=mm.orcamento_status||'em_elaboracao',editavel=['aberta','aguardando_pecas'].includes(mm.status)&&!mm.cobranca_debito_id&&['em_elaboracao','reprovado'].includes(st),erro=el('p',null,'ofi-erro');
  const sit=el('p');sit.append(document.createTextNode('Orçamento: '),badge(st));if(mm.orcamento_observacao)sit.append(document.createTextNode(' · '+mm.orcamento_observacao));box.append(sit);
  box.append(el('p','Motivo: '+mm.motivo));
  // Responsável: ocupante atual (sugerido) ou outro locatário recente; sem locatário, a empresa paga.
  const resp=el('div',null,'ofi-linha'),rs=el('select');rs.setAttribute('aria-label','Locatário responsável');campo(resp,'Locatário responsável',rs);
  const semR=el('option','Sem locatário (empresa paga tudo)');semR.value='';rs.append(semR);
  if(mm.responsavel_cliente_id){const o1=el('option',mm.responsavel_nome);o1.value=mm.responsavel_cliente_id;rs.append(o1);}rs.value=mm.responsavel_cliente_id||'';rs.disabled=!editavel;
  if(editavel&&mm.carro_id)rpc('oficina_responsaveis_sugeridos',{p_empresa:company.id,p_manutencao:m.id}).then(l=>{for(const c of l){if(c.cliente_id===mm.responsavel_cliente_id)continue;const op=el('option',c.nome+(c.atual?' (ocupante atual)':c.substituto?' (está no carro substituto)':''));op.value=c.cliente_id;rs.append(op);}}).catch(()=>{});
  if(editavel){const busca=input('search');busca.placeholder='Buscar outro locatário (nome ou CPF)';busca.setAttribute('aria-label','Buscar locatário');resp.append(busca);let t0;
   busca.oninput=()=>{clearTimeout(t0);t0=setTimeout(async()=>{if(busca.value.trim().length<3)return;try{const l=await rpc('oficina_buscar_locatarios',{p_empresa:company.id,p_texto:busca.value});
    for(const c of l){if([...rs.options].some(o=>o.value===c.cliente_id))continue;const op=el('option',c.nome+' · '+c.empresa);op.value=c.cliente_id;rs.append(op);}if(l.length)rs.focus();}catch(e){erro.textContent=e.message;}},300);};}
  rs.onchange=async()=>{try{await rpc('oficina_manutencao_responsavel',{p_empresa:company.id,p_manutencao:m.id,p_cliente:rs.value||null});await carregar();await orcamento(m);}catch(e){erro.textContent=e.message;}};
  box.append(resp);
  // Linhas: peças (saídas do estoque) e serviços.
  const t=el('table'),tb=el('tbody'),hr=el('tr');for(const h of ['Tipo','Descrição','Qtd','Unitário','Total','Corretiva / preventiva','Locatário',''])hr.append(el('th',h));const th=el('thead');th.append(hr);t.append(th,tb);
  const vista=montarOrcamento(o);
  o.linhas.forEach((l,k)=>{const v=vista.linhas[k],r=el('tr'),a=el('td');r.append(el('td',v.tipo),el('td',v.descricao+(l.motivo?' · '+l.motivo:'')),el('td',v.quantidade),el('td',v.unitario),el('td',v.total),el('td',v.natureza),el('td',v.locatario));
   if(l.tipo==='peca'&&!Number(l.custo_unitario))r.children[3].append(el('small',' ⚠ sem valor','ofi-sem-valor'));
   // Tipo de cada peça/serviço: dá para trocar enquanto o orçamento está em elaboração.
   if(editavel){const s=el('select');for(const [k,lb] of Object.entries(NATUREZA)){const op=el('option',lb);op.value=k;s.append(op);}s.value=l.natureza||mm.tipo;s.setAttribute('aria-label','Tipo de '+l.descricao);
    s.onchange=async()=>{erro.textContent='';s.disabled=true;try{await rpc('oficina_linha_natureza',{p_empresa:company.id,p_tipo:l.tipo,p_id:l.id,p_natureza:s.value});await carregar();await orcamento(m);}catch(e){erro.textContent=/oficina_linha_natureza|Could not find|schema cache/i.test(e.message)?'Aplique sql/oficina_orcamento_alquiler.sql no Supabase para trocar o tipo.':e.message;s.disabled=false;s.value=l.natureza||mm.tipo;}};
    r.children[5].replaceChildren(s);}
   if(editavel&&l.tipo==='peca'){const bv=btn('Valor'),bx=btn('Tirar');a.append(bv,bx);
    bv.onclick=()=>{const tr=el('tr'),td=el('td');td.colSpan=8;const f=el('div',null,'ofi-linha'),v=input();v.inputMode='decimal';v.value=Number(l.custo_unitario)?String(l.custo_unitario).replace('.',','):'';v.placeholder='0,00';
     const lv=campo(f,'Custo por unidade de '+l.descricao+' (R$)',v),cad=input('checkbox'),lc=el('label');lc.style.flexDirection='row';lc.style.alignItems='center';lc.append(cad,document.createTextNode(' Gravar também no custo da peça no estoque'));cad.checked=!Number(l.custo_unitario);cad.setAttribute('aria-label','Gravar também no custo da peça');
     const salvar=btn('Salvar valor','btn btn-primary'),buscar=btn('Buscar do cadastro'),cancelar=btn('Cancelar'),er=el('p',null,'ofi-erro');f.append(lc,salvar,buscar,cancelar);td.append(f,el('p','O valor é o custo da peça; na corretiva e na batida o orçamento soma a margem por cima.','section-note'),er);tr.append(td);r.after(tr);v.focus();
     const enviar=async custo=>{er.textContent='';salvar.disabled=buscar.disabled=true;try{await rpc('oficina_peca_preco',{p_empresa:company.id,p_movimento:l.id,p_custo:custo,p_atualizar_cadastro:custo!=null&&cad.checked});await carregar();await orcamento(m);}catch(e){er.textContent=e.message;}finally{salvar.disabled=buscar.disabled=false;}};
     salvar.onclick=()=>{const c=lerValor(v.value);if(!(c>=0)||v.value.trim()===''){er.textContent='Informe o valor da peça.';return;}enviar(c);};buscar.onclick=()=>enviar(null);cancelar.onclick=()=>tr.remove();};
    bx.onclick=()=>{const tr=el('tr'),td=el('td');td.colSpan=8;const f=el('div',null,'ofi-linha'),mot=input();mot.placeholder='Ex.: peça não foi usada, lançada errada';
     campo(f,'Por que '+l.descricao+' sai do orçamento',mot);const ok=btn('Tirar e devolver ao estoque','btn btn-danger'),cancelar=btn('Cancelar'),er=el('p',null,'ofi-erro');f.append(ok,cancelar);td.append(f,el('p','A peça volta para o estoque e sai do orçamento e das fotos pendentes. Fica registrado nos Movimentos.','section-note'),er);tr.append(td);r.after(tr);mot.focus();
     ok.onclick=async()=>{er.textContent='';if(mot.value.trim().length<3){er.textContent='Explique por que a peça sai do orçamento.';return;}ok.disabled=true;try{await rpc('oficina_peca_remover',{p_empresa:company.id,p_movimento:l.id,p_motivo:mot.value});await carregar();await orcamento(m);}catch(e){er.textContent=e.message;}finally{ok.disabled=false;}};cancelar.onclick=()=>tr.remove();};}
   if(editavel&&l.tipo==='servico'){const x=btn('Tirar');x.onclick=async()=>{if(!confirm('Tirar o serviço '+l.descricao+' do orçamento?'))return;try{await rpc('oficina_servico_remover',{p_empresa:company.id,p_id:l.id});await carregar();await orcamento(m);}catch(e){erro.textContent=e.message;}};a.append(x);}r.append(a);tb.append(r);});
  if(!o.linhas.length){const r=el('tr'),d=el('td','Nenhuma peça ou serviço lançado.');d.colSpan=8;r.append(d);tb.append(r);}
  const w=el('div',null,'table-scroll');w.append(t);box.append(w);
  const tot=el('div',null,'ofi-totais');for(const [k,v] of vista.totais){tot.append(el('span',k),el('strong',v));}box.append(tot,el('p',vista.regra+(vista.cobrado?' '+vista.cobrado:''),'section-note'));
  // Lançar serviço (do catálogo ou avulso, interno ou de fora).
  if(editavel){
   const f=el('div',null,'ofi-linha'),sv=el('select'),desc=campo(f,'Descrição do serviço',input()),cat=el('select'),nat=el('select'),q=campo(f,'Qtd',input()),val=campo(f,'Valor (R$)',input()),fora=input('checkbox'),forn=campo(f,'Quem fez (serviço de fora)',input()),add=btn('Lançar serviço','btn btn-primary');
   const o0=el('option','Serviço avulso');o0.value='';sv.append(o0);for(const s of painel.servicos){const op=el('option',s.descricao+' · '+brl(s.valor_padrao));op.value=s.id;sv.append(op);}f.prepend((()=>{const l=el('label');l.append(el('span','Catálogo'),sv);return l;})());
   for(const [k,l] of Object.entries(CATEGORIAS)){const op=el('option',l);op.value=k;cat.append(op);}campo(f,'Categoria',cat);
   for(const [k,l] of [['',`Igual à manutenção (${NATUREZA[mm.tipo]})`],['corretiva','Corretiva'],['preventiva','Preventiva'],['avaria','Batida / avaria (100% locatário)']]){const op=el('option',l);op.value=k;nat.append(op);}campo(f,'Corretiva / preventiva',nat);
   const lf=el('label');lf.style.flexDirection='row';lf.style.alignItems='center';lf.append(fora,document.createTextNode(' Serviço de fora'));f.append(lf);q.value='1';q.inputMode=val.inputMode='decimal';forn.parentElement.hidden=true;fora.onchange=()=>{forn.parentElement.hidden=!fora.checked;};
   sv.onchange=()=>{const s=painel.servicos.find(x=>x.id===sv.value);if(s){desc.value=s.descricao;cat.value=s.categoria;val.value=String(s.valor_padrao).replace('.',',');}};
   f.append(add);const op=()=>crypto.randomUUID();let operacao=op();
   add.onclick=async()=>{erro.textContent='';const v=lerValor(val.value),qq=lerQuantidade(q.value);if(v==null||Number.isNaN(v)||Number.isNaN(qq))return erro.textContent='Confira quantidade e valor.';
    try{await rpc('oficina_servico_lancar',{p_empresa:company.id,p_operacao:operacao,p_manutencao:m.id,p_dados:{servico_id:sv.value||null,descricao:desc.value,categoria:cat.value,natureza:nat.value||null,quantidade:qq,valor_unitario:v,externo:fora.checked,fornecedor:forn.value}});operacao=op();await carregar();await orcamento(m);}catch(e){erro.textContent=e.message;}};
   box.append(el('h3','Lançar serviço'),f);
   const lp=el('a','Lançar peça do estoque','btn btn-quiet');lp.href='oficina.html?secao=saida&manutencao='+m.id;box.append(lp);
  }
  // Fotos das peças desta manutenção.
  const fotos=el('div');box.append(el('h3','Fotos das peças'),fotos);
  Promise.all([rpc('oficina_fotos_pendentes',{p_empresa:company.id,p_manutencao:m.id}),rpc('oficina_fotos_lista',{p_empresa:company.id,p_manutencao:m.id})]).then(([pend,lista])=>{
   for(const x of pend)fotos.append(fotoPeca(x,()=>orcamento(m)));
   for(const f of lista){const l=el('div',null,'ofi-foto');l.append(el('span',`${f.produto} · ${f.tipo==='nova'?'peça nova funcionando':'peça antiga'}`));
    if(f.arquivo_path){const v=btn('Ver foto');v.onclick=async()=>{const r=await db.storage.from('oficina-fotos').createSignedUrl(f.arquivo_path,300);if(r.error)return alert(r.error.message);window.open(r.data.signedUrl,'_blank','noopener');};l.append(v);}else l.append(el('span','Sem peça antiga: '+f.justificativa));fotos.append(l);}
   if(!pend.length&&!lista.length)fotos.append(el('p','Nenhuma peça retirada.','section-note'));}).catch(e=>fotos.append(el('p',e.message,'ofi-erro')));
  box.append(erro);
  const acoes=el('div',null,'dialog-footer'),pdf=btn('Gerar orçamento (papel timbrado)','btn btn-primary');
  pdf.onclick=async()=>{erro.textContent='';pdf.disabled=true;try{const {gerarOrcamentoPdf}=await import('./orcamento-pdf.mjs?v=20261128b');const bytes=await gerarOrcamentoPdf({db,company,orcamento:o});
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=el('a');a.href=url;a.download=`orcamento-${String(mm.numero).padStart(5,'0')}-${mm.placa}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
   catch(e){erro.textContent='Não foi possível gerar o PDF: '+e.message;}finally{pdf.disabled=false;}};
  acoes.append(pdf);
  const acao=async(nome,args,msg)=>{erro.textContent='';try{await rpc(nome,{p_empresa:company.id,p_manutencao:m.id,...args});await carregar();await orcamento(m);status.textContent=msg;}catch(e){erro.textContent=e.message;}};
  if(editavel){const env=btn('Enviar para aprovação');env.onclick=()=>acao('oficina_orcamento_enviar',{},'Orçamento #'+mm.numero+' enviado para aprovação do analista.');acoes.append(env);}
  if(st==='aguardando_aprovacao'&&painel.analista){const ap=btn('Aprovar orçamento','btn btn-primary'),rp=btn('Reprovar');
   ap.onclick=()=>{if(confirm('Aprovar o orçamento #'+mm.numero+' de '+brl(o.totais.geral)+'?'))acao('oficina_orcamento_decidir',{p_aprovar:true,p_observacao:null},'Orçamento #'+mm.numero+' aprovado.');};
   rp.onclick=()=>{const mot=prompt('Por que o orçamento foi reprovado?');if(mot)acao('oficina_orcamento_decidir',{p_aprovar:false,p_observacao:mot},'Orçamento #'+mm.numero+' reprovado.');};acoes.append(ap,rp);}
  else if(st==='aguardando_aprovacao')acoes.append(el('span','Aguardando o analista aprovar.','section-note'));
  if(['aguardando_aprovacao','aprovado'].includes(st)&&painel.analista&&!mm.cobranca_debito_id){const re=btn('Reabrir orçamento');re.onclick=()=>{const mot=prompt('Por que reabrir o orçamento?');if(mot)acao('oficina_orcamento_reabrir',{p_motivo:mot},'Orçamento #'+mm.numero+' reaberto.');};acoes.append(re);}
  // Cobrança: parte do locatário parcelada na diária, depois da aprovação.
  if(st==='aprovado'&&o.responsavel&&!mm.cobranca_debito_id&&Number(o.totais.locatario)>0){
   const c=el('div',null,'ofi-linha'),par=campo(c,'Parcelas diárias',input('number')),pri=campo(c,'Primeira parcela',input('date')),prev=el('span',null,'section-note'),cob=btn('Lançar na locação do locatário','btn btn-primary');
   par.min='1';par.max='120';par.value=String(Math.min(120,Math.max(1,Math.ceil(Number(o.totais.locatario)/50))));pri.value=new Date(Date.now()-4*3600000).toISOString().slice(0,10);
   const calc=()=>{const n=Math.max(1,Math.min(120,Number(par.value)||1));prev.textContent=`${n} × ${brl(Number(o.totais.locatario)/n)} por dia, junto com a diária.`;};par.oninput=calc;calc();c.append(prev,cob);
   cob.onclick=()=>{const n=Number(par.value);if(!confirm(`Lançar ${brl(o.totais.locatario)} para ${o.responsavel.nome} em ${n} parcela(s) diária(s) a partir de ${pri.value.split('-').reverse().join('/')}? Depois disso a manutenção não aceita novas peças nem serviços.`))return;
    acao('oficina_cobrar_locatario',{p_parcelas:n,p_primeiro:pri.value},`${brl(o.totais.locatario)} lançados na locação de ${o.responsavel.nome} em ${n} parcela(s) diária(s).`);};
   box.append(el('h3','Cobrança do locatário'),c);}
  dialog.append(acoes);
 }

 // Depois de salvar algo, a tela é redesenhada com os dados novos sem perder busca, filtros e a posição da rolagem.
 function rolagem(){for(let n=body;n;n=n.parentElement){const o=getComputedStyle(n).overflowY;if(n.scrollHeight>n.clientHeight&&/(auto|scroll)/.test(o))return n;}return document.scrollingElement||document.documentElement;}
 function salvarTela(){const campos=[...body.querySelectorAll('input,select,textarea')].map((e,i)=>({i,tag:e.tagName,tipo:e.type,id:e.getAttribute('aria-label')||e.placeholder||'',valor:e.value,marcado:e.checked})).filter(c=>c.tipo!=='file'&&c.tipo!=='hidden');const sc=rolagem();return {secao,campos,sc,topo:sc.scrollTop};}
 function restaurarTela(t){if(!t||t.secao!==secao)return;const atuais=[...body.querySelectorAll('input,select,textarea')];
  for(const c of t.campos){const e=atuais[c.i];if(!e||e.tagName!==c.tag||e.type!==c.tipo||(e.getAttribute('aria-label')||e.placeholder||'')!==c.id)continue;
   if(c.tipo==='checkbox'||c.tipo==='radio'){if(e.checked!==c.marcado){e.checked=c.marcado;e.dispatchEvent(new Event('change',{bubbles:true}));}}
   else if(e.value!==c.valor&&(e.tagName!=='SELECT'||[...e.options].some(op=>op.value===c.valor))){e.value=c.valor;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));}}
  const voltar=()=>{t.sc.scrollTop=t.topo;};voltar();requestAnimationFrame(voltar);setTimeout(voltar,350);}
 async function recarregar(msg){const t=salvarTela();await carregar();body.replaceChildren();desenhar();restaurarTela(t);status.textContent=msg||'';}
 function desenhar(){({manutencoes:abaManutencoes,entrada:abaEntrada,notas:abaNotas,saida:abaSaida,fotos:abaFotos,estoque:abaEstoque,aprovacoes:abaAprovacoes,financeiro:abaFinanceiro,movimentos:abaMovimentos,servicos:abaServicos}[secao]||abaManutencoes)();}
 desenhar();
}
