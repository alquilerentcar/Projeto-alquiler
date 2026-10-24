const { test } = require("node:test"),
  assert = require("node:assert/strict");
test("rotas preservam filtros e recusam destinos externos e caminhos desconhecidos", async () => {
  const { resolveRoute } = await import("./runtime/navigation.js"),
    base = "https://sistema.example/";
  assert.equal(
    resolveRoute("/clientes.html?busca=teste#lista", base),
    "/cadastros/clientes?busca=teste#lista",
  );
  assert.equal(
    resolveRoute("/locacao/substituicao", base),
    "/locacao/substituicao",
  );
  assert.equal(
    resolveRoute("/financeiro?secao=extras", base),
    "/financeiro?secao=extras",
  );
  for (const value of [
    "https://outro.example/clientes",
    "//outro.example/clientes",
    "javascript:alert(1)",
    "/desconhecido/clientes",
    "/nao-existe",
  ])
    assert.equal(resolveRoute(value, base), null);
});
test("consultas que materializam diárias não são classificadas como leitura pura", async () => {
  const { isReadOnlyRpc } = await import("./runtime/navigation.js");
  assert(isReadOnlyRpc("/rest/v1/rpc/acessos_contexto"));
  assert(isReadOnlyRpc("/rest/v1/rpc/modelos_documentos_menu"));
  assert(!isReadOnlyRpc("/rest/v1/rpc/frota_previsto"));
  assert(!isReadOnlyRpc("/rest/v1/rpc/cliente_debito_receber"));
});
