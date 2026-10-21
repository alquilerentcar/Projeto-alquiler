import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireAuth,bindLogout} from './auth-guard.js';
import {mountExtras,mountClientDocuments} from './cliente-complementos.mjs';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');await requireAuth(db);bindLogout(db);
const company=window.alquilerContext.company,id=new URLSearchParams(location.search).get('cliente');
try{if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('Selecione um locatário em Clientes.');const {data,error}=await db.from('clientes').select('id,nome_completo').eq('empresa_id',company.id).eq('id',id).single();if(error)throw error;document.querySelector('#client-name').textContent=data.nome_completo;document.querySelector('#client-history').href='/historico?cliente='+encodeURIComponent(id);await Promise.all([mountExtras(db,company,id,document.querySelector('#client-operation-debts')),mountClientDocuments(db,company,id,document.querySelector('#client-operation-documents'))]);}catch(error){document.querySelector('#client-operation-status').textContent=error.message;}
