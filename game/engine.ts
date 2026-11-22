// Game loop, input and state. Browser-only. All gameplay rules that affect the score
// live in cracks.ts / scoring.ts so the server can replay them.
import { getAudio, vibrate } from "./audio";
import {
  BOARD_H,
  BOARD_W,
  COMBO_WINDOW_MS,
  COUNTDOWN_MS,
  FILL_THRESHOLD,
  METER_MAX,
  ROUND_MS,
  RUSH_HOUR_MS,
  TICK_MS,
  TRACE_TOLERANCE_PX,
  type RankName,
} from "./config";
import { PROBLEMS, formatScore } from "./content";
import { generateSchedule, type CrackSpec } from "./cracks";
import { C, buildBackdrop, buildFloor, drawTag, drawTrowel, hash, roundRect } from "./render";
import {
  meterStep,
  newComboState,
  rankFor,
  roundAccuracy,
  scoreFill,
  simulateRound,
  type Fill,
  type RoundResult,
} from "./scoring";

export interface FillEvent {
  spec: CrackSpec;
  points: number;
  combo: number;
  score: number;
}

export interface EndEvent {
  result: RoundResult;
  fills: Fill[];
}

export interface EngineCallbacks {
  onStart?(): void;
  onFill?(e: FillEvent): void;
  onLeakWarning?(): void;
  onCombo5?(): void;
  onRankUp?(rank: RankName): void;
  onRushHour?(): void;
  onEnd(e: EndEvent): void;
}

interface Pt {
  x: number;
  y: number;
}

interface LiveCrack {
  spec: CrackSpec;
  samples: Pt[];
  /** Crack outline (board units): left edge and right edge, one point per sample. */
  left: Pt[];
  right: Pt[];
  chips: Pt[][];
  twigs: Pt[][];
  blob: number[];
  covered: Uint8Array;
  minDist: Float32Array;
  coveredCount: number;
  state: "open" | "sealed" | "gone";
  bornAt: number;
  sealedAt: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  tagAngle: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  born: number;
  color: string;
  size: number;
}

const HUD_H = 84;
export const BOTTOM_H = 104;
const SEAL_ANIM_MS = 650;
/** Only the most recent filled cracks stay on the floor; older ones fade away. */
const MAX_DRIED = 5;
const DRIED_FADE_MS = 450;
const MAX_PARTICLES = 110;
const SAMPLE_STEP = 6;
const CRACK_MAX_W = 9; // board units, widest point of a crack

function resample(points: [number, number][], step: number): Pt[] {
  const out: Pt[] = [{ x: points[0][0], y: points[0][1] }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= seg) {
      const k = d / seg;
      out.push({ x: ax + (bx - ax) * k, y: ay + (by - ay) * k });
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = points[points.length - 1];
  out.push({ x: last[0], y: last[1] });
  return out;
}

function distToSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let k = l2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  k = Math.max(0, Math.min(1, k));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private scale = 1;
  private bx = 0;
  private by = 0;
  private floor: HTMLCanvasElement | null = null;
  private backdrop: HTMLCanvasElement | null = null;
  private floorSeed = 1;

  private phase: "idle" | "countdown" | "playing" | "ended" = "idle";
  private seed: number | null = null;
  private schedule: CrackSpec[] = [];
  private live: LiveCrack[] = [];
  private dried: { c: LiveCrack; fadeAt: number | null }[] = [];
  private nextSpawn = 0;
  private fills: Fill[] = [];
  private fillAt: (number | undefined)[] = [];
  private combo = newComboState();
  private displayCombo = 0;
  private comboPopAt = 0;
  private score = 0;
  private meter = 0;
  private nextTick = TICK_MS;
  private rank: RankName = "Naya Helper";

  private countdownStart = 0;
  private lastCountdownBeat = -1;
  private playStart = 0;
  private pausedTotal = 0;
  private pauseStart: number | null = null;
  private lastFrame = 0;
  private leakArmed = true;
  private rushOn = false;
  private rushBannerUntil = 0;
  private goBannerUntil = 0;
  private shakeUntil = 0;
  private shakeMag = 0;

  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private pointerId: number | null = null;
  private lastPt: Pt | null = null;
  private finger: Pt | null = null; // screen px
  private trowelAngle = -0.5;

  private raf = 0;
  private ro: ResizeObserver | null = null;
  private font: string;
  private audio = getAudio();

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: EngineCallbacks,
    font: string,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.font = font;
  }

  mount() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(c);
    this.resize();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ro?.disconnect();
    this.audio.stopAll();
  }

  /** Starts the 3-2-1 countdown. The round begins once the countdown ends and a seed is set. */
  begin() {
    this.phase = "countdown";
    this.seed = null;
    this.schedule = [];
    this.live = [];
    this.dried = [];
    this.nextSpawn = 0;
    this.fills = [];
    this.fillAt = [];
    this.combo = newComboState();
    this.displayCombo = 0;
    this.score = 0;
    this.meter = 0;
    this.nextTick = TICK_MS;
    this.rank = "Naya Helper";
    this.pausedTotal = 0;
    this.pauseStart = null;
    this.leakArmed = true;
    this.rushOn = false;
    this.rushBannerUntil = 0;
    this.particles = [];
    this.floaters = [];
    this.pointerId = null;
    this.lastPt = null;
    this.finger = null;
    this.countdownStart = performance.now();
    this.lastCountdownBeat = -1;
    this.floor = null;
    this.audio.stopAll();
  }

  setSeed(seed: number) {
    this.seed = seed;
    this.schedule = generateSchedule(seed, PROBLEMS.length);
    this.floorSeed = seed;
    this.floor = null;
  }

  // ---------------------------------------------------------------- layout

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    const availH = this.h - HUD_H - BOTTOM_H;
    this.scale = Math.max(0.2, Math.min((this.w - 20) / BOARD_W, availH / BOARD_H));
    this.bx = (this.w - BOARD_W * this.scale) / 2;
    this.by = HUD_H + (availH - BOARD_H * this.scale) / 2;
    this.floor = null;
    this.backdrop = null;
  }

  private ensureTextures() {
    if (!this.backdrop) this.backdrop = buildBackdrop(this.w, this.h, this.dpr);
    if (this.floor) return;
    this.floor = buildFloor(this.scale, this.dpr, this.floorSeed);
  }

  private toBoard(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.bx) / this.scale, y: (e.clientY - r.top - this.by) / this.scale };
  }

  private sx(x: number) {
    return this.bx + x * this.scale;
  }

  private sy(y: number) {
    return this.by + y * this.scale;
  }

  private elapsed(now: number) {
    return now - this.playStart - this.pausedTotal;
  }

  // ---------------------------------------------------------------- input

  private onDown = (e: PointerEvent) => {
    this.audio.unlock();
    if (this.phase !== "playing" || this.pauseStart !== null) return;
    if (this.pointerId !== null || !e.isPrimary) return;
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = this.toBoard(e);
    this.lastPt = p;
    this.finger = { x: this.sx(p.x), y: this.sy(p.y) };
    this.trace(p, p);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId || !this.lastPt || this.phase !== "playing") return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e]) {
      const p = this.toBoard(ev);
      const dx = p.x - this.lastPt.x;
      const dy = p.y - this.lastPt.y;
      if (dx * dx + dy * dy > 4) {
        // Trowel leans with the stroke, smoothed so it doesn't jitter.
        const target = Math.atan2(dy, dx) * 0.35 - 0.5;
        this.trowelAngle += (target - this.trowelAngle) * 0.25;
      }
      this.trace(this.lastPt, p);
      this.lastPt = p;
      this.finger = { x: this.sx(p.x), y: this.sy(p.y) };
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.lastPt = null;
    this.finger = null;
  };

  private onVisibility = () => {
    const now = performance.now();
    if (document.hidden) {
      if (this.phase === "playing" && this.pauseStart === null) this.pauseStart = now;
      this.audio.suspend();
    } else {
      if (this.pauseStart !== null) {
        this.pausedTotal += now - this.pauseStart;
        this.pauseStart = null;
      }
      this.audio.resume();
    }
  };

  /** Lays grout on every open crack sample within tolerance of segment a→b. */
  private trace(a: Pt, b: Pt) {
    const tol = TRACE_TOLERANCE_PX / this.scale;
    const x0 = Math.min(a.x, b.x) - tol;
    const x1 = Math.max(a.x, b.x) + tol;
    const y0 = Math.min(a.y, b.y) - tol;
    const y1 = Math.max(a.y, b.y) + tol;
    let laid = 0;
    for (const c of this.live) {
      if (c.state !== "open") continue;
      if (c.box.x1 < x0 || c.box.x0 > x1 || c.box.y1 < y0 || c.box.y0 > y1) continue;
      for (let i = 0; i < c.samples.length; i++) {
        const d = distToSeg(c.samples[i], a, b);
        if (d > tol) continue;
        if (!c.covered[i]) {
          c.covered[i] = 1;
          c.coveredCount++;
          laid++;
        }
        if (d < c.minDist[i]) c.minDist[i] = d;
      }
      if (c.coveredCount >= FILL_THRESHOLD * c.samples.length) this.seal(c, tol);
    }
    if (laid) {
      this.audio.scrape(Math.min(1, laid / 4));
      if (Math.random() < 0.3) this.crumb(b);
    }
  }

  private seal(c: LiveCrack, tol: number) {
    const now = performance.now();
    const t = Math.max(c.spec.spawnAt, Math.round(this.elapsed(now)));
    if (c.spec.expiresAt !== undefined && t >= c.spec.expiresAt) return;

    let sum = 0;
    let n = 0;
    for (let i = 0; i < c.samples.length; i++) {
      if (c.covered[i]) {
        sum += c.minDist[i];
        n++;
      }
    }
    const avg = n ? sum / n : tol;
    const acc = roundAccuracy(1 - Math.max(0, avg - tol * 0.12) / (tol * 0.6));
    const fill: Fill = { c: c.spec.id, t, a: acc };
    this.fills.push(fill);
    this.fillAt[c.spec.id] = t;

    const prevCombo = this.displayCombo;
    const r = scoreFill(this.combo, c.spec, fill);
    this.score += r.points;
    this.displayCombo = r.combo;
    this.comboPopAt = now;

    c.state = "sealed";
    c.sealedAt = now;
    c.covered.fill(1);

    const mid = c.samples[Math.floor(c.samples.length / 2)];
    const golden = c.spec.type === "golden";
    this.floaters.push({
      text: `+${r.points}`,
      x: this.sx(mid.x),
      y: this.sy(mid.y) - 10,
      born: now,
      color: golden ? C.turmeric : C.white,
      size: golden ? 30 : 24,
    });
    for (let i = 0; i < c.samples.length; i += 3) this.dust(c.samples[i], 2);
    this.shake(golden ? 5 : 2 + Math.min(3, r.combo * 0.5), golden ? 220 : 120);

    this.audio.plop();
    if (r.combo >= 2) this.audio.chime(r.combo);
    if (golden) this.audio.sparkle();
    vibrate(golden ? 40 : 25);

    const newRank = rankFor(this.score);
    if (newRank !== this.rank) {
      this.rank = newRank;
      this.audio.dhol();
      this.cb.onRankUp?.(newRank);
    }
    if (r.combo === 5 && prevCombo < 5) this.cb.onCombo5?.();
    this.cb.onFill?.({ spec: c.spec, points: r.points, combo: r.combo, score: this.score });
  }

  private shake(mag: number, ms: number) {
    const now = performance.now();
    if (now > this.shakeUntil || mag > this.shakeMag) this.shakeMag = mag;
    this.shakeUntil = Math.max(this.shakeUntil, now + ms);
  }

  // ---------------------------------------------------------------- particles

  private crumb(p: Pt) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({
      x: this.sx(p.x),
      y: this.sy(p.y),
      vx: (Math.random() - 0.5) * 60,
      vy: -20 - Math.random() * 40,
      life: 0,
      max: 350,
      size: 2 + Math.random() * 2,
      color: C.groutDark,
    });
  }

  private dust(p: Pt, count: number, color?: string) {
    for (let k = 0; k < count && this.particles.length < MAX_PARTICLES; k++) {
      this.particles.push({
        x: this.sx(p.x),
        y: this.sy(p.y),
        vx: (Math.random() - 0.5) * 140,
        vy: -40 - Math.random() * 110,
        life: 0,
        max: 500 + Math.random() * 300,
        size: 2 + Math.random() * 3.5,
        color: color ?? (Math.random() < 0.5 ? C.groutShine : C.grout),
      });
    }
  }

  // ---------------------------------------------------------------- loop

  private spawn(spec: CrackSpec, now: number) {
    const samples = resample(spec.points, SAMPLE_STEP);
    const n = samples.length;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const left: Pt[] = [];
    const right: Pt[] = [];
    const maxW = spec.type === "zigzag" ? CRACK_MAX_W * 1.1 : CRACK_MAX_W;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      x0 = Math.min(x0, s.x);
      y0 = Math.min(y0, s.y);
      x1 = Math.max(x1, s.x);
      y1 = Math.max(y1, s.y);
      const a = samples[Math.max(0, i - 1)];
      const b = samples[Math.min(n - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const t = n > 1 ? i / (n - 1) : 0.5;
      const taper = Math.pow(Math.sin(Math.PI * (0.04 + t * 0.92)), 0.55);
      const half = (maxW / 2) * taper * (0.7 + Math.random() * 0.55);
      const skew = (Math.random() - 0.5) * half * 0.5;
      left.push({ x: s.x + nx * (half + skew), y: s.y + ny * (half + skew) });
      right.push({ x: s.x - nx * (half - skew), y: s.y - ny * (half - skew) });
    }

    // Chipped tile edges: little triangles of exposed ceramic along the crack.
    const chips: Pt[][] = [];
    const chipCount = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < chipCount && n > 4; k++) {
      const i = 1 + Math.floor(Math.random() * (n - 2));
      const side = Math.random() < 0.5 ? left : right;
      const e = side[i];
      const s = samples[i];
      const ox = e.x - s.x;
      const oy = e.y - s.y;
      const ol = Math.hypot(ox, oy) || 1;
      const t = samples[Math.min(n - 1, i + 1)];
      const tx = (t.x - s.x) / (Math.hypot(t.x - s.x, t.y - s.y) || 1);
      const ty = (t.y - s.y) / (Math.hypot(t.x - s.x, t.y - s.y) || 1);
      const sz = 3 + Math.random() * 4;
      chips.push([
        { x: e.x - tx * sz, y: e.y - ty * sz },
        { x: e.x + (ox / ol) * sz * 0.9, y: e.y + (oy / ol) * sz * 0.9 },
        { x: e.x + tx * sz, y: e.y + ty * sz },
      ]);
    }

    const twigs: Pt[][] = [];
    const twigCount = spec.type === "golden" ? 0 : 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < twigCount; k++) {
      const s = samples[Math.floor(n * (0.2 + Math.random() * 0.6))];
      const ang = Math.random() * Math.PI * 2;
      const l1 = 7 + Math.random() * 9;
      const p1 = { x: s.x + Math.cos(ang) * l1, y: s.y + Math.sin(ang) * l1 };
      const a2 = ang + (Math.random() - 0.5) * 1.2;
      twigs.push([s, p1, { x: p1.x + Math.cos(a2) * l1 * 0.7, y: p1.y + Math.sin(a2) * l1 * 0.7 }]);
    }
    const blob = Array.from({ length: 12 }, () => 0.72 + Math.random() * 0.5);

    this.live.push({
      spec,
      samples,
      left,
      right,
      chips,
      twigs,
      blob,
      covered: new Uint8Array(n),
      minDist: new Float32Array(n).fill(Infinity),
      coveredCount: 0,
      state: "open",
      bornAt: now,
      sealedAt: 0,
      box: { x0, y0, x1, y1 },
      tagAngle: (hash(spec.id) - 0.5) * 0.18,
    });

    // Snap: ceramic chips fly off as the tile cracks.
    const s0 = samples[Math.floor(n / 2)];
    for (let k = 0; k < 5 && this.particles.length < MAX_PARTICLES; k++) {
      this.particles.push({
        x: this.sx(s0.x),
        y: this.sy(s0.y),
        vx: (Math.random() - 0.5) * 180,
        vy: -60 - Math.random() * 120,
        life: 0,
        max: 420,
        size: 2 + Math.random() * 2.5,
        color: Math.random() < 0.5 ? C.ceramic : "#FFFFFF",
      });
    }
    this.audio.crackSnap(spec.type === "golden");
    this.shake(1.5, 80);
  }

  private end() {
    if (this.phase !== "playing") return;
    this.phase = "ended";
    this.pointerId = null;
    this.lastPt = null;
    this.finger = null;
    const flooded = this.meter >= METER_MAX;
    const result = simulateRound(this.schedule, this.fills);
    this.score = result.score;
    // Show the result and save the score first; end-of-round sounds are extras
    // and must never be able to block that.
    this.cb.onEnd({ result, fills: result.validFills });
    try {
      this.audio.stopAll();
      if (flooded) this.audio.splash();
      this.audio.endSting(result.score >= 700 && !flooded);
    } catch (e) {
      console.warn("end-of-round audio failed", e);
    }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    const paused = this.pauseStart !== null;

    if (this.phase === "countdown") {
      const beat = Math.floor((now - this.countdownStart) / 1000);
      if (beat !== this.lastCountdownBeat && beat < 3) {
        this.lastCountdownBeat = beat;
        this.audio.countdownTick(false);
      }
      if (now - this.countdownStart >= COUNTDOWN_MS && this.seed !== null) {
        this.phase = "playing";
        this.playStart = now;
        this.pausedTotal = 0;
        this.goBannerUntil = now + 700;
        this.audio.countdownTick(true);
        this.audio.startRoundAudio();
        this.cb.onStart?.();
      }
    }

    if (this.phase === "playing" && !paused) {
      const el = this.elapsed(now);
      while (this.nextSpawn < this.schedule.length && this.schedule[this.nextSpawn].spawnAt <= el) {
        this.spawn(this.schedule[this.nextSpawn++], now);
      }
      for (const c of this.live) {
        if (c.state === "open" && c.spec.expiresAt !== undefined && el >= c.spec.expiresAt) {
          c.state = "gone";
          c.sealedAt = now;
          for (let i = 0; i < c.samples.length; i += 4) this.dust(c.samples[i], 1, C.turmeric);
        }
      }
      while (this.nextTick <= el && this.phase === "playing") {
        this.meter = meterStep(this.meter, this.schedule, this.fillAt, this.nextTick);
        if (this.meter >= METER_MAX) this.end();
        this.nextTick += TICK_MS;
      }
      if (this.phase === "playing" && el >= ROUND_MS) this.end();

      if (this.meter >= 60 && this.leakArmed) {
        this.leakArmed = false;
        this.cb.onLeakWarning?.();
      } else if (this.meter < 35) {
        this.leakArmed = true;
      }
      if (!this.rushOn && el >= RUSH_HOUR_MS && this.phase === "playing") {
        this.rushOn = true;
        this.rushBannerUntil = now + 1600;
        this.audio.rushHorn();
        this.cb.onRushHour?.();
      }
      if (el - this.combo.lastFillT > COMBO_WINDOW_MS) this.displayCombo = 0;
      if (this.phase === "playing") {
        this.audio.updateDrip(this.meter / METER_MAX, dt);
        this.audio.setMusicStage(el);
      }
    }

    const k = dt / 1000;
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy += 380 * k;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    this.floaters = this.floaters.filter((f) => now - f.born < 900);

    this.ensureTextures();
    const keep: LiveCrack[] = [];
    for (const c of this.live) {
      if (c.state === "sealed" && now - c.sealedAt > SEAL_ANIM_MS) {
        this.dried.push({ c, fadeAt: null });
      } else if (c.state === "gone" && now - c.sealedAt > 300) {
        /* drop */
      } else {
        keep.push(c);
      }
    }
    this.live = keep;

    // Keep the floor clean: past MAX_DRIED filled cracks, the oldest fades out.
    let solid = this.dried.filter((d) => d.fadeAt === null).length;
    for (const d of this.dried) {
      if (solid <= MAX_DRIED) break;
      if (d.fadeAt === null) {
        d.fadeAt = now;
        solid--;
      }
    }
    this.dried = this.dried.filter((d) => d.fadeAt === null || now - d.fadeAt < DRIED_FADE_MS);

    this.render(now);
  };

  // ---------------------------------------------------------------- drawing

  /** Dried grout on a filled crack (drawn in board units on top of the floor). */
  private drawDried(c: LiveCrack, alpha: number) {
    const f = this.ctx;
    f.save();
    f.globalAlpha = alpha;
    f.translate(this.bx, this.by);
    f.scale(this.scale, this.scale);
    const w = Math.max(7 / this.scale, 13);
    this.pathSamples(f, c.samples, c.samples.length, (p) => p.x, (p) => p.y);
    f.lineCap = "round";
    f.lineJoin = "round";
    f.strokeStyle = "rgba(150,153,157,0.22)";
    f.lineWidth = w + 9;
    f.stroke();
    f.strokeStyle = "#7A7D81";
    f.lineWidth = w + 2.5;
    f.stroke();
    f.strokeStyle = C.groutDry;
    f.lineWidth = w;
    f.stroke();
    f.strokeStyle = "rgba(255,255,255,0.3)";
    f.lineWidth = Math.max(1.2, w * 0.16);
    this.pathSamples(f, c.samples, c.samples.length, (p) => p.x - w * 0.12, (p) => p.y - w * 0.15);
    f.stroke();
    f.restore();
  }

  private pathSamples(
    ctx: CanvasRenderingContext2D,
    pts: Pt[],
    count: number,
    fx: (p: Pt) => number,
    fy: (p: Pt) => number,
  ) {
    ctx.beginPath();
    ctx.moveTo(fx(pts[0]), fy(pts[0]));
    for (let i = 1; i < count; i++) ctx.lineTo(fx(pts[i]), fy(pts[i]));
  }

  private render(now: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, this.w, this.h);
    else {
      ctx.fillStyle = C.backdrop;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    ctx.save();
    if (now < this.shakeUntil) {
      const m = this.shakeMag * ((this.shakeUntil - now) / 220 + 0.3);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    const bw = BOARD_W * this.scale;
    const bh = BOARD_H * this.scale;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    roundRect(ctx, this.bx - 2, this.by + 6, bw + 10, bh + 8, 8);
    ctx.fill();
    ctx.fillStyle = "#0E0E0F";
    roundRect(ctx, this.bx - 5, this.by - 5, bw + 10, bh + 10, 8);
    ctx.fill();
    if (this.floor) ctx.drawImage(this.floor, this.bx, this.by, bw, bh);

    const el = this.phase === "playing" ? this.elapsed(this.pauseStart ?? now) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.bx, this.by, bw, bh);
    ctx.clip();
    for (const d of this.dried) {
      const a = d.fadeAt === null ? 1 : 1 - (now - d.fadeAt) / DRIED_FADE_MS;
      if (a > 0) this.drawDried(d.c, a);
    }
    for (const c of this.live) if (c.state === "open" && c.spec.type !== "golden") this.drawPuddle(c, el);
    for (const c of this.live) this.drawCrack(c, now, el);
    ctx.restore();

    for (const c of this.live) {
      if (c.state !== "open" || c.spec.problem === undefined) continue;
      const mid = c.samples[Math.floor(c.samples.length / 2)];
      drawTag(
        ctx,
        this.sx(mid.x),
        this.sy(mid.y) - 30,
        PROBLEMS[c.spec.problem].problem,
        `700 13px ${this.font}`,
        c.tagAngle,
        { w: this.w, h: this.h - BOTTOM_H },
        c.spec.id,
      );
    }

    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    if (this.finger && this.phase === "playing") {
      drawTrowel(ctx, this.finger.x - 6, this.finger.y - 26, this.trowelAngle, 34);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const f of this.floaters) {
      const a = (now - f.born) / 900;
      ctx.globalAlpha = 1 - a * a;
      ctx.font = `800 ${f.size}px ${this.font}`;
      const y = f.y - a * 46;
      ctx.lineWidth = 5;
      ctx.strokeStyle = C.ink;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawHud(now, el);
    this.drawOverlays(now);
  }

  private drawPuddle(c: LiveCrack, el: number) {
    const ctx = this.ctx;
    const end = c.samples[c.samples.length - 1];
    const age = Math.max(0, Math.min(8, (el - c.spec.spawnAt) / 1000));
    const r = Math.max(4, (5 + age * 3.6) * this.scale);
    const x = this.sx(end.x);
    const y = this.sy(end.y);
    const n = c.blob.length;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 0.5) / n) * Math.PI * 2;
      const r0 = r * c.blob[i % n];
      const r1 = r * (c.blob[i % n] + c.blob[(i + 1) % n]) * 0.5;
      const px = x + Math.cos(a0) * r0 * 1.25;
      const py = y + Math.sin(a0) * r0 * 0.85;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.quadraticCurveTo(x + Math.cos(a1 - Math.PI / n) * r1 * 1.3, y + Math.sin(a1 - Math.PI / n) * r1 * 0.9, px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(63,169,245,0.5)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(30,110,168,0.85)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.45, y - r * 0.15, r * 0.3, r * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Ripple from the drip.
    const phase = ((el / 1000 + c.spec.id * 0.37) % 1.3) / 1.3;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - phase)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.2 + 0.8 * phase), r * (0.14 + 0.55 * phase), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private crackPath(c: LiveCrack, count: number, grow = 0) {
    const ctx = this.ctx;
    ctx.beginPath();
    const L = c.left;
    const R = c.right;
    ctx.moveTo(this.sx(L[0].x), this.sy(L[0].y));
    for (let i = 1; i < count; i++) ctx.lineTo(this.sx(L[i].x + (L[i].x - c.samples[i].x) * grow), this.sy(L[i].y + (L[i].y - c.samples[i].y) * grow));
    for (let i = count - 1; i >= 0; i--) ctx.lineTo(this.sx(R[i].x + (R[i].x - c.samples[i].x) * grow), this.sy(R[i].y + (R[i].y - c.samples[i].y) * grow));
    ctx.closePath();
  }

  private drawCrack(c: LiveCrack, now: number, el: number) {
    const ctx = this.ctx;
    const n = c.samples.length;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const X = (p: Pt) => this.sx(p.x);
    const Y = (p: Pt) => this.sy(p.y);

    if (c.state === "gone") ctx.globalAlpha = Math.max(0, 1 - (now - c.sealedAt) / 300);

    if (c.state === "open" || c.state === "gone") {
      const grow = Math.min(1, (now - c.bornAt) / 180);
      const count = Math.max(2, Math.ceil(grow * n));
      const golden = c.spec.type === "golden";

      // Exposed ceramic body around the break, then chips, then the dark gap.
      this.crackPath(c, count, 0.55);
      ctx.fillStyle = golden ? C.ink : C.ceramic;
      ctx.fill();
      if (grow >= 1 && !golden) {
        ctx.fillStyle = C.ceramic;
        for (const chip of c.chips) {
          ctx.beginPath();
          ctx.moveTo(X(chip[0]), Y(chip[0]));
          ctx.lineTo(X(chip[1]), Y(chip[1]));
          ctx.lineTo(X(chip[2]), Y(chip[2]));
          ctx.closePath();
          ctx.fill();
        }
      }
      this.crackPath(c, count);
      ctx.fillStyle = golden ? C.turmeric : C.crack;
      ctx.fill();
      if (!golden) {
        this.pathSamples(ctx, c.samples, count, X, Y);
        ctx.strokeStyle = C.crackDeep;
        ctx.lineWidth = Math.max(1, 1.6 * this.scale);
        ctx.stroke();
        // Water seeping into the gap as the crack ages.
        const age = (el - c.spec.spawnAt) / 1000;
        if (c.state === "open" && age > 0.6) {
          ctx.globalAlpha = Math.min(0.85, (age - 0.6) / 3);
          ctx.strokeStyle = C.water;
          ctx.lineWidth = Math.max(1.2, CRACK_MAX_W * 0.32 * this.scale);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      if (grow >= 1) {
        ctx.strokeStyle = golden ? C.ink : C.crack;
        for (const t of c.twigs) {
          ctx.lineWidth = Math.max(1, 2.6 * this.scale);
          ctx.beginPath();
          ctx.moveTo(X(t[0]), Y(t[0]));
          ctx.lineTo(X(t[1]), Y(t[1]));
          ctx.stroke();
          ctx.lineWidth = Math.max(0.7, 1.4 * this.scale);
          ctx.beginPath();
          ctx.moveTo(X(t[1]), Y(t[1]));
          ctx.lineTo(X(t[2]), Y(t[2]));
          ctx.stroke();
        }
      }
      if (golden && c.state === "open") this.drawGoldenFx(c, now, el);
    }

    if (c.coveredCount > 0 || c.state === "sealed") {
      const p = c.state === "sealed" ? Math.min(1, (now - c.sealedAt) / SEAL_ANIM_MS) : -1;
      this.drawGrout(c, p);
    }
    ctx.globalAlpha = 1;
  }

  private drawGoldenFx(c: LiveCrack, now: number, el: number) {
    const ctx = this.ctx;
    for (let k = 0; k < 3; k++) {
      const s = c.samples[Math.floor(((k + 0.5) / 3) * (c.samples.length - 1))];
      const blink = 0.5 + 0.5 * Math.sin(now / 90 + k * 2);
      const r = (5 + 4 * blink) * Math.max(0.7, this.scale);
      const x = this.sx(s.x) + 8;
      const y = this.sy(s.y) - 8;
      ctx.fillStyle = C.white;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.28, y - r * 0.28);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.28, y + r * 0.28);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.28, y + r * 0.28);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x - r * 0.28, y - r * 0.28);
      ctx.closePath();
      ctx.fill();
    }
    const left = Math.max(0, (c.spec.expiresAt! - el) / (c.spec.expiresAt! - c.spec.spawnAt));
    const s0 = c.samples[0];
    const x = this.sx(s0.x);
    const y = this.sy(s0.y);
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = C.turmeric;
    ctx.fill();
  }

  /**
   * p = -1 while laying (wet, lumpy paste), 0..1 during the seal: a trowel sweeps along
   * the crack and leaves smooth, shiny grout behind it.
   */
  private drawGrout(c: LiveCrack, p: number) {
    const ctx = this.ctx;
    const w = Math.max(7, 13 * this.scale);
    const n = c.samples.length;
    const smoothUpTo = p < 0 ? 0 : Math.floor(p * n);
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (let i = 0; i < n; i++) {
      if (c.covered[i]) run.push(c.samples[i]);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const X = (q: Pt) => this.sx(q.x);
    const Y = (q: Pt) => this.sy(q.y);
    for (const r of runs) {
      this.pathSamples(ctx, r, r.length, X, Y);
      if (r.length === 1) ctx.lineTo(X(r[0]) + 0.1, Y(r[0]));
      ctx.strokeStyle = "rgba(138,141,145,0.3)";
      ctx.lineWidth = w + 9;
      ctx.stroke();
      ctx.strokeStyle = C.groutDark;
      ctx.lineWidth = w + 3;
      ctx.stroke();
      ctx.strokeStyle = C.groutWet;
      ctx.lineWidth = w;
      ctx.stroke();
    }

    // Lumpy wet paste (only where the trowel hasn't smoothed it yet).
    for (let i = smoothUpTo; i < n; i += 2) {
      if (!c.covered[i]) continue;
      const s = c.samples[i];
      const rr = w * 0.5 * (0.9 + hash(c.spec.id * 97 + i) * 0.5);
      const ox = (hash(i + 3) - 0.5) * 3.5;
      const oy = (hash(i + 7) - 0.5) * 3.5;
      ctx.fillStyle = C.groutWet;
      ctx.beginPath();
      ctx.arc(X(s) + ox, Y(s) + oy, rr, 0, Math.PI * 2);
      ctx.fill();
      if (i % 6 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(X(s) + ox - rr * 0.3, Y(s) + oy - rr * 0.35, Math.max(1, rr * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (p >= 0) {
      if (smoothUpTo > 1) {
        this.pathSamples(ctx, c.samples, smoothUpTo, (q) => X(q) - w * 0.12, (q) => Y(q) - w * 0.16);
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = Math.max(1.5, w * 0.2);
        ctx.stroke();
      }
      if (p < 1) {
        const i = Math.min(n - 1, smoothUpTo);
        const a = c.samples[Math.max(0, i - 1)];
        const b = c.samples[Math.min(n - 1, i + 1)];
        drawTrowel(ctx, X(c.samples[i]), Y(c.samples[i]) - 4, Math.atan2(b.y - a.y, b.x - a.x), 30);
      }
    }
  }

  private drawChip(x: number, y: number, w: number, h: number, fill: string) {
    const ctx = this.ctx;
    ctx.fillStyle = C.ink;
    roundRect(ctx, x + 3, y + 3, w, h, 10);
    ctx.fill();
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }

  private drawHud(now: number, el: number) {
    const ctx = this.ctx;
    const rush = this.rushOn && this.phase === "playing";
    const remaining =
      this.phase === "playing"
        ? Math.max(0, Math.ceil((ROUND_MS - el) / 1000))
        : this.phase === "ended"
          ? 0
          : 60;
    const pad = 12;

    this.drawChip(pad, 10, 84, 40, rush ? C.red : C.white);
    ctx.fillStyle = rush ? C.white : C.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 24px ${this.font}`;
    ctx.fillText(`0:${String(remaining).padStart(2, "0")}`, pad + 42, 32);

    const scoreText = formatScore(this.score);
    ctx.font = `800 24px ${this.font}`;
    const sw = Math.max(96, ctx.measureText(scoreText).width + 28);
    this.drawChip(this.w - pad - sw, 10, sw, 40, C.turmeric);
    ctx.fillStyle = C.ink;
    ctx.fillText(scoreText, this.w - pad - sw / 2, 32);

    if (this.displayCombo >= 2) {
      const pop = Math.max(0, 1 - (now - this.comboPopAt) / 220);
      const r = 22 * (1 + pop * 0.35);
      const cx = this.w / 2;
      ctx.beginPath();
      ctx.arc(cx + 3, 31 + 3, r, 0, Math.PI * 2);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, 31, r, 0, Math.PI * 2);
      ctx.fillStyle = this.displayCombo >= 5 ? C.red : C.white;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.fillStyle = this.displayCombo >= 5 ? C.white : C.ink;
      ctx.font = `800 ${Math.round(20 * (1 + pop * 0.3))}px ${this.font}`;
      ctx.fillText(`x${this.displayCombo}`, cx, 32);
    }

    // Seepage meter.
    const my = 60;
    const mh = 16;
    const mw = this.w - pad * 2;
    const frac = this.meter / METER_MAX;
    ctx.fillStyle = "#2A2C2F";
    roundRect(ctx, pad, my, mw, mh, 8);
    ctx.fill();
    if (frac > 0) {
      const danger = frac > 0.75;
      ctx.globalAlpha = danger ? 0.75 + 0.25 * Math.sin(now / 80) : 1;
      ctx.fillStyle = danger ? C.red : C.water;
      ctx.save();
      roundRect(ctx, pad, my, mw, mh, 8);
      ctx.clip();
      ctx.fillRect(pad, my, mw * frac, mh);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(pad, my + 2, mw * frac, 3);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    roundRect(ctx, pad, my, mw, mh, 8);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0E0E0F";
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.font = `800 11px ${this.font}`;
    ctx.textAlign = "left";
    ctx.fillText("SEEPAGE", pad + 8, my + mh / 2 + 1);
  }

  private bigText(text: string, size: number, y: number, fill: string, scale = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.w / 2, y);
    ctx.scale(scale, scale);
    ctx.font = `800 ${size}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(6, size / 7);
    ctx.strokeStyle = C.ink;
    ctx.strokeText(text, 3, 3);
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private drawOverlays(now: number) {
    const ctx = this.ctx;
    const cy = this.by + (BOARD_H * this.scale) / 2;
    if (this.phase === "countdown") {
      ctx.fillStyle = "rgba(14,14,15,0.55)";
      ctx.fillRect(this.bx, this.by, BOARD_W * this.scale, BOARD_H * this.scale);
      const t = now - this.countdownStart;
      if (t < COUNTDOWN_MS) {
        const n = 3 - Math.floor(t / 1000);
        const local = (t % 1000) / 1000;
        this.bigText(String(n), 120, cy, C.turmeric, 1.4 - 0.4 * Math.min(1, local * 3));
      } else {
        this.bigText("Ruko…", 48, cy, C.white);
      }
    } else if (this.phase === "playing") {
      if (now < this.goBannerUntil) {
        const k = 1 - (this.goBannerUntil - now) / 700;
        this.bigText("Bharo!", 72, cy, C.turmeric, 0.8 + k * 0.4);
      }
      if (now < this.rushBannerUntil) {
        const wob = 1 + 0.06 * Math.sin(now / 60);
        this.bigText("RUSH HOUR!", 52, cy, C.red, wob);
      }
      if (this.pauseStart !== null) this.bigText("Paused", 48, cy, C.white);
    }
  }
}
