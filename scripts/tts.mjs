// Generates voice lines with Sarvam AI text-to-speech (bulbul:v3).
// Lines marked "source": "reel" in content/problems.json (e.g. "Grout bhar denge!") are
// never generated: they must come from the original reel (npm run voice:cut).
//
//   npm run voice:tts                    # generate all non-reel lines (skips existing files)
//   npm run voice:tts -- --force         # regenerate even if the mp3 exists
//   npm run voice:tts -- --speaker=rahul # pick another voice
//   npm run voice:tts -- --samples       # one line in several male voices → voice-src/speakers/
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sounds", "voice");
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const speaker = flag("speaker")?.split("=")[1] ?? "ratan";
const force = !!flag("force");

const key = process.env.SARVAM_API_KEY;
if (!key) {
  console.error("SARVAM_API_KEY is not set (add it to .env.local).");
  process.exit(1);
}

async function tts(text, who) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, target_language_code: "hi-IN", model: "bulbul:v3", speaker: who, pace: 1.1 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json.error ?? json)}`);
  return Buffer.from(json.audios[0], "base64");
}

/** WAV → trimmed, loudness-normalised mono MP3. */
function toMp3(wav, out) {
  const r = spawnSync(
    ffmpeg,
    [
      "-hide_banner", "-loglevel", "error", "-y", "-f", "wav", "-i", "pipe:0",
      "-af",
      "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_threshold=-45dB:stop_duration=0.25,loudnorm=I=-16:TP=-1.5:LRA=11",
      "-ac", "1", "-ar", "44100", "-b:a", "96k", out,
    ],
    { input: wav, maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(String(r.stderr));
}

function writeManifest() {
  const ids = readdirSync(outDir)
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.replace(/\.mp3$/, ""))
    .sort();
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(ids) + "\n");
  return ids;
}

const content = JSON.parse(readFileSync(join(root, "content", "problems.json"), "utf8"));
const v = content.voice;
const lines = [...v.start, ...v.fill, ...v.combo5, ...v.leak, ...v.rush, ...Object.values(v.gameOver)];

if (flag("samples")) {
  const dir = join(root, "voice-src", "speakers");
  mkdirSync(dir, { recursive: true });
  const males = ["ratan", "rahul", "amit", "vijay", "sunny", "mohit", "kabir", "tarun", "aditya", "rohan"];
  for (const who of males) {
    toMp3(await tts("हो गया भाई! इसमें भी ग्राउट!", who), join(dir, `${who}.mp3`));
    console.log(`  voice-src/speakers/${who}.mp3`);
  }
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
for (const line of lines) {
  const out = join(outDir, `${line.id}.mp3`);
  if (line.source === "reel") {
    console.log(`  ${line.id.padEnd(15)} reel only${existsSync(out) ? " (present)" : " (MISSING: run voice:cut)"}`);
    continue;
  }
  if (!line.say) continue;
  if (existsSync(out) && !force) {
    console.log(`  ${line.id.padEnd(15)} exists, skipped`);
    continue;
  }
  toMp3(await tts(line.say, speaker), out);
  console.log(`  ${line.id.padEnd(15)} generated (${speaker})  "${line.text}"`);
}
console.log("manifest:", writeManifest().join(", "));
