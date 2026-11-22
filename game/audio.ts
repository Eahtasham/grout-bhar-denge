// Sound design, all synthesized with Web Audio (original, zero download):
// trowel scrape, tile crack, grout plop, site ambience and a layered desi beat that
// builds through the round. Voice lines are optional files at /sounds/voice/<id>.mp3.

const MUTE_KEY = "gbd:muted";

// Raag Bhairav on D: D Eb F# G A Bb C# D
const SCALE = [0, 1, 4, 5, 7, 8, 11, 12, 13, 16];
const ROOT = 293.66;

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private scrapeGain: GainNode | null = null;
  private squelchGain: GainNode | null = null;
  private voices = new Map<string, AudioBuffer | null>();
  private dripClock = 0;

  private seqTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private tempo = 96;
  private layers = 1;
  private melodyIdx = 3;
  private drone: { stop: () => void } | null = null;
  private ambience: { stop: () => void } | null = null;
  private clankTimer: ReturnType<typeof setTimeout> | null = null;

  muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = localStorage.getItem(MUTE_KEY) === "1";
      } catch {
        /* storage blocked */
      }
    }
  }

  /** Must be called from a user gesture (mobile browsers block audio until then). */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.42;
      this.musicBus.connect(this.master);
      this.noise = this.makeNoise(false);
      this.brown = this.makeNoise(true);
      this.startScrapeLoop();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  suspend() {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private makeNoise(brown: boolean) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = white;
    }
    return buf;
  }

  private startScrapeLoop() {
    const ctx = this.ctx!;
    // Steel on paste: bright, gritty band.
    const a = ctx.createBufferSource();
    a.buffer = this.noise;
    a.loop = true;
    const bpA = ctx.createBiquadFilter();
    bpA.type = "bandpass";
    bpA.frequency.value = 1900;
    bpA.Q.value = 0.7;
    const lfoA = ctx.createOscillator();
    lfoA.frequency.value = 23;
    const lfoAG = ctx.createGain();
    lfoAG.gain.value = 500;
    lfoA.connect(lfoAG).connect(bpA.frequency);
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    a.connect(bpA).connect(this.scrapeGain).connect(this.sfx!);
    // Wet squelch underneath.
    const b = ctx.createBufferSource();
    b.buffer = this.noise;
    b.loop = true;
    const bpB = ctx.createBiquadFilter();
    bpB.type = "bandpass";
    bpB.frequency.value = 420;
    bpB.Q.value = 2.2;
    const lfoB = ctx.createOscillator();
    lfoB.frequency.value = 7;
    const lfoBG = ctx.createGain();
    lfoBG.gain.value = 180;
    lfoB.connect(lfoBG).connect(bpB.frequency);
    this.squelchGain = ctx.createGain();
    this.squelchGain.gain.value = 0;
    b.connect(bpB).connect(this.squelchGain).connect(this.sfx!);
    a.start();
    b.start();
    lfoA.start();
    lfoB.start();
  }

  /** Call while grout is being laid (intensity 0..1); fades out on its own. */
  scrape(intensity: number) {
    if (!this.ctx || !this.scrapeGain || !this.squelchGain) return;
    const now = this.ctx.currentTime;
    for (const [g, vol] of [
      [this.scrapeGain.gain, 0.07 + 0.1 * intensity],
      [this.squelchGain.gain, 0.16 + 0.12 * intensity],
    ] as const) {
      g.cancelScheduledValues(now);
      g.setTargetAtTime(vol, now, 0.012);
      g.setTargetAtTime(0, now + 0.1, 0.05);
    }
  }

  private tone(
    freq: number,
    endFreq: number,
    dur: number,
    vol: number,
    type: OscillatorType = "sine",
    when = 0,
    bus: AudioNode | null = this.sfx,
  ) {
    if (!this.ctx || !bus) return;
    // A bad value must never throw: the Web Audio API rejects NaN/Infinity, and an
    // exception here would interrupt whatever game code called it.
    if (![freq, endFreq, dur, vol, when].every(Number.isFinite) || freq <= 0 || dur <= 0) return;
    const t = when || this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private burst(
    dur: number,
    vol: number,
    freq: number,
    type: BiquadFilterType = "lowpass",
    when = 0,
    bus: AudioNode | null = this.sfx,
    q = 1,
  ) {
    if (!this.ctx || !bus || !this.noise) return;
    if (![dur, vol, freq, when, q].every(Number.isFinite) || dur <= 0) return;
    const t = when || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
  }

  // ------------------------------------------------------------- effects

  /** Tile cracking: sharp snap + ceramic ring. */
  crackSnap(golden = false) {
    this.burst(0.04, 0.5, 3200, "highpass");
    this.tone(2600, 700, 0.03, 0.2, "square");
    const base = golden ? 2400 : 1700 + Math.random() * 500;
    this.tone(base, base * 0.98, 0.18, 0.06, "sine");
    this.tone(base * 1.51, base * 1.5, 0.12, 0.035, "sine");
    if (golden) this.sparkle();
  }

  /** Grout pressed in and sealed: wet plop + short trowel swipe. */
  plop() {
    this.tone(170, 62, 0.18, 0.55);
    this.burst(0.09, 0.35, 650, "lowpass");
    this.burst(0.12, 0.12, 2600, "bandpass", (this.ctx?.currentTime ?? 0) + 0.06, this.sfx, 0.8);
  }

  /** Rising chime per combo step (1..5). */
  chime(step: number) {
    const f = ROOT * Math.pow(2, SCALE[Math.min(SCALE.length - 1, step + 2)] / 12) * 2;
    const t = (this.ctx?.currentTime ?? 0) + 0.05;
    this.tone(f, f, 0.4, 0.14, "triangle", t);
    this.tone(f * 2, f * 2, 0.22, 0.05, "sine", t);
  }

  sparkle() {
    const t0 = this.ctx?.currentTime ?? 0;
    [0, 4, 7, 12].forEach((s, i) => {
      const f = 1320 * Math.pow(2, s / 12);
      this.tone(f, f, 0.25, 0.07, "sine", t0 + i * 0.05);
    });
  }

  /** Dhol hit on rank-up. */
  dhol() {
    const t = this.ctx?.currentTime ?? 0;
    this.tone(105, 46, 0.5, 0.85, "sine", t);
    this.burst(0.08, 0.35, 900, "lowpass", t);
    this.tone(230, 150, 0.18, 0.35, "sine", t + 0.15);
    this.burst(0.06, 0.25, 2500, "bandpass", t + 0.15);
  }

  splash() {
    this.burst(0.6, 0.35, 1100, "bandpass", 0, this.sfx, 0.6);
    this.tone(700, 180, 0.4, 0.12);
  }

  countdownTick(go: boolean) {
    if (go) {
      this.tone(880, 880, 0.35, 0.22, "triangle");
      this.tone(1320, 1320, 0.3, 0.1, "sine");
    } else {
      this.tone(520, 520, 0.12, 0.18, "triangle");
    }
  }

  /** Pressure-horn sting when Rush Hour starts. */
  rushHorn() {
    const t = this.ctx?.currentTime ?? 0;
    this.tone(330, 330, 0.25, 0.18, "sawtooth", t);
    this.tone(330, 330, 0.45, 0.18, "sawtooth", t + 0.3);
    this.tone(415, 415, 0.45, 0.12, "sawtooth", t + 0.3);
  }

  endSting(good: boolean) {
    const t = (this.ctx?.currentTime ?? 0) + 0.15;
    if (good) {
      // Rising arpeggio on scale steps 2, 4, 5, 7 (whole indices into SCALE).
      [2, 4, 5, 7].forEach((step, i) => {
        const f = ROOT * Math.pow(2, SCALE[step] / 12);
        this.tone(f, f, 0.5, 0.18, "triangle", t + i * 0.11);
      });
      this.tone(100, 45, 0.6, 0.7, "sine", t + 0.44);
    } else {
      [0, 1, 2].forEach((i) => {
        const f = 392 * Math.pow(2, -i / 12) * (i === 2 ? 0.94 : 1);
        this.tone(f, f * (i === 2 ? 0.85 : 1), i === 2 ? 0.8 : 0.3, 0.12, "sawtooth", t + i * 0.32);
      });
    }
  }

  /** Dripping gets faster and louder as the seepage meter fills. Call every frame. */
  updateDrip(meterFrac: number, dtMs: number) {
    if (!this.ctx || meterFrac < 0.05) {
      this.dripClock = 0;
      return;
    }
    this.dripClock += dtMs;
    const interval = 1300 - 1050 * meterFrac;
    if (this.dripClock >= interval) {
      this.dripClock = 0;
      const f = 1400 + Math.random() * 600;
      this.tone(f, f * 0.35, 0.1, 0.05 + 0.22 * meterFrac);
    }
  }

  // ------------------------------------------------------------- ambience + music

  startRoundAudio() {
    if (!this.ctx || !this.musicBus) return;
    this.stopRoundAudio();
    this.startAmbience();
    this.tempo = 96;
    this.layers = 1;
    this.step = 0;
    this.melodyIdx = 3;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.seqTimer = setInterval(() => this.schedule(), 25);
  }

  /** Builds the music as the round goes on: tabla → +dhol → +melody/drone → rush. */
  setMusicStage(elapsedMs: number) {
    const s = elapsedMs < 15_000 ? 1 : elapsedMs < 30_000 ? 2 : elapsedMs < 50_000 ? 3 : 4;
    if (s === this.layers) return;
    this.layers = s;
    if (s >= 3 && !this.drone) this.startDrone();
    this.tempo = s === 4 ? 132 : s === 3 ? 104 : 96;
  }

  private schedule() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step % 16, this.nextNoteTime);
      this.nextNoteTime += 60 / this.tempo / 4;
      this.step++;
    }
  }

  private playStep(s: number, t: number) {
    const bus = this.musicBus;
    // Layer 1: tabla-ish bols (ge / na / ti).
    if ([0, 3, 8, 11].includes(s)) this.tone(118, 72, 0.28, 0.4, "sine", t, bus);
    if ([2, 6, 10, 13, 14].includes(s)) {
      this.tone(690, 680, 0.12, 0.12, "triangle", t, bus);
      this.tone(1380, 1370, 0.06, 0.05, "sine", t, bus);
    }
    if (s === 4 || s === 12) this.burst(0.04, 0.08, 5200, "highpass", t, bus);
    // Layer 2: dhol.
    if (this.layers >= 2) {
      if (s === 0 || s === 8) this.tone(80, 44, 0.4, 0.55, "sine", t, bus);
      if (s === 4 || s === 12) this.burst(0.08, 0.22, 950, "bandpass", t, bus, 1.4);
      if (s === 7 || s === 15) this.burst(0.05, 0.12, 1300, "bandpass", t, bus, 1.4);
    }
    // Layer 3: plucked melody in Bhairav.
    if (this.layers >= 3 && s % 2 === 0 && Math.random() < 0.6) {
      this.melodyIdx = Math.max(0, Math.min(SCALE.length - 1, this.melodyIdx + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]));
      const f = ROOT * Math.pow(2, SCALE[this.melodyIdx] / 12);
      this.pluck(f, t);
    }
    // Layer 4: rush hour shaker + extra dhol.
    if (this.layers >= 4) {
      this.burst(0.03, 0.05, 7500, "highpass", t, bus);
      if (s === 4 || s === 12) this.tone(80, 44, 0.3, 0.4, "sine", t, bus);
    }
  }

  private pluck(f: number, t: number) {
    if (!this.ctx || !this.musicBus) return;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(lp).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private startDrone() {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const oscs = [ROOT / 2, (ROOT / 2) * 1.5, ROOT / 4].map((f) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(lp);
      o.start();
      return o;
    });
    lp.connect(g).connect(this.musicBus);
    this.drone = {
      stop: () => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
        oscs.forEach((o) => o.stop(ctx.currentTime + 0.8));
      },
    };
  }

  private startAmbience() {
    if (!this.ctx || !this.brown || !this.sfx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 1);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start();
    // Distant clanks from the rest of the site.
    const clank = () => {
      const base = 600 + Math.random() * 700;
      for (const [m, v] of [
        [1, 0.03],
        [1.47, 0.02],
        [2.31, 0.012],
      ] as const) {
        this.tone(base * m, base * m * 0.995, 0.7, v, "sine");
      }
      this.clankTimer = setTimeout(clank, 2500 + Math.random() * 4500);
    };
    this.clankTimer = setTimeout(clank, 1500);
    this.ambience = {
      stop: () => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
        src.stop(ctx.currentTime + 1);
      },
    };
  }

  private stopRoundAudio() {
    if (this.seqTimer) clearInterval(this.seqTimer);
    this.seqTimer = null;
    if (this.clankTimer) clearTimeout(this.clankTimer);
    this.clankTimer = null;
    this.drone?.stop();
    this.drone = null;
    this.ambience?.stop();
    this.ambience = null;
  }

  stopAll() {
    this.stopRoundAudio();
    if (this.ctx && this.scrapeGain && this.squelchGain) {
      this.scrapeGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      this.squelchGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
  }

  // ------------------------------------------------------------- voice

  /** Plays /sounds/voice/<id>.mp3 if it exists. Returns true if a clip played. */
  private loading = new Map<string, Promise<AudioBuffer | null>>();

  private available: Promise<Set<string>> | null = null;

  /** /sounds/voice/manifest.json lists the clips that exist (written by npm run voice:cut). */
  private availableIds = new Set<string>();

  private manifest() {
    if (!this.available) {
      this.available = fetch("/sounds/voice/manifest.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : []))
        .then((ids: string[]) => new Set(Array.isArray(ids) ? ids : []))
        .catch(() => new Set<string>())
        .then((set) => (this.availableIds = set));
    }
    return this.available;
  }

  /** True once the manifest says a recorded/generated clip exists for this line. */
  hasVoice(id: string) {
    return this.availableIds.has(id);
  }

  private load(id: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return Promise.resolve(null);
    let p = this.loading.get(id);
    if (!p) {
      const ctx = this.ctx;
      p = this.manifest()
        .then((ids) => (ids.has(id) ? fetch(`/sounds/voice/${id}.mp3`) : null))
        .then((res) => (res && res.ok ? res.arrayBuffer() : null))
        .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
        .catch(() => null)
        .then((buf) => {
          this.voices.set(id, buf);
          return buf;
        });
      this.loading.set(id, p);
    }
    return p;
  }

  async voice(id: string): Promise<boolean> {
    if (!this.ctx || !this.master || this.muted) return false;
    const buf = this.voices.get(id) ?? (await this.load(id));
    if (!buf || !this.ctx || !this.master) return false;
    // Duck the music under the voice.
    if (this.musicBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.setTargetAtTime(0.15, t, 0.03);
      this.musicBus.gain.setTargetAtTime(0.42, t + buf.duration, 0.2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master);
    src.start();
    return true;
  }

  /** Warms the voice cache so the first line plays without a delay. */
  preloadVoices(ids: string[]) {
    if (!this.ctx) return;
    void this.manifest().then(() => {
      for (const id of ids) if (this.hasVoice(id)) void this.load(id);
    });
  }
}

let instance: AudioManager | null = null;
export function getAudio() {
  if (!instance) instance = new AudioManager();
  return instance;
}

export function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported (iOS Safari) */
  }
}
