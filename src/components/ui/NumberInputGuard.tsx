import { useEffect } from "react";

function isNumberInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "number";
}

function isIntegerStep(el: HTMLInputElement): boolean {
  const raw = el.getAttribute("step");
  if (!raw || raw === "any") return true;
  const step = Number(raw);
  return Number.isFinite(step) && step >= 1 && step % 1 === 0;
}

/** Stops mouse-wheel / arrow nudging, and blocks decimals on whole-number fields. */
export function NumberInputGuard() {
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!isNumberInput(e.target)) return;
      e.preventDefault();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!isNumberInput(e.target)) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
      }
      if (isIntegerStep(e.target) && (e.key === "." || e.key === ",")) {
        e.preventDefault();
      }
    }
    function onBeforeInput(e: InputEvent) {
      if (!isNumberInput(e.target) || !isIntegerStep(e.target)) return;
      if (e.data?.includes(".") || e.data?.includes(",")) e.preventDefault();
    }
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
    };
  }, []);
  return null;
}

