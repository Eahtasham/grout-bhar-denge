// Drawing helpers. Expensive textures (backdrop, tile floor, baked grout) are
// pre-rendered once into offscreen canvases so each frame stays cheap on low-end phones.
import { BOARD_H, BOARD_W, COLS, ROWS, TILE } from "./config";
import { createRng } from "./rng";

export const C = {
  tile: "#F4F1EA",
  blue: "#2E7DAF",
  grout: "#8A8D91",
  groutWet: "#8E9195",
  groutDry: "#A6A9AD",
  groutDark: "#6B6E72",
  groutShine: "#C9CCD0",
  crack: "#2B211C",
  crackDeep: "#140D09",
  ceramic: "#D9CFBF",
  turmeric: "#F2B705",
  water: "#3FA9F5",
  waterRim: "#1E6EA8",
  red: "#E4572E",
  ink: "#1E1E1E",
  paper: "#FFFDF4",
  white: "#FFFFFF",
  backdrop: "#1A1B1D",
};

export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dark concrete site backdrop behind the floor, rendered once per resize. */
export function buildBackdrop(w: number, h: number, dpr: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = C.backdrop;
  ctx.fillRect(0, 0, w, h);
  const rng = createRng(77);
  const n = Math.round((w * h) / 90);
  for (let i = 0; i < n; i++) {
    const light = rng.next() < 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${0.02 + rng.next() * 0.04})` : `rgba(0,0,0,${0.15 + rng.next() * 0.2})`;
    const s = 0.6 + rng.next() * 1.6;
    ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
  }
  // Faint wall-tile joints so it reads as a bathroom under construction.
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h * 0.45, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(255,240,200,0.06)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  return cv;
}

const TILE_TONES = ["#F4F1EA", "#F1EDE4", "#F6F3EC", "#EFEBE1", "#F3EFE6"];

function glossAndBevel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const g = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.3, "rgba(255,255,255,0.22)");
  g.addColorStop(0.42, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(x, y, TILE, 2);
  ctx.fillRect(x, y, 2, TILE);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(x, y + TILE - 2.5, TILE, 2.5);
  ctx.fillRect(x + TILE - 2.5, y, 2.5, TILE);
}

/** Ceramic tile floor in board units: tone variation, speckle, gloss, bevels, stains, recessed joints. */
export function buildFloor(scale: number, dpr: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(BOARD_W * scale * dpr);
  cv.height = Math.ceil(BOARD_H * scale * dpr);
  const ctx = cv.getContext("2d")!;
  ctx.scale(scale * dpr, scale * dpr);
  const rng = createRng(seed ^ 0x5bd1e995);

  const blue = new Set<number>();
  while (blue.size < 7) blue.add(rng.int(0, COLS * ROWS));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = r * TILE;
      const i = r * COLS + c;
      if (blue.has(i)) {
        drawBlueTile(ctx, x, y);
      } else {
        ctx.fillStyle = TILE_TONES[rng.int(0, TILE_TONES.length)];
        ctx.fillRect(x, y, TILE, TILE);
        for (let k = 0; k < 30; k++) {
          ctx.fillStyle = `rgba(110,98,80,${0.08 + rng.next() * 0.18})`;
          const s = 0.8 + rng.next() * 1.4;
          ctx.fillRect(x + rng.next() * TILE, y + rng.next() * TILE, s, s);
        }
      }
      glossAndBevel(ctx, x, y);
    }
  }

  // Old stains from years of use.
  for (let k = 0; k < 5; k++) {
    const sx = rng.range(0, BOARD_W);
    const sy = rng.range(0, BOARD_H);
    const sr = rng.range(40, 110);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    g.addColorStop(0, "rgba(130,100,60,0.09)");
    g.addColorStop(1, "rgba(130,100,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }

  // Recessed grout joints.
  const joints = (style: string, width: number, offset = 0) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(c * TILE + offset, 0);
      ctx.lineTo(c * TILE + offset, BOARD_H);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(0, r * TILE + offset);
      ctx.lineTo(BOARD_W, r * TILE + offset);
    }
    ctx.stroke();
  };
  joints("#6F7276", 5);
  joints("#8E9195", 3);
  joints("rgba(255,255,255,0.35)", 0.8, 0.9);

  // Inner shadow around the floor edge.
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, BOARD_W, BOARD_H);
  return cv;
}

function drawBlueTile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const m = TILE / 2;
  ctx.fillStyle = C.blue;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.tile;
  ctx.beginPath();
  ctx.moveTo(x + m, y + 16);
  ctx.lineTo(x + TILE - 16, y + m);
  ctx.lineTo(x + m, y + TILE - 16);
  ctx.lineTo(x + 16, y + m);
  ctx.closePath();
  ctx.fill();
  for (const [qx, qy, a0] of [
    [x, y, 0],
    [x + TILE, y, Math.PI / 2],
    [x + TILE, y + TILE, Math.PI],
    [x, y + TILE, (3 * Math.PI) / 2],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(qx, qy);
    ctx.arc(qx, qy, 17, a0, a0 + Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  // Petals.
  ctx.fillStyle = C.blue;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.ellipse(x + m + Math.cos(a) * 12, y + m + Math.sin(a) * 12, 9, 4.5, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.turmeric;
  ctx.beginPath();
  ctx.arc(x + m, y + m, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** Masonry trowel, drawn at (x, y) = blade tip area. Size ~ blade length in px. */
export function drawTrowel(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.moveTo(size * 0.6 + 3, 4);
  ctx.lineTo(-size * 0.35 + 3, -size * 0.3 + 4);
  ctx.lineTo(-size * 0.35 + 3, size * 0.3 + 4);
  ctx.closePath();
  ctx.fill();
  // Blade.
  ctx.beginPath();
  ctx.moveTo(size * 0.6, 0);
  ctx.lineTo(-size * 0.35, -size * 0.3);
  ctx.lineTo(-size * 0.35, size * 0.3);
  ctx.closePath();
  ctx.fillStyle = "#B9BDC2";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(size * 0.45, -size * 0.03);
  ctx.lineTo(-size * 0.25, -size * 0.22);
  ctx.stroke();
  // Paste on the blade.
  ctx.fillStyle = C.groutWet;
  ctx.beginPath();
  ctx.ellipse(size * 0.05, size * 0.08, size * 0.18, size * 0.1, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Shank + wooden handle.
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, 0);
  ctx.lineTo(-size * 0.42, -size * 0.32);
  ctx.lineTo(-size * 0.62, -size * 0.32);
  ctx.stroke();
  roundRect(ctx, -size * 1.18, -size * 0.43, size * 0.6, size * 0.22, size * 0.1);
  ctx.fillStyle = "#A8692F";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-size * 1.1, -size * 0.39, size * 0.42, size * 0.05);
  ctx.restore();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 2): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] += "…";
    return kept;
  }
  return lines;
}

/** Torn-paper label tag for problem cracks. (x, y) is the tag centre in screen px. */
export function drawTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  font: string,
  angle: number,
  bounds: { w: number; h: number },
  seed: number,
) {
  ctx.save();
  ctx.font = font;
  const lines = wrapText(ctx, text, 132);
  const lh = 15;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const h = lines.length * lh + 10;
  const cx = Math.min(bounds.w - w / 2 - 4, Math.max(w / 2 + 4, x));
  const cy = Math.min(bounds.h - h / 2 - 4, Math.max(h / 2 + 4, y));
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2 - 3);
  const teeth = Math.max(4, Math.round(w / 9));
  for (let i = teeth; i >= 0; i--) {
    const tx = -w / 2 + (w * i) / teeth;
    ctx.lineTo(tx, h / 2 + (i % 2 === 0 ? 2 : -2) + hash(seed + i) * 2);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.save();
  ctx.translate(2.5, 3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();

  // Masking tape.
  ctx.fillStyle = "rgba(242,215,140,0.9)";
  ctx.fillRect(-13, -h / 2 - 5, 26, 9);

  ctx.fillStyle = C.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, 0, -((lines.length - 1) * lh) / 2 + i * lh + 1));
  ctx.restore();
}
