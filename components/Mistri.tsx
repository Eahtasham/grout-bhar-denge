import { mistriSvg, type MistriMood } from "@/lib/mistri";

export function Mistri({ mood = "idle", className = "" }: { mood?: MistriMood; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Mistri"
      className={`block [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: mistriSvg(mood) }}
    />
  );
}
