import type { MastersIndiaEdocConfig } from "./config";

let tokenCache: { token: string; expMs: number } | null = null;

export function clearEdocTokenCache(): void {
  tokenCache = null;
}

export async function getEdocAccessToken(cfg: MastersIndiaEdocConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expMs > now + 120_000) {
    return tokenCache.token;
  }

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: cfg.username,
      password: cfg.password,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    access?: string;
    access_token?: string;
    token?: string;
    refresh?: string;
    expires_in?: number;
    detail?: string;
    message?: string;
    non_field_errors?: string[];
  };

  const token = json.access ?? json.access_token ?? json.token;
  if (!res.ok || !token) {
    const msg =
      json.detail ??
      json.message ??
      (Array.isArray(json.non_field_errors) ? json.non_field_errors.join("; ") : null) ??
      res.statusText ??
      "Masters India e-doc token request failed";
    throw new Error(msg);
  }

  const expiresIn =
    typeof json.expires_in === "number" && json.expires_in > 60 ? json.expires_in : 86_400;
  tokenCache = { token: String(token), expMs: now + expiresIn * 1000 };
  return tokenCache.token;
}
