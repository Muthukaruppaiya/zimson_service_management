import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiJson } from "../../lib/api";
import {
  validateQuickBillDocumentFile,
  validateQuickBillImageFile,
  watchAttachmentDisplayName,
  watchAttachmentMaxSizeLabel,
} from "../../lib/watchAttachmentUpload";

type CaptureSession = {
  sessionId: string;
  customerName: string;
  watch: string;
  documentPath: string | null;
  imagePath: string | null;
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

export function QuickBillCapturePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const docInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const docCameraRef = useRef<HTMLInputElement>(null);
  const imgCameraRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<CaptureSession | null>(null);
  const [status, setStatus] = useState("Checking link…");
  const [busy, setBusy] = useState<null | "doc" | "img">(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canUpload = Boolean(token && session);

  const refresh = useCallback(async () => {
    if (!token) {
      setStatus("Missing link. Open the QR or link from the store again.");
      return;
    }
    try {
      const data = await apiJson<CaptureSession>(
        `/api/public/quick-bill-capture/session?token=${encodeURIComponent(token)}`,
      );
      setSession(data);
      setStatus("Upload your document and watch image below.");
      setUploadError(null);
    } catch (e) {
      setSession(null);
      setStatus(e instanceof Error ? e.message : "This upload link is not valid.");
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function uploadFile(file: File, kind: "doc" | "img") {
    if (!token) return;
    const validationError =
      kind === "doc" ? validateQuickBillDocumentFile(file) : validateQuickBillImageFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }
    setBusy(kind);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("token", token);
      form.append("kind", kind);
      form.append("file", file);
      const res = await fetch("/api/public/quick-bill-capture/upload", { method: "POST", body: form });
      const text = await res.text();
      if (!res.ok) throw new Error(parseApiError(text));
      const data = JSON.parse(text) as CaptureSession;
      setSession(data);
      setStatus(kind === "doc" ? "Document saved." : "Image saved.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function removeAttachment(kind: "doc" | "img") {
    if (!token) return;
    setBusy(kind);
    setUploadError(null);
    try {
      const data = await apiJson<CaptureSession>(
        `/api/public/quick-bill-capture/attachment?token=${encodeURIComponent(token)}&kind=${kind}`,
        { method: "DELETE" },
      );
      setSession(data);
      setStatus(kind === "doc" ? "Document removed." : "Image removed.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not remove file.");
    } finally {
      setBusy(null);
    }
  }

  async function onFileSelected(kind: "doc" | "img", files: FileList | null, input?: HTMLInputElement | null) {
    if (!files?.length) return;
    await uploadFile(files[0], kind);
    if (input) input.value = "";
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900">
      <div className="mx-auto max-w-md">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zimson-700">Zimson service</p>
          <h1 className="mt-1 text-xl font-semibold text-zimson-950">Quick bill — upload</h1>
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
              <span className="font-semibold">Customer:</span> {session.customerName}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Watch:</span> {session.watch}
            </p>
          </section>
        ) : null}

        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy !== null}
          onChange={(e) => void onFileSelected("doc", e.target.files, e.target)}
        />
        <input
          ref={docCameraRef}
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy !== null}
          onChange={(e) => void onFileSelected("doc", e.target.files, e.target)}
        />
        <input
          ref={imgInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/*"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy !== null}
          onChange={(e) => void onFileSelected("img", e.target.files, e.target)}
        />
        <input
          ref={imgCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          disabled={!canUpload || busy !== null}
          onChange={(e) => void onFileSelected("img", e.target.files, e.target)}
        />

        <section className="mt-5 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zimson-900">Document</h2>
          <p className="mt-1 text-xs text-stone-600">PDF or Word — max {watchAttachmentMaxSizeLabel()}</p>
          {!session?.documentPath ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canUpload || busy !== null}
                onClick={() => docCameraRef.current?.click()}
                className="rounded-lg bg-zimson-800 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Camera
              </button>
              <button
                type="button"
                disabled={!canUpload || busy !== null}
                onClick={() => docInputRef.current?.click()}
                className="rounded-lg border-2 border-zimson-700 bg-white px-3 py-3 text-sm font-semibold text-zimson-900 disabled:opacity-50"
              >
                {busy === "doc" ? "Uploading…" : "Choose file"}
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
              <p className="text-sm font-medium text-stone-800">
                {watchAttachmentDisplayName(session.documentPath)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canUpload || busy !== null}
                  onClick={() => docCameraRef.current?.click()}
                  className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                >
                  Retake (camera)
                </button>
                <button
                  type="button"
                  disabled={!canUpload || busy !== null}
                  onClick={() => docInputRef.current?.click()}
                  className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                >
                  Replace (file)
                </button>
                <button
                  type="button"
                  disabled={!canUpload || busy !== null}
                  onClick={() => void removeAttachment("doc")}
                  className="text-xs font-semibold text-rose-700 underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zimson-900">Watch image</h2>
          <p className="mt-1 text-xs text-stone-600">Photo of the watch — max {watchAttachmentMaxSizeLabel()}</p>
          {!session?.imagePath ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canUpload || busy !== null}
                onClick={() => imgCameraRef.current?.click()}
                className="rounded-lg bg-zimson-800 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Camera
              </button>
              <button
                type="button"
                disabled={!canUpload || busy !== null}
                onClick={() => imgInputRef.current?.click()}
                className="rounded-lg border-2 border-zimson-700 bg-white px-3 py-3 text-sm font-semibold text-zimson-900 disabled:opacity-50"
              >
                {busy === "img" ? "Uploading…" : "Choose file"}
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
              <img
                src={session.imagePath}
                alt="Watch"
                className="mx-auto max-h-40 rounded object-contain"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canUpload || busy !== null}
                  onClick={() => imgCameraRef.current?.click()}
                  className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                >
                  Retake (camera)
                </button>
                <button
                  type="button"
                  disabled={!canUpload || busy !== null}
                  onClick={() => imgInputRef.current?.click()}
                  className="text-xs font-semibold text-zimson-800 underline disabled:opacity-50"
                >
                  Replace (file)
                </button>
                <button
                  type="button"
                  disabled={!canUpload || busy !== null}
                  onClick={() => void removeAttachment("img")}
                  className="text-xs font-semibold text-rose-700 underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </section>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void refresh()}
          className="mt-5 w-full rounded-lg border border-stone-300 bg-white py-2 text-sm font-semibold text-stone-800 disabled:opacity-50"
        >
          Refresh
        </button>

        <p className="mt-6 text-center text-[11px] text-stone-500">
          Link expires in 45 minutes. Tell the store staff when you are done.
        </p>
      </div>
    </div>
  );
}
