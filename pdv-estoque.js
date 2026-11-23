import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth} from './auth-guard.js';
import {mountPdv} from './pdv-estoque.mjs?v=20261124';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');
await requireAuth(db);
await mountPdv({db,company:window.alquilerContext.company,host:document.querySelector('#pdv-host')});
