// Navegação com telas guardadas, sem Supabase real.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const company = {
    id: "performance-company",
    nome_fantasia: "EMPRESA DE TESTE",
    razao_social: "EMPRESA DE TESTE",
    cor_primaria: "#264b2d",
    cor_sidebar: "#0d1c25",
    cor_fundo: "#f1e3d2",
    cor_paineis: "#fff7ee",
  },
  context = {
    schemaVersion: 2,
    company,
    companies: [company],
    developer: false,
    canManageCompany: true,
    modules: ["locacao"],
    user: { id: "u", nome: "USUARIO TESTE", administrador: true },
  };
fs.mkdirSync(path.join(root, "tmp", "qa"), { recursive: true });
(async () => {
  const server = http.createServer(require(path.join(root, "server.js")));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.TEST_BROWSER_PATH
      ? { executablePath: process.env.TEST_BROWSER_PATH }
      : process.platform === "win32"
        ? {
            executablePath:
              "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          }
        : {}),
  });
  try {
    const base = "http://127.0.0.1:" + server.address().port,
      page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [],
      loads = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("ERRO: " + e.message);
    });
    page.on("request", (r) => {
      if (r.isNavigationRequest())
        loads.push({ url: r.url(), main: r.frame() === page.mainFrame() });
    });
    await page.addInitScript(
      ({ company }) => {
        sessionStorage.setItem("bgsys:empresa-id", company.id);
        sessionStorage.setItem(
          "bgsys:brand:" + company.id,
          JSON.stringify(company),
        );
        localStorage.setItem(
          "sb-xtelzwclrzzlsqjecscl-auth-token",
          JSON.stringify({ user: { id: "performance-user" } }),
        );
        window.earlyColors = [];
        new MutationObserver(() => {
          const c =
            document.documentElement?.style.getPropertyValue(
              "--company-primary",
            );
          if (c) window.earlyColors.push(c);
        }).observe(document, {
          attributes: true,
          subtree: true,
          attributeFilter: ["style"],
        });
      },
      { company },
    );
    await page.route("https://esm.sh/@supabase/**", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: `const ctx=${JSON.stringify(context)};if(sessionStorage.getItem('fixture-role')==='operator')ctx.canManageCompany=false;const wait=ms=>new Promise(r=>setTimeout(r,ms));export function createClient(){const query=()=>{let single=false;const q=new Proxy({}, {get(_,p){if(p==='then')return (ok,no)=>fetch('/fixture-list').then(()=>({data:single?{}:[],error:null,count:0})).then(ok,no);return (...args)=>{if(p==='single'||p==='maybeSingle')single=true;return q;};}});return q;};return {auth:{getSession:async()=>({data:{session:sessionStorage.getItem('fixture-auth')==='out'?null:{access_token:'fixture',user:{id:'performance-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},rpc:async name=>{(window.top.rpcLog=window.top.rpcLog||[]).push(name);await wait(name==='acessos_contexto'?120:180);return {data:name==='acessos_contexto'?ctx:name==='frota_painel'?{carros:[],periodos:[],fornecedores:[]}:[],error:null}},from:query,storage:{from:()=>({})}};}`,
      }),
    );
    await page.route("**/fixture-list", async (r) => {
      await new Promise((res) => setTimeout(res, 80));
      await r.fulfill({ json: [] });
    });
    await page.route("https://esm.sh/pdf-lib*", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: "export const PDFDocument={},StandardFonts={},rgb=()=>({});",
      }),
    );
    await page.route("**/api/ai/status", (r) =>
      r.fulfill({ json: { active: false, provider: "groq" } }),
    );
    await page.route("**/api/acessos", (r) =>
      r.fulfill({
        json: {
          empresas: [company],
          modulos: [],
          licencas: [],
          usuarios: [],
          permissoes: [],
        },
      }),
    );
    const nav=async(href,n)=>{await page.locator('.sidebar a[href="'+href+'"]').first().click();await page.waitForFunction(k=>window.bgNavigationMetrics?.length===k,n);return (await page.evaluate(()=>window.bgNavigationMetrics)).at(-1);};
    const contextCalls=()=>page.evaluate(()=>(window.rpcLog||[]).filter(x=>x==='acessos_contexto').length);
    await page.goto(base+'/app?rota='+encodeURIComponent('/cadastros/clientes'));
    await page.waitForFunction(()=>window.bgNavigationMetrics?.length===1);
    let child=page.frames().find(f=>f!==page.mainFrame());await child.waitForSelector('#clients-body',{state:'attached'});
    assert.equal(await contextCalls(),1,'a tela usa o acesso conferido pela moldura');
    // Visita várias telas e volta: as já abertas reaparecem sem recarregar.
    let n=1;for(const href of ['carros.html','fornecedores.html','locacoes.html','frota.html'])assert.equal((await nav(href,++n)).source,'loaded',href);
    for(const href of ['carros.html','clientes.html','locacoes.html'])assert.equal((await nav(href,++n)).source,'reused',href);
    assert.equal(await contextCalls(),1,'nenhuma nova consulta de acesso ao navegar');
    assert.ok(await page.locator('#shell-content iframe').count()<=6,'no máximo 5 telas guardadas além da atual');
    // Formulário aberto e alterado pede confirmação; fechado sem salvar, não.
    const prompts=[];let accept=false;page.on('dialog',d=>{prompts.push(d.message());accept?d.accept():d.dismiss();});
    await nav('clientes.html',++n);child=page.frames().find(f=>f!==page.mainFrame()&&f.url().includes('/cadastros/clientes'));
    await child.locator('#new-client-button').click();await child.locator('#client-dialog[open]').waitFor();
    await child.locator('#client-form [name=nome_completo]').fill('CLIENTE EM DIGITAÇÃO');
    await page.locator('.sidebar a[href="carros.html"]').first().click();await page.waitForTimeout(300);
    assert.equal(prompts.length,1,'formulário aberto com dados pede confirmação');
    assert.equal(await page.evaluate(()=>window.bgNavigationMetrics.at(-1).outcome),'cancelled');
    accept=true;await child.locator('#cancel-button').click();await child.locator('#client-dialog:not([open])').waitFor({state:'attached'});const before=prompts.length;
    assert.equal((await nav('carros.html',n+2)).outcome,'loaded');assert.equal(prompts.length,before,'formulário fechado não pede confirmação');
    assert.deepEqual(errors,[]);
    console.log('OK: telas guardadas voltam sem recarregar, acesso conferido uma vez e aviso só com formulário aberto.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
