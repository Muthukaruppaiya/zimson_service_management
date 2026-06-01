import { useLottie } from "lottie-react";
import { useEffect, useState } from "react";

type Props = {
  src: string;
  className?: string;
  loop?: boolean;
  ariaLabel?: string;
};

export function LottieAnimation({ src, className, loop = true, ariaLabel }: Props) {
  const [animationData, setAnimationData] = useState<object | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setAnimationData(undefined);
    void fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load animation (${r.status})`);
        return r.json() as Promise<object>;
      })
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setAnimationData(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const { View } = useLottie(
    {
      animationData,
      loop,
      autoplay: Boolean(animationData),
    },
    { className: "h-full w-full" },
  );

  if (!animationData) {
    return (
      <div
        className={className}
        role="status"
        aria-label={ariaLabel ?? "Loading"}
        aria-busy="true"
      />
    );
  }

  return (
    <div role="img" aria-label={ariaLabel} className={className}>
      {View}
    </div>
  );
}
