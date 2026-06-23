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

export function SrfBillingHandoverCapturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [session, setSession] = useState<HandoverSession | null>(null);
  const [status, setStatus] = useState("Checking link…");
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl]);

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
      setPreviewUrl(null);
      previewBlobRef.current = null;
      setCameraOpen(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function onGalleryPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadFile(file);
  }

  async function startCamera() {
    setUploadError(null);
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOpen(true);
    } catch {
      setUploadError("Could not open camera — use gallery upload instead.");
    } finally {
      setCameraStarting(false);
    }
  }

  function captureFromCamera() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewBlobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92,
    );
  }

  function confirmPreview() {
    const blob = previewBlobRef.current;
    if (!blob) return;
    void uploadFile(new File([blob], "handover.jpg", { type: "image/jpeg" }));
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-stone-700">
        <h1 className="text-lg font-bold text-zimson-900">Handover photo</h1>
        <p className="mt-2 text-sm">Open the link or scan the QR from the store billing screen.</p>
      </div>
    );
  }

  if (!session && status) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-stone-700">
        <h1 className="text-lg font-bold text-zimson-900">Handover photo</h1>
        <p className="mt-2 text-sm text-red-700">{status}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-stone-50 px-4 py-6">
      <h1 className="text-xl font-bold text-zimson-900">Handover watch photo</h1>
      <p className="mt-1 text-sm text-stone-600">
        {session?.reference} · {session?.customerName}
      </p>
      <p className="text-sm text-stone-600">{session?.watch}</p>
      <p className="mt-3 text-xs text-stone-500">
        Take one clear photo of the watch when the store hands it back to you.
      </p>

      {session?.photoPath ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-white p-4">
          <p className="text-sm font-semibold text-emerald-800">Photo uploaded</p>
          <img
            src={session.photoPath}
            alt="Handover watch"
            className="mt-3 w-full rounded-lg border border-stone-200 object-contain"
          />
          <p className="mt-3 text-xs text-stone-600">You can close this page. The store will complete billing.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="mt-4 w-full rounded-xl border border-zimson-300 bg-white py-3 text-sm font-semibold text-zimson-900"
          >
            Replace photo
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {!cameraOpen ? (
            <>
              <button
                type="button"
                disabled={busy || cameraStarting}
                onClick={() => void startCamera()}
                className="w-full rounded-xl bg-zimson-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {cameraStarting ? "Opening camera…" : "Take photo with camera"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => galleryRef.current?.click()}
                className="w-full rounded-xl border border-zimson-400 bg-white py-3 text-sm font-semibold text-zimson-900"
              >
                Choose from gallery
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-zimson-200 bg-white p-3">
              {!previewUrl ? (
                <>
                  <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black" />
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="mt-3 w-full rounded-xl bg-zimson-700 py-3 text-sm font-semibold text-white"
                  >
                    Capture
                  </button>
                </>
              ) : (
                <>
                  <img src={previewUrl} alt="Preview" className="w-full rounded-lg border border-stone-200" />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmPreview}
                      className="flex-1 rounded-xl bg-zimson-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Uploading…" : "Use this photo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                        previewBlobRef.current = null;
                      }}
                      className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-700"
                    >
                      Retake
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {uploadError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{uploadError}</p>
      ) : null}

      <input
        ref={galleryRef}
        type="file"
        accept={SRF_WATCH_PHOTO_ACCEPT}
        className="hidden"
        onChange={onGalleryPick}
      />
    </div>
  );
}
