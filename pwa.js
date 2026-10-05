(()=>{
let promptEvent=null,button;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function ready(){if(standalone())return;button=document.createElement('button');button.type='button';button.id='bg-install-app';button.textContent='Instalar aplicativo';button.hidden=!promptEvent;button.style.cssText='position:fixed;bottom:18px;left:18px;z-index:1100;padding:10px 14px;border:1px solid #cdd7e5;border-radius:10px;background:#fff;color:#173b75;font:600 13px system-ui;box-shadow:0 3px 12px #0002;cursor:pointer';
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(ios){button.hidden=false;button.textContent='Adicionar à tela inicial';}
button.addEventListener('click',async()=>{if(ios){alert('No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.');return;}if(!promptEvent)return;const pending=promptEvent;promptEvent=null;button.hidden=true;try{await pending.prompt();await pending.userChoice;}catch{}});document.body.append(button);}
window.addEventListener('beforeinstallprompt',event=>{if(standalone())return;event.preventDefault();promptEvent=event;if(button)button.hidden=false;});
window.addEventListener('appinstalled',()=>{promptEvent=null;if(button)button.remove();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
if('serviceWorker' in navigator&&window.isSecureContext)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{}),{once:true});
})();