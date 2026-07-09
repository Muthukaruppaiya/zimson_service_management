import { useId } from "react";

/** Gold login-card ribbon — SVG fill with rounded top corners and smooth bottom curve. */
export function LoginRibbonBg({ className = "" }: { className?: string }) {
  const gradId = useId();
  const shadowId = useId();

  return (
    <svg
      className={className}
      viewBox="0 0 440 128"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9a417" />
          <stop offset="52%" stopColor="#c89410" />
          <stop offset="100%" stopColor="#b7830a" />
        </linearGradient>
        <filter id={shadowId} x="-4%" y="-8%" width="108%" height="125%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="rgba(183,131,10,0.22)" />
        </filter>
      </defs>
      <path
        fill={`url(#${gradId})`}
        filter={`url(#${shadowId})`}
        d="
          M 0 28
          A 28 28 0 0 1 28 0
          H 412
          A 28 28 0 0 1 440 28
          C 440 44 434 58 424 70
          C 412 84 396 96 376 104
          C 356 112 334 118 312 122
          C 290 126 268 128 248 128
          H 192
          C 172 128 150 126 128 122
          C 106 118 84 112 64 104
          C 44 96 28 84 16 70
          C 6 58 0 44 0 28
          Z
        "
      />
    </svg>
  );
}
