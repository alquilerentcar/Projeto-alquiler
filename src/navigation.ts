export const routes: Readonly<Record<string, string>> = Object.freeze({
  dashboard: "/locacao/dashboard",
  clientes: "/cadastros/clientes",
  carros: "/cadastros/carros",
  fornecedores: "/cadastros/fornecedores",
  "modelos-contrato": "/cadastros/modelos-contrato",
  certificados: "/cadastros/certificados",
  frota: "/locacao/frota",
  locacoes: "/locacao/locacoes",
  contratos: "/locacao/contratos",
  contrato: "/locacao/contrato",
  assinaturas: "/locacao/assinaturas",
  registros: "/locacao/registros",
  alteracoes: "/locacao/alteracoes",
  substituicao: "/locacao/substituicao",
  recibos: "/locacao/recibos",
  distratos: "/locacao/distratos",
  "documentos-modelo": "/locacao/documentos-modelo",
  financeiro: "/financeiro",
  notificacoes: "/notificacoes",
  empresa: "/administracao/empresa",
  acessos: "/administracao/acessos",
  controle: "/controle",
  perfil: "/conta/perfil",
  historico: "/historico",
  relatorios: "/relatorios",
  locatario: "/locatario",
});
export function resolveRoute(value: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== new URL(base).origin || url.username || url.password)
    return null;
  const key = Object.keys(routes).find(
    (k) =>
      url.pathname === routes[k] ||
      url.pathname === "/" + k ||
      url.pathname === "/" + k + ".html",
  );
  if (!key) return null;
  return routes[key] + url.search + url.hash;
}
export function isReadOnlyRpc(path: string): boolean {
  return new Set([
    "acessos_contexto",
    "modelos_documentos_menu",
    "modelos_documentos_publicados",
    "modelo_contrato_vigente",
    "frota_painel",
    "cliente_debitos_painel",
    "substituicao_configuracao",
    "substituicao_limite_fotos",
    "vistoriadores_listar",
  ]).has(path.split("/").pop() || "");
}
export interface NavigationMeasurement {
  route: string;
  durationMs: number;
  outcome: "loaded" | "error" | "cancelled";
  source?: "loaded" | "reused";
}
export interface NavigationOptions {
  host: HTMLElement;
  status: HTMLElement;
  initial: string;
  onContext: (context: unknown) => void;
  scope: () => string;
  validate: (route: string) => Promise<boolean>;
  onError: (message: string) => void;
}
declare global {
  interface Window {
    __grupoShell?: boolean;
    bgShellNavigate?: (route: string, replace?: boolean) => Promise<void>;
    bgShellContext?: (context: unknown) => void;
    bgNavigationMetrics?: NavigationMeasurement[];
    bgShellDispose?: () => void;
  }
}
