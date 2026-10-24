const http = require("node:http"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
(async () => {
  const server = http.createServer(require(path.join(root, "server.js")));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = "http://127.0.0.1:" + server.address().port,
      a = await fetch(base + "/runtime/navigation.js");
    assert.equal(a.status, 200);
    assert.match(a.headers.get("cache-control"), /must-revalidate/);
    const tag = a.headers.get("etag");
    assert(tag);
    await a.arrayBuffer();
    const unchanged = await fetch(base + "/runtime/navigation.js", {
      headers: { "If-None-Match": tag },
    });
    assert.equal(unchanged.status, 304);
    const page = await fetch(base + "/app");
    assert.equal(page.headers.get("cache-control"), "no-store");
    await page.arrayBuffer();
    const doc = await fetch(base + "/papel_timbrado_alquiler.pdf");
    assert.equal(doc.headers.get("cache-control"), "no-store");
    await doc.arrayBuffer();
    console.log(
      "OK: JS público revalidado por ETag/304; HTML e PDF não armazenados pelo servidor.",
    );
  } finally {
    server.closeAllConnections();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
