/** Absolute URL for a file in Vite `public/` (works on any client route). */
export function lottiePublicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${normalized}`.replace(/([^:]\/)\/+/g, "$1");
}

export function resolveLottieFetchUrl(src: string): string {
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  return lottiePublicUrl(src);
}
