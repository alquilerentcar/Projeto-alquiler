// Notificações: avisos automáticos no topo da página.
import {getAuthenticatedClient} from './auth-guard.js';
import {montarAvisos} from './avisos.mjs?v=20261128';
const db=await getAuthenticatedClient(),ctx=window.alquilerContext;
const main=document.querySelector('main');
if(ctx?.company?.id&&ctx.modules?.includes('locacao')&&main){const host=document.createElement('div');main.querySelector('.topbar')?.after(host)??main.prepend(host);await montarAvisos(db,ctx.company.id,host);}
