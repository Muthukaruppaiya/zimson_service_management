import { resolveLottieFetchUrl } from "./lottiePublicUrl";

const cache = new Map<string, Promise<object>>();

export function fetchLottieAnimation(src: string): Promise<object> {
  const url = resolveLottieFetchUrl(src);
  const hit = cache.get(url);
  if (hit) return hit;

  const pending = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load animation (${r.status})`);
      return r.json() as Promise<object>;
    })
    .catch((err) => {
      cache.delete(url);
      throw err;
    });

  cache.set(url, pending);
  return pending;
}

export function prefetchLottieAnimation(src: string): void {
  void fetchLottieAnimation(src).catch(() => {
    /* ignore — UI will retry when shown */
  });
}
