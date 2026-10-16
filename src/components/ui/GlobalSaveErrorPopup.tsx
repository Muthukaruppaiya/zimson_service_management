import { useEffect, useRef, useState } from "react";
import { onApiSaveError, showErrorPopup, type ApiSaveErrorEvent } from "../../lib/api";
import { AppModal } from "./AppModal";

const DUPLICATE_WINDOW_MS = 2500;
/** How long after a user action a newly shown inline error is treated as that action's result. */
const ACTION_WINDOW_MS = 4000;
const ACTION_LABEL =
  /\b(save|create|update|submit|generate|post|confirm|add|finali[sz]e|dispatch|send|verify|approve|issue|apply|handover|import|upload|set password|delete|remove|reject|assign|pay|convert)\b/i;
const BANNER_TAGS = new Set(["P", "DIV", "LI", "SECTION"]);
const ERROR_BG_SELECTOR = '[class*="bg-red-50"],[class*="bg-rose-50"]';
const ERROR_TEXT_CLASS = /\btext-(red|rose)-(6|7|8|9)00\b/;

function normalizeMessage(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s+/g, " ").trim();
}

function titleFor(event: ApiSaveErrorEvent): string {
  if (event.status === -1) return "Please check";
  if (event.status === 0) return "Connection problem";
  if (event.status === 401) return "Session expired";
  if (event.status === 403) return "Not allowed";
  if (event.method === "DELETE") return "Could not delete";
  return "Could not save";
}

function isInlineErrorBanner(el: Element): boolean {
  if (!BANNER_TAGS.has(el.tagName)) return false;
  if (el.closest("[data-global-error-popup],[data-no-error-popup]")) return false;
  const cls = el.getAttribute("class") ?? "";
  if (!ERROR_TEXT_CLASS.test(cls)) return false;
  const html = el as HTMLElement;
  return html.offsetParent !== null || html.getClientRects().length > 0;
}

function readInlineErrors(): Map<Element, string> {
  const out = new Map<Element, string>();
  for (const el of document.querySelectorAll(ERROR_BG_SELECTOR)) {
    if (!isInlineErrorBanner(el)) continue;
    const text = normalizeMessage((el as HTMLElement).innerText ?? el.textContent ?? "");
    if (text.length >= 4 && text.length <= 500) out.set(el, text);
  }
  return out;
}

export function GlobalSaveErrorPopup() {
  const [queue, setQueue] = useState<ApiSaveErrorEvent[]>([]);
  const recentRef = useRef(new Map<string, number>());

  useEffect(
    () =>
      onApiSaveError((event) => {
        const key = normalizeMessage(event.message).toLowerCase();
        if (!key) return;
        const now = Date.now();
        const seenAt = recentRef.current.get(key);
        if (seenAt != null && now - seenAt < DUPLICATE_WINDOW_MS) return;
        recentRef.current.set(key, now);
        setQueue((q) => (q.some((e) => normalizeMessage(e.message).toLowerCase() === key) ? q : [...q, event]));
      }),
    [],
  );

  useEffect(() => {
    let armedUntil = 0;
    let snapshot = new Map<Element, string>();
    let timer: number | undefined;

    const arm = () => {
      snapshot = readInlineErrors();
      armedUntil = Date.now() + ACTION_WINDOW_MS;
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const btn = target?.closest("button, input[type=submit], [role=button]") as HTMLElement | null;
      if (!btn || btn.closest("[data-global-error-popup]")) return;
      const label = `${btn.innerText ?? ""} ${btn.getAttribute("aria-label") ?? ""} ${btn.getAttribute("title") ?? ""}`;
      if ((btn as HTMLButtonElement).type === "submit" || ACTION_LABEL.test(label)) arm();
    };
    const onSubmit = () => arm();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT") && !t.closest("[data-global-error-popup]")) arm();
    };

    const scan = () => {
      if (Date.now() > armedUntil) return;
      const current = readInlineErrors();
      for (const [el, text] of current) {
        if (snapshot.get(el) === text) continue;
        snapshot.set(el, text);
        showErrorPopup(text);
      }
    };

    const observer = new MutationObserver(() => {
      if (Date.now() > armedUntil) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 60);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        setQueue((q) => q.slice(1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [current]);

  if (!current) return null;

  const close = () => setQueue((q) => q.slice(1));

  return (
    <div data-global-error-popup>
      <AppModal
        open
        onClose={close}
        eyebrow="Error"
        title={titleFor(current)}
        size="sm"
        zIndex={200}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">{queue.length > 1 ? `1 of ${queue.length}` : ""}</span>
            <button
              type="button"
              onClick={close}
              autoFocus
              className="rounded-xl bg-rlx-green px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rlx-green-deep"
            >
              OK
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </span>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{current.message}</p>
        </div>
      </AppModal>
    </div>
  );
}
