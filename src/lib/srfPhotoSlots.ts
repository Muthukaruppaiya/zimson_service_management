export type SrfWatchPhotoKind =
  | "front"
  | "back"
  | "strap_up"
  | "strap_down"
  | "serial"
  | "crown"
  | "dial"
  | "clasp"
  | "bezel"
  | "damage";

export const SRF_WATCH_PHOTO_KINDS: readonly SrfWatchPhotoKind[] = [
  "front",
  "back",
  "strap_up",
  "strap_down",
  "serial",
  "crown",
  "dial",
  "clasp",
  "bezel",
  "damage",
] as const;

export const SRF_DOCUMENT_PHOTO_KIND = "document" as const;

export const SRF_MAX_WATCH_PHOTOS = SRF_WATCH_PHOTO_KINDS.length;

/** Minimum watch photos required — any categories, not specific slots. */
export const SRF_MIN_WATCH_PHOTOS_REQUIRED = 4;

export const SRF_PHOTO_SLOT_LABELS: Record<SrfWatchPhotoKind, string> = {
  front: "Watch front",
  back: "Watch back",
  strap_up: "Strap up",
  strap_down: "Strap down",
  serial: "Serial number",
  crown: "Crown",
  dial: "Dial",
  clasp: "Clasp / buckle",
  bezel: "Bezel",
  damage: "Damage (if any)",
};

export type SrfPhotoKindStored = SrfWatchPhotoKind | typeof SRF_DOCUMENT_PHOTO_KIND;

export function srfWatchPhotoKindsListHint(): string {
  return `${SRF_WATCH_PHOTO_KINDS.join(", ")}, or document`;
}

export function srfMinWatchPhotosFinalizeError(uploadedCount: number): string {
  return `Upload at least ${SRF_MIN_WATCH_PHOTOS_REQUIRED} watch photos before finalizing (any categories — you have ${uploadedCount}).`;
}

export function srfWatchPhotoKindsPresent(
  uploadedKinds: Iterable<string | null | undefined>,
): Set<SrfWatchPhotoKind> {
  const present = new Set<SrfWatchPhotoKind>();
  for (const raw of uploadedKinds) {
    const kind = normalizeSrfPhotoKind(raw);
    if (kind && kind !== SRF_DOCUMENT_PHOTO_KIND) {
      present.add(kind);
    }
  }
  return present;
}

export function countSrfWatchPhotos(uploadedKinds: Iterable<string | null | undefined>): number {
  return srfWatchPhotoKindsPresent(uploadedKinds).size;
}

export function srfPhotoKindLabel(kind?: string | null): string {
  const normalized = normalizeSrfPhotoKind(kind);
  if (normalized && normalized !== SRF_DOCUMENT_PHOTO_KIND && normalized in SRF_PHOTO_SLOT_LABELS) {
    return SRF_PHOTO_SLOT_LABELS[normalized];
  }
  const raw = String(kind ?? "").trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ") : "Photo";
}

/** Value sent on upload (`watch_back` avoids some proxies/WAFs mishandling bare `back`). */
export function srfPhotoKindUploadValue(kind: SrfPhotoKindStored): string {
  if (kind === SRF_DOCUMENT_PHOTO_KIND) return "document";
  return `watch_${kind}`;
}

function normalizeLegacyWatchKind(slot: string): SrfWatchPhotoKind | null {
  if (slot === "strap") return "strap_up";
  if (slot === "other") return "dial";
  if (slot === "other_2") return "clasp";
  if (slot === "other_3") return "bezel";
  if ((SRF_WATCH_PHOTO_KINDS as readonly string[]).includes(slot)) {
    return slot as SrfWatchPhotoKind;
  }
  return null;
}

/** Normalize API / DB photo kind (accepts `watch_back` or legacy `back`). Returns null if missing. */
export function normalizeSrfPhotoKind(input: string | null | undefined): SrfPhotoKindStored | null {
  const v = String(input ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "document") return "document";
  if (v.startsWith("watch_")) {
    const slot = v.slice(6);
    const normalized = normalizeLegacyWatchKind(slot);
    if (normalized) return normalized;
  }
  const legacy = normalizeLegacyWatchKind(v);
  if (legacy) return legacy;
  return null;
}
