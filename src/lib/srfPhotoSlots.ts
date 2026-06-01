export type SrfWatchPhotoKind = "front" | "back" | "strap" | "serial" | "damage" | "other";

export const SRF_WATCH_PHOTO_KINDS: readonly SrfWatchPhotoKind[] = [
  "front",
  "back",
  "strap",
  "serial",
  "damage",
  "other",
] as const;

export const SRF_DOCUMENT_PHOTO_KIND = "document" as const;

export const SRF_MAX_WATCH_PHOTOS = 6;

export const SRF_PHOTO_SLOT_LABELS: Record<SrfWatchPhotoKind, string> = {
  front: "Watch front",
  back: "Watch back",
  strap: "Strap or bracelet",
  serial: "Serial number",
  damage: "Damage (if any)",
  other: "Other",
};

export type SrfPhotoKindStored = SrfWatchPhotoKind | typeof SRF_DOCUMENT_PHOTO_KIND;

/** Value sent on upload (`watch_back` avoids some proxies/WAFs mishandling bare `back`). */
export function srfPhotoKindUploadValue(kind: SrfPhotoKindStored): string {
  if (kind === SRF_DOCUMENT_PHOTO_KIND) return "document";
  return `watch_${kind}`;
}

/** Normalize API / DB photo kind (accepts `watch_back` or legacy `back`). */
export function normalizeSrfPhotoKind(input: string | null | undefined): SrfPhotoKindStored {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "document") return "document";
  if (v.startsWith("watch_")) {
    const slot = v.slice(6);
    if ((SRF_WATCH_PHOTO_KINDS as readonly string[]).includes(slot)) {
      return slot as SrfWatchPhotoKind;
    }
  }
  if ((SRF_WATCH_PHOTO_KINDS as readonly string[]).includes(v)) {
    return v as SrfWatchPhotoKind;
  }
  return "other";
}
