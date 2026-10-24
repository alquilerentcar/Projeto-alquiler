export declare const routes: Readonly<Record<string, string>>;
export declare function resolveRoute(value: string, base: string): string | null;
export declare function isReadOnlyRpc(path: string): boolean;
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
