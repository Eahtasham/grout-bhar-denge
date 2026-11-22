"use client";

import { track } from "@vercel/analytics";
import { PROBLEMS, formatScore } from "@/game/content";
import { mistriDataUri } from "./mistri";

/** Native share sheet, falling back to a WhatsApp link. */
export async function shareLink(text: string, url: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text, url });
      track("share_click", { method: "native" });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  track("share_click", { method: "whatsapp" });
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws the 1080 x 1920 story image for Instagram / WhatsApp Status. */
export async function makeStoryImage(opts: {
  nickname: string;
  score: number;
  rank: string;
  bestProblem: number | null;
  site: string;
}): Promise<Blob> {
  await document.fonts?.ready;
  const font = getComputedStyle(document.body).fontFamily;
  const W = 1080;
  const H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const INK = "#1E1E1E";

  ctx.fillStyle = "#F2B705";
  ctx.fillRect(0, 0, W, H);

  // Tile floor panel.
  ctx.fillStyle = INK;
  rr(ctx, 92, 452, 916, 1120, 40);
  ctx.fill();
  rr(ctx, 80, 440, 916, 1120, 40);
  ctx.fill();
  ctx.save();
  rr(ctx, 88, 448, 900, 1104, 34);
  ctx.clip();
  ctx.fillStyle = "#F4F1EA";
  ctx.fillRect(88, 448, 900, 1104);
  ctx.strokeStyle = "#8A8D91";
  ctx.lineWidth = 6;
  for (let x = 88; x < 988; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, 448);
    ctx.lineTo(x, 1552);
    ctx.stroke();
  }
  for (let y = 448; y < 1552; y += 150) {
    ctx.beginPath();
    ctx.moveTo(88, y);
    ctx.lineTo(988, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const outlined = (text: string, x: number, y: number, size: number, fill: string, stroke = 14) => {
    ctx.font = `800 ${size}px ${font}`;
    ctx.lineWidth = stroke;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x + 6, y + 6);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };

  outlined("GROUT BHAR", W / 2, 170, 128, "#FFFFFF");
  outlined("DENGE!", W / 2, 310, 150, "#FFFFFF");

  const mood = opts.rank === "Grout King" ? "king" : "happy";
  const mistri = await loadImage(mistriDataUri(mood));
  ctx.drawImage(mistri, 330, 470, 420, 462);

  ctx.fillStyle = INK;
  ctx.font = `700 54px ${font}`;
  ctx.fillText(`${opts.nickname} ne bhare`, W / 2, 990);
  outlined(formatScore(opts.score), W / 2, 1110, 190, "#F2B705", 18);
  ctx.fillStyle = INK;
  ctx.font = `700 52px ${font}`;
  ctx.fillText("points", W / 2, 1220);

  // Rank badge.
  ctx.font = `800 60px ${font}`;
  const bw = ctx.measureText(opts.rank).width + 90;
  ctx.fillStyle = INK;
  rr(ctx, W / 2 - bw / 2 + 8, 1272 + 8, bw, 110, 55);
  ctx.fill();
  ctx.fillStyle = "#E4572E";
  rr(ctx, W / 2 - bw / 2, 1272, bw, 110, 55);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(opts.rank, W / 2, 1330);

  if (opts.bestProblem !== null && PROBLEMS[opts.bestProblem]) {
    const p = PROBLEMS[opts.bestProblem];
    ctx.fillStyle = INK;
    ctx.font = `700 44px ${font}`;
    const lines = wrap(ctx, `"${p.problem}" → ${p.fix}`, 820);
    lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1450 + i * 54));
  }

  outlined("Tu kitna bharega?", W / 2, 1680, 92, "#FFFFFF", 12);
  ctx.fillStyle = INK;
  ctx.font = `700 46px ${font}`;
  ctx.fillText(opts.site.replace(/^https?:\/\//, ""), W / 2, 1800);

  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/** Shares the story image as a file, or downloads it where file sharing isn't supported. */
export async function shareStoryImage(blob: Blob, text: string) {
  const file = new File([blob], "grout-bhar-denge.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      track("share_click", { method: "story" });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "grout-bhar-denge.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  track("share_click", { method: "story_download" });
}
