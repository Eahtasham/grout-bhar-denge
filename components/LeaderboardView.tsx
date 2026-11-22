"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatScore } from "@/game/content";
import { getMyScoreIds, getPositions, istDayClient, type LastPositions } from "@/lib/client";
import { MuteToggle } from "./MuteToggle";

type Scope = "daily" | "all";

interface Entry {
  pos: number;
  id: string;
  nickname: string;
  score: number;
  rank: string;
}

export function LeaderboardView() {
  const [scope, setScope] = useState<Scope>("daily");
  const [data, setData] = useState<Partial<Record<Scope, Entry[] | "error">>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<LastPositions | null>(null);

  useEffect(() => {
    for (const s of ["daily", "all"] as const) {
      fetch(`/api/leaderboard?scope=${s}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setData((prev) => ({ ...prev, [s]: d.entries })))
        .catch(() => setData((prev) => ({ ...prev, [s]: "error" })));
    }
    // Device-local info: read after mount so server and client markup match.
    const t = setTimeout(() => {
      setMine(new Set(getMyScoreIds()));
      setPos(getPositions());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const list = data[scope];
  const inList = Array.isArray(list) && list.some((e) => mine.has(e.id));
  const myPos =
    pos && !inList
      ? scope === "daily"
        ? pos.day === istDayClient()
          ? pos.dailyPos
          : null
        : pos.allTimePos
      : null;

  return (
    <main className="tile-bg flex min-h-[100dvh] justify-center">
      <div className="flex w-full max-w-[480px] flex-col gap-4 px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn bg-white px-4 py-2 text-base">
            ← Home
          </Link>
          <MuteToggle />
        </div>
        <h1 className="text-center text-5xl font-extrabold text-white [paint-order:stroke_fill] [-webkit-text-stroke:6px_#1E1E1E] [text-shadow:3px_3px_0_#1E1E1E]">
          Leaderboard
        </h1>

        <div role="tablist" aria-label="Leaderboard" className="grid grid-cols-2 gap-3">
          {(
            [
              ["daily", "Aaj"],
              ["all", "All-time"],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`btn py-2 text-xl ${scope === s ? "bg-turmeric" : "bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="sticker bg-paper p-3" role="tabpanel">
          {list === undefined && <p className="p-3 font-bold">Load ho raha hai…</p>}
          {list === "error" && <p className="p-3 font-bold text-danger">Leaderboard load nahi hua. Thodi der mein try karo.</p>}
          {Array.isArray(list) && list.length === 0 && (
            <p className="p-3 font-bold">
              {scope === "daily" ? "Aaj abhi koi score nahi. Pehla number tera ho sakta hai." : "Abhi koi score nahi."}
            </p>
          )}
          {Array.isArray(list) && list.length > 0 && (
            <ol className="flex flex-col">
              {list.map((e) => {
                const me = mine.has(e.id);
                return (
                  <li
                    key={e.id}
                    className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${me ? "bg-turmeric outline-[3px] outline-ink" : ""}`}
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-ink text-sm font-extrabold ${
                        e.pos <= 3 ? "bg-turmeric" : "bg-white"
                      }`}
                    >
                      {e.pos}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold leading-tight">
                        {e.nickname}
                        {me && <span className="ml-1 text-sm font-extrabold">(tu)</span>}
                      </span>
                      <span className="block text-xs font-bold text-ink/60">{e.rank}</span>
                    </span>
                    <span className="text-xl font-extrabold tabular-nums">{formatScore(e.score)}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {myPos && (
            <p className="mt-2 rounded-xl bg-turmeric px-3 py-2 font-extrabold">Tera number: #{myPos}</p>
          )}
        </section>

        <Link href="/" className="btn bg-turmeric py-3 text-center text-2xl">
          Grout Bharo
        </Link>
      </div>
    </main>
  );
}
