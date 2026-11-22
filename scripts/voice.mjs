// Cuts voice lines out of a reel (mp4/mp3/m4a…) for the game.
//
// 1) npm run voice:split -- "C:/path/reel.mp4"
//    Finds every spoken phrase (by silence gaps), saves each as voice-src/clips/clip-NN.mp3
//    and writes voice-src/cues.json. Listen to the clips and fill in an "id" for the ones
//    you want (ids are listed in public/sounds/voice/README.md). Tweak start/end if needed.
//
// 2) npm run voice:cut -- "C:/path/reel.mp4"
//    Cuts every cue that has an id into public/sounds/voice/<id>.mp3 (loudness-normalised,
//    mono, short fades) and updates public/sounds/voice/manifest.json.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "voice-src");
const clipsDir = join(srcDir, "clips");
const cuesFile = join(srcDir, "cues.json");
const outDir = join(root, "public", "sounds", "voice");

const [mode, input] = process.argv.slice(2);
if (!["split", "cut"].includes(mode) || !input) {
  console.error('Usage: node scripts/voice.mjs split|cut "path/to/reel.mp4"');
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`File not found: ${input}`);
  process.exit(1);
}

function run(args) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error("ffmpeg failed");
  }
  return r.stderr;
}

function cut(start, end, out) {
  const dur = Math.max(0.1, end - start);
  const fade = Math.min(0.03, dur / 4);
  run([
    "-ss", String(start), "-t", String(dur), "-i", input,
    "-vn", "-ac", "1", "-ar", "44100",
    "-af", `afade=t=in:d=${fade},afade=t=out:st=${(dur - fade).toFixed(3)}:d=${fade},loudnorm=I=-16:TP=-1.5:LRA=11`,
    "-b:a", "96k", out,
  ]);
}

if (mode === "split") {
  const log = run(["-i", input, "-vn", "-af", "silencedetect=noise=-32dB:d=0.18", "-f", "null", "-"]);
  const durMatch = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const total = durMatch ? +durMatch[1] * 3600 + +durMatch[2] * 60 + +durMatch[3] : 0;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  // Speech = gaps between silences.
  const segs = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] - cursor > 0.25) segs.push([Math.max(0, cursor - 0.05), starts[i] + 0.05]);
    cursor = ends[i] ?? total;
  }
  if (total - cursor > 0.25) segs.push([Math.max(0, cursor - 0.05), total]);

  mkdirSync(clipsDir, { recursive: true });
  for (const f of readdirSync(clipsDir)) if (f.startsWith("clip-")) writeFileSync(join(clipsDir, f), "");
  const cues = segs.map(([s, e], i) => {
    const clip = `clip-${String(i + 1).padStart(2, "0")}.mp3`;
    cut(s, e, join(clipsDir, clip));
    return { clip, start: +s.toFixed(2), end: +e.toFixed(2), id: "", text: "" };
  });
  writeFileSync(cuesFile, JSON.stringify(cues, null, 2) + "\n");
  console.log(`Found ${cues.length} phrases. Listen in voice-src/clips/, then set "id" (and "text") in voice-src/cues.json.`);
  for (const c of cues) console.log(`  ${c.clip}  ${c.start.toFixed(2)}s → ${c.end.toFixed(2)}s`);
} else {
  if (!existsSync(cuesFile)) {
    console.error("voice-src/cues.json not found. Run the split step first.");
    process.exit(1);
  }
  const cues = JSON.parse(readFileSync(cuesFile, "utf8")).filter((c) => c.id);
  mkdirSync(outDir, { recursive: true });
  for (const c of cues) {
    cut(c.start, c.end, join(outDir, `${c.id}.mp3`));
    console.log(`  ${c.id}.mp3  (${(c.end - c.start).toFixed(2)}s)${c.text ? `  "${c.text}"` : ""}`);
  }
  const ids = readdirSync(outDir)
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.replace(/\.mp3$/, ""))
    .sort();
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(ids) + "\n");
  console.log(`Wrote ${cues.length} clips. manifest.json lists: ${ids.join(", ")}`);
}
