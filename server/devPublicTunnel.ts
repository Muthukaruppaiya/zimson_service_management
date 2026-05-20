import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getMessagingPublicBaseUrl } from "./messaging/config";

let tunnelChild: ChildProcess | null = null;

function logTunnelBanner(url: string, provider: string): void {
  console.log("");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  WhatsApp PDF public URL (${provider})`);
  console.log(`  MESSAGING_PUBLIC_BASE_URL=${url}`);
  console.log(`  Open once in browser, then test PDF:`);
  console.log(`  ${url}/uploads/invoice-pdf/`);
  if (provider.includes("localtunnel") || provider.includes("loca")) {
    console.log("  loca.lt often fails WhatsApp (502/408) — use cloudflared or ngrok.");
  }
  console.log("══════════════════════════════════════════════════════════");
  console.log("");
}

/** cloudflared is often installed but not on PATH (winget → Program Files). */
function resolveCloudflaredBin(): string | null {
  const fromEnv = process.env.CLOUDFLARED_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const pf64 = process.env.ProgramFiles ?? "C:\\Program Files";
    candidates.push(
      join(pf, "cloudflared", "cloudflared.exe"),
      join(pf64, "cloudflared", "cloudflared.exe"),
    );
  } else {
    candidates.push("/usr/local/bin/cloudflared", "/opt/homebrew/bin/cloudflared");
  }
  candidates.push("cloudflared");

  for (const c of candidates) {
    if (c === "cloudflared") return c;
    if (existsSync(c)) return c;
  }
  return null;
}

function startCloudflaredTunnel(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const bin = resolveCloudflaredBin();
    if (!bin) {
      console.warn(
        "[dev-tunnel] cloudflared not found. Install: winget install Cloudflare.cloudflared",
      );
      resolve(null);
      return;
    }

    const args = ["tunnel", "--url", `http://127.0.0.1:${port}`];
    const proc = spawn(bin, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    tunnelChild = proc;

    let resolved = false;
    const done = (url: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(url);
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        console.warn("[dev-tunnel] cloudflared timed out starting (25s).");
        proc.kill();
        done(null);
      }
    }, 25_000);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) {
        done(match[0].replace(/\/$/, ""));
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("error", (err) => {
      console.warn("[dev-tunnel] cloudflared spawn error:", err.message);
      done(null);
    });
    proc.on("exit", (code) => {
      if (!resolved && code !== 0) {
        console.warn(`[dev-tunnel] cloudflared exited with code ${code ?? "?"}`);
        done(null);
      }
    });
  });
}

async function startLocaltunnel(port: number): Promise<string | null> {
  try {
    const { default: localtunnel } = await import("localtunnel");
    const tunnel = await localtunnel({ port });
    const url = tunnel.url.replace(/\/$/, "");
    tunnel.on("close", () => {
      console.warn("[dev-tunnel] localtunnel closed. WhatsApp PDF links will break.");
    });
    console.warn(
      "[dev-tunnel] WARNING: loca.lt often returns 502 Bad Gateway or 408 for WhatsApp. Set CLOUDFLARED_PATH or use ngrok.",
    );
    return url;
  } catch (e) {
    console.error("[dev-tunnel] localtunnel failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Quick check that the tunnel forwards to our API (avoids sending dead loca.lt links). */
async function verifyTunnelBaseUrl(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/me`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Public HTTPS URL for invoice PDFs in local dev.
 * WhatsApp/Meta cannot use localhost; loca.lt often 502/408 — cloudflared/ngrok work.
 */
export async function startDevPublicTunnel(port: number): Promise<string | null> {
  if (process.env.MESSAGING_AUTO_TUNNEL !== "true") return null;
  if (process.env.NODE_ENV === "production") return null;

  const existing = getMessagingPublicBaseUrl();
  if (existing) {
    console.log(`[dev-tunnel] Using MESSAGING_PUBLIC_BASE_URL=${existing}`);
    return existing;
  }

  const provider = (process.env.MESSAGING_TUNNEL_PROVIDER ?? "cloudflared").trim().toLowerCase();

  let url: string | null = null;
  let usedProvider = provider;

  if (provider === "cloudflared" || provider === "cloudflare") {
    url = await startCloudflaredTunnel(port);
    usedProvider = "cloudflared (trycloudflare.com)";
    if (!url) {
      console.warn("[dev-tunnel] cloudflared unavailable, trying localtunnel…");
      url = await startLocaltunnel(port);
      usedProvider = "localtunnel (fallback — unreliable for WhatsApp)";
    }
  } else if (provider === "localtunnel" || provider === "loca") {
    url = await startLocaltunnel(port);
    usedProvider = "localtunnel";
  } else {
    console.warn(`[dev-tunnel] Unknown MESSAGING_TUNNEL_PROVIDER=${provider}`);
  }

  if (!url) {
    console.error(
      "[dev-tunnel] No tunnel. Add to .env:\n" +
        "  CLOUDFLARED_PATH=C:\\Program Files (x86)\\cloudflared\\cloudflared.exe\n" +
        "Or: ngrok http 4000 → MESSAGING_PUBLIC_BASE_URL=https://xxxx.ngrok-free.app",
    );
    return null;
  }

  await new Promise((r) => setTimeout(r, 2000));
  const ok = await verifyTunnelBaseUrl(url);
  if (!ok) {
    console.error(
      `[dev-tunnel] Tunnel URL not reachable (${url}) — Bad Gateway likely. ` +
        "Restart npm run dev or use cloudflared/ngrok. WhatsApp invoices will fail until this works.",
    );
    if (usedProvider.includes("localtunnel")) {
      const cf = await startCloudflaredTunnel(port);
      if (cf) {
        const cfOk = await verifyTunnelBaseUrl(cf);
        if (cfOk) {
          url = cf;
          usedProvider = "cloudflared (trycloudflare.com)";
        }
      }
    }
  }

  process.env.MESSAGING_PUBLIC_BASE_URL = url;
  logTunnelBanner(url, usedProvider);
  return url;
}

export function stopDevPublicTunnel(): void {
  tunnelChild?.kill();
  tunnelChild = null;
}
