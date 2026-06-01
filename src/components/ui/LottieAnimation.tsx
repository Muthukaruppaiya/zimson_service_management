import { useLottie } from "lottie-react";
import { useEffect, useState } from "react";
import { fetchLottieAnimation, prefetchLottieAnimation } from "../../lib/lottieCache";

export { prefetchLottieAnimation };

type Props = {
  src: string;
  className?: string;
  loop?: boolean;
  ariaLabel?: string;
};

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
      renderer: "svg",
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

    void fetchLottieAnimation(src)
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
      <div className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-zimson-600 border-t-transparent" />
      {failed ? (
        <span className="sr-only">Animation could not be loaded; showing spinner instead.</span>
      ) : null}
    </div>
  );
}
