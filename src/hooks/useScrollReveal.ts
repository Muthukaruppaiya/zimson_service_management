import { useEffect, type RefObject } from "react";

/** Blocks that fade in when scrolled into view (cards, sections, tables). */
const REVEAL_SELECTOR = "section, .ui-card, .ui-table-scroll, [data-reveal]";

/**
 * Fades in content blocks inside `rootRef` as they scroll into view.
 * Only blocks that start below the fold are hidden, so nothing already on screen flickers.
 */
export function useScrollReveal(rootRef: RefObject<HTMLElement | null>, resetKey: string): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add("reveal-in");
          el.classList.remove("reveal-pending");
          io.unobserve(el);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
    );

    const register = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.closest("[role='dialog'], .legacy-modal-backdrop, [aria-modal='true']")) return;
      if (el.parentElement?.closest(".reveal-pending, .reveal-in")) return;
      const rect = el.getBoundingClientRect();
      const viewBottom = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < viewBottom - 24) return;
      el.classList.add("reveal-pending");
      io.observe(el);
    };

    const scan = (scope: ParentNode) => {
      scope.querySelectorAll(REVEAL_SELECTOR).forEach(register);
    };

    scan(root);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(REVEAL_SELECTOR)) register(node);
          scan(node);
        });
      }
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      root.querySelectorAll(".reveal-pending").forEach((el) => el.classList.remove("reveal-pending"));
    };
  }, [rootRef, resetKey]);
}
