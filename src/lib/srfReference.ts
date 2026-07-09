/** Customer-facing SRF reference — prefers root booking ref over archived/local suffixes. */
export function displaySrfReference(
  reference: string | null | undefined,
  transferSourceReference?: string | null,
): string {
  const root = String(transferSourceReference ?? "").trim();
  if (root && !/-ARCH-/i.test(root)) return root;
  const raw = String(reference ?? "").trim();
  const stripped = raw.replace(/-ARCH-.*$/i, "").trim();
  return stripped || root || raw;
}

export function normalizeSrfReferenceList(refs: string[]): string[] {
  const out = new Set<string>();
  for (const r of refs) {
    const n = displaySrfReference(r);
    if (n) out.add(n);
  }
  return [...out].sort();
}
