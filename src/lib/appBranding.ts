import { apiJson } from "./api";
import { loadDocumentTemplateStore } from "./documentTemplates";

export const DEFAULT_APP_LOGO_URL = "/icons.svg";
export const DEFAULT_APP_FAVICON_URL = "/icons.svg";
const CACHE_KEY = "zimson.app.branding.cache.v1";

type BrandingCache = {
  logoUrl: string;
  faviconUrl: string;
};

function normalizeBrandingUrl(url: string): string {
  const out = url.trim();
  if (!out) return "";
  // Build output paths under /dist are not stable in dev/runtime.
  if (out.startsWith("/dist/")) return "";
  return out;
}

function readCache(): BrandingCache {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { logoUrl: DEFAULT_APP_LOGO_URL, faviconUrl: DEFAULT_APP_FAVICON_URL };
    const parsed = JSON.parse(raw) as Partial<BrandingCache>;
    const logoUrl = normalizeBrandingUrl(String(parsed.logoUrl ?? "").trim());
    const faviconUrl = normalizeBrandingUrl(String(parsed.faviconUrl ?? "").trim());
    return {
      logoUrl: logoUrl || DEFAULT_APP_LOGO_URL,
      faviconUrl: faviconUrl || logoUrl || DEFAULT_APP_FAVICON_URL,
    };
  } catch {
    return { logoUrl: DEFAULT_APP_LOGO_URL, faviconUrl: DEFAULT_APP_FAVICON_URL };
  }
}

function writeCache(cache: BrandingCache): void {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function getAppLogoUrl(): string {
  const cacheLogo = normalizeBrandingUrl(readCache().logoUrl);
  if (cacheLogo && cacheLogo !== DEFAULT_APP_LOGO_URL) return cacheLogo;
  try {
    const localLogo = normalizeBrandingUrl(loadDocumentTemplateStore().branding.companyLogoUrl?.trim() ?? "");
    if (localLogo) return localLogo;
  } catch {
    /* ignore */
  }
  return cacheLogo || DEFAULT_APP_LOGO_URL;
}

export function getAppFaviconUrl(): string {
  const cacheFav = normalizeBrandingUrl(readCache().faviconUrl);
  if (cacheFav && cacheFav !== DEFAULT_APP_FAVICON_URL) return cacheFav;
  try {
    const localLogo = normalizeBrandingUrl(loadDocumentTemplateStore().branding.companyLogoUrl?.trim() ?? "");
    if (localLogo) return localLogo;
  } catch {
    /* ignore */
  }
  return getAppLogoUrl() || cacheFav || DEFAULT_APP_FAVICON_URL;
}

export function applyAppFavicon(url: string): void {
  const href = normalizeBrandingUrl(url) || getAppLogoUrl() || DEFAULT_APP_FAVICON_URL;
  const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((ln) => {
    ln.href = href;
  });
}

export async function refreshAppBrandingFromServer(): Promise<void> {
  try {
    const out = await apiJson<{ settings: { appLogoUrl?: string; appFaviconUrl?: string } }>("/api/settings/tax");
    const logo = normalizeBrandingUrl(String(out.settings.appLogoUrl ?? "").trim());
    const favicon = normalizeBrandingUrl(String(out.settings.appFaviconUrl ?? "").trim());
    const cache: BrandingCache = {
      logoUrl: logo || DEFAULT_APP_LOGO_URL,
      faviconUrl: favicon || logo || DEFAULT_APP_FAVICON_URL,
    };
    writeCache(cache);
    applyAppFavicon(cache.faviconUrl);
    window.dispatchEvent(new Event("zimson-branding-updated"));
  } catch {
    applyAppFavicon(getAppFaviconUrl());
  }
}
