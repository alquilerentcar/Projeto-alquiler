// Ajuda nos cadastros de todas as telas: CNPJ preenche os dados da Receita (BrasilAPI), CEP preenche o endereço (ViaCEP),
// e CPF, CNPJ e telefone são conferidos na hora. Só preenche campos vazios e nunca envia nada ao banco sozinho.
import {onlyDigits,normalizeCnpj,formatCpf,formatCnpj,formatPhone,validCpf,validCnpj,validPhone,normalizePhone} from './cadastro-core.mjs?v=20261128';

const CSS=`.campo-dica{display:block;margin-top:4px;font-size:11.5px;font-weight:600;line-height:1.35;animation:dica-entra .18s ease}
.campo-dica.ok{color:#15803d}.campo-dica.erro{color:#c0362c}.campo-dica.info{color:#64748b}
input.campo-invalido{border-color:#c0362c!important;box-shadow:0 0 0 3px rgba(192,54,44,.12)!important}
@keyframes dica-entra{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.campo-dica{animation:none}}`;

const cacheCep=new Map(),cacheCnpj=new Map();
function dica(input,texto,tipo){let d=input.parentElement?.querySelector(':scope > .campo-dica');if(!texto){d?.remove();input.classList.remove('campo-invalido');return;}
 if(!d){d=document.createElement('small');d.className='campo-dica';d.setAttribute('aria-live','polite');input.after(d);}d.textContent=texto;d.className='campo-dica '+tipo;input.classList.toggle('campo-invalido',tipo==='erro');}
const campo=(form,...nomes)=>{for(const n of nomes){const e=form.elements?.namedItem?.(n);if(e&&!(e instanceof RadioNodeList)&&!e.disabled&&!e.readOnly)return e;}return null;};
// Preenche só o que está vazio (ou o que esta ajuda mesma preencheu antes), avisando a tela como se fosse digitado.
function preencher(el,valor){if(!el||valor==null||valor==='')return false;const v=String(valor).trim();if(el.value&&el.dataset.autoPreenchido!==el.value)return false;
 if(el instanceof HTMLSelectElement){const op=[...el.options].find(o=>o.value.toUpperCase()===v.toUpperCase()||o.text.toUpperCase()===v.toUpperCase());if(!op)return false;el.value=op.value;}else el.value=v;
 el.dataset.autoPreenchido=el.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}

async function buscarCep(digitos){if(cacheCep.has(digitos))return cacheCep.get(digitos);let d=null;
 try{const r=await fetch('https://viacep.com.br/ws/'+digitos+'/json/',{signal:AbortSignal.timeout(7000)});if(r.ok){const j=await r.json();if(!j.erro)d={endereco:j.logradouro,bairro:j.bairro,cidade:j.localidade,uf:j.uf,complemento:j.complemento};}}catch{}
 if(!d){try{const r=await fetch('https://brasilapi.com.br/api/cep/v1/'+digitos,{signal:AbortSignal.timeout(7000)});if(r.ok){const j=await r.json();d={endereco:j.street,bairro:j.neighborhood,cidade:j.city,uf:j.state};}}catch{}}
 if(d)cacheCep.set(digitos,d);return d;}
async function buscarCnpj(cnpj){if(cacheCnpj.has(cnpj))return cacheCnpj.get(cnpj);const r=await fetch('https://brasilapi.com.br/api/cnpj/v1/'+cnpj,{signal:AbortSignal.timeout(9000)});
 if(r.status===404)throw Error('CNPJ não encontrado na Receita.');if(!r.ok)throw Error('Consulta da Receita indisponível agora. Preencha manualmente.');const j=await r.json();cacheCnpj.set(cnpj,j);return j;}

function ligarCep(form,cep){if(cep.dataset.ajuda)return;cep.dataset.ajuda='1';
 // O cadastro de locatário já tem o botão próprio de CEP: lá só deixamos o preenchimento automático ao completar 8 dígitos.
 let ultimo='';const rodar=async()=>{const d=onlyDigits(cep.value);if(d.length!==8||d===ultimo)return;ultimo=d;dica(cep,'Buscando endereço…','info');const r=await buscarCep(d);if(onlyDigits(cep.value)!==d)return;
  if(!r){dica(cep,'CEP não encontrado. Preencha o endereço manualmente.','erro');return;}
  const n=[preencher(campo(form,'endereco','logradouro','locatario_endereco'),r.endereco),preencher(campo(form,'bairro'),r.bairro),preencher(campo(form,'cidade','municipio'),r.cidade),preencher(campo(form,'uf','estado'),r.uf)].filter(Boolean).length;
  cep.value=d.slice(0,5)+'-'+d.slice(5);dica(cep,n?'Endereço preenchido pelo CEP. Confira e informe o número.':'CEP conferido: '+[r.endereco,r.bairro,r.cidade+'/'+r.uf].filter(Boolean).join(', '),'ok');campo(form,'numero')?.focus?.();};
 cep.addEventListener('input',()=>{if(onlyDigits(cep.value).length===8)rodar();else dica(cep,'');});cep.addEventListener('blur',rodar);}

function ligarCnpj(form,inp){if(inp.dataset.ajuda)return;inp.dataset.ajuda='1';let ultimo='';
 const rodar=async()=>{const c=normalizeCnpj(inp.value);if(!c){dica(inp,'');inp.setCustomValidity('');return;}
  if(c.length<14){dica(inp,'CNPJ incompleto.','erro');return;}
  if(!validCnpj(c)){dica(inp,'CNPJ inválido: confira os números.','erro');inp.setCustomValidity('CNPJ inválido: confira os números.');return;}
  inp.setCustomValidity('');inp.value=formatCnpj(c);if(c===ultimo)return;ultimo=c;
  const temOnde=['razao_social','nome_fantasia','endereco','cep','telefone','nome_completo'].some(n=>campo(form,n));if(!temOnde||/[A-Z]/.test(c)){dica(inp,'CNPJ válido.','ok');return;}
  dica(inp,'CNPJ válido. Buscando dados na Receita…','info');
  try{const j=await buscarCnpj(c);if(normalizeCnpj(inp.value)!==c)return;
   const pj=campo(form,'tipo_pessoa');const nomeCampo=campo(form,'razao_social')||(pj?campo(form,'nome_completo'):null);
   const tel=onlyDigits(j.ddd_telefone_1||''),logradouro=[j.descricao_tipo_de_logradouro,j.logradouro].filter(Boolean).join(' ');
   [preencher(nomeCampo,j.razao_social),preencher(campo(form,'nome_fantasia'),j.nome_fantasia||''),preencher(campo(form,'cep'),j.cep?String(j.cep).replace(/^(\d{5})(\d{3})$/,'$1-$2'):''),preencher(campo(form,'endereco'),logradouro),
    preencher(campo(form,'numero'),j.numero),preencher(campo(form,'complemento'),j.complemento),preencher(campo(form,'bairro'),j.bairro),preencher(campo(form,'cidade'),j.municipio),preencher(campo(form,'uf'),j.uf),
    preencher(campo(form,'telefone'),tel?formatPhone(tel):''),preencher(campo(form,'email'),(j.email||'').toLowerCase())];
   const sit=String(j.descricao_situacao_cadastral||'').toUpperCase();dica(inp,'Dados da Receita preenchidos'+(sit?' · situação '+sit:'')+'. Confira antes de salvar.',sit&&sit!=='ATIVA'?'erro':'ok');}
  catch(e){dica(inp,'CNPJ válido. '+e.message,'info');}};
 inp.addEventListener('blur',rodar);inp.addEventListener('input',()=>{if(normalizeCnpj(inp.value).length===14)rodar();else{dica(inp,'');inp.setCustomValidity('');}});}

function ligarCpf(inp){if(inp.dataset.ajuda)return;inp.dataset.ajuda='1';
 const rodar=()=>{const d=onlyDigits(inp.value);if(!d){dica(inp,'');inp.setCustomValidity('');return;}if(d.length<11){dica(inp,'CPF incompleto.','erro');return;}
  if(!validCpf(d)){dica(inp,'CPF inválido: confira os números.','erro');inp.setCustomValidity('CPF inválido: confira os números.');return;}inp.setCustomValidity('');inp.value=formatCpf(d);dica(inp,'CPF válido.','ok');};
 inp.addEventListener('blur',rodar);inp.addEventListener('input',()=>{if(onlyDigits(inp.value).length===11)rodar();else{dica(inp,'');inp.setCustomValidity('');}});}

function ligarTelefone(inp,celular){if(inp.dataset.ajuda)return;inp.dataset.ajuda='1';
 inp.addEventListener('blur',()=>{const d=normalizePhone(inp.value);if(!d){dica(inp,'');return;}
  if(!validPhone(d)){dica(inp,'Telefone inválido: confira o DDD e os números.','erro');return;}
  if(celular&&d.length!==11){dica(inp,'Celular precisa do 9 na frente (11 dígitos com DDD).','erro');return;}
  inp.value=formatPhone(d);dica(inp,d.length===11?'Celular válido.':'Telefone fixo válido.','ok');});}

function ligarForm(form){if(!(form instanceof HTMLFormElement))return;
 const cep=campo(form,'cep');if(cep)ligarCep(form,cep);
 const cnpj=campo(form,'cnpj');if(cnpj)ligarCnpj(form,cnpj);
 // CPF e telefones do locatário já têm conferência própria (bindClientFields); aqui cobrimos as outras telas.
 const doLocatario=Boolean(form.elements?.namedItem?.('contato_1_numero'));
 const cpf=campo(form,'cpf');if(cpf&&!doLocatario)ligarCpf(cpf);
 for(const n of ['telefone','celular','whatsapp'])if(!doLocatario){const t=campo(form,n);if(t)ligarTelefone(t,n!=='telefone');}}

export function iniciarCadastros(){
 if(!document.getElementById('cadastro-ajuda-css')){const st=document.createElement('style');st.id='cadastro-ajuda-css';st.textContent=CSS;document.head.append(st);}
 document.querySelectorAll('form').forEach(ligarForm);
 new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.tagName==='FORM')ligarForm(n);else n.querySelectorAll?.('form').forEach(ligarForm);const f=n.closest?.('form');if(f)ligarForm(f);}}).observe(document.body,{childList:true,subtree:true});
}
