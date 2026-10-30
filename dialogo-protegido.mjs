export function protectDialog(dialog,form,{buttons=[],isBusy=()=>false,message='Há dados não salvos. Deseja sair e descartar as alterações?'}={}){
 let baseline='';
 const signature=()=>JSON.stringify([...form.elements].filter(e=>e.name&&!['submit','button','reset','search'].includes(e.type)).map(e=>[e.name,e.type==='file'?[...e.files].map(f=>[f.name,f.size,f.lastModified]):['checkbox','radio'].includes(e.type)?e.checked:e.value]));
 const original=dialog.showModal.bind(dialog);dialog.showModal=(...args)=>{original(...args);baseline=signature();};
 const dirty=()=>dialog.open&&signature()!==baseline;
 const requestClose=()=>{if(isBusy())return false;if(dirty()&&!confirm(message))return false;dialog.close();return true;};
 for(const button of buttons)button.addEventListener('click',requestClose);
 dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
 window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
 return {requestClose,dirty,markSaved(){baseline=signature();}};
}
