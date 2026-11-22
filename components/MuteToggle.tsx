"use client";

import { useSyncExternalStore } from "react";
import { getAudio } from "@/game/audio";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function MuteToggle({ className = "" }: { className?: string }) {
  const muted = useSyncExternalStore(
    subscribe,
    () => getAudio().muted,
    () => false,
  );
  return (
    <button
      type="button"
      onClick={() => {
        const a = getAudio();
        a.unlock();
        a.setMuted(!a.muted);
        listeners.forEach((l) => l());
      }}
      aria-label={muted ? "Sound on karo" : "Mute karo"}
      aria-pressed={muted}
      className={`btn grid h-11 w-11 place-items-center bg-white ${className}`}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1E1E1E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="#F2B705" />
        {muted ? (
          <path d="M17 9l5 6M22 9l-5 6" />
        ) : (
          <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />
        )}
      </svg>
    </button>
  );
}
