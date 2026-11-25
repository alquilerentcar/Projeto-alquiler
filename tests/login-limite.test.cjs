// Limite de tentativas do login por usuário: contador no banco (SQL real em PGlite) e mensagens genéricas.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();
 await db.exec("create role anon;create role authenticated;create role service_role;");
 await db.exec(fs.readFileSync(root+'/sql/login_tentativas.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/sql/login_tentativas.sql','utf8')); // rodar de novo não quebra
 const reg=async(k,max)=>(await db.query('select public.login_tentativa_registrar($1,$2) ok',[k,max])).rows[0].ok;
 const chave='a'.repeat(64);
 for(let i=0;i<3;i++)assert.equal(await reg(chave,3),true);
 assert.equal(await reg(chave,3),false,'quarta tentativa bloqueada');
 await db.query("update public.login_tentativas set janela_ate=now()-interval '1 minute'");
 assert.equal(await reg(chave,3),true,'janela vencida recomeça');
 await db.query('select public.login_tentativa_limpar($1)',[chave]);
 assert.equal((await db.query('select count(*)::int n from public.login_tentativas')).rows[0].n,0);
 await assert.rejects(()=>reg('curta',3),/inválidos/);
 const priv=(await db.query("select has_function_privilege('anon','public.login_tentativa_registrar(text,integer)','execute') a, has_function_privilege('authenticated','public.login_tentativa_registrar(text,integer)','execute') b, has_table_privilege('authenticated','public.login_tentativas','select') c")).rows[0];
 assert.deepEqual(priv,{a:false,b:false,c:false},'só o servidor usa');

 // username-login.js usando o banco acima no lugar do Supabase.
 process.env.SUPABASE_SERVICE_ROLE_KEY='chave-de-teste';
 const calls=[];let senhaCerta='certa',perfis=[{auth_user_id:'u1'}];
 global.fetch=async(url,opt={})=>{url=String(url);calls.push(url);const body=opt.body?JSON.parse(opt.body):null;const ok=data=>({ok:true,json:async()=>data});
  if(url.includes('/rpc/login_tentativa_registrar'))return ok(await reg(body.p_chave,body.p_max));
  if(url.includes('/rpc/login_tentativa_limpar')){await db.query('select public.login_tentativa_limpar($1)',[body.p_chave]);return ok(null);}
  if(url.includes('/rest/v1/usuarios_empresa'))return ok(perfis);
  if(url.includes('/auth/v1/admin/users/'))return ok({email:'pessoa@example.com'});
  if(url.includes('/auth/v1/token'))return body.password===senhaCerta?ok({access_token:'a',refresh_token:'r'}):{ok:false,json:async()=>({})};
  throw new Error('url inesperada '+url);};
 const login=require(root+'/username-login.js');
 const req=ip=>({method:'POST',headers:{'x-forwarded-for':ip+', 10.0.0.1'},socket:{remoteAddress:'127.0.0.1'}});
 assert.deepEqual(await login(req('1.1.1.1'),{usuario:'joao',password:'certa'}),{access_token:'a',refresh_token:'r'});
 for(let i=0;i<10;i++)await assert.rejects(()=>login(req('2.2.2.'+i),{usuario:'joao',password:'errada'}),e=>e.status===401&&e.message==='Usuário ou senha incorretos.');
 await assert.rejects(()=>login(req('3.3.3.3'),{usuario:'joao',password:'certa'}),e=>e.status===429,'11ª tentativa do mesmo usuário bloqueada mesmo de outro IP');
 const linhas=(await db.query('select chave from public.login_tentativas')).rows.map(r=>r.chave).join(' ');
 assert.doesNotMatch(linhas,/joao|JOAO|2\.2\.2/,'não guarda usuário nem IP em claro');
 perfis=[{auth_user_id:'u1'},{auth_user_id:'u2'}];
 await assert.rejects(()=>login(req('4.4.4.4'),{usuario:'maria',password:'x'}),e=>e.message==='Usuário ou senha incorretos.','não revela conta repetida');
 // Banco fora do ar: o limite na memória continua valendo.
 const antigo=global.fetch;global.fetch=async(url,opt)=>String(url).includes('/rpc/')?{ok:false,json:async()=>null}:antigo(url,opt);perfis=[{auth_user_id:'u1'}];
 for(let i=0;i<10;i++)await assert.rejects(()=>login(req('5.5.5.5'),{usuario:'ana',password:'errada'}),e=>e.status===401);
 await assert.rejects(()=>login(req('5.5.5.5'),{usuario:'ana',password:'errada'}),e=>e.status===429);
 await db.close();console.log('PASS login: limite de tentativas no banco, por usuário de qualquer IP, sem guardar IP/usuário em claro e com mensagens genéricas.');
})().catch(e=>{console.error(e);process.exit(1)});
