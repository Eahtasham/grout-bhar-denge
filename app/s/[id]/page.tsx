import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Mistri } from "@/components/Mistri";
import { PROBLEMS, formatScore, shareText } from "@/game/content";
import { getScore } from "@/lib/scores";

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = await getScore(id);
  if (!s) return { title: "Grout Bhar Denge" };
  const title = `${s.nickname} ne ${formatScore(s.score)} points ka grout bhara`;
  const description = shareText(s.score, s.rank);
  return {
    title,
    description,
    openGraph: { title, description, type: "website", url: `/s/${s.id}` },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

export default function SharePage({ params }: PageProps<"/s/[id]">) {
  return (
    <main className="tile-bg flex min-h-[100dvh] justify-center">
      <div className="flex w-full max-w-[480px] flex-col gap-4 px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
        <p className="text-center text-3xl font-extrabold text-white [paint-order:stroke_fill] [-webkit-text-stroke:5px_#1E1E1E] [text-shadow:3px_3px_0_#1E1E1E]">
          Grout Bhar Denge!
        </p>
        <Suspense fallback={<div className="sticker h-96 animate-pulse bg-paper" />}>
          <ScoreCard params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function ScoreCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getScore(id);
  if (!s) notFound();
  const best = s.bestProblem !== null ? PROBLEMS[s.bestProblem] : null;
  return (
    <>
      <section className="sticker pop-in bg-paper p-5 text-center">
        <div className="mx-auto h-40 w-36">
          <Mistri mood={s.rank === "Grout King" ? "king" : "happy"} className="h-full w-full" />
        </div>
        <p className="mt-2 text-xl font-bold">{s.nickname} ne bhare</p>
        <p className="text-7xl font-extrabold leading-none tabular-nums">{formatScore(s.score)}</p>
        <p className="text-lg font-bold">points</p>
        <span className="sticker mt-3 inline-block bg-danger px-4 py-1 text-xl font-extrabold text-white">{s.rank}</span>
        {best && (
          <div className="mt-4 rounded-xl border-[3px] border-dashed border-ink/40 px-3 py-2 text-left">
            <p className="font-bold text-ink/60 line-through decoration-danger decoration-2">{best.problem}</p>
            <p className="text-lg font-extrabold leading-tight">{best.fix}</p>
          </div>
        )}
      </section>
      <Link href={`/?c=${s.id}`} className="btn bg-turmeric py-4 text-center text-3xl">
        Mera record todo
      </Link>
      <p className="text-center font-bold">60 second. Ek ungli. Kitni problems mein grout bharega?</p>
    </>
  );
}
