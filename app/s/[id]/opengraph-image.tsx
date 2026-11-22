import { ImageResponse } from "next/og";
import { PROBLEMS, formatScore } from "@/game/content";
import { mistriDataUri } from "@/lib/mistri";
import { getScore } from "@/lib/scores";

export const alt = "Grout Bhar Denge score card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1E1E1E";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getScore(id);
  const nickname = s?.nickname ?? "Koi mistri";
  const score = s?.score ?? 0;
  const rank = s?.rank ?? "Naya Helper";
  const best = s && s.bestProblem !== null ? PROBLEMS[s.bestProblem] : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F2B705",
          padding: 36,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            background: "#F4F1EA",
            border: `8px solid ${INK}`,
            borderRadius: 36,
            boxShadow: `12px 12px 0 ${INK}`,
            padding: "28px 40px",
            alignItems: "center",
            gap: 36,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mistriDataUri(rank === "Grout King" ? "king" : "happy")} width={360} height={396} alt="" />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#2E7DAF", letterSpacing: 2 }}>GROUT BHAR DENGE</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: INK, marginTop: 8 }}>{`${nickname} ne bhare`}</div>
            <div style={{ fontSize: 150, fontWeight: 800, color: INK, lineHeight: 1 }}>{formatScore(score)}</div>
            <div style={{ display: "flex", marginTop: 14 }}>
              <div
                style={{
                  background: "#E4572E",
                  color: "#fff",
                  fontSize: 40,
                  fontWeight: 800,
                  padding: "6px 28px",
                  border: `5px solid ${INK}`,
                  borderRadius: 999,
                }}
              >
                {rank}
              </div>
            </div>
            {best && (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
                <div style={{ fontSize: 28, color: "#6B6E72", textDecoration: "line-through" }}>{best.problem}</div>
                <div style={{ fontSize: 34, fontWeight: 700, color: INK }}>{best.fix}</div>
              </div>
            )}
            <div style={{ fontSize: 38, fontWeight: 800, color: INK, marginTop: 18 }}>Tu kitna bharega?</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
