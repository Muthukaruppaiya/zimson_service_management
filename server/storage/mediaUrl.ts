/** Canonical browser URL for a stored file path (local disk or S3). */
export function publicMediaUrl(storagePath: string): string {
  const p = storagePath.replace(/\\/g, "/").trim().replace(/^\//, "");
  if (!p) return "";
  if (p.startsWith("api/media/")) return `/${p}`;
  if (p.startsWith("uploads/")) return `/api/media/${p.slice("uploads/".length)}`;
  return `/${p}`;
}
