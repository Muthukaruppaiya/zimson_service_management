/**
 * Opens the browser print dialog for invoice copies.
 * Invoice markup should live in `.service-invoice-print-root`; chrome uses `.print-hidden`.
 *
 * Each print contains Original / Duplicate / Triplicate, so the footer shows the page
 * number within one copy (1/2, 2/2, 1/2, 2/2 …), not across the whole print job.
 */

const PAGE_STYLE_ID = "invoice-page-number-style";
const PAGE_MM = { width: 210, height: 297 };
const MARGIN_MM = { top: 5, right: 5, bottom: 9, left: 5 };

const MEASURE_SCOPE = "zcm-print-measure";
const HOST_CLASS = "zcm-invoice-print-host";

function scopeSelector(selector: string): string {
  return selector
    .split(",")
    .map((part) => {
      const s = part.trim();
      if (!s) return s;
      if (/^(html|body|:root)\b/i.test(s)) return s.replace(/^(html\s+body|html|body|:root)/i, `.${MEASURE_SCOPE}`);
      return `.${MEASURE_SCOPE} ${s}`;
    })
    .join(", ");
}

/** Re-scopes `@media print` style rules to the measuring box so it lays out like the printed page. */
function collectScopedPrintCss(rules: CSSRuleList, inPrint: boolean, out: string[]): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      const media = rule.media.mediaText;
      const print = /\bprint\b/i.test(media) && !/\bscreen\b/i.test(media);
      if (print || inPrint) collectScopedPrintCss(rule.cssRules, true, out);
      continue;
    }
    if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) {
      collectScopedPrintCss(rule.cssRules, inPrint, out);
      continue;
    }
    if (inPrint && rule instanceof CSSStyleRule) {
      out.push(`${scopeSelector(rule.selectorText)} { ${rule.style.cssText} }`);
    }
  }
}

function findPrintedInvoiceSet(): HTMLElement | null {
  const hiddenInPrint = ".print\\:hidden, .print-hidden, .app-modal-overlay, .invoice-print-offscreen";
  const sets = Array.from(document.querySelectorAll<HTMLElement>(".service-invoice-print-set")).filter(
    (el) => !el.closest(`.${HOST_CLASS}`),
  );
  const set = sets.find((el) => !el.closest(hiddenInPrint)) ?? sets[0];
  if (set) return set;
  const root = document.querySelector(".service-invoice-print-root");
  return root instanceof HTMLElement ? root : null;
}

/** Waits for the async e-invoice QR and images so the copy is measured at its final height. */
async function waitForInvoiceReady(source: HTMLElement, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const roots = source.matches(".service-invoice-print-root")
    ? [source]
    : Array.from(source.querySelectorAll<HTMLElement>(".service-invoice-print-root"));
  while (Date.now() < deadline) {
    const qrPending = roots.some(
      (root) =>
        root.getAttribute("data-expect-einvoice-qr") === "1" &&
        !root.querySelector("[data-einvoice-qr-ready='true']"),
    );
    const imgPending = Array.from(source.querySelectorAll("img")).some((img) => !img.complete);
    if (!qrPending && !imgPending) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
}

async function waitForImages(root: ParentNode, timeoutMs: number): Promise<void> {
  const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  if (!pending.length) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

/** Pages one invoice copy needs on A4, measured with a multi-column box (same fragmentation as print). */
async function measureInvoiceCopyPages(host: HTMLElement): Promise<number | null> {
  const source = host.querySelector(".service-invoice-print-root");
  if (!(source instanceof HTMLElement)) return null;

  const css: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectScopedPrintCss(sheet.cssRules, false, css);
    } catch {
      /* cross-origin sheet (web fonts) */
    }
  }
  // Clipped boxes are monolithic in multi-column layout but still split across printed pages.
  css.push(`.${MEASURE_SCOPE} * { overflow: visible !important; }`);
  const style = document.createElement("style");
  style.textContent = css.join("\n");

  const contentW = PAGE_MM.width - MARGIN_MM.left - MARGIN_MM.right;
  const contentH = PAGE_MM.height - MARGIN_MM.top - MARGIN_MM.bottom;
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = [
    "position:fixed",
    "left:-20000px",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    "margin:0",
    "padding:0",
    `width:${contentW}mm`,
    `height:${contentH}mm`,
    `column-width:${contentW}mm`,
    "column-gap:0",
    "column-fill:auto",
  ].join(";");

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  clone.classList.remove("inv-copy-duplicate", "inv-copy-triplicate");
  clone.style.display = "block";
  const page = document.createElement("div");
  page.className = MEASURE_SCOPE;
  page.appendChild(clone);
  box.appendChild(page);

  document.head.appendChild(style);
  document.body.appendChild(box);
  try {
    await waitForImages(box, 2000);
    try {
      await document.fonts.ready;
    } catch {
      /* best effort */
    }
    const width = box.getBoundingClientRect().width;
    if (!width) return null;
    return Math.max(1, Math.ceil(box.scrollWidth / width - 0.02));
  } finally {
    box.remove();
    style.remove();
  }
}

const HOST_CSS = `
.${HOST_CLASS} { display: none; }
@media print {
  body.invoice-printing > :not(.${HOST_CLASS}) { display: none !important; }
  body.invoice-printing > .${HOST_CLASS} { display: block !important; margin: 0; padding: 0; }
  .${HOST_CLASS} .service-invoice-print-set { display: block !important; }
}`;

function printCss(pages: number | null, withHost: boolean): string {
  const hostCss = withHost ? HOST_CSS : "";
  const margin = `${MARGIN_MM.top}mm ${MARGIN_MM.right}mm ${MARGIN_MM.bottom}mm ${MARGIN_MM.left}mm`;
  if (!pages) return `${hostCss}\n@media print { @page { size: A4; margin: ${margin}; } }`;
  const symbols = Array.from({ length: pages }, (_, i) => `"${i + 1}"`).join(" ");
  return `${hostCss}
@counter-style zcm-invoice-page { system: cyclic; symbols: ${symbols}; }
@media print {
  @page {
    size: A4;
    margin: ${margin};
    @bottom-center {
      content: counter(page, zcm-invoice-page) "/${pages}";
      font: 8pt Arial, Helvetica, sans-serif;
      color: #555555;
    }
  }
}`;
}

export function printServiceInvoice(): void {
  void (async () => {
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((el) => el.remove());
    document.getElementById(PAGE_STYLE_ID)?.remove();

    const source = findPrintedInvoiceSet();
    let host: HTMLElement | null = null;
    let pages: number | null = null;
    if (source) {
      await waitForInvoiceReady(source, 3000);
      const clone = source.cloneNode(true) as HTMLElement;
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      host = document.createElement("div");
      host.className = HOST_CLASS;
      host.setAttribute("aria-hidden", "true");
      host.appendChild(clone);
      document.body.appendChild(host);
      try {
        pages = await measureInvoiceCopyPages(host);
      } catch {
        pages = null;
      }
    }

    const style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
    style.textContent = printCss(pages, Boolean(host));
    document.head.appendChild(style);

    document.body.classList.add("invoice-printing");
    const restore = () => {
      document.body.classList.remove("invoice-printing");
      document.getElementById(PAGE_STYLE_ID)?.remove();
      host?.remove();
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.setTimeout(() => {
      window.print();
    }, 50);
  })();
}
