import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useScrollScrub } from "../hooks/useScrollScrub";

const MILESTONES = [
  {
    from: 0.08,
    to: 0.3,
    tag: "01",
    title: "Precision Movement",
    body: "Every calibre inspected under magnification.",
  },
  {
    from: 0.34,
    to: 0.58,
    tag: "02",
    title: "Genuine Parts",
    body: "OEM components tracked from inward to fitment.",
  },
  {
    from: 0.62,
    to: 0.88,
    tag: "03",
    title: "Certified Technicians",
    body: "Factory-trained experts — one standard of excellence.",
  },
] as const;

/** Temp toggle: hide all overlay copy so the raw scroll-scrub video can be reviewed on its own. */
const SHOW_HERO_COPY = false;

function milestoneOpacity(progress: number, from: number, to: number) {
  const mid = (from + to) / 2;
  const half = (to - from) / 2;
  if (progress < from || progress > to) return 0;
  const d = Math.abs(progress - mid);
  return Math.max(0, 1 - d / half);
}

/** Fade hero headline out as the user scrolls into the reveal. */
function heroTextOpacity(progress: number) {
  if (progress <= 0.12) return 1;
  if (progress >= 0.38) return 0;
  return 1 - (progress - 0.12) / 0.26;
}

export function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [navSolid, setNavSolid] = useState(false);

  // Scroll starts a few seconds into the clip, at the clean straight-on watch shot,
  // instead of the very first (softer) frame. Source clip is 24fps (~0.0417s/frame).
  const { ready, progress } = useScrollScrub(containerRef, videoRef, canvasRef, {
    skipStartSeconds: 2 - 5 / 24,
  });

  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const headlineOpacity = heroTextOpacity(progress);

  return (
    <div className="bg-zimson-950 text-white antialiased">
      {/* Navbar */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          navSolid
            ? "border-b border-white/10 bg-zimson-950/85 shadow-lg shadow-black/30 backdrop-blur-xl"
            : "bg-gradient-to-b from-zimson-950/70 to-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3">
            <img src="/zimson-logo.png" alt="Zimson" className="h-9 w-auto object-contain drop-shadow-lg" />
            <span className="hidden text-sm font-medium tracking-wide text-zimson-100 sm:inline">
              Service Management
            </span>
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-rlx-gold px-6 py-2.5 text-sm font-semibold text-zimson-950 shadow-[0_0_28px_rgba(201,162,39,0.45)] transition hover:scale-[1.03] hover:bg-rlx-gold-light"
          >
            Login
          </Link>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-rlx-gold/80 to-transparent" />
      </header>

      {/* Scroll-scrub hero — tall track for smooth frame stepping on real footage */}
      <section ref={containerRef} className="relative h-[450vh]">
        <div className="sticky top-0 h-screen overflow-hidden">
          {/* Video canvas — full bleed */}
          <div className="absolute inset-0">
            <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
            {/* Light vignette only — keep the watch visible */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(8,20,58,0.55)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zimson-950/60 via-transparent to-zimson-950/30" />
          </div>

          <video
            ref={videoRef}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
            muted
            playsInline
            preload="auto"
          >
            <source src="/media/watch-reveal.mp4" type="video/mp4" />
            <source src="/media/watch-reveal.webm" type="video/webm" />
          </video>

          {/* Ambient gold glow that intensifies with scroll */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[min(90vw,90vh)] w-[min(90vw,90vh)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rlx-gold/10 blur-[100px] transition-opacity duration-300"
            style={{ opacity: 0.25 + progress * 0.45 }}
          />

          {/* Content overlay */}
          <div className="relative z-10 flex h-full flex-col">
            {SHOW_HERO_COPY && (
              <>
                {/* Headline — fades as reveal begins */}
                <div
                  className="mx-auto w-full max-w-7xl px-5 pt-28 transition-opacity duration-200 sm:px-8 sm:pt-32"
                  style={{ opacity: headlineOpacity }}
                >
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.35em] text-rlx-gold">
                    Luxury watch service
                  </p>
                  <h1 className="max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                    Open the movement.
                    <span className="mt-1 block bg-gradient-to-r from-rlx-gold-light via-rlx-gold to-rlx-gold-dark bg-clip-text text-transparent">
                      Master every repair.
                    </span>
                  </h1>
                  <p className="mt-5 max-w-md text-base text-zimson-200/90 sm:text-lg">
                    Scroll to explore the craft — then sign in to your workspace.
                  </p>
                  <Link
                    to="/login"
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-rlx-gold px-7 py-3.5 text-sm font-semibold text-zimson-950 shadow-[0_0_40px_rgba(201,162,39,0.5)] transition hover:bg-rlx-gold-light"
                  >
                    Enter workspace
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Link>
                </div>

                <div className="flex-1" />

                {/* Milestone callouts — right side, synced to video progress */}
                <div className="mx-auto flex w-full max-w-7xl items-end justify-between gap-6 px-5 pb-12 sm:px-8 sm:pb-16">
                  <div className="hidden sm:block sm:w-48">
                    {/* Scroll progress */}
                    <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.3em] text-zimson-400">
                      Reveal
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rlx-gold-dark via-rlx-gold to-rlx-gold-light transition-[width] duration-75"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-xs text-zimson-500">
                      {String(Math.round(progress * 100)).padStart(3, "0")}%
                    </p>
                  </div>

                  <div className="relative min-h-[8rem] w-full max-w-md sm:max-w-lg">
                    {MILESTONES.map((m) => {
                      const opacity = milestoneOpacity(progress, m.from, m.to);
                      const translateY = opacity > 0 ? 0 : 12;
                      return (
                        <div
                          key={m.title}
                          className="absolute inset-x-0 bottom-0 transition-all duration-200"
                          style={{
                            opacity,
                            transform: `translateY(${translateY}px)`,
                            pointerEvents: opacity > 0.05 ? "auto" : "none",
                          }}
                        >
                          <div className="rounded-2xl border border-rlx-gold/30 bg-zimson-950/55 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
                            <div className="flex items-start gap-4">
                              <span className="font-mono text-2xl font-bold leading-none text-rlx-gold/50">
                                {m.tag}
                              </span>
                              <div>
                                <h2 className="text-xl font-semibold text-white sm:text-2xl">{m.title}</h2>
                                <p className="mt-1.5 text-sm leading-relaxed text-zimson-200">{m.body}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {!SHOW_HERO_COPY && <div className="flex-1" />}

            {/* Scroll cue */}
            <div
              className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 transition-opacity duration-300"
              style={{ opacity: progress < 0.06 ? 1 : 0 }}
            >
              <span className="text-[10px] uppercase tracking-[0.35em] text-zimson-400">Scroll</span>
              <span className="relative h-10 w-px overflow-hidden bg-white/15">
                <span className="absolute inset-x-0 top-0 h-3 animate-[landing-scroll-pulse_1.6s_ease-in-out_infinite] bg-gradient-to-b from-rlx-gold to-transparent" />
              </span>
            </div>

            {/* Loading veil */}
            {!ready && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-zimson-950/80 backdrop-blur-md">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-rlx-gold/30 border-t-rlx-gold" />
                <p className="text-sm text-zimson-300">Loading cinematic reveal…</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Minimal end cap — appears after scroll completes */}
      <section className="relative border-t border-white/10 bg-zimson-950 py-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rlx-gold to-transparent" />
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-5 text-center sm:px-8">
          <img src="/zimson-logo.png" alt="Zimson" className="h-10 w-auto object-contain opacity-90" />
          <p className="max-w-md text-sm text-zimson-300">
            Zimson Service Management — precision operations for luxury watch care.
          </p>
          <Link
            to="/login"
            className="rounded-full border border-rlx-gold/40 bg-rlx-gold/10 px-8 py-3 text-sm font-semibold text-rlx-gold transition hover:bg-rlx-gold hover:text-zimson-950"
          >
            Login to continue
          </Link>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-zimson-500">
            <Link to="/login" className="hover:text-rlx-gold">
              Login
            </Link>
            <span className="text-zimson-700">·</span>
            <Link to="/track" className="hover:text-rlx-gold">
              Track SRF
            </Link>
            <span className="text-zimson-700">·</span>
            <span>© {new Date().getFullYear()} Zimson</span>
          </div>
        </div>
      </section>
    </div>
  );
}
