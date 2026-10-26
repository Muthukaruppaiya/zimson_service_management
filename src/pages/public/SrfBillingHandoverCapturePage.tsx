import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../lib/api";
import { SRF_CUSTOMER_PHOTO_MAX_BYTES, srfCustomerPhotoMaxSizeLabel } from "../../lib/srfPhotoLimits";
import { SRF_WATCH_PHOTO_ACCEPT, validateSrfCustomerPhotoFile } from "../../lib/srfCustomerPhotoUpload";

type HandoverSession = {
  sessionId: string;
  reference: string;
  customerName: string;
  watch: string;
  photoPath: string | null;
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

/** Frames must arrive within this window or the stream is treated as black and restarted once. */
const BLACK_FRAME_TIMEOUT_MS = 3500;

function parseApiError(text: string): string {
  const t = text.trim();
  try {
    const j = JSON.parse(t) as { error?: string };
    if (j?.error?.trim()) return j.error.trim();
  } catch {
    /* plain */
  }
  return t || "Something went wrong.";
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f4ef] text-[#1a2332]" style={{ fontFamily: '"Poppins", system-ui, sans-serif' }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <header className="bg-[#0a1f3d] text-white">
        <div className="mx-auto max-w-lg px-5 py-4">
          <p
            className="text-xl font-semibold tracking-[0.12em] text-[#E8C14E]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            ZIMSON WATCH
          </p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.32em] text-white/75">Handover photo</p>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-transparent via-[#E8C14E] to-transparent" />
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>
    </div>
  );
}

export function SrfBillingHandoverCapturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraFallbackRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const restartedRef = useRef(false);

  const [session, setSession] = useState<HandoverSession | null>(null);
  const [status, setStatus] = useState("Checking link…");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);

  const loadSession = useCallback(async () => {
    if (!token) {
      setStatus("Missing or invalid link.");
      return;
    }
    try {
      const data = await apiJson<HandoverSession>(
        `/api/public/srf-billing-handover/session?token=${encodeURIComponent(token)}`,
      );
      setSession(data);
      setStatus("");
    } catch (e) {
      setSession(null);
      setStatus(e instanceof Error ? e.message : "Invalid or expired link.");
    }
  }, [token]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
    setCameraReady(false);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    previewBlobRef.current = null;
  }, []);

  const closeCamera = useCallback(() => {
    clearPreview();
    stopCameraStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }, [clearPreview, stopCameraStream]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopCameraStream();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopCameraStream]);

  const openStream = useCallback(async (): Promise<boolean> => {
    stopCameraStream();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      return true;
    } catch {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        return true;
      } catch {
        return false;
      }
    }
  }, [stopCameraStream]);

  /** Attach the live stream whenever the video element is on screen (first open and after Retake). */
  useEffect(() => {
    if (!cameraOpen || previewUrl) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    const markReady = () => {
      if (video.videoWidth > 0) setCameraReady(true);
    };
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    markReady();
    void video.play().catch(() => {
      /* autoplay retried on user tap */
    });

    const timer = window.setTimeout(() => {
      if (video.videoWidth > 0) return;
      if (!restartedRef.current) {
        restartedRef.current = true;
        void (async () => {
          setCameraStarting(true);
          const ok = await openStream();
          setCameraStarting(false);
          if (ok && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            void videoRef.current.play().catch(() => undefined);
          } else {
            setUploadError("Camera did not start. Use Phone camera or Gallery below.");
          }
        })();
      } else {
        setUploadError("Camera did not start. Use Phone camera or Gallery below.");
      }
    }, BLACK_FRAME_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
  }, [cameraOpen, previewUrl, cameraStarting, openStream]);

  async function uploadFile(file: File) {
    const err = validateSrfCustomerPhotoFile(file);
    if (err) {
      setUploadError(err);
      return;
    }
    if (file.size > SRF_CUSTOMER_PHOTO_MAX_BYTES) {
      setUploadError(`Photo must be under ${srfCustomerPhotoMaxSizeLabel()}.`);
      return;
    }
    setBusy(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("token", token);
      const res = await fetch("/api/public/srf-billing-handover/upload", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(parseApiError(text));
      const data = JSON.parse(text) as HandoverSession;
      setSession(data);
      closeCamera();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file);
  }

  async function startCamera() {
    setUploadError(null);
    clearPreview();
    restartedRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraFallbackRef.current?.click();
      return;
    }
    setCameraStarting(true);
    const ok = await openStream();
    setCameraStarting(false);
    if (ok) {
      setCameraOpen(true);
    } else {
      setUploadError("Could not open camera. Allow camera permission, or use Phone camera / Gallery.");
      cameraFallbackRef.current?.click();
    }
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
    previewBlobRef.current = blob;
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function retake() {
    clearPreview();
    setUploadError(null);
    restartedRef.current = false;
    setCameraStarting(true);
    const ok = await openStream();
    setCameraStarting(false);
    if (!ok) {
      setUploadError("Could not reopen camera.");
      closeCamera();
    }
  }

  function confirmPreview() {
    const blob = previewBlobRef.current;
    if (!blob) return;
    void uploadFile(new File([blob], `handover-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  if (!token || (!session && status)) {
    return (
      <PageShell>
        <section className="rounded-3xl border border-[#e8dfd0] bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[#0a1f3d]" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>
            Handover photo
          </h1>
          <p className={`mt-3 text-sm ${token ? "text-red-700" : "text-[#5c6b7a]"}`}>
            {token ? status : "Open the link or scan the QR from the store billing screen."}
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="rounded-3xl border border-[#e8dfd0] bg-white px-5 py-5 shadow-[0_8px_30px_rgba(10,31,61,0.08)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#A8850F]">Service reference</p>
        <p className="mt-1 font-mono text-lg font-bold text-[#0a1f3d]">{session?.reference}</p>
        <p className="mt-2 text-sm font-semibold text-[#1a2332]">{session?.customerName}</p>
        <p className="text-sm text-[#5c6b7a]">{session?.watch}</p>
      </section>

      {session?.photoPath ? (
        <section className="mt-5 rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <p className="text-sm font-semibold text-emerald-800">Photo uploaded</p>
          </div>
          <img
            src={session.photoPath}
            alt="Handover watch"
            className="mt-4 w-full rounded-2xl border border-[#e8dfd0] object-contain"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void startCamera()}
            className="mt-4 w-full rounded-2xl border-2 border-[#0a1f3d] bg-white py-3 text-sm font-bold text-[#0a1f3d] disabled:opacity-50"
          >
            Replace photo
          </button>
        </section>
      ) : (
        <section className="mt-5 space-y-3">
          <button
            type="button"
            disabled={busy || cameraStarting}
            onClick={() => void startCamera()}
            className="w-full rounded-2xl bg-[#0a1f3d] py-3.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
          >
            {cameraStarting ? "Opening camera…" : "Take photo"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraFallbackRef.current?.click()}
              className="rounded-2xl border border-[#d4c4a8] bg-white py-3 text-sm font-semibold text-[#0a1f3d] disabled:opacity-50"
            >
              Phone camera
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="rounded-2xl border border-[#d4c4a8] bg-white py-3 text-sm font-semibold text-[#0a1f3d] disabled:opacity-50"
            >
              Gallery
            </button>
          </div>
        </section>
      )}

      {uploadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {uploadError}
        </p>
      ) : null}

      {cameraOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between bg-[#0a1f3d] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <p className="text-sm font-semibold text-white">Handover photo</p>
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white"
              aria-label="Close camera"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative min-h-0 flex-1 bg-black">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  onClick={() => void videoRef.current?.play().catch(() => undefined)}
                  className="h-full w-full object-cover"
                />
                {!cameraReady ? (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                    Starting camera…
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-[#C9A227]/25 bg-[#0a1f3d] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {previewUrl ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void retake()}
                  className="rounded-xl border border-white/30 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Retake
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={confirmPreview}
                  className="rounded-xl bg-gradient-to-b from-[#e7c968] to-[#C9A227] py-3 text-sm font-bold text-[#0a1f3d] disabled:opacity-50"
                >
                  {busy ? "Uploading…" : "Use photo"}
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
                  disabled={busy || cameraStarting || !cameraReady}
                  onClick={() => void captureFromCamera()}
                  className="rounded-xl bg-gradient-to-b from-[#e7c968] to-[#C9A227] py-3 text-sm font-bold text-[#0a1f3d] disabled:opacity-50"
                >
                  Capture
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <input ref={galleryRef} type="file" accept={SRF_WATCH_PHOTO_ACCEPT} className="hidden" onChange={onFilePick} />
      <input
        ref={cameraFallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFilePick}
      />
    </PageShell>
  );
}
