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
        body: `const ctx=${JSON.stringify(context)};if(sessionStorage.getItem('fixture-role')==='operator')ctx.canManageCompany=false;const wait=ms=>new Promise(r=>setTimeout(r,ms));export function createClient(){const query=()=>{let single=false;const q=new Proxy({}, {get(_,p){if(p==='then')return (ok,no)=>fetch('/fixture-list').then(()=>({data:single?{}:[],error:null,count:0})).then(ok,no);return (...args)=>{if(p==='single'||p==='maybeSingle')single=true;return q;};}});return q;};return {auth:{getSession:async()=>({data:{session:sessionStorage.getItem('fixture-auth')==='out'?null:{access_token:'fixture',user:{id:'performance-user'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},rpc:async name=>{await wait(name==='acessos_contexto'?120:180);return {data:name==='acessos_contexto'?ctx:name==='frota_painel'?{carros:[],periodos:[],fornecedores:[]}:[],error:null}},from:query,storage:{from:()=>({})}};}`,
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
    await page.goto(
      base + "/app?rota=" + encodeURIComponent("/cadastros/clientes"),
    );
    await page.waitForFunction(() => window.bgNavigationMetrics?.length === 1);
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--company-primary")
          .trim(),
      ),
      company.cor_primaria,
    );
    assert(
      !(await page.evaluate(() => window.earlyColors)).includes("#2864da"),
    );
    await page.evaluate(() => {
      window.savedSidebar = document.querySelector(".sidebar");
    });
    let child = page.frames().find((f) => f !== page.mainFrame());
    assert(child);
    await child.waitForSelector("#clients-body", { state: "attached" });
    await child.waitForFunction(() =>
      /0/.test(document.querySelector("#list-count")?.textContent || ""),
    );
    await page.locator('.sidebar a[href="carros.html"]').click();
    await page.waitForFunction(() => window.bgNavigationMetrics?.length === 2);
    await page.locator('.sidebar a[href="clientes.html"]').click();
    await page.waitForFunction(() => window.bgNavigationMetrics?.length === 3);
    assert(
      await page.evaluate(
        () => window.savedSidebar === document.querySelector(".sidebar"),
      ),
    );
    assert.equal(loads.filter((x) => x.main).length, 1);
    const mainNavigationsForTabs = loads.filter((x) => x.main).length;
    const metrics = await page.evaluate(() => window.bgNavigationMetrics);
    assert.equal(metrics[2].source, "reused");
    await page.goBack();
    await page.waitForFunction(() => window.bgNavigationMetrics?.length === 4);
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(root, "tmp", "qa", "navegacao-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(root, "tmp", "qa", "navegacao-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.sidebar a[href="clientes.html"]').click();
    await page.waitForFunction(
      () =>
        location.pathname === "/cadastros/clientes" &&
        document.querySelectorAll(".shell-pending").length === 0,
    );
    let editFrame = page.frames().find((f) => f !== page.mainFrame());
    await editFrame.locator("#new-client-button").click();
    await editFrame.locator("[name=nome_completo]").fill("RASCUNHO FICTICIO");
    page.once("dialog", (d) => d.dismiss());
    await page.locator('.sidebar a[href="carros.html"]').click();
    await page.waitForTimeout(100);
    assert.equal(new URL(page.url()).pathname, "/cadastros/clientes");
    assert.equal(
      await editFrame.locator("[name=nome_completo]").inputValue(),
      "RASCUNHO FICTICIO",
    );
    page.once("dialog", (d) => d.accept());
    await page.locator('.sidebar a[href="carros.html"]').click();
    await page.waitForFunction(
      () =>
        location.pathname === "/cadastros/carros" &&
        document.querySelectorAll(".shell-pending").length === 0,
    );
    console.log("OK: formulário preservado ao cancelar a saída.");
    await page.evaluate(() => window.bgShellNavigate("/cadastros/clientes"));
    await page.waitForFunction(
      () =>
        location.pathname === "/cadastros/clientes" &&
        document.querySelectorAll(".shell-pending").length === 0,
    );
    assert.equal(page.frames().length, 3);
    await page.evaluate(() => window.bgClearListCache());
    await page.waitForFunction(
      () => document.querySelectorAll("iframe.shell-frame").length === 1,
    );
    await page.evaluate(() => window.bgShellNavigate("/cadastros/carros"));
    await page.waitForFunction(
      () =>
        location.pathname === "/cadastros/carros" &&
        document.querySelectorAll(".shell-pending").length === 0,
    );
    assert.equal(
      await page.evaluate(() => window.bgNavigationMetrics.at(-1).source),
      "loaded",
    );
    console.log(
      "OK: invalidação descarta as telas anteriores e impede reutilização desatualizada.",
    );
    const beforeInternal = await page.evaluate(() => history.length);
    const activeFrame = page.frames().find((f) => f !== page.mainFrame());
    await activeFrame.evaluate(() => {
      location.href = "/cadastros/clientes";
    });
    await page.waitForFunction(
      () => location.pathname === "/cadastros/clientes",
    );
    assert.equal(await page.evaluate(() => history.length), beforeInternal + 1);
    await page.evaluate(() => history.back());
    await page.waitForFunction(
      () =>
        location.pathname === "/cadastros/carros" &&
        document.querySelectorAll(".shell-pending").length === 0,
    );
    await page.waitForTimeout(200);
    console.log(
      "OK: navegação interna preserva o histórico sem duplicar entradas.",
    );
    await page.evaluate(() =>
      sessionStorage.setItem("fixture-role", "operator"),
    );
    await page.goto(
      base + "/app?rota=" + encodeURIComponent("/administracao/empresa"),
      { waitUntil: "commit" },
    );
    await page.waitForURL(
      (url) =>
        url.pathname === "/modulos" &&
        url.searchParams.get("acesso") === "negado",
    );
    assert.equal(page.frames().length, 1);
    console.log(
      "OK: operador sem acesso à empresa redirecionado fora da área de trabalho.",
    );
    await page.evaluate(() => sessionStorage.setItem("fixture-auth", "out"));
    await page.goto(
      base + "/app?rota=" + encodeURIComponent("/cadastros/clientes"),
      { waitUntil: "commit" },
    );
    await page.waitForURL((url) => url.pathname === "/login");
    assert.equal(page.frames().length, 1);
    console.log(
      "OK: sem sessão, login obrigatório e nenhuma tela privada aberta.",
    );
    console.log(
      JSON.stringify({
        metricas: metrics,
        navegacoes_documento_principal_entre_abas: mainNavigationsForTabs,
        erros: errors,
      }),
    );
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
