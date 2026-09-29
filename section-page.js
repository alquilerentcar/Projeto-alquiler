import{createClient}from'https://esm.sh/@supabase/supabase-js@2';import{requireAuth,bindLogout}from'./auth-guard.js';
const db=createClient('https://xtelzwclrzzlsqjecscl.supabase.co','sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3');await requireAuth(db);bindLogout(db);
