import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export type ScrollScrubOptions = {
  /** Extra progress callback (0–1) for milestone UI. */
  onProgress?: (progress: number) => void;
  /**
   * Seconds to skip at the very start of the clip (e.g. a soft/black lead-in frame).
   * Scroll progress 0..1 is remapped onto [skipStartSeconds, duration] instead of [0, duration].
   */
  skipStartSeconds?: number;
};

/**
 * Maps scroll progress inside a tall sticky container to video.currentTime,
 * then draws the seeked frame onto a canvas. Seeks are serialized (one in flight)
 * so Safari-style seeking stays smooth.
 *
 * Frame updates run on a continuous requestAnimationFrame loop (not the `scroll` event)
 * so tracking isn't limited by the browser's scroll-event throttling/coalescing, and the
 * target time is lightly eased each frame to smooth out any residual seek latency.
 */
export function useScrollScrub(
  containerRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: ScrollScrubOptions = {},
) {
  const { onProgress, skipStartSeconds = 0.3 } = options;
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const seekingRef = useRef(false);
  const pendingTimeRef = useRef<number | null>(null);
  const smoothTimeRef = useRef<number | null>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const timeForProgress = useCallback(
    (p: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return 0;
      const usableStart = Math.min(skipStartSeconds, video.duration * 0.25);
      const usableEnd = video.duration - 0.04;
      return usableStart + Math.max(0, Math.min(1, p)) * (usableEnd - usableStart);
    },
    [skipStartSeconds, videoRef],
  );

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // Prefer native DPR so Retina screens stay sharp (cap at 3 for very dense displays).
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const scale = Math.max(targetW / vw, targetH / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (targetW - dw) / 2;
    const dy = (targetH - dh) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#08143A";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(video, dx, dy, dw, dh);
  }, [canvasRef, videoRef]);

  const seekTo = useCallback(
    (t: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

      const clamped = Math.max(0, Math.min(video.duration - 0.04, t));

      if (seekingRef.current) {
        pendingTimeRef.current = clamped;
        return;
      }

      if (Math.abs(video.currentTime - clamped) < 0.01) {
        drawFrame();
        return;
      }

      seekingRef.current = true;
      video.currentTime = clamped;
    },
    [drawFrame, videoRef],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => {
      setReady(true);
      const t0 = timeForProgress(0);
      smoothTimeRef.current = t0;
      seekTo(t0);
      drawFrame();
    };

    const onSeeked = () => {
      seekingRef.current = false;
      drawFrame();
      const pending = pendingTimeRef.current;
      if (pending != null) {
        pendingTimeRef.current = null;
        seekTo(pending);
      }
    };

    if (video.readyState >= 1) onLoaded();
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", drawFrame);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", drawFrame);
    };
  }, [drawFrame, seekTo, timeForProgress, videoRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const rect = container.getBoundingClientRect();
      const scrollable = container.offsetHeight - window.innerHeight;

      if (scrollable > 0) {
        const scrolled = -rect.top;
        const p = Math.max(0, Math.min(1, scrolled / scrollable));
        setProgress(p);
        onProgressRef.current?.(p);

        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          const target = timeForProgress(p);
          const current = smoothTimeRef.current ?? target;
          const diff = target - current;
          // Snap on big jumps (resize, tab refocus); otherwise ease toward the
          // scroll-mapped time so residual seek latency reads as smooth motion.
          const eased = Math.abs(diff) > 1.2 ? target : current + diff * 0.4;
          smoothTimeRef.current = eased;
          seekTo(eased);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [containerRef, seekTo, timeForProgress, videoRef]);

  return { ready, progress, drawFrame };
}
