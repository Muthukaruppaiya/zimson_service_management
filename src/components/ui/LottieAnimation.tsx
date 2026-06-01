import { useLottie } from "lottie-react";
import { useEffect, useState } from "react";

type Props = {
  src: string;
  className?: string;
  loop?: boolean;
  ariaLabel?: string;
};

function lottiePublicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${normalized}`.replace(/([^:]\/)\/+/g, "$1");
}

function LottieMounted({
  animationData,
  className,
  loop,
  ariaLabel,
}: {
  animationData: object;
  className?: string;
  loop: boolean;
  ariaLabel?: string;
}) {
  const { View } = useLottie(
    {
      animationData,
      loop,
      autoplay: true,
    },
    { className: "h-full w-full" },
  );

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      {View}
    </div>
  );
}

export function LottieAnimation({ src, className, loop = true, ariaLabel }: Props) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAnimationData(null);
    setFailed(false);
    const url = src.startsWith("http") || src.startsWith("/") ? lottiePublicUrl(src) : src;
    void fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load animation (${r.status})`);
        return r.json() as Promise<object>;
      })
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (animationData) {
    return (
      <LottieMounted
        key={src}
        animationData={animationData}
        className={className}
        loop={loop}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center ${className ?? ""}`}
      role="status"
      aria-label={ariaLabel ?? "Loading"}
      aria-busy="true"
    >
      <div
        className={`h-10 w-10 shrink-0 rounded-full border-4 border-zimson-600 border-t-transparent ${
          failed ? "" : "animate-spin"
        }`}
      />
    </div>
  );
}
