import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../lib/api";
import { SRF_CUSTOMER_PHOTO_MAX_BYTES, srfCustomerPhotoMaxSizeLabel } from "../../lib/srfPhotoLimits";

type PhotoKind = "front" | "back" | "strap" | "serial" | "damage" | "other";

type SessionPhoto = { id: string; photoKind?: string; filePath: string };

const PHOTO_SLOTS: { kind: PhotoKind; title: string; hint: string; required: boolean }[] = [
  { kind: "front", title: "Watch front", hint: "Dial and crystal facing you", required: true },
  { kind: "back", title: "Watch back", hint: "Case back / movement side", required: true },
  { kind: "strap", title: "Strap or bracelet", hint: "Clasp and links visible", required: true },
  { kind: "serial", title: "Serial number", hint: "Legible engraving or sticker", required: true },
  { kind: "damage", title: "Damage (if any)", hint: "Skip if the watch has no visible damage", required: false },
  { kind: "other", title: "Other", hint: "Only if counter staff asked for an extra shot", required: false },
];

function parseApiError(text: string): string {
  const t = text.trim();
  try {
    const j = JSON.parse(t) as { error?: string };
    if (j && typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* plain text */
  }
  return t || "Something went wrong.";
}

export function SrfPhotoCapturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadKindRef = useRef<PhotoKind>("front");

  const [session, setSession] = useState<{
    srfId: string;
    reference: string;
    customerName: string;
    watch: string;
    photoCount: number;
    photos: SessionPhoto[];
  } | null>(null);
  const [status, setStatus] = useState<string>("Checking link…");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<PhotoKind>("front");

  const canUpload = useMemo(() => !!token && !!session, [token, session]);

  const photoByKind = useMemo(() => {
    const m = new Map<string, SessionPhoto>();
    for (const p of session?.photos ?? []) {
      const k = (p.photoKind ?? "other").toLowerCase();
      m.set(k, p);
    }
    return m;
  }, [session?.photos]);

  const requiredDone = useMemo(() => {
    return PHOTO_SLOTS.filter((s) => s.required).every((s) => photoByKind.has(s.kind));
  }, [photoByKind]);

  const requiredTotal = useMemo(() => PHOTO_SLOTS.filter((s) => s.required).length, []);

  async function refresh() {
    if (!token) {
      setStatus("Missing link. Open the QR or link from the store again.");
      return;
    }
    try {
      const data = await apiJson<{
        srfId: string;
        reference: string;
        customerName: string;
        watch: string;
        photoCount: number;
        photos: SessionPhoto[];
      }>(`/api/public/srf-photo/session?token=${encodeURIComponent(token)}`);
      setSession(data);
      setStatus("You can upload or replace photos below.");
      setUploadError(null);
    } catch (e) {
      setSession(null);
      setStatus(e instanceof Error ? e.message : "This upload link is not valid.");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function openPickerForKind(kind: PhotoKind) {
    uploadKindRef.current = kind;
    setActiveKind(kind);
    setUploadError(null);
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;
    const file = files[0];
    const kind = uploadKindRef.current;

    setUploadError(null);
    if (file.size > SRF_CUSTOMER_PHOTO_MAX_BYTES) {
      setUploadError(
        `This image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please choose a photo under ${srfCustomerPhotoMaxSizeLabel()}.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("photoKind", kind);
      form.append("file", file);
      const res = await fetch("/api/public/srf-photo/upload", { method: "POST", body: form });
      const text = await res.text();
      if (!res.ok) throw new Error(parseApiError(text));
      await refresh();
      setStatus("Saved. You can continue with the next photo or go back to the counter.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 to-stone-200/90 pb-10 pt-6 text-stone-900">
      <div className="mx-auto w-full max-w-md px-4 sm:max-w-lg">
        <header className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zimson-700">Zimson service</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-zimson-950 sm:text-[1.65rem]">Watch photo upload</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{status}</p>
        </header>

        {uploadError ? (
          <div
            className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm"
            role="alert"
          >
            {uploadError}
          </div>
        ) : null}

        {session ? (
          <section className="mt-5 overflow-hidden rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wide text-amber-900/90">Booking summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-amber-950">SRF</dt>
                <dd className="text-amber-950/90">{session.reference}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-amber-950">Customer</dt>
                <dd className="text-amber-950/90">{session.customerName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-semibold text-amber-950">Watch</dt>
                <dd className="leading-snug text-amber-950/90">{session.watch}</dd>
              </div>
              <div className="flex gap-2 border-t border-amber-200/80 pt-2">
                <dt className="w-24 shrink-0 font-semibold text-amber-950">Progress</dt>
                <dd className="font-medium text-amber-950">
                  {PHOTO_SLOTS.filter((s) => s.required && photoByKind.has(s.kind)).length} of {requiredTotal} required
                  {requiredDone ? " · complete" : ""}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-xl border border-amber-300/60 bg-white/70 p-3 text-xs leading-relaxed text-amber-950/85">
              <p className="font-semibold text-amber-950">What we need</p>
              <p className="mt-1">
                One clear photo for each of: <strong>front</strong>, <strong>back</strong>, <strong>strap</strong>, and{" "}
                <strong>serial number</strong>. Add <strong>damage</strong> only if there is visible wear or impact. Each
                category keeps only your latest photo (uploading again replaces the previous one).
              </p>
              <p className="mt-2 text-amber-900/80">
                Max file size <strong>{srfCustomerPhotoMaxSizeLabel()}</strong> per photo. Use JPG or PNG from your
                gallery, or take a new picture.
              </p>
            </div>
          </section>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy}
          onChange={(e) => void upload(e.target.files)}
        />

        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-zimson-900">Photo checklist</h2>
          <p className="text-xs text-stone-600">Tap a row to add or replace that photo (one image per category).</p>
          <ul className="space-y-2">
            {PHOTO_SLOTS.map((slot) => {
              const shot = photoByKind.get(slot.kind);
              const isActive = activeKind === slot.kind;
              return (
                <li key={slot.kind}>
                  <button
                    type="button"
                    disabled={!canUpload || busy}
                    onClick={() => openPickerForKind(slot.kind)}
                    className={`flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left transition ${
                      shot
                        ? "border-emerald-200 bg-white shadow-sm"
                        : isActive
                          ? "border-zimson-400 bg-zimson-50/80 shadow-sm"
                          : "border-stone-200 bg-white/90 shadow-sm hover:border-zimson-300"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                      {shot ? (
                        <img
                          src={`/${shot.filePath}`}
                          alt={slot.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center px-1 text-center text-[10px] font-medium text-stone-400">
                          {slot.required ? "Required" : "Optional"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-stone-900">{slot.title}</span>
                        {shot ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                            Saved
                          </span>
                        ) : slot.required ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                            Needed
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-stone-600">{slot.hint}</p>
                      <p className="mt-2 text-xs font-semibold text-zimson-800">
                        {busy && isActive ? "Uploading…" : shot ? "Tap to replace" : "Tap to upload"}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="rounded-2xl border-2 border-zimson-400 bg-white px-5 py-3 text-sm font-semibold text-zimson-900 shadow-sm transition hover:bg-zimson-50 disabled:opacity-50"
          >
            Refresh status
          </button>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-stone-500">
          This link is temporary and stops working after the service desk finalises your booking. Photos are stored only
          for this repair request.
        </p>
      </div>
    </div>
  );
}
