import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../lib/api";

export function SrfPhotoCapturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const [session, setSession] = useState<{
    srfId: string;
    reference: string;
    customerName: string;
    watch: string;
    photoCount: number;
    photos: Array<{ id: string; photoKind?: string; filePath: string }>;
  } | null>(null);
  const [status, setStatus] = useState<string>("Checking link...");
  const [busy, setBusy] = useState(false);
  const [photoKind, setPhotoKind] = useState<"front" | "back" | "strap" | "serial" | "damage" | "other">("front");

  const canUpload = useMemo(() => !!token && !!session, [token, session]);

  async function refresh() {
    if (!token) {
      setStatus("Missing token.");
      return;
    }
    try {
      const data = await apiJson<{
        srfId: string;
        reference: string;
        customerName: string;
        watch: string;
        photoCount: number;
        photos: Array<{ id: string; photoKind?: string; filePath: string }>;
      }>(
        `/api/public/srf-photo/session?token=${encodeURIComponent(token)}`,
      );
      setSession(data);
      setStatus("Capture link active.");
    } catch (e) {
      setSession(null);
      setStatus(e instanceof Error ? e.message : "Capture link not valid.");
    }
  }

  useEffect(() => {
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("token", token);
        form.append("photoKind", photoKind);
        form.append("file", file);
        const res = await fetch("/api/public/srf-photo/upload", { method: "POST", body: form });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "Upload failed.");
      }
      await refresh();
      setStatus("Upload complete.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="text-xl font-semibold text-zimson-900">SRF Camera Upload</h1>
      <p className="mt-1 text-sm text-stone-600">{status}</p>
      {session ? (
        <div className="mt-4 rounded-xl border border-zimson-200 bg-white p-4">
          <p className="text-sm"><strong>SRF:</strong> {session.reference}</p>
          <p className="text-sm"><strong>Customer:</strong> {session.customerName}</p>
          <p className="text-sm"><strong>Watch:</strong> {session.watch}</p>
          <p className="text-sm"><strong>Uploaded:</strong> {session.photoCount}</p>
          <p className="mt-2 text-xs text-stone-600">Required photos: Front, Back, Strap, Serial Number, and Damage (if any).</p>
        </div>
      ) : null}
      <div className="mt-4">
        <label className="block text-sm font-medium text-stone-700">
          Photo type
          <select
            value={photoKind}
            onChange={(e) => setPhotoKind(e.target.value as "front" | "back" | "strap" | "serial" | "damage" | "other")}
            className="mt-2 block w-full rounded-xl border border-zimson-300 bg-white px-3 py-2 text-sm"
          >
            <option value="front">Watch front</option>
            <option value="back">Watch back</option>
            <option value="strap">Strap</option>
            <option value="serial">Serial number</option>
            <option value="damage">Damage image</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-stone-700">Capture or choose photos</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={!canUpload || busy}
          onChange={(e) => void upload(e.target.files)}
          className="mt-2 block w-full text-sm"
        />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void refresh()}
        className="mt-4 rounded-xl border border-zimson-300 bg-white px-4 py-2 text-sm font-semibold text-zimson-900 hover:bg-zimson-50 disabled:opacity-50"
      >
        Refresh status
      </button>
      {session && session.photos?.length ? (
        <div className="mt-4 rounded-xl border border-zimson-200 bg-white p-3">
          <p className="text-sm font-semibold text-zimson-900">Uploaded photo preview</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {session.photos.map((p) => (
              <div key={p.id} className="rounded-lg border border-zimson-200 p-2">
                <img src={`/${p.filePath}`} alt={p.photoKind ?? "watch photo"} className="h-24 w-full rounded object-cover" />
                <p className="mt-1 text-[11px] capitalize text-stone-600">{p.photoKind ?? "other"}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-stone-500">
        This upload link is one-time/temporary and will be disabled once SRF booking is finalized at counter.
      </p>
    </div>
  );
}
