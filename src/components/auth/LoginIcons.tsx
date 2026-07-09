import type { CSSProperties } from "react";

/** Inline SVG icons for login — outline style in cream/gold circles. */
const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconUser() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" {...iconStroke} />
      <path d="M5 20c0-3.5 3.13-6 7-6s7 2.5 7 6" {...iconStroke} />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="11" width="12" height="9" rx="1.5" {...iconStroke} />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" {...iconStroke} />
    </svg>
  );
}

export function IconHeadset() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a8 8 0 0 0-8 8v5a3 3 0 0 0 3 3h1v-7H5a6 6 0 1 1 12 0h-3v7h1a3 3 0 0 0 3-3v-5a8 8 0 0 0-8-8Zm-5 13h2a2 2 0 0 1-2 2v2a2 2 0 0 0 2 2h1v-6H7Zm11 0v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1Z" fill="currentColor" />
    </svg>
  );
}

export function IconArrowRight() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
    </svg>
  );
}

/** Fan of thin gold lines converging toward a corner, like light rays. */
export function GoldSwoosh({ className, gradId = "zimson-swoosh-grad" }: { className?: string; gradId?: string }) {
  const lineCount = 9;
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const spread = i * 9;
    const endY = 78 - i * 4;
    return {
      d: `M0 ${72 - spread * 0.3} C120 ${20 + spread}, 260 ${10 + spread * 0.6}, 400 ${endY}`,
      opacity: 0.25 + (i / lineCount) * 0.6,
      width: i === Math.round(lineCount / 2) ? 2.25 : 1,
    };
  });

  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 400 90" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#B8860B" stopOpacity="0" />
          <stop offset="40%" stopColor="#D4A017" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#F4D77B" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#E5B13A" stopOpacity="0" />
        </linearGradient>
      </defs>
      {lines.map((line, i) => (
        <path
          key={i}
          d={line.d}
          stroke={`url(#${gradId})`}
          strokeWidth={line.width}
          strokeLinecap="round"
          opacity={line.opacity}
        />
      ))}
    </svg>
  );
}

/** Large hollow/outlined "Z" watermark, matching the ZIMSON brand mark style. */
export function ZWatermark({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      viewBox="0 0 220 300"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M40 40 H180 L60 260 H190"
        stroke="currentColor"
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
