import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, bindLogout } from "./auth-guard.js";
import { renderAppContext, loadAppContext } from "./app-context.js";
import { canOpen } from "./access-policy.js";
import { startNavigation } from "./runtime/shell-navigation.js";
import { resolveRoute } from "./runtime/navigation.js";
const db = createClient(
  "https://xtelzwclrzzlsqjecscl.supabase.co",
  "sb_publishable_37VAv7_GhtRLum-WVwMv0w_EiD0HqZ3",
);
const session = await requireAuth(db);
bindLogout(db);
const initial =
  resolveRoute(
    new URLSearchParams(location.search).get("rota") || "/locacao/dashboard",
    location.origin + "/",
  ) || "/locacao/dashboard";
startNavigation({
  host: document.querySelector("#shell-content"),
  status: document.querySelector("#shell-status"),
  initial,
  scope() {
    const c = window.alquilerContext;
    return JSON.stringify({
      account: session.user.id,
      company: c.company,
      modules: c.modules,
      developer: c.developer,
      admin: c.canManageCompany,
      user: c.user,
      models: c.documentModels,
    });
  },
  async validate(route) {
    const live = await db.auth.getSession();
    if (!live.data?.session || live.data.session.user.id !== session.user.id) {
      window.bgShellDispose?.();
      location.replace("/login");
      return false;
    }
    const c = await loadAppContext(db);
    if (
      c.accessDenied ||
      c.company?.id !== window.alquilerContext.company?.id ||
      !canOpen(c, new URL(route, location.origin).pathname)
    ) {
      window.bgShellDispose?.();
      location.replace("/modulos?acesso=negado");
      return false;
    }
    window.alquilerContext = c;
    renderAppContext(c);
    window.dispatchEvent(new CustomEvent("app-context-ready", { detail: c }));
    return true;
  },
  onContext(context) {
    window.alquilerContext = context;
    renderAppContext(context);
    window.dispatchEvent(
      new CustomEvent("app-context-ready", { detail: context }),
    );
  },
  onError(message) {
    document.querySelector("#shell-status").textContent = message;
  },
});

window.addEventListener("shell-route-ready", () => {
  if (window.alquilerContext) renderAppContext(window.alquilerContext);
});

db.auth.onAuthStateChange((event, next) => {
  if (
    event === "SIGNED_OUT" ||
    (next?.user?.id && next.user.id !== session.user.id)
  ) {
    window.bgShellDispose?.();
    window.bgClearListCache?.();
    location.replace("/login");
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.bgShellDispose?.();
    document.querySelector("#shell-content").style.visibility = "hidden";
    location.reload();
  }
});
