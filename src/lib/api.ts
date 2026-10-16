/** When false, spare catalogue uses browser localStorage instead of the API. */
export function useApiMode(): boolean {
  return import.meta.env.VITE_USE_API !== "false";
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type ApiSaveErrorEvent = {
  message: string;
  status: number;
  path: string;
  method: string;
};

type ApiSaveErrorListener = (event: ApiSaveErrorEvent) => void;

const saveErrorListeners = new Set<ApiSaveErrorListener>();

/** Paths whose write failures are handled by their own screens or are background-only. */
const SILENT_SAVE_ERROR_PREFIXES = ["/api/auth/", "/api/notifications"];

export function onApiSaveError(listener: ApiSaveErrorListener): () => void {
  saveErrorListeners.add(listener);
  return () => {
    saveErrorListeners.delete(listener);
  };
}

/** Raise the global save-error popup (for uploads that use `fetch` directly). */
export function reportApiSaveError(message: string, info?: Partial<Omit<ApiSaveErrorEvent, "message">>): void {
  const event: ApiSaveErrorEvent = {
    message: message || "Request failed",
    status: info?.status ?? 0,
    path: info?.path ?? "",
    method: info?.method ?? "POST",
  };
  for (const fn of saveErrorListeners) {
    try {
      fn(event);
    } catch {
      /* listener errors must not break the caller */
    }
  }
}

/** Show the global error popup for a validation / UI message. */
export function showErrorPopup(message: string): void {
  reportApiSaveError(message, { status: -1, method: "" });
}

function shouldReportSaveError(path: string, method: string, silent: boolean | undefined): boolean {
  if (silent) return false;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const p = path.replace(/^https?:\/\/[^/]+/i, "");
  return !SILENT_SAVE_ERROR_PREFIXES.some((prefix) => p.startsWith(prefix));
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit & { json?: unknown; silent?: boolean },
): Promise<T> {
  const { json, headers, silent, ...rest } = init ?? {};
  const method = String(rest.method ?? "GET").toUpperCase();
  const report = shouldReportSaveError(path, method, silent);
  const h = new Headers(headers);
  if (json !== undefined) {
    h.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: h,
      credentials: "include",
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (e) {
    if (report && !(e instanceof DOMException && e.name === "AbortError")) {
      reportApiSaveError("Could not reach the server. Check your connection and try again.", { status: 0, path, method });
    }
    throw e;
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: string }).error)
        : typeof data === "object" && data !== null && "message" in data
          ? String((data as { message: string }).message)
          : res.statusText;
    if (report) reportApiSaveError(msg || "Request failed", { status: res.status, path, method });
    throw new ApiError(msg || "Request failed", res.status, data);
  }
  return data as T;
}
