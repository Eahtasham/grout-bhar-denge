"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PROBLEMS, SHARE, VOICE, fillTemplate, formatScore, shareText } from "@/game/content";
import { nextRank, rankFor, type Fill, type RoundResult } from "@/game/scoring";
import {
  addMyScoreId,
  getDeviceId,
  getNickname,
  istDayClient,
  setNickname,
  setPositions,
} from "@/lib/client";
import { makeStoryImage, shareLink, shareStoryImage } from "@/lib/share";
import type { Challenge } from "./GroutApp";

interface Submitted {
  id: string;
  score: number;
  rank: string;
  dailyPos: number;
  allTimePos: number;
}

type SubmitState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "done"; data: Submitted }
  | { state: "error"; message: string; retryable: boolean };

const RANK_STYLE: Record<string, string> = {
  "Naya Helper": "bg-white text-ink",
  Mistri: "bg-water text-ink",
  "Senior Mistri": "bg-blue text-white",
  Thekedaar: "bg-danger text-white",
  "Grout King": "bg-turmeric text-ink",
};

function validNick(n: string) {
  const t = n.trim();
  return t.length >= 3 && t.length <= 16;
}

export function GameOver({
  result,
  fills,
  sessionId,
  challenge,
  onPlayAgain,
  onHome,
}: {
  result: RoundResult;
  fills: Fill[];
  sessionId: string | null;
  challenge: Challenge | null;
  onPlayAgain: () => void;
  onHome: () => void;
}) {
  const rank = rankFor(result.score);
  const next = nextRank(result.score);
  const [nick, setNick] = useState(getNickname);
  // The name the score was (or will be) posted under; drives the story image.
  const [committedNick, setCommittedNick] = useState(getNickname);
  const [autoSubmit] = useState(() => !!sessionId && validNick(getNickname()));
  const [submit, setSubmit] = useState<SubmitState>(autoSubmit ? { state: "saving" } : { state: "idle" });
  const [story, setStory] = useState<Blob | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const post = (name: string) => {
    started.current = true;
    return fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, deviceId: getDeviceId(), nickname: name.trim(), fills }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          // 422 with a nickname reason can be fixed and retried; others can't.
          const retryable = r.status === 422 && !String(d.error ?? "").startsWith("Rejected");
          if (retryable) started.current = false;
          setSubmit({ state: "error", message: d.error ?? "Save nahi hua", retryable });
          return;
        }
        setNickname(name.trim());
        setCommittedNick(name.trim());
        addMyScoreId(d.id);
        setPositions({ day: istDayClient(), dailyPos: d.dailyPos, allTimePos: d.allTimePos, bestScore: d.bestScore });
        setSubmit({ state: "done", data: d });
      })
      .catch(() => {
        started.current = false;
        setSubmit({ state: "error", message: "Network gaya. Dobara try karo.", retryable: true });
      });
  };

  useEffect(() => {
    if (autoSubmit && !started.current) void post(getNickname());
    // Runs once per round (component is keyed by round).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareId = submit.state === "done" ? submit.data.id : null;
  const displayNick = committedNick.trim() || "Main";

  // Pre-render the story image so tapping the button can share it immediately
  // (iOS drops the share permission if we await slow work after the tap).
  useEffect(() => {
    let alive = true;
    makeStoryImage({
      nickname: displayNick,
      score: result.score,
      rank,
      bestProblem: result.bestProblem,
      site: window.location.origin,
    })
      .then((b) => alive && setStory(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [displayNick, result.score, result.bestProblem, rank]);

  const onSave = () => {
    if (!validNick(nick)) {
      setSubmit({ state: "error", message: "Naam 3 se 16 letters ka ho", retryable: true });
      inputRef.current?.focus();
      return;
    }
    if (started.current) return;
    setSubmit({ state: "saving" });
    void post(nick);
  };

  const text = shareText(result.score, rank);
  const onShare = () => {
    const url = shareId ? `${window.location.origin}/s/${shareId}` : window.location.origin;
    void shareLink(text, url);
  };
  const onStory = async () => {
    setStoryBusy(true);
    try {
      const blob =
        story ??
        (await makeStoryImage({
          nickname: displayNick,
          score: result.score,
          rank,
          bestProblem: result.bestProblem,
          site: window.location.origin,
        }));
      await shareStoryImage(blob, text);
    } finally {
      setStoryBusy(false);
    }
  };

  const best = result.bestProblem !== null ? PROBLEMS[result.bestProblem] : null;
  const beat = challenge && result.score > challenge.score;
  const needsName = !!sessionId && submit.state !== "done" && submit.state !== "saving" && !(submit.state === "error" && !submit.retryable);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-ink/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="over-title"
        className="sticker pop-in my-auto w-full max-w-[420px] bg-paper p-5"
      >
        <p className="text-center text-lg font-bold">{VOICE.gameOver[rank].text}</p>
        <h2 id="over-title" className="sr-only">
          Round khatam
        </h2>
        <p className="text-center text-[4.5rem] font-extrabold leading-none tabular-nums">{formatScore(result.score)}</p>
        <div className="mt-2 flex justify-center">
          <span className={`sticker px-4 py-1 text-xl font-extrabold ${RANK_STYLE[rank]}`}>{rank}</span>
        </div>
        <p className="mt-2 text-center text-sm font-bold text-ink/70">
          {result.fills} cracks seal · best combo x{result.maxCombo}
          {next ? ` · ${next.name} ke liye ${formatScore(next.min - result.score)} aur` : ""}
        </p>

        {challenge && (
          <div className={`sticker mt-4 px-3 py-2 text-center font-extrabold ${beat ? "bg-turmeric" : "bg-white"}`}>
            {beat
              ? `${fillTemplate(SHARE.beatChallenge, { name: challenge.nickname })} Ab usko wapas bhejo.`
              : `${challenge.nickname} ko harane ke liye ${formatScore(challenge.score - result.score + 1)} aur chahiye. Ek aur round?`}
          </div>
        )}

        {best && (
          <div className="mt-4 rounded-xl border-[3px] border-dashed border-ink/40 px-3 py-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">Aaj ka best fix</p>
            <p className="font-bold text-ink/60 line-through decoration-danger decoration-2">{best.problem}</p>
            <p className="text-lg font-extrabold leading-tight">{best.fix}</p>
          </div>
        )}

        {needsName && (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            <label htmlFor="nick" className="sr-only">
              Tera naam
            </label>
            <input
              id="nick"
              ref={inputRef}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={16}
              autoComplete="nickname"
              placeholder="Tera naam (leaderboard ke liye)"
              className="min-w-0 flex-1 rounded-xl border-[3px] border-ink bg-white px-3 py-2 text-lg font-bold outline-none focus:border-blue"
            />
            <button type="submit" className="btn bg-white px-4 text-lg">
              Save
            </button>
          </form>
        )}

        <div className="mt-2 min-h-6 text-center text-sm font-bold" aria-live="polite">
          {!sessionId && "Offline round: score leaderboard pe nahi gaya."}
          {submit.state === "saving" && "Score save ho raha hai…"}
          {submit.state === "error" && <span className="text-danger">{submit.message}</span>}
          {submit.state === "done" && `Aaj #${submit.data.dailyPos} · All-time #${submit.data.allTimePos}`}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onShare}
            disabled={!!sessionId && submit.state === "saving"}
            className="btn col-span-2 bg-turmeric py-3 text-2xl"
          >
            {beat ? "Usko bhejo" : "Share karo"}
          </button>
          <button type="button" onClick={onPlayAgain} className="btn bg-white py-3 text-xl">
            Phir se
          </button>
          <button type="button" onClick={onStory} disabled={storyBusy} className="btn bg-white py-3 text-lg leading-tight">
            {storyBusy ? "Ban raha hai…" : "Status image"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between text-base font-bold">
          <button type="button" onClick={onHome} className="underline underline-offset-4">
            Home
          </button>
          <Link href="/leaderboard" className="underline underline-offset-4">
            Leaderboard
          </Link>
        </div>
        <p className="mt-2 text-center text-sm font-bold text-ink/60">{SHARE.comeBack}</p>
      </div>
    </div>
  );
}
