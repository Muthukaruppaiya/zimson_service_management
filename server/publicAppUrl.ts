import type { Request } from "express";

function header(req: Request, name: string): string {
  const v = req.headers[name];
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function originFromUrl(urlStr: string): string | null {
  const s = urlStr.trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Base URL of the SPA (where /track, /service/srf-capture, etc. are served).
 * - Set APP_BASE_URL or PUBLIC_APP_URL in production (e.g. http://192.168.1.10:5173 or https://your-domain.com).
 * - In dev, the browser sends Origin (http://localhost:5173) on API calls via Vite proxy — that wins when env is unset.
 * - If the request hits the API directly (Host ends with API port), map to WEB_DEV_PORT (default 5173).
 */
export function resolvePublicAppBaseUrl(req: Request): string {
  const envUrl = appBaseUrlFromEnvVars();
  if (envUrl) return envUrl;

  const origin = originFromUrl(header(req, "origin"));
  if (origin) return origin;

  const referer = originFromUrl(header(req, "referer"));
  if (referer) return referer;

  const protoHeader = header(req, "x-forwarded-proto");
  const xfHost = header(req, "x-forwarded-host");
  const hostHeader = xfHost || header(req, "host");
  if (protoHeader && hostHeader) {
    const h = hostHeader.split(",")[0].trim();
    const p = protoHeader.split(",")[0].trim();
    return `${p}://${h}`.replace(/\/+$/, "");
  }

  const webPort = String(process.env.WEB_DEV_PORT ?? "5173").trim() || "5173";
  const apiPort = String(process.env.PORT ?? "4000").trim() || "4000";
  const scheme = req.protocol === "https" ? "https" : "http";

  if (hostHeader) {
    const rawHost = hostHeader.split(",")[0].trim();
    const m = rawHost.match(/^(.+):(\d+)$/);
    if (m) {
      const [, hostname, port] = m;
      if (port === apiPort) {
        const displayHost = hostname === "127.0.0.1" ? "localhost" : hostname;
        return `${scheme}://${displayHost}:${webPort}`.replace(/\/+$/, "");
      }
    }
    let hostToUse = rawHost;
    if (rawHost.startsWith("127.0.0.1:")) {
      hostToUse = `localhost:${rawHost.slice("127.0.0.1:".length)}`;
    }
    return `${scheme}://${hostToUse}`.replace(/\/+$/, "");
  }

  return `http://localhost:${webPort}`;
}

/** For jobs that only have env (e.g. future SMS worker) — no Request. */
export function publicAppBaseUrlFromEnv(): string {
  const envUrl = appBaseUrlFromEnvVars();
  if (envUrl) return envUrl;
  const webPort = String(process.env.WEB_DEV_PORT ?? "5173").trim() || "5173";
  return `http://localhost:${webPort}`;
}

function appBaseUrlFromEnvVars(): string {
  return (process.env.APP_BASE_URL ?? process.env.MESSAGING_PUBLIC_BASE_URL ?? process.env.PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
}

/** Prefer APP_BASE_URL / MESSAGING_PUBLIC_BASE_URL (emails, WhatsApp); fall back to request Origin. */
export function getAppBaseUrl(req?: Request): string {
  const envUrl = appBaseUrlFromEnvVars();
  if (envUrl) return envUrl;
  if (req) return resolvePublicAppBaseUrl(req);
  return publicAppBaseUrlFromEnv();
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isLocalOrPrivateAppHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (LOCAL_HOSTS.has(h)) return true;
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/**
 * Base URL for links inside emails (password reset, tracking).
 * Must be a public https URL — Gmail disables localhost / private IP links.
 */
export function getEmailActionBaseUrl(req?: Request): string {
  const envUrl = appBaseUrlFromEnvVars();
  if (envUrl) return normalizeEmailActionBaseUrl(envUrl);

  if (req) {
    const fromReq = resolvePublicAppBaseUrl(req);
    if (!isLocalOrPrivateAppHost(new URL(fromReq).hostname)) {
      return normalizeEmailActionBaseUrl(fromReq);
    }
  }

  throw new Error(
    "APP_BASE_URL must be set to your public site (e.g. https://zimsonwatchcare.com). " +
      "localhost links do not work in Gmail or on mobile.",
  );
}

/** Use https for real domains; block localhost in email hrefs. */
export function normalizeEmailActionBaseUrl(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  if (isLocalOrPrivateAppHost(u.hostname)) {
    throw new Error(
      `Email links cannot use ${u.hostname}. Set APP_BASE_URL=https://zimsonwatchcare.com in .env`,
    );
  }
  if (u.protocol === "http:" && process.env.NODE_ENV === "production") {
    u.protocol = "https:";
  }
  if (u.hostname.endsWith("zimsonwatchcare.com") && u.protocol === "http:") {
    u.protocol = "https:";
  }
  return `${u.protocol}//${u.host}`;
}

export function buildPasswordResetUrl(req: Request, rawToken: string): string {
  const base = getEmailActionBaseUrl(req);
  return `${base}/login/reset-password?token=${encodeURIComponent(rawToken)}`;
}
