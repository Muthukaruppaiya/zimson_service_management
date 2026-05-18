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
