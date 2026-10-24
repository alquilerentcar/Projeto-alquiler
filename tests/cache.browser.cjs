const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(root, "tmp", "qa"), { recursive: true });
(async () => {
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
    const context = await browser.newContext();
    await context.route("https://cache.test/**", (r) =>
      r.fulfill({
        contentType: r.request().url().endsWith("site-ui.js")
          ? "text/javascript"
          : "text/html",
        body: r.request().url().endsWith("site-ui.js")
          ? fs.readFileSync(path.join(root, "site-ui.js"), "utf8")
          : '<!doctype html><head><script src="/site-ui.js"></script></head><body>Teste</body>',
      }),
    );
    await context.route("https://xtelzwclrzzlsqjecscl.supabase.co/**", (r) =>
      r.fulfill({ json: [] }),
    );
    const page = await context.newPage();
    await page.goto("https://cache.test/");
    const result = await page.evaluate(async () => {
      window.bgCacheIdentity = "u";
      window.alquilerContext = { company: { id: "a" } };
      let calls = 0;
      const q = async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        return { data: [{ name: "DADO FICTICIO" }], error: null };
      };
      await Promise.all([bgLoadList("clientes", q), bgLoadList("clientes", q)]);
      const first = calls;
      await fetch(
        "https://xtelzwclrzzlsqjecscl.supabase.co/rest/v1/rpc/acessos_contexto",
        { method: "POST", body: "{}" },
      );
      await bgLoadList("clientes", q);
      const afterRead = calls;
      await fetch("https://xtelzwclrzzlsqjecscl.supabase.co/rest/v1/clientes", {
        method: "PATCH",
        body: "{}",
      });
      await bgLoadList("clientes", q);
      const afterWrite = calls;
      window.alquilerContext.company.id = "b";
      await bgLoadList("clientes", q);
      const afterCompany = calls;
      window.bgCacheIdentity = "v";
      await bgLoadList("clientes", q);
      const afterUser = calls;
      let release;
      const pending = bgLoadList(
        "pendente",
        () => new Promise((r) => (release = r)),
      );
      await Promise.resolve();
      bgClearListCache();
      release({ data: [{ name: "RESULTADO ANTIGO" }], error: null });
      await pending;
      const stale = Object.keys(sessionStorage).some((k) =>
        k.endsWith(":pendente"),
      );
      return {
        first,
        afterRead,
        afterWrite,
        afterCompany,
        afterUser,
        stale,
        metrics: window.bgPerformance,
      };
    });
    assert.deepEqual(
      [
        result.first,
        result.afterRead,
        result.afterWrite,
        result.afterCompany,
        result.afterUser,
        result.stale,
      ],
      [1, 1, 2, 3, 4, false],
    );
    assert(result.metrics.every((m) => !("body" in m) && !("headers" in m)));
    console.log(
      "OK: consultas simultâneas agrupadas, leitura não invalida cache, escrita invalida, isolamento por conta/empresa e resposta antiga não repovoa o cache.",
    );
    const other = await context.newPage();
    await other.goto("https://cache.test/");
    await other.evaluate(async () => {
      window.bgCacheIdentity = "u";
      window.alquilerContext = { company: { id: "a" } };
      window.otherCalls = 0;
      window.gotInvalidations = 0;
      window.otherQuery = async () => {
        window.otherCalls++;
        return { data: [], error: null };
      };
      window.addEventListener(
        "bg-cache-invalidated",
        () => window.gotInvalidations++,
      );
      await bgLoadList("clientes", window.otherQuery);
    });
    await page.evaluate(() => bgClearListCache());
    await other.waitForFunction(() => window.gotInvalidations > 0);
    await other.evaluate(() => bgLoadList("clientes", window.otherQuery));
    assert.equal(await other.evaluate(() => window.otherCalls), 2);
    console.log(
      "OK: invalidação entre janelas sem compartilhar dados de clientes.",
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
