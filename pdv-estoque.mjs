import {lerQuantidade,lerValor,normalizarCodigo,adicionarItem,conferirItens,itensSaida,fmtQtd,rotuloManutencao,converterEntrada,SITUACOES_SAIDA} from './oficina-core.mjs?v=20261118';
const brl=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
import {paginaEtiquetas,FORMATOS} from './etiqueta-core.mjs?v=20261118b';
import {imprimirSerial} from './impressora-serial.mjs?v=20261118';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,cls='pdv-btn')=>{const b=el('button',text,cls);b.type='button';return b;};
const placaLimpa=t=>String(t||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const pareceplaca=t=>/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placaLimpa(t));
export const CATEGORIAS_ITEM={pecas:'Peças',uso_consumo:'Uso e consumo',revenda:'Revenda',obra:'Construção em andamento',limpeza:'Material de limpeza',ferramenta:'Ferramenta',outros:'Outros'};
export const DESTINOS=SITUACOES_SAIDA;
const PEDIDO_DESTINO={uso_consumo:'Setor ou uso (ex.: limpeza da oficina)',obra:'Qual obra ou construção',revenda:'Para quem foi vendido',perda:'O que aconteceu (ex.: vazou, quebrou)',devolucao:'Fornecedor e motivo da devolução'};

// Bipe de caixa: curto e agudo quando deu certo, grave quando deu errado.
let audio;function bipe(ok=true){try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=ok?1400:220;g.gain.value=.08;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+(ok?.08:.35));}catch{}}

// Balcão do estoque: tela única de retirada e entrada de peças com o leitor de código de barras.
export async function mountPdv({db,company,host}){
 const rpc=async(name,args)=>{const r=await db.rpc(name,args);if(r.error)throw Error(r.error.message);return r.data;};
 host.replaceChildren();const app=el('div',null,'pdv');app.id='pdv';host.append(app);
 let painel={produtos:[],manutencoes:[]},modo='retirada',destino='manutencao',itens=[],carro=null,operacao=crypto.randomUUID(),ocupado=false;
 const destinoDesc=el('input');destinoDesc.setAttribute('aria-label','Para onde vai');
 const abertas=()=>painel.manutencoes.filter(m=>['aberta','aguardando_pecas'].includes(m.status)&&!m.cobrada_em&&['em_elaboracao','reprovado',undefined,null].includes(m.orcamento_status));

 // ---------- Estrutura ----------
 const topo=el('div',null,'pdv-topo'),modos=el('div',null,'pdv-modos'),bRet=btn('RETIRADA  F2','pdv-modo'),bEnt=btn('ENTRADA  F3','pdv-modo');modos.append(bRet,bEnt);
 const relogio=el('span',null,'pdv-relogio'),tela=btn('Tela cheia','pdv-btn pdv-leve');tela.onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();
 topo.append(modos,relogio,tela);
 const corpo=el('div',null,'pdv-corpo'),esq=el('section',null,'pdv-esq'),dir=el('aside',null,'pdv-dir');corpo.append(esq,dir);
 const scan=el('input');scan.className='pdv-scan';scan.type='text';scan.autocomplete='off';scan.setAttribute('aria-label','Leitor de código de barras');
 const aviso=el('p',null,'pdv-aviso');aviso.setAttribute('role','status');aviso.setAttribute('aria-live','polite');
 const lista=el('div',null,'pdv-lista');esq.append(scan,aviso,lista);
 const overlay=el('div',null,'pdv-overlay');overlay.hidden=true;
 app.append(topo,corpo,overlay);
 setInterval(()=>{relogio.textContent=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Manaus'});},1000);
 const avisar=(t,ok=true)=>{aviso.textContent=t;aviso.className='pdv-aviso '+(ok?'ok':'erro');bipe(ok);};
 // O leitor precisa do foco: volta para ele sempre que não houver outra coisa sendo digitada.
 const focar=()=>{if(overlay.hidden&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))scan.focus();};
 document.addEventListener('click',()=>setTimeout(focar,0));setInterval(focar,1500);

 async function carregar(){painel=await rpc('oficina_painel',{p_empresa:company.id});}

 // ---------- Lista de itens ----------
 function desenharLista(){
  lista.replaceChildren();
  if(!itens.length){lista.append(el('p',modo==='retirada'?(destino!=='manutencao'?'Passe o leitor nos itens que vão para '+DESTINOS[destino].toLowerCase()+'.':carro?'Passe o leitor nas peças que vão para '+carro.placa+'.':'Primeiro escolha o carro ao lado (ou digite a placa e aperte Enter).'):'Passe o leitor nos itens que estão chegando.','pdv-vazio'));}
  for(const i of itens){
   const row=el('div',null,'pdv-item'),info=el('div',null,'pdv-info');info.append(el('strong',i.produto.descricao+(i.produto.marca?' · '+i.produto.marca:'')),el('small',(i.produto.codigo_barras||i.produto.codigo_interno||'')+' · em estoque: '+fmtQtd(i.produto.saldo)+' '+i.produto.unidade));
   const menos=btn('−','pdv-qtd'),q=el('input'),mais=btn('+','pdv-qtd');q.inputMode='decimal';q.value=fmtQtd(i.quantidade);q.setAttribute('aria-label','Quantidade de '+i.produto.descricao);
   q.oninput=()=>{i.quantidade=lerQuantidade(q.value);resumo();};menos.onclick=()=>{i.quantidade=Math.max(1,(i.quantidade||1)-1);desenharLista();};mais.onclick=()=>{i.quantidade=(i.quantidade||0)+1;desenharLista();};
   const qtd=el('div',null,'pdv-qtdbox');qtd.append(menos,q,mais);
   row.append(info,qtd);
   if(modo==='entrada'){
    const fator=Number(i.produto.qtd_embalagem)||1,emb=i.produto.embalagem||'CX',calc=el('small',null,'pdv-calc');
    if(fator>1){const u=el('select');u.className='pdv-un';u.setAttribute('aria-label','Entrada por · '+i.produto.descricao);for(const [v,l] of [['un',i.produto.unidade],['cx',`${emb} c/ ${fmtQtd(fator)}`]]){const o=el('option',l);o.value=v;u.append(o);}u.value=i.porEmbalagem?'cx':'un';u.onchange=()=>{i.porEmbalagem=u.value==='cx';desenharLista();};qtd.append(u);}
    const cst=el('input');cst.className='pdv-lote';cst.inputMode='decimal';cst.placeholder=`Custo R$ por ${i.porEmbalagem?emb:i.produto.unidade}`;cst.value=i.custoTexto||'';cst.setAttribute('aria-label','Custo de '+i.produto.descricao);
    const conta=()=>{const r=converterEntrada({quantidade:i.quantidade,porEmbalagem:i.porEmbalagem,fator,custo:lerValor(i.custoTexto)});calc.textContent=`= ${fmtQtd(r.quantidade)} ${i.produto.unidade}`+(r.custo_unitario!=null?` · ${brl(r.custo_unitario)} cada · total ${brl(r.custo_unitario*r.quantidade)}`:'');};
    cst.oninput=()=>{i.custoTexto=cst.value;conta();};row.append(cst,calc);conta();q.addEventListener('input',conta);}
   if(modo==='retirada'&&destino==='revenda'){const pv=el('input'),tot=el('small',null,'pdv-calc');pv.className='pdv-lote';pv.inputMode='decimal';pv.placeholder='Preço R$ por '+i.produto.unidade;pv.setAttribute('aria-label','Preço de venda de '+i.produto.descricao);
    if(i.precoTexto==null&&i.produto.preco_venda!=null)i.precoTexto=String(i.produto.preco_venda).replace('.',',');pv.value=i.precoTexto||'';
    const conta=()=>{const v=lerValor(i.precoTexto);tot.textContent=v==null||Number.isNaN(v)?'Informe o preço':`total ${brl(v*(Number(i.quantidade)||0))}`;};pv.oninput=()=>{i.precoTexto=pv.value;conta();};q.addEventListener('input',conta);row.append(pv,tot);conta();}
   if(modo==='entrada'){const lt=el('input');lt.className='pdv-lote';lt.placeholder=i.produto.controla_lote?'Lote (obrigatório)':'Lote';lt.value=i.lote||'';lt.setAttribute('aria-label','Lote de '+i.produto.descricao);lt.oninput=()=>{i.lote=lt.value;};row.append(lt);
    const mc=el('input');mc.className='pdv-lote';mc.placeholder='Marca';if(i.marca==null)i.marca=i.produto.marca||'';mc.value=i.marca;mc.setAttribute('aria-label','Marca de '+i.produto.descricao);mc.oninput=()=>{i.marca=mc.value;};row.append(mc);
    if(i.produto.ultimo_custo!=null)row.append(el('small',`Última compra: ${brl(i.produto.ultimo_custo)} por ${i.produto.unidade}${i.produto.ultimo_fornecedor?' · '+i.produto.ultimo_fornecedor:''}`,'pdv-calc'));}
   if(modo==='retirada'&&destino==='manutencao'){const nat=btn(i.natureza==='preventiva'?'PREVENTIVA':i.natureza==='corretiva'?'CORRETIVA':(carro?.tipo==='preventiva'?'PREVENTIVA':'CORRETIVA'),'pdv-nat');nat.setAttribute('aria-label','Corretiva ou preventiva · '+i.produto.descricao);
    nat.onclick=()=>{const atual=i.natureza||carro?.tipo||'corretiva';i.natureza=atual==='corretiva'?'preventiva':'corretiva';desenharLista();};row.append(nat);
    }
   if(modo==='retirada'&&i.quantidade>Number(i.produto.saldo))row.classList.add('pdv-falta');
   const x=btn('✕','pdv-tirar');x.setAttribute('aria-label','Tirar '+i.produto.descricao);x.onclick=()=>{itens.splice(itens.indexOf(i),1);desenharLista();};row.append(x);
   lista.append(row);}
  resumo();
 }

 // ---------- Painel da direita ----------
 const motivo=el('input'),nf=el('input'),forn=el('input'),finalizar=btn('FINALIZAR  F9','pdv-finalizar'),total=el('p',null,'pdv-total'),limpar=btn('Cancelar  Esc','pdv-btn pdv-leve');
 motivo.placeholder='Motivo da retirada (ex.: sensor com defeito)';motivo.setAttribute('aria-label','Motivo da retirada');nf.placeholder='Nota fiscal (opcional)';nf.setAttribute('aria-label','Nota fiscal');forn.placeholder='Fornecedor (opcional)';forn.setAttribute('aria-label','Fornecedor');
 function resumo(){const n=itens.reduce((s,i)=>s+(Number(i.quantidade)||0),0);total.textContent=`${itens.length} peça(s) · ${fmtQtd(n)} unidade(s)`;finalizar.disabled=ocupado||!itens.length||(modo==='retirada'&&destino==='manutencao'&&!carro);}
 function desenharDireita(){
  dir.replaceChildren();
  if(modo==='retirada'){
   const ds=el('div',null,'pdv-destinos');for(const [k,l] of Object.entries(DESTINOS)){const b=btn(l,'pdv-btn pdv-leve');if(k===destino)b.classList.add('ativo');b.onclick=()=>{destino=k;carro=null;desenharDireita();desenharLista();};ds.append(b);}
   dir.append(el('h2','Situação da saída'),ds);
   if(destino!=='manutencao'){destinoDesc.placeholder=PEDIDO_DESTINO[destino];dir.append(destinoDesc,el('p',destino==='revenda'?'Sai pelo preço de venda cadastrado no item.':'Fica registrado no relatório de movimentos com essa descrição.','pdv-vazio'));dir.append(total,finalizar,limpar);resumo();return;}
   dir.append(el('h2','Para qual carro?'));
   if(carro){const c=el('div',null,'pdv-carro sel');c.append(el('strong',carro.placa),el('span',rotuloManutencao(carro)),el('small',(carro.responsavel_nome?'Locatário: '+carro.responsavel_nome:'Sem locatário')+' · '+carro.motivo));const tr=btn('Trocar carro','pdv-btn pdv-leve');tr.onclick=()=>{carro=null;desenharDireita();desenharLista();};dir.append(c,tr);}
   else{const ls=abertas(),rap=btn('+ Atendimento rápido (outro carro)','pdv-btn');rap.onclick=()=>atendimento('');dir.append(rap);if(!ls.length)dir.append(el('p','Nenhum carro na oficina agora. Digite a placa no leitor ou use o atendimento rápido.','pdv-vazio'));
    for(const m of ls){const c=btn('','pdv-carro');c.append(el('strong',m.placa),el('span',(m.veiculo||'')+' · '+(m.tipo==='preventiva'?'Preventiva':'Corretiva')),el('small',m.motivo));c.onclick=()=>escolherCarro(m);dir.append(c);}}
   dir.append(motivo);
  }else{
   dir.append(el('h2','Entrada de peças'),nf,forn);const sem=btn('Peça sem código de barras','pdv-btn');sem.onclick=()=>cadastro('');dir.append(sem);
  }
  dir.append(total,finalizar,limpar);resumo();
 }
 function escolherCarro(m){carro=m;avisar('Carro '+m.placa+' escolhido. Agora passe o leitor nas peças.');desenharDireita();desenharLista();scan.focus();}

 function trocarModo(novo){if(ocupado)return;modo=novo;destino='manutencao';destinoDesc.value='';itens=[];carro=null;operacao=crypto.randomUUID();motivo.value=nf.value=forn.value='';bRet.classList.toggle('ativo',modo==='retirada');bEnt.classList.toggle('ativo',modo==='entrada');app.dataset.modo=modo;
  scan.placeholder=modo==='retirada'?'RETIRADA · passe o leitor (ou digite a placa do carro)':'ENTRADA · passe o leitor na peça';aviso.textContent='';desenharDireita();desenharLista();scan.focus();}
 bRet.onclick=()=>trocarModo('retirada');bEnt.onclick=()=>trocarModo('entrada');

 // ---------- Leitura ----------
 scan.addEventListener('keydown',async e=>{if(e.key!=='Enter')return;e.preventDefault();const codigo=normalizarCodigo(scan.value);scan.value='';if(!codigo)return;
  if(modo==='retirada'&&destino==='manutencao'&&!carro){const m=abertas().find(x=>placaLimpa(x.placa)===placaLimpa(codigo));if(m)return escolherCarro(m);if(pareceplaca(codigo))return atendimento(placaLimpa(codigo));return avisar('Escolha o carro antes de ler as peças.',false);}
  try{const p=await rpc('oficina_produto_buscar',{p_empresa:company.id,p_codigo:codigo});
   if(!p){if(modo==='entrada')return cadastro(codigo);return avisar('Peça '+codigo+' não cadastrada. Dê entrada nela primeiro.',false);}
   if(modo==='retirada'&&Number(p.saldo)<=0)return avisar(p.descricao+' está SEM ESTOQUE.',false);
   adicionarItem(itens,p);desenharLista();const i=itens.find(x=>x.produto.id===p.id);
   if(modo==='retirada'&&i.quantidade>Number(p.saldo))avisar(`${p.descricao}: só tem ${fmtQtd(p.saldo)} em estoque.`,false);else avisar(`${p.descricao} · ${fmtQtd(i.quantidade)} ${p.unidade}`);}
  catch(err){avisar(err.message,false);}});

 // ---------- Cadastro rápido (entrada) ----------
 function cadastro(codigo){
  overlay.replaceChildren();overlay.hidden=false;const box=el('form',null,'pdv-modal');
  const campo=(label,elx)=>{const l=el('label',null,'pdv-campo');l.append(el('span',label),elx);return l;};
  const d=el('input'),cb=el('input'),cat=el('select'),u=el('input'),emb=el('input'),qe=el('input'),loc=el('input'),min=el('input'),marca=el('input'),lote=el('input');lote.type='checkbox';marca.placeholder='Ex.: Bosch, Mahle, Original VW';
  d.required=true;d.placeholder='Ex.: Sensor de combustível Tera 1.0';cb.inputMode='numeric';cb.value=/^\d{6,14}$/.test(codigo||'')?codigo:'';cb.placeholder='Passe o leitor ou deixe em branco para gerar';u.value='UN';emb.placeholder='Ex.: CX, PCT (opcional)';qe.value='1';qe.inputMode='decimal';min.value='0';min.inputMode='decimal';loc.placeholder='Ex.: Prateleira A1';
  for(const [k,l] of Object.entries(CATEGORIAS_ITEM)){const o=el('option',l);o.value=k;cat.append(o);}
  const linha=el('div',null,'pdv-linha2');linha.append(campo('Unidade',u),campo('Vem em (embalagem)',emb),campo('Unidades por embalagem',qe));
  const linha2=el('div',null,'pdv-linha2');linha2.append(campo('Estoque mínimo',min),campo('Local',loc));
  const lotel=el('label',null,'pdv-check');lotel.append(lote,document.createTextNode(' Controla lote (pede o lote em toda entrada)'));
  const ok=el('button','Cadastrar e adicionar  Enter','pdv-finalizar');ok.type='submit';const cancel=btn('Cancelar  Esc','pdv-btn pdv-leve');cancel.onclick=fechar;
  box.append(el('h2',codigo?'Item novo: '+codigo:'Item sem código de barras'),el('p',codigo?'Este código nunca foi cadastrado. Identifique o item para dar entrada.':'O sistema gera o código de barras e imprime a etiqueta.'),
   campo('Identificação do item',d),campo('Código de barras',cb),campo('Marca',marca),campo('Categoria',cat),linha,linha2,lotel,ok,cancel);overlay.append(box);setTimeout(()=>d.focus(),0);
  box.onsubmit=async e=>{e.preventDefault();ok.disabled=true;
   const barras=cb.value.trim();if(barras&&!/^\d{6,14}$/.test(barras)){avisar('O código de barras tem só números (de 6 a 14 dígitos).',false);ok.disabled=false;return;}
   const outra=barras&&painel.produtos.find(x=>x.codigo_barras===barras);if(outra){avisar('O código '+barras+' já é de '+outra.descricao+'.',false);ok.disabled=false;return;}
   try{const numerico=/^\d{6,14}$/.test(codigo);let p=await rpc('oficina_produto_salvar',{p_empresa:company.id,p_id:null,p_dados:{descricao:d.value,categoria:cat.value,codigo_barras:barras||null,codigo_interno:codigo&&!numerico?codigo:null,unidade:u.value,embalagem:emb.value,qtd_embalagem:lerQuantidade(qe.value)||1,estoque_minimo:lerQuantidade(min.value)||0,localizacao:loc.value,marca:marca.value,controla_lote:lote.checked}});
    const gerado=!barras&&!codigo;if(gerado)p=await rpc('oficina_produto_gerar_codigo',{p_empresa:company.id,p_produto:p.id});
    painel.produtos.push(p);adicionarItem(itens,p);fechar();desenharLista();avisar(p.descricao+' cadastrado'+(p.codigo_barras?' com o código '+p.codigo_barras:'')+'.');if(gerado)imprimir([{descricao:p.descricao,codigo:p.codigo_barras,local:p.localizacao,copias:1}]);}
   catch(err){avisar(err.message,false);ok.disabled=false;}};
 }
 // ---------- Atendimento rápido ----------
 // Abre a ordem de serviço na hora para qualquer placa, sem tirar o carro da locação (ex.: o locatário só veio trocar uma lâmpada).
 let veiculos=null;
 async function atendimento(placaInicial){
  overlay.replaceChildren();overlay.hidden=false;const box=el('form',null,'pdv-modal');
  const campo=(label,elx)=>{const l=el('label',null,'pdv-campo');l.append(el('span',label),elx);return l;};
  const placa=el('input'),info=el('p',null,'pdv-vazio'),motivoOs=el('textarea'),km=el('input'),cliente=el('input'),modelo=el('input');
  placa.value=placaInicial||'';placa.placeholder='Ex.: QZZ5H15';motivoOs.placeholder='O que vai ser feito? Ex.: troca de lâmpada do farol, troca de óleo';motivoOs.rows=2;km.inputMode='numeric';km.placeholder='KM atual (opcional)';
  const fora=el('div',null,'pdv-linha2');fora.append(campo('Cliente (carro de fora)',cliente),campo('Modelo e ano',modelo));fora.hidden=true;
  let tipo='corretiva';const tipos=el('div',null,'pdv-destinos');
  const desenharTipos=()=>{tipos.replaceChildren();for(const [k,l] of [['corretiva','CORRETIVA · consertar defeito'],['preventiva','PREVENTIVA · revisão, troca programada']]){const b=btn(l,'pdv-btn pdv-leve');if(k===tipo)b.classList.add('ativo');b.onclick=()=>{tipo=k;desenharTipos();};tipos.append(b);}};desenharTipos();
  const ok=el('button','Abrir ordem de serviço  Enter','pdv-finalizar');ok.type='submit';const cancel=btn('Cancelar  Esc','pdv-btn pdv-leve');cancel.onclick=fechar;
  box.append(el('h2','Atendimento rápido'),el('p','Abre a ordem de serviço sem tirar o carro da locação. Depois é só ler as peças.'),campo('Placa do carro',placa),info,fora,tipos,campo('O que vai ser feito',motivoOs),campo('KM',km),ok,cancel);overlay.append(box);
  if(veiculos==null){info.textContent='Procurando os carros…';try{veiculos=await rpc('oficina_veiculos',{p_empresa:company.id});}catch(err){veiculos=[];info.textContent=err.message;}}
  let achado=null;const achar=()=>{const pl=placaLimpa(placa.value);achado=veiculos.find(v=>placaLimpa(v.placa)===pl)||null;fora.hidden=Boolean(achado)||pl.length<7;
   info.textContent=achado?`${achado.veiculo||''} · ${achado.empresa||''}${achado.ultimo_km?' · último KM '+Number(achado.ultimo_km).toLocaleString('pt-BR'):''}`:pl.length>=7?'Carro de fora da frota: informe o cliente e o modelo.':'';
   if(achado?.ultimo_km&&!km.value)km.placeholder='Último KM: '+Number(achado.ultimo_km).toLocaleString('pt-BR');};
  placa.oninput=achar;achar();setTimeout(()=>(placaInicial?motivoOs:placa).focus(),0);
  const operacaoOs=crypto.randomUUID();
  box.onsubmit=async e=>{e.preventDefault();const pl=placaLimpa(placa.value);
   if(pl.length<7)return avisar('Informe a placa do carro.',false);
   if(motivoOs.value.trim().length<3)return avisar('Informe o que vai ser feito no carro.',false);
   if(!achado&&cliente.value.trim().length<2)return avisar('Carro de fora: informe o cliente.',false);
   const kmN=km.value.trim()?Number(km.value.replace(/\D/g,'')):null;
   ok.disabled=true;
   try{const m=await rpc('oficina_manutencao_abrir',{p_empresa:company.id,p_operacao:operacaoOs,p_dados:{carro_id:achado?.carro_id||null,placa:pl,veiculo:achado?null:modelo.value.trim(),cliente_externo:achado?null:cliente.value.trim(),
     tipo,motivo:motivoOs.value.trim(),km:kmN,observacoes:'Atendimento rápido pelo balcão: o carro não saiu da locação.'}});
    await carregar();fechar();const aberta=painel.manutencoes.find(x=>x.id===m.id)||m;if(!motivo.value.trim())motivo.value=motivoOs.value.trim();escolherCarro(aberta);avisar('Ordem de serviço #'+m.numero+' aberta para '+m.placa+'. Agora passe o leitor nas peças.');}
   catch(err){avisar(err.message,false);ok.disabled=false;}};
 }
 function fechar(){overlay.hidden=true;overlay.replaceChildren();scan.focus();}
 async function imprimir(etqs){const fmt=(()=>{try{return localStorage.getItem('oficina-etiqueta-formato')||'bobina80';}catch{return 'bobina80';}})();
  if(fmt==='usb'){try{await imprimirSerial(etqs);avisar('Etiqueta enviada para a impressora.');}catch(err){avisar('Etiqueta não impressa: '+err.message+' Conecte a impressora em Mecânica → Serviços e ajustes.',false);}return;}
  const w=window.open('','_blank');if(!w)return avisar('O navegador bloqueou a impressão da etiqueta. Permita pop-ups.',false);
  w.document.open();w.document.write(paginaEtiquetas(etqs,{empresa:company.nome_fantasia||'',formato:FORMATOS[fmt]?fmt:'bobina80'}));w.document.close();w.focus();setTimeout(()=>w.print(),400);}

 // ---------- Funcionário pelo CPF ----------
 // Toda entrada e saída do balcão fica no nome de quem fez: o funcionário digita o CPF ao finalizar.
 function pedirCpf(){return new Promise(resolve=>{
  overlay.replaceChildren();overlay.hidden=false;const box=el('form',null,'pdv-modal pdv-cpf'),cpf=el('input'),msg=el('p',null,'pdv-aviso');
  cpf.inputMode='numeric';cpf.autocomplete='off';cpf.placeholder='000.000.000-00';cpf.setAttribute('aria-label','CPF do funcionário');
  const ok=el('button','Confirmar  Enter','pdv-finalizar');ok.type='submit';const cancel=btn('Cancelar  Esc','pdv-btn pdv-leve');
  cancel.onclick=()=>{overlay.hidden=true;overlay.replaceChildren();resolve(null);};
  cpf.oninput=()=>{const d=cpf.value.replace(/\D/g,'').slice(0,11);cpf.value=d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');};
  box.append(el('h2','Quem está fazendo esta '+(modo==='entrada'?'entrada':'saída')+'?'),el('p','Digite o seu CPF para registrar a operação no seu nome.'),cpf,msg,ok,cancel);overlay.append(box);setTimeout(()=>cpf.focus(),0);
  box.onsubmit=async e=>{e.preventDefault();ok.disabled=true;msg.textContent='';
   try{const o=await rpc('oficina_operador_identificar',{p_empresa:company.id,p_cpf:cpf.value});overlay.hidden=true;overlay.replaceChildren();resolve(o);}
   catch(err){msg.textContent=err.message;msg.className='pdv-aviso erro';bipe(false);ok.disabled=false;cpf.select();}};
 });}

 // ---------- Finalizar ----------
 async function concluir(){
  if(ocupado||finalizar.disabled)return;
  const erros=conferirItens(itens,{saida:modo==='retirada'});
  if(modo==='retirada'&&destino==='manutencao'&&motivo.value.trim().length<3)erros.push('Informe o motivo da retirada.');
  if(modo==='retirada'&&destino!=='manutencao'&&destinoDesc.value.trim().length<3)erros.push(PEDIDO_DESTINO[destino]+'.');
  if(modo==='entrada')for(const i of itens){if(i.produto.controla_lote&&!String(i.lote||'').trim())erros.push('Informe o lote de '+i.produto.descricao+'.');if(Number.isNaN(lerValor(i.custoTexto)))erros.push('Custo inválido em '+i.produto.descricao+'.');}
  if(modo==='retirada'&&destino==='revenda')for(const i of itens){const v=lerValor(i.precoTexto);if(v==null||Number.isNaN(v))erros.push('Informe o preço de venda de '+i.produto.descricao+'.');}
  if(erros.length){avisar(erros.join(' '),false);if(modo==='retirada'&&destino==='manutencao'&&motivo.value.trim().length<3)motivo.focus();else if(modo==='retirada'&&destino!=='manutencao')destinoDesc.focus();return;}
  const operador=await pedirCpf();if(!operador){avisar('Operação não finalizada: falta identificar o funcionário.',false);return;}
  ocupado=true;resumo();
  try{
   if(modo==='retirada'&&destino!=='manutencao'){const r=await rpc('oficina_saida_avulsa',{p_empresa:company.id,p_operacao:operacao,p_destino:destino,p_descricao:destinoDesc.value.trim(),p_itens:itens.map(i=>({produto_id:i.produto.id,quantidade:i.quantidade,...(destino==='revenda'?{valor_venda:lerValor(i.precoTexto)}:{})})),p_operador:operador.id});
    avisar(`Saída para ${DESTINOS[destino].toLowerCase()} registrada por ${operador.nome}: `+r.map(x=>`${x.descricao} −${fmtQtd(x.quantidade)} (restam ${fmtQtd(x.saldo)})`).join(' · '));destinoDesc.value='';}
   else if(modo==='retirada'){const m=carro,r=await rpc('oficina_saida',{p_empresa:company.id,p_operacao:operacao,p_manutencao:m.id,p_itens:itensSaida(itens,m.tipo),p_observacao:motivo.value.trim(),p_operador:operador.id});
    avisar(`Retirada registrada para ${m.placa} por ${operador.nome}: ${r.length} peça(s). Agora as fotos.`);fotos(r.map(x=>({...x,placa:m.placa,manutencao:m.numero})));}
   else{const r=await rpc('oficina_entrada',{p_empresa:company.id,p_operacao:operacao,p_itens:itens.map(i=>({produto_id:i.produto.id,...converterEntrada({quantidade:i.quantidade,porEmbalagem:i.porEmbalagem,fator:i.produto.qtd_embalagem,custo:lerValor(i.custoTexto)}),lote:String(i.lote||'').trim()||null,marca:String(i.marca??i.produto.marca??'').trim()||null})),p_documento:nf.value.trim()||null,p_fornecedor:forn.value.trim()||null,p_observacao:null,p_operador:operador.id});
    avisar('Entrada registrada por '+operador.nome+': '+r.map(x=>`${x.descricao} +${fmtQtd(x.quantidade)} (estoque ${fmtQtd(x.saldo)})`).join(' · '));}
   itens=[];operacao=crypto.randomUUID();motivo.value=nf.value=forn.value='';await carregar();if(modo==='retirada'&&destino==='manutencao')carro=null;desenharDireita();desenharLista();}
  catch(err){avisar(err.message,false);}finally{ocupado=false;resumo();}
 }
 finalizar.onclick=concluir;limpar.onclick=()=>{itens=[];carro=modo==='retirada'?null:carro;operacao=crypto.randomUUID();desenharDireita();desenharLista();avisar('Operação cancelada.');};

 // ---------- Fotos da peça (nova funcionando e antiga) ----------
 function fotos(lst){
  overlay.replaceChildren();overlay.hidden=false;const box=el('div',null,'pdv-modal pdv-fotos');box.append(el('h2','Fotos das peças'),el('p','Tire a foto da peça nova funcionando e da peça antiga. A operação só fica concluída com as duas.'));
  for(const x of lst){const linha=el('div',null,'pdv-foto');linha.append(el('strong',x.descricao||x.produto));
   for(const [tipo,label] of [['nova','Peça nova funcionando'],['antiga','Peça antiga']]){
    const l=el('label',null,'pdv-btn'),f=el('input');f.type='file';f.accept='image/*';f.setAttribute('capture','environment');f.hidden=true;f.setAttribute('aria-label',label+' · '+(x.descricao||x.produto));l.append(document.createTextNode(label),f);
    f.onchange=async()=>{const arq=f.files[0];f.value='';if(!arq)return;
     try{const ext=(arq.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'jpg',caminho=`${company.id}/${x.movimento_id}/${tipo}-${crypto.randomUUID()}.${ext}`;
      const up=await db.storage.from('oficina-fotos').upload(caminho,arq,{contentType:arq.type||'image/jpeg',upsert:false});if(up.error)throw Error(up.error.message);
      await rpc('oficina_foto_registrar',{p_empresa:company.id,p_movimento:x.movimento_id,p_tipo:tipo,p_path:caminho,p_justificativa:null});l.replaceWith(el('span','✓ '+label,'pdv-ok'));bipe(true);}
     catch(err){avisar('Foto não enviada: '+err.message,false);}};
    linha.append(l);}
   const sem=btn('Não há peça antiga','pdv-btn pdv-leve');sem.onclick=async()=>{const j=prompt('Por que não há peça antiga? (ex.: item novo, fluido descartado)');if(!j)return;
    try{await rpc('oficina_foto_registrar',{p_empresa:company.id,p_movimento:x.movimento_id,p_tipo:'antiga',p_path:null,p_justificativa:j});sem.replaceWith(el('span','✓ Sem peça antiga','pdv-ok'));}catch(err){avisar(err.message,false);}};
   linha.append(sem);box.append(linha);}
  const depois=btn('Concluir (o que faltar fica em Fotos pendentes)','pdv-finalizar');depois.onclick=fechar;box.append(depois);overlay.append(box);
 }

 // ---------- Teclado ----------
 document.addEventListener('keydown',e=>{
  if(e.key==='F2'){e.preventDefault();trocarModo('retirada');}
  else if(e.key==='F3'){e.preventDefault();trocarModo('entrada');}
  else if(e.key==='F9'){e.preventDefault();if(overlay.hidden)concluir();}
  else if(e.key==='Escape'&&!overlay.hidden){e.preventDefault();const c=overlay.querySelector('.pdv-cpf .pdv-leve');if(c)c.click();else fechar();}
 });

 try{await carregar();}catch(err){app.replaceChildren(el('p','Sem acesso ao estoque da oficina: '+err.message,'pdv-aviso erro'));return;}
 trocarModo('retirada');
}
