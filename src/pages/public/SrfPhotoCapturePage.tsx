import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../lib/api";
import { SRF_CUSTOMER_PHOTO_MAX_BYTES, srfCustomerPhotoMaxSizeLabel } from "../../lib/srfPhotoLimits";
import {
  SRF_DOCUMENT_ACCEPT,
  SRF_WATCH_PHOTO_ACCEPT,
  validateSrfCustomerPhotoFile,
  validateSrfDocumentFile,
} from "../../lib/srfCustomerPhotoUpload";
import {
  SRF_DOCUMENT_PHOTO_KIND,
  SRF_MAX_WATCH_PHOTOS,
  SRF_MIN_WATCH_PHOTOS_REQUIRED,
  normalizeSrfPhotoKind,
  SRF_PHOTO_SLOT_LABELS,
  SRF_WATCH_PHOTO_KINDS,
  type SrfWatchPhotoKind,
} from "../../lib/srfPhotoSlots";

type SessionPhoto = { id: string; photoKind?: string; filePath: string; mime?: string };
type CameraTarget = "watch" | "document";

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

function isWatchPhotoKind(k: string): k is SrfWatchPhotoKind {
  return (SRF_WATCH_PHOTO_KINDS as readonly string[]).includes(k);
}

export function SrfPhotoCapturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement>(null);
  const documentGalleryInputRef = useRef<HTMLInputElement>(null);
  const documentCameraFallbackInputRef = useRef<HTMLInputElement>(null);
  const pendingKindRef = useRef<SrfWatchPhotoKind | "">("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
  const [selectedKind, setSelectedKind] = useState<SrfWatchPhotoKind | "">("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>("watch");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);
  const capturePreviewBlobRef = useRef<Blob | null>(null);

  const canUpload = useMemo(() => !!token && !!session, [token, session]);

  const photoByKind = useMemo(() => {
    const m = new Map<string, SessionPhoto>();
    for (const p of session?.photos ?? []) {
      const k = normalizeSrfPhotoKind(p.photoKind);
      if (k) m.set(k, p);
    }
    return m;
  }, [session?.photos]);

  const documentPhoto = photoByKind.get(SRF_DOCUMENT_PHOTO_KIND);

  /** Categories not uploaded yet — hidden from dropdown after each save. */
  const availableKinds = useMemo(
    () => SRF_WATCH_PHOTO_KINDS.filter((kind) => !photoByKind.has(kind)),
    [photoByKind],
  );

  const uploadedWatchPhotos = useMemo(
    () =>
      SRF_WATCH_PHOTO_KINDS.map((kind) => {
        const shot = photoByKind.get(kind);
        return shot ? { kind, shot } : null;
      }).filter((x): x is { kind: SrfWatchPhotoKind; shot: SessionPhoto } => x != null),
    [photoByKind],
  );

  const watchPhotoCount = uploadedWatchPhotos.length;
  const allWatchPhotosDone = watchPhotoCount >= SRF_MAX_WATCH_PHOTOS;

  const pickWatchKind = useCallback((kind: SrfWatchPhotoKind) => {
    setSelectedKind(kind);
    pendingKindRef.current = kind;
    setUploadError(null);
  }, []);

  const resolveActiveWatchKind = useCallback((): SrfWatchPhotoKind | null => {
    const k = pendingKindRef.current || selectedKind;
    return k && isWatchPhotoKind(k) ? k : null;
  }, [selectedKind]);

  useEffect(() => {
    if (selectedKind && photoByKind.has(selectedKind)) {
      const next = availableKinds[0];
      if (next) pickWatchKind(next);
      else {
        setSelectedKind("");
        pendingKindRef.current = "";
      }
      return;
    }
    if (!selectedKind && availableKinds.length > 0) {
      pickWatchKind(availableKinds[0]);
      return;
    }
    if (selectedKind && !availableKinds.includes(selectedKind)) {
      const next = availableKinds[0];
      if (next) pickWatchKind(next);
      else {
        setSelectedKind("");
        pendingKindRef.current = "";
      }
    }
  }, [availableKinds, selectedKind, photoByKind, pickWatchKind]);

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const clearCapturePreview = useCallback(() => {
    if (capturePreviewUrl) URL.revokeObjectURL(capturePreviewUrl);
    setCapturePreviewUrl(null);
    capturePreviewBlobRef.current = null;
  }, [capturePreviewUrl]);

  const closeCamera = useCallback(() => {
    clearCapturePreview();
    stopCameraStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }, [clearCapturePreview, stopCameraStream]);

  useEffect(() => {
    return () => stopCameraStream();
  }, [stopCameraStream]);

  useEffect(() => {
    if (!cameraOpen || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      /* ignored */
    });
  }, [cameraOpen, cameraStarting]);

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
      setStatus(
        `Add at least ${SRF_MIN_WATCH_PHOTOS_REQUIRED} watch photos (any categories). Up to ${SRF_MAX_WATCH_PHOTOS} types — one photo per type.`,
      );
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

  function prepareWatchUpload(kindOverride?: SrfWatchPhotoKind): boolean {
    const kind = kindOverride ?? resolveActiveWatchKind();
    if (!kind) {
      setUploadError("Select a photo category first.");
      return false;
    }
    pendingKindRef.current = kind;
    setSelectedKind(kind);
    setUploadError(null);
    return true;
  }

  function openGalleryPicker() {
    if (!prepareWatchUpload()) return;
    requestAnimationFrame(() => galleryInputRef.current?.click());
  }

  function openCameraFallbackInput(target: CameraTarget) {
    const input = target === "watch" ? cameraFallbackInputRef : documentCameraFallbackInputRef;
    requestAnimationFrame(() => input.current?.click());
  }

  async function startCamera(target: CameraTarget, watchKindOverride?: SrfWatchPhotoKind) {
    setCameraTarget(target);
    if (target === "watch" && !prepareWatchUpload(watchKindOverride)) return;
    setUploadError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      openCameraFallbackInput(target);
      return;
    }

    setCameraStarting(true);
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setUploadError("Could not open camera. Allow camera permission or use gallery upload.");
      openCameraFallbackInput(target);
    } finally {
      setCameraStarting(false);
    }
  }

  function openDocumentGallery() {
    setUploadError(null);
    requestAnimationFrame(() => documentGalleryInputRef.current?.click());
  }

  async function uploadFile(file: File, kind: string) {
    if (!token) return;
    setUploadError(null);
    const formatErr =
      kind === SRF_DOCUMENT_PHOTO_KIND
        ? validateSrfDocumentFile(file)
        : validateSrfCustomerPhotoFile(file);
    if (formatErr) {
      setUploadError(formatErr);
      return;
    }
    if (file.size > SRF_CUSTOMER_PHOTO_MAX_BYTES) {
      setUploadError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max ${srfCustomerPhotoMaxSizeLabel()}.`,
      );
      return;
    }

    setBusy(true);
    try {
      const storedKind =
        kind === SRF_DOCUMENT_PHOTO_KIND
          ? SRF_DOCUMENT_PHOTO_KIND
          : isWatchPhotoKind(kind)
            ? kind
            : null;
      if (!storedKind) {
        setUploadError("Select a valid photo category.");
        return;
      }
      const form = new FormData();
      form.append("token", token);
      form.append("kind", storedKind);
      form.append("photoKind", storedKind);
      form.append("file", file);
      const q = new URLSearchParams({ token, kind: storedKind, photoKind: storedKind });
      const uploadUrl = `/api/public/srf-photo/upload?${q.toString()}`;
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: form,
        headers: { "X-Srf-Photo-Kind": storedKind },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(parseApiError(text));
      await refresh();
      setStatus(
        kind === SRF_DOCUMENT_PHOTO_KIND
          ? "Document saved."
          : `${SRF_PHOTO_SLOT_LABELS[kind as SrfWatchPhotoKind] ?? kind} saved.`,
      );
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onWatchFileSelected(files: FileList | null) {
    if (!files?.length) return;
    const kind = resolveActiveWatchKind();
    if (!kind) {
      setUploadError("Select a photo category first.");
      return;
    }
    await uploadFile(files[0], kind);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraFallbackInputRef.current) cameraFallbackInputRef.current.value = "";
  }

  async function onDocumentFileSelected(files: FileList | null) {
    if (!files?.length) return;
    await uploadFile(files[0], SRF_DOCUMENT_PHOTO_KIND);
    if (documentGalleryInputRef.current) documentGalleryInputRef.current.value = "";
    if (documentCameraFallbackInputRef.current) documentCameraFallbackInputRef.current.value = "";
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setUploadError("Camera not ready. Wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setUploadError("Could not capture photo.");
      return;
    }
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setUploadError("Could not capture photo.");
      return;
    }
    stopCameraStream();
    clearCapturePreview();
    capturePreviewBlobRef.current = blob;
    setCapturePreviewUrl(URL.createObjectURL(blob));
  }

  async function confirmCaptureUpload() {
    const blob = capturePreviewBlobRef.current;
    if (!blob) {
      setUploadError("No photo to upload. Capture again.");
      return;
    }
    const kind =
      cameraTarget === "document" ? SRF_DOCUMENT_PHOTO_KIND : resolveActiveWatchKind();
    if (cameraTarget === "watch" && !kind) {
      setUploadError("Select a photo category first.");
      return;
    }
    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    closeCamera();
    await uploadFile(file, kind);
  }

  function retakeCapturePreview() {
    clearCapturePreview();
    void (async () => {
      setCameraStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        setCameraOpen(true);
      } catch {
        setUploadError("Could not reopen camera.");
        closeCamera();
      } finally {
        setCameraStarting(false);
      }
    })();
  }

  function prepareRetakeWatch(kind: SrfWatchPhotoKind) {
    pickWatchKind(kind);
    void startCamera("watch", kind);
  }

  function prepareRetakeDocument() {
    setUploadError(null);
    void startCamera("document");
  }

  async function removePhoto(photoId: string) {
    if (!token) return;
    setBusy(true);
    setUploadError(null);
    try {
      await apiJson<{ ok: boolean; photoCount: number }>(
        `/api/public/srf-photo/${encodeURIComponent(photoId)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      await refresh();
      setStatus("Photo removed.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }

  const documentIsPdf =
    documentPhoto?.mime?.includes("pdf") || documentPhoto?.filePath?.toLowerCase().endsWith(".pdf");

  const watchUploadDisabled = !canUpload || busy || !resolveActiveWatchKind();

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900">
      <div className="mx-auto max-w-md">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zimson-700">Zimson service</p>
          <h1 className="mt-1 text-xl font-semibold text-zimson-950">Watch photo upload</h1>
          <p className="mt-2 text-sm text-stone-600">{status}</p>
        </header>

        {uploadError ? (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
            {uploadError}
          </div>
        ) : null}

        {session ? (
          <section className="mt-4 rounded-lg border border-stone-200 bg-white p-3 text-sm">
            <p>
              <span className="font-semibold">SRF:</span> {session.reference}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Customer:</span> {session.customerName}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Watch:</span> {session.watch}
            </p>
            <p className="mt-2 text-xs text-stone-600">
              Photos: {watchPhotoCount} / {SRF_MAX_WATCH_PHOTOS} · Document: {documentPhoto ? "1 / 1" : "0 / 1"}
            </p>
          </section>
        ) : null}

        {/* Gallery — no capture attribute */}
        <input
          ref={galleryInputRef}
          type="file"
          accept={SRF_WATCH_PHOTO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy}
          onChange={(e) => void onWatchFileSelected(e.target.files)}
        />
        {/* Mobile fallback — native camera app */}
        <input
          ref={cameraFallbackInputRef}
          type="file"
          accept={SRF_WATCH_PHOTO_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy}
          onChange={(e) => void onWatchFileSelected(e.target.files)}
        />
        <input
          ref={documentGalleryInputRef}
          type="file"
          accept={SRF_DOCUMENT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy}
          onChange={(e) => void onDocumentFileSelected(e.target.files)}
        />
        <input
          ref={documentCameraFallbackInputRef}
          type="file"
          accept={SRF_DOCUMENT_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy}
          onChange={(e) => void onDocumentFileSelected(e.target.files)}
        />

        <section className="mt-5 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zimson-900">
            Watch photos ({watchPhotoCount} / {SRF_MAX_WATCH_PHOTOS})
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            Minimum {SRF_MIN_WATCH_PHOTOS_REQUIRED} photos required for the store to finalize the SRF. Pick any
            categories (damage and other are optional). One photo per category, up to {SRF_MAX_WATCH_PHOTOS} types.
          </p>

          {!allWatchPhotosDone ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-medium text-stone-700">
                Photo category
                <select
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                  value={selectedKind}
                  disabled={!canUpload || busy || availableKinds.length === 0}
                  onChange={(e) => pickWatchKind(e.target.value as SrfWatchPhotoKind)}
                >
                  {availableKinds.length === 0 ? (
                    <option value="">All categories done</option>
                  ) : (
                    availableKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {SRF_PHOTO_SLOT_LABELS[kind]}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={watchUploadDisabled || cameraStarting || availableKinds.length === 0}
                  onClick={() => void startCamera("watch")}
                  className="rounded-lg bg-zimson-800 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {cameraStarting ? "Opening…" : "Open camera"}
                </button>
                <button
                  type="button"
                  disabled={watchUploadDisabled || availableKinds.length === 0}
                  onClick={openGalleryPicker}
                  className="rounded-lg border-2 border-zimson-700 bg-white px-3 py-3 text-sm font-semibold text-zimson-900 disabled:opacity-50"
                >
                  {busy ? "Uploading…" : "Gallery"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium text-emerald-800">
              All {SRF_MAX_WATCH_PHOTOS} watch photo slots are filled. You can retake or remove below if needed.
            </p>
          )}

          {uploadedWatchPhotos.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {uploadedWatchPhotos.map(({ kind, shot }) => (
                <li key={kind} className="flex items-center gap-3 rounded-lg border border-stone-200 p-2">
                  <img
                    src={`/${shot.filePath}`}
                    alt={SRF_PHOTO_SLOT_LABELS[kind]}
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-800">{SRF_PHOTO_SLOT_LABELS[kind]}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canUpload || busy || cameraStarting}
                        onClick={() => prepareRetakeWatch(kind)}
                        className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                      >
                        Retake (camera)
                      </button>
                      <button
                        type="button"
                        disabled={!canUpload || busy}
                        onClick={() => {
                          pickWatchKind(kind);
                          openGalleryPicker();
                        }}
                        className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                      >
                        Replace (gallery)
                      </button>
                      <button
                        type="button"
                        disabled={!canUpload || busy}
                        onClick={() => void removePhoto(shot.id)}
                        className="text-xs font-semibold text-rose-700 underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zimson-900">Document (1 only)</h2>
          <p className="mt-1 text-xs text-stone-600">Invoice, warranty card, or ID — photo or PDF.</p>
          {!documentPhoto ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canUpload || busy || cameraStarting}
                onClick={() => void startCamera("document")}
                className="rounded-lg bg-zimson-800 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Open camera
              </button>
              <button
                type="button"
                disabled={!canUpload || busy}
                onClick={openDocumentGallery}
                className="rounded-lg border-2 border-zimson-700 bg-white px-3 py-3 text-sm font-semibold text-zimson-900 disabled:opacity-50"
              >
                Gallery / PDF
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
              {documentIsPdf ? (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-stone-200 text-[10px] font-bold text-stone-600">
                  PDF
                </span>
              ) : (
                <img src={`/${documentPhoto.filePath}`} alt="Document" className="h-14 w-14 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800">Document uploaded</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canUpload || busy || cameraStarting}
                    onClick={prepareRetakeDocument}
                    className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                  >
                    Retake (camera)
                  </button>
                  <button
                    type="button"
                    disabled={!canUpload || busy}
                    onClick={openDocumentGallery}
                    className="text-xs font-semibold text-zimson-800 underline"
                  >
                    Replace (file)
                  </button>
                  <button
                    type="button"
                    disabled={!canUpload || busy}
                    onClick={() => void removePhoto(documentPhoto.id)}
                    className="text-xs font-semibold text-rose-700 underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="mt-5 w-full rounded-lg border border-stone-300 bg-white py-2 text-sm font-semibold text-stone-800 disabled:opacity-50"
        >
          Refresh
        </button>

        <p className="mt-6 text-center text-[11px] text-stone-500">
          Allow camera access when prompted. Max {SRF_MAX_WATCH_PHOTOS} photos ({srfCustomerPhotoMaxSizeLabel()} each) and 1
          document.
        </p>
      </div>

      {cameraOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="text-sm font-semibold">
              {cameraTarget === "document" ? "Capture document" : SRF_PHOTO_SLOT_LABELS[pendingKindRef.current as SrfWatchPhotoKind] ?? "Capture photo"}
            </p>
            <button type="button" onClick={closeCamera} className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold">
              Close
            </button>
          </div>
          <div className="relative min-h-0 flex-1 bg-black">
            {capturePreviewUrl ? (
              <img src={capturePreviewUrl} alt="Preview" className="h-full w-full object-contain" />
            ) : (
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-white/20 bg-stone-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {capturePreviewUrl ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={retakeCapturePreview}
                  className="rounded-xl border border-white/40 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Retake
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmCaptureUpload()}
                  className="rounded-xl bg-zimson-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Use photo"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="rounded-xl border border-white/40 py-3 text-sm font-semibold text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || cameraStarting}
                  onClick={() => void captureFromCamera()}
                  className="rounded-xl bg-zimson-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Capture
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
