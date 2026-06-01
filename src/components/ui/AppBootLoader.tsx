import { LOTTIE_APP_LOADING } from "../../lib/lottieAssets";
import { LottieAnimation } from "./LottieAnimation";

export function AppBootLoader({ message = "Loading Zimson…" }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zimson-50 px-6">
      <LottieAnimation
        src={LOTTIE_APP_LOADING}
        className="h-40 w-40 max-w-[min(280px,70vw)] sm:h-48 sm:w-48"
        ariaLabel="Loading application"
      />
      <p className="mt-4 text-sm font-medium text-stone-600">{message}</p>
    </div>
  );
}
