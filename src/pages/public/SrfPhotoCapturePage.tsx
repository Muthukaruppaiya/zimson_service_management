import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../lib/api";
import { publicMediaUrl } from "../../lib/mediaUrl";
import { SRF_CUSTOMER_PHOTO_MAX_BYTES, srfCustomerPhotoMaxSizeLabel } from "../../lib/srfPhotoLimits";
import {
  SRF_DOCUMENT_PDF_ONLY_ACCEPT,
  SRF_WATCH_PHOTO_ACCEPT,
  validateSrfCustomerPhotoFile,
  validateSrfDocumentPdfOnlyFile,
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

type IconProps = { className?: string };

function CameraIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function GalleryIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function RefreshIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function RetakeIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function ReplaceIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PdfIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M10 13h4M10 17h4M10 9H8" />
    </svg>
  );
}

const actionTile =
  "flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none";
const actionTilePrimary = `${actionTile} border-[#1b3a8f]/35 bg-gradient-to-b from-[#1b3a8f] to-[#0c1c56] text-white shadow-md`;
const actionTileSecondary = `${actionTile} border-[#1b3a8f]/20 bg-white text-[#1b3a8f] shadow-sm hover:border-[#1b3a8f]/35 hover:bg-[#f8faff]`;
const thumbActionBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";
const sectionCard = "overflow-hidden rounded-2xl border border-[#e2e8f5] bg-white shadow-[0_8px_24px_-12px_rgba(12,28,86,0.18)]";

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
        `Upload at least ${SRF_MIN_WATCH_PHOTOS_REQUIRED} watch photos (any categories). Up to ${SRF_MAX_WATCH_PHOTOS} types — one photo per category.`,
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
        ? validateSrfDocumentPdfOnlyFile(file)
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
  const photoProgressPct = Math.min(100, Math.round((watchPhotoCount / SRF_MAX_WATCH_PHOTOS) * 100));
  const minPhotosMet = watchPhotoCount >= SRF_MIN_WATCH_PHOTOS_REQUIRED;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8faff] via-[#f4f6fb] to-[#eef2fa] px-4 py-5 text-[#0d1b2a]">
      <div className="mx-auto max-w-md">
        <header className="relative overflow-hidden rounded-2xl border border-[#c9a227]/30 bg-gradient-to-r from-[#0c1c56] via-[#152a72] to-[#1b3a8f] px-4 py-5 text-center text-white shadow-[0_12px_32px_-14px_rgba(12,28,86,0.55)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#c9a227] to-transparent" aria-hidden />
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#e7c968]">Zimson service</p>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight">Watch photo upload</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/80">{status}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
        </header>

        {uploadError ? (
          <div
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-900 shadow-sm"
            role="alert"
          >
            {uploadError}
          </div>
        ) : null}

        {session ? (
          <section className={`mt-4 ${sectionCard}`}>
            <div className="border-b border-[#e2e8f5] bg-[#f8faff] px-4 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#1b3a8f]">Service request</p>
            </div>
            <div className="space-y-2.5 px-4 py-3.5 text-sm leading-relaxed">
              <p>
                <span className="font-semibold text-[#1b3a8f]">SRF:</span>{" "}
                <span className="font-mono text-[#0d1b2a]">{session.reference}</span>
              </p>
              <p>
                <span className="font-semibold text-[#1b3a8f]">Customer:</span> {session.customerName}
              </p>
              <p>
                <span className="font-semibold text-[#1b3a8f]">Watch:</span> {session.watch}
              </p>
              <div className="mt-3 rounded-xl border border-[#e2e8f5] bg-[#f8faff] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#1b3a8f]">
                    Photos {watchPhotoCount} / {SRF_MAX_WATCH_PHOTOS}
                  </span>
                  <span className={minPhotosMet ? "font-semibold text-emerald-700" : "text-stone-500"}>
                    {minPhotosMet ? "Minimum met" : `Need ${SRF_MIN_WATCH_PHOTOS_REQUIRED}+`}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8f5]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      allWatchPhotosDone
                        ? "bg-gradient-to-r from-[#c9a227] to-[#e7c968]"
                        : "bg-gradient-to-r from-[#1b3a8f] to-[#3d5fc4]"
                    }`}
                    style={{ width: `${photoProgressPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-stone-500">
                  Document: {documentPhoto ? "1 / 1 uploaded" : "0 / 1 pending"}
                </p>
              </div>
            </div>
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
          accept={SRF_DOCUMENT_PDF_ONLY_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy}
          onChange={(e) => void onDocumentFileSelected(e.target.files)}
        />

        <section className={`mt-5 ${sectionCard}`}>
          <div className="border-b border-[#e2e8f5] bg-gradient-to-r from-[#f8faff] to-white px-4 py-3">
            <h2 className="text-sm font-bold text-[#1b3a8f]">
              Watch photos ({watchPhotoCount} / {SRF_MAX_WATCH_PHOTOS})
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              At least {SRF_MIN_WATCH_PHOTOS_REQUIRED} watch photos required before the store can finalize the SRF (any
              categories). One photo per category, up to {SRF_MAX_WATCH_PHOTOS} types.
            </p>
          </div>

          <div className="p-4">
            {!allWatchPhotosDone ? (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#1b3a8f]">
                  Photo category
                  <select
                    className="mt-1.5 w-full rounded-xl border border-[#e2e8f5] bg-white px-3 py-2.5 text-sm font-medium text-[#0d1b2a] focus:border-[#1b3a8f] focus:outline-none focus:ring-2 focus:ring-[#1b3a8f]/15"
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
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={watchUploadDisabled || cameraStarting || availableKinds.length === 0}
                    onClick={() => void startCamera("watch")}
                    className={actionTilePrimary}
                    aria-label="Open camera"
                  >
                    <CameraIcon />
                    <span className="text-xs font-bold">{cameraStarting ? "Opening…" : "Camera"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={watchUploadDisabled || availableKinds.length === 0}
                    onClick={openGalleryPicker}
                    className={actionTileSecondary}
                    aria-label="Choose from gallery"
                  >
                    <GalleryIcon />
                    <span className="text-xs font-bold">{busy ? "Uploading…" : "Gallery"}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-emerald-800">
                All {SRF_MAX_WATCH_PHOTOS} watch photo slots are filled. You can retake or remove below if needed.
              </p>
            )}

            {uploadedWatchPhotos.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {uploadedWatchPhotos.map(({ kind, shot }) => (
                  <li
                    key={kind}
                    className="flex items-center gap-3 rounded-xl border border-[#e2e8f5] bg-[#f8faff] p-2.5"
                  >
                    <img
                      src={publicMediaUrl(shot.filePath)}
                      alt={SRF_PHOTO_SLOT_LABELS[kind]}
                      className="h-16 w-16 shrink-0 rounded-xl border border-white object-cover shadow-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#0d1b2a]">{SRF_PHOTO_SLOT_LABELS[kind]}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={!canUpload || busy || cameraStarting}
                          onClick={() => prepareRetakeWatch(kind)}
                          className={`${thumbActionBtn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}
                          aria-label="Retake with camera"
                          title="Retake"
                        >
                          <RetakeIcon />
                        </button>
                        <button
                          type="button"
                          disabled={!canUpload || busy}
                          onClick={() => {
                            pickWatchKind(kind);
                            openGalleryPicker();
                          }}
                          className={`${thumbActionBtn} border-[#1b3a8f]/20 bg-white text-[#1b3a8f] hover:bg-[#f0f4ff]`}
                          aria-label="Replace from gallery"
                          title="Replace"
                        >
                          <ReplaceIcon />
                        </button>
                        <button
                          type="button"
                          disabled={!canUpload || busy}
                          onClick={() => void removePhoto(shot.id)}
                          className={`${thumbActionBtn} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                          aria-label="Remove photo"
                          title="Remove"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section className={`mt-4 ${sectionCard}`}>
          <div className="border-b border-[#e2e8f5] bg-gradient-to-r from-[#f8faff] to-white px-4 py-3">
            <h2 className="text-sm font-bold text-[#1b3a8f]">Document (1 only)</h2>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Invoice, warranty card, or ID — <span className="font-semibold text-[#1b3a8f]">PDF only</span> (images not
              accepted).
            </p>
          </div>
          <div className="p-4">
            {!documentPhoto ? (
              <button
                type="button"
                disabled={!canUpload || busy}
                onClick={openDocumentGallery}
                className={`${actionTilePrimary} w-full`}
                aria-label="Upload PDF document"
              >
                <PdfIcon />
                <span className="text-xs font-bold">{busy ? "Uploading…" : "Upload PDF"}</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-[#c9a227]/30 bg-[#fffdf5] p-2.5">
                {documentIsPdf ? (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#e2e8f5] bg-white text-[#1b3a8f] shadow-sm">
                    <PdfIcon className="h-7 w-7" />
                  </span>
                ) : (
                  <img
                    src={publicMediaUrl(documentPhoto.filePath)}
                    alt="Document"
                    className="h-16 w-16 shrink-0 rounded-xl border border-white object-cover shadow-sm"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0d1b2a]">Document uploaded</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={!canUpload || busy}
                      onClick={openDocumentGallery}
                      className={`${thumbActionBtn} border-[#1b3a8f]/20 bg-white text-[#1b3a8f] hover:bg-[#f0f4ff]`}
                      aria-label="Replace document PDF"
                      title="Replace PDF"
                    >
                      <ReplaceIcon />
                    </button>
                    <button
                      type="button"
                      disabled={!canUpload || busy}
                      onClick={() => void removePhoto(documentPhoto.id)}
                      className={`${thumbActionBtn} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                      aria-label="Remove document"
                      title="Remove"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-500">
          Allow camera access when prompted. Max {SRF_MAX_WATCH_PHOTOS} photos ({srfCustomerPhotoMaxSizeLabel()} each) and 1
          document.
        </p>
      </div>

      {cameraOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0c1c56]">
          <div className="flex items-center justify-between border-b border-[#c9a227]/30 bg-gradient-to-r from-[#0c1c56] to-[#1b3a8f] px-4 py-3 text-white">
            <p className="text-sm font-bold">
              {cameraTarget === "document"
                ? "Capture document"
                : SRF_PHOTO_SLOT_LABELS[pendingKindRef.current as SrfWatchPhotoKind] ?? "Capture photo"}
            </p>
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white"
              aria-label="Close camera"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative min-h-0 flex-1 bg-black">
            {capturePreviewUrl ? (
              <img src={capturePreviewUrl} alt="Preview" className="h-full w-full object-contain" />
            ) : (
              <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-[#c9a227]/25 bg-[#0c1c56] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {capturePreviewUrl ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={retakeCapturePreview}
                  className="rounded-xl border border-white/30 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Retake
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmCaptureUpload()}
                  className="rounded-xl bg-gradient-to-b from-[#e7c968] to-[#c9a227] py-3 text-sm font-bold text-[#0c1c56] disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Use photo"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={closeCamera}
                  className="rounded-xl border border-white/30 py-3 text-sm font-semibold text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || cameraStarting}
                  onClick={() => void captureFromCamera()}
                  className="rounded-xl bg-gradient-to-b from-[#e7c968] to-[#c9a227] py-3 text-sm font-bold text-[#0c1c56] disabled:opacity-50"
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
