"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { getAudio } from "@/game/audio";
import { CREDITS, PROBLEMS, SHARE, VOICE, VOICE_IDS, fillTemplate, formatScore, pick, type VoiceLine } from "@/game/content";
import { BOTTOM_H, GameEngine } from "@/game/engine";
import { rankFor, type Fill, type RoundResult } from "@/game/scoring";
import type { MistriMood } from "@/lib/mistri";
import { GameOver } from "./GameOver";
import { Mistri } from "./Mistri";
import { MuteToggle } from "./MuteToggle";

export interface Challenge {
  id: string;
  nickname: string;
  score: number;
}

interface TopEntry {
  pos: number;
  id: string;
  nickname: string;
  score: number;
  rank: string;
}

export function GroutApp() {
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [top3, setTop3] = useState<TopEntry[] | null>(null);

  const loadTop = useCallback(() => {
    fetch("/api/leaderboard?scope=daily")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTop3(d.entries.slice(0, 3)))
      .catch(() => setTop3([]));
  }, []);

  useEffect(() => {
    loadTop();
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) {
      fetch(`/api/score?id=${encodeURIComponent(c)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setChallenge({ id: d.id, nickname: d.nickname, score: d.score });
          track("challenge_open");
        })
        .catch(() => {});
    }
  }, [loadTop]);

  if (screen === "game") {
    return (
      <GameView
        challenge={challenge}
        onHome={() => {
          setScreen("home");
          loadTop();
        }}
      />
    );
  }
  return (
    <Home
      challenge={challenge}
      top3={top3}
      onPlay={() => {
        getAudio().unlock();
        setScreen("game");
      }}
    />
  );
}

// ------------------------------------------------------------------ Home

function Home({ challenge, top3, onPlay }: { challenge: Challenge | null; top3: TopEntry[] | null; onPlay: () => void }) {
  return (
    <main className="tile-bg flex min-h-[100dvh] justify-center">
      <div className="flex w-full max-w-[480px] flex-col gap-4 px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <Link href="/leaderboard" className="btn bg-white px-4 py-2 text-base">
            Leaderboard
          </Link>
          <MuteToggle />
        </div>

        {challenge && (
          <div className="sticker pop-in bg-danger px-4 py-3 text-center text-lg font-extrabold leading-tight text-white">
            {fillTemplate(SHARE.challengeBanner, { name: challenge.nickname, score: formatScore(challenge.score) })}
          </div>
        )}

        {/* Site poster */}
        <div className="poster relative mx-1 mt-2 -rotate-2 rounded-md border-4 border-danger bg-turmeric px-4 pb-4 pt-5 text-center text-ink">
          <span className="pin left-2 top-2" />
          <span className="pin right-2 top-2" />
          <p className="text-xs font-extrabold tracking-widest text-danger">✦ HAR GAP KA EK HI ILAAJ ✦</p>
          <h1 className="mt-1 text-[clamp(2.6rem,13vw,3.6rem)] font-extrabold leading-[0.92] text-white [paint-order:stroke_fill] [-webkit-text-stroke:7px_#1E1E1E] [text-shadow:4px_4px_0_#1E1E1E]">
            Grout Bhar
            <br />
            Denge!
          </h1>
          <p className="mt-2 inline-block rounded-full bg-ink px-4 py-1 text-sm font-extrabold tracking-wide text-turmeric">
            60 SECOND · EK UNGLI
          </p>
        </div>

        <div className="relative mx-auto -mt-1 h-48 w-44">
          <Mistri mood="happy" className="bob h-full w-full drop-shadow-[0_8px_0_rgba(0,0,0,0.35)]" />
        </div>

        <p className="text-center text-lg font-bold leading-snug">
          Ungli se crack pe trowel chalao, grout bhar jayega.
          <br />
          Paani bharne se pehle sab seal karo.
        </p>

        <button type="button" onClick={onPlay} className="btn bg-turmeric py-4 text-3xl text-ink" autoFocus>
          Grout Bharo
        </button>

        <section className="sticker bg-paper p-4 text-ink" aria-labelledby="top-today">
          <h2 id="top-today" className="mb-2 text-xl font-extrabold">
            Aaj ke top mistri
          </h2>
          {top3 === null ? (
            <p className="text-ink/70">Load ho raha hai…</p>
          ) : top3.length === 0 ? (
            <p className="font-bold">Aaj abhi koi nahi. Pehla number tera?</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {top3.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-lg">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-turmeric font-extrabold">
                    {e.pos}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{e.nickname}</span>
                  <span className="font-extrabold tabular-nums">{formatScore(e.score)}</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/leaderboard" className="mt-3 inline-block font-bold underline underline-offset-4">
            Poora leaderboard dekho
          </Link>
        </section>

        <p className="text-center text-sm font-bold text-ink/70">
          Awaaz:{" "}
          <a href={CREDITS.voiceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {CREDITS.voice}
          </a>{" "}
          ki original reels se. Shukriya!
        </p>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ Game

type Bubble = { kind: "voice"; text: string } | { kind: "fix"; problem: string; fix: string };

interface Over {
  result: RoundResult;
  fills: Fill[];
  sessionId: string | null;
  round: number;
}

function GameView({ challenge, onHome }: { challenge: Challenge | null; onHome: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const sessionRef = useRef<string | null>(null);
  const roundRef = useRef(0);
  const [over, setOver] = useState<Over | null>(null);
  const [mood, setMood] = useState<MistriMood>("idle");
  const [bubble, setBubble] = useState<Bubble | null>(null);

  const start = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setOver(null);
    setBubble(null);
    setMood("idle");
    const round = ++roundRef.current;
    sessionRef.current = null;
    engine.begin();
    track("round_start");
    fetch("/api/session", { method: "POST" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { sessionId: string; seed: number }) => {
        if (round !== roundRef.current) return;
        sessionRef.current = d.sessionId;
        engine.setSeed(d.seed);
      })
      .catch(() => {
        if (round !== roundRef.current) return;
        // Offline: still playable, the score just isn't posted.
        engine.setSeed((Math.random() * 2 ** 32) >>> 0 || 1);
      });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const audio = getAudio();
    let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
    let moodTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFixAt = 0;
    let fillCount = 0;

    // Prefer lines that have audio, so the bubble and the voice match.
    // Real reel lines ("Grout bhar denge!") get picked more often than the AI ones.
    const voiced = (lines: VoiceLine[]) => {
      const withAudio = lines.filter((l) => audio.hasVoice(l.id));
      const reel = withAudio.filter((l) => l.source === "reel");
      if (reel.length && Math.random() < 0.6) return pick(reel);
      return pick(withAudio.length ? withAudio : lines);
    };
    const say = (b: Bubble, ms: number) => {
      setBubble(b);
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => setBubble(null), ms);
    };
    const feel = (m: MistriMood, ms: number) => {
      setMood(m);
      clearTimeout(moodTimer);
      moodTimer = setTimeout(() => setMood("idle"), ms);
    };

    const font = getComputedStyle(document.body).fontFamily || "sans-serif";
    const engine = new GameEngine(
      canvas,
      {
        onStart() {
          const line = voiced(VOICE.start);
          say({ kind: "voice", text: line.text }, 1200);
          void audio.voice(line.id);
        },
        onFill(e) {
          fillCount++;
          if (e.spec.problem !== undefined) {
            const p = PROBLEMS[e.spec.problem];
            lastFixAt = performance.now();
            say({ kind: "fix", problem: p.problem, fix: p.fix }, 2200);
            feel("happy", 1200);
            return;
          }
          if (performance.now() - lastFixAt < 1500) return;
          if (fillCount % 3 === 1 || e.combo >= 3) {
            const line = voiced(VOICE.fill);
            say({ kind: "voice", text: line.text }, 1200);
            void audio.voice(line.id);
          }
          if (e.combo >= 2) feel("happy", 900);
        },
        onCombo5() {
          const line = voiced(VOICE.combo5);
          say({ kind: "voice", text: line.text }, 1500);
          void audio.voice(line.id);
          feel("king", 1600);
        },
        onLeakWarning() {
          const line = voiced(VOICE.leak);
          say({ kind: "voice", text: line.text }, 1500);
          void audio.voice(line.id);
          feel("panic", 1800);
        },
        onRushHour() {
          const line = voiced(VOICE.rush);
          say({ kind: "voice", text: line.text }, 1500);
          void audio.voice(line.id);
          feel("panic", 1400);
        },
        onRankUp(rank) {
          if (performance.now() - lastFixAt < 1500) return;
          say({ kind: "voice", text: `Promotion! Ab tu ${rank}` }, 1500);
          feel("happy", 1200);
        },
        onEnd({ result, fills }) {
          clearTimeout(bubbleTimer);
          clearTimeout(moodTimer);
          setBubble(null);
          const rank = rankFor(result.score);
          setMood(rank === "Grout King" ? "king" : result.score >= 700 ? "happy" : "idle");
          void audio.voice(VOICE.gameOver[rank].id);
          setOver({ result, fills, sessionId: sessionRef.current, round: roundRef.current });
          track("round_end", { score: result.score, rank, fills: result.fills });
        },
      },
      font,
    );
    engineRef.current = engine;
    audio.preloadVoices(VOICE_IDS);
    engine.mount();
    start();
    const rounds = roundRef;
    return () => {
      clearTimeout(bubbleTimer);
      clearTimeout(moodTimer);
      engine.destroy();
      engineRef.current = null;
      rounds.current++; // invalidates any in-flight session fetch
    };
  }, [start]);

  return (
    <main className="fixed inset-0 flex justify-center bg-[#1A1B1D]">
      <div className="relative h-[100dvh] w-full max-w-[480px] select-none">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Game board" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 px-3 pb-2"
          style={{ height: BOTTOM_H }}
        >
          <Mistri mood={mood} className="h-[92px] w-[84px] shrink-0" />
          <div className="mb-3 min-w-0 flex-1">
            {bubble && (
              <div key={bubble.kind === "fix" ? bubble.fix : bubble.text} className="sticker pop-in relative bg-white px-3 py-2">
                <span className="absolute -left-[11px] bottom-3 h-4 w-4 rotate-45 border-b-[3px] border-l-[3px] border-ink bg-white" />
                {bubble.kind === "fix" ? (
                  <>
                    <p className="truncate text-sm font-bold text-ink/60 line-through decoration-danger decoration-2">
                      {bubble.problem}
                    </p>
                    <p className="text-base font-extrabold leading-tight">{bubble.fix}</p>
                  </>
                ) : (
                  <p className="text-lg font-extrabold leading-tight">{bubble.text}</p>
                )}
              </div>
            )}
          </div>
          <div className="pointer-events-auto mb-2 shrink-0">
            <MuteToggle />
          </div>
        </div>

        {over && (
          <GameOver
            key={over.round}
            result={over.result}
            fills={over.fills}
            sessionId={over.sessionId}
            challenge={challenge}
            onPlayAgain={start}
            onHome={onHome}
          />
        )}
      </div>
    </main>
  );
}

