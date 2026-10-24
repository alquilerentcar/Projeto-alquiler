import {
  resolveRoute,
  type NavigationOptions,
  type NavigationMeasurement,
} from "./navigation.js";
type SavedScreen = { frame: HTMLIFrameElement; scope: string; time: number };
export function startNavigation(options: NavigationOptions): void {
  let current: HTMLIFrameElement | null = null,
    pending: HTMLIFrameElement | null = null,
    generation = 0,
    dirty = false,
    activeRoute = "",
    currentScope = "",
    currentTime = 0,
    currentValid = true,
    invalidation = 0;
  const saved = new Map<string, SavedScreen>(),
    eligible = (route: string) =>
      ["/cadastros/clientes", "/cadastros/carros"].includes(
        route.split("?")[0].split("#")[0],
      );
  window.bgNavigationMetrics = [];
  const record = (m: NavigationMeasurement) => {
    window.bgNavigationMetrics!.push(m);
    if (window.bgNavigationMetrics!.length > 80)
      window.bgNavigationMetrics!.shift();
  };
  const invalidate = () => {
    invalidation++;
    for (const item of saved.values()) item.frame.remove();
    saved.clear();
    currentValid = false;
  };
  window.addEventListener("bg-cache-invalidated", invalidate);
  const paintMenu = (route: string) => {
    window.dispatchEvent(
      new CustomEvent("shell-route-ready", { detail: { route } }),
    );
    for (const a of document.querySelectorAll<HTMLAnchorElement>(
      ".sidebar a[href]",
    )) {
      const active = resolveRoute(a.href, location.href) === route;
      a.classList.toggle("active", active);
      if (active) {
        a.setAttribute("aria-current", "page");
        const group = a.closest("details");
        if (group) group.open = true;
      } else a.removeAttribute("aria-current");
    }
    document.body.classList.remove("mobile-menu-open");
    document
      .querySelector(".mobile-menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  };
  function activate(
    frame: HTMLIFrameElement,
    route: string,
    replace: boolean,
    stamp: number,
    scope: string,
  ): void {
    if (current && current !== frame) {
      if (
        !dirty &&
        currentValid &&
        eligible(activeRoute) &&
        Date.now() - currentTime < 30000
      ) {
        current.classList.add("shell-cached");
        current.style.pointerEvents = "none";
        if (saved.get(activeRoute)?.frame !== current)
          saved.get(activeRoute)?.frame.remove();
        saved.set(activeRoute, {
          frame: current,
          time: currentTime,
          scope: currentScope,
        });
      } else current.remove();
    }
    while (saved.size > 1) {
      const oldest = saved.keys().next().value as string;
      saved.get(oldest)?.frame.remove();
      saved.delete(oldest);
    }
    current = frame;
    pending = null;
    activeRoute = route;
    dirty = false;
    currentTime = stamp;
    currentScope = scope;
    currentValid = true;
    frame.classList.remove("shell-pending", "shell-cached");
    frame.style.pointerEvents = "";
    options.status.hidden = true;
    options.host.setAttribute("aria-busy", "false");
    if (replace) history.replaceState(null, "", route);
    else history.pushState(null, "", route);
    paintMenu(route);
  }
  const navigate = async (value: string, replace = false): Promise<void> => {
    const route = resolveRoute(value, location.origin + "/");
    if (!route) {
      location.assign(value);
      return;
    }
    if (route === activeRoute && !pending) return;
    if (
      dirty &&
      !confirm(
        "Você alterou um formulário nesta tela. Confirme que salvou antes de sair. Deseja continuar?",
      )
    ) {
      record({
        route: route.split("?")[0],
        durationMs: 0,
        outcome: "cancelled",
      });
      if (replace) history.pushState(null, "", activeRoute);
      return;
    }
    const token = ++generation,
      started = performance.now(),
      epoch = invalidation;
    pending?.remove();
    pending = null;
    options.status.hidden = false;
    options.status.textContent = "Abrindo…";
    options.host.setAttribute("aria-busy", "true");
    if (current) current.style.pointerEvents = "none";
    const memo = saved.get(route);
    if (memo) {
      saved.delete(route);
      if (Date.now() - memo.time < 30000 && memo.frame.isConnected) {
        let allowed = false;
        try {
          allowed = await options.validate(route);
        } catch {}
        if (token !== generation) {
          memo.frame.remove();
          return;
        }
        if (
          allowed &&
          epoch === invalidation &&
          memo.frame.isConnected &&
          memo.scope === options.scope()
        ) {
          activate(memo.frame, route, replace, memo.time, memo.scope);
          memo.frame.contentWindow?.dispatchEvent(
            new CustomEvent("bg-page-resume"),
          );
          record({
            route: route.split("?")[0],
            durationMs: Math.round(performance.now() - started),
            outcome: "loaded",
            source: "reused",
          });
          return;
        }
      }
      memo.frame.remove();
    }
    if (token !== generation) return;
    const frameEpoch = invalidation,
      frame = document.createElement("iframe");
    pending = frame;
    frame.className = "shell-frame shell-pending";
    frame.title = "Área de trabalho";
    frame.src = route;
    const timeout = window.setTimeout(() => {
      if (token === generation)
        options.status.textContent =
          "A abertura está demorando. Você pode tentar novamente ou abrir outra aba.";
    }, 12000);
    frame.addEventListener("load", () => {
      clearTimeout(timeout);
      if (token !== generation && frame !== current) {
        frame.remove();
        return;
      }
      if (token !== generation && frame === current && pending) {
        currentValid = false;
        return;
      }
      const internal = frame === current;
      try {
        const child = frame.contentWindow;
        if (!child) throw Error();
        const loaded = resolveRoute(child.location.href, location.href);
        if (!loaded) {
          window.bgShellDispose?.();
          location.replace(child.location.href);
          return;
        }
        activate(
          frame,
          loaded,
          internal ? true : replace,
          Date.now(),
          options.scope(),
        );
        currentValid = frameEpoch === invalidation;
        if (!internal)
          record({
            route: loaded.split("?")[0],
            durationMs: Math.round(performance.now() - started),
            outcome: "loaded",
            source: "loaded",
          });
        const doc = frame.contentDocument;
        doc?.addEventListener(
          "input",
          (event) => {
            const input = event.target as Element | null;
            if (
              event.isTrusted &&
              input?.nodeType === 1 &&
              input.closest("form") &&
              !(
                input.tagName === "INPUT" &&
                (input as HTMLInputElement).type === "search"
              )
            )
              dirty = true;
          },
          true,
        );
        doc?.addEventListener(
          "reset",
          () => {
            dirty = false;
          },
          true,
        );
      } catch {
        options.status.textContent = "Não foi possível abrir a tela.";
        options.host.setAttribute("aria-busy", "false");
        if (current) current.style.pointerEvents = "";
        record({
          route: route.split("?")[0],
          durationMs: Math.round(performance.now() - started),
          outcome: "error",
        });
        options.onError("Não foi possível abrir a tela.");
      }
    });
    options.host.append(frame);
  };
  window.bgShellDispose = () => {
    dirty = false;
    generation++;
    pending?.remove();
    current?.remove();
    pending = current = null;
    invalidate();
    options.host.replaceChildren();
  };
  window.bgShellNavigate = navigate;
  window.bgShellContext = options.onContext;
  window.addEventListener("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const a = target.closest<HTMLAnchorElement>("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const route = resolveRoute(a.href, location.href);
    if (route) {
      event.preventDefault();
      void navigate(route);
    }
  });
  window.addEventListener("popstate", () => {
    void navigate(location.href, true);
  });
  void navigate(options.initial, true);
}
