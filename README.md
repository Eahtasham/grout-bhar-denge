# Grout Bhar Denge

A 60-second, one-thumb mobile web game. Cracks keep appearing on a tiled floor; trace them with your finger to fill them with grout before the seepage meter fills up. Some cracks carry everyday problems ("Exam kal hai", "Salary late hai"), and grouting them "fixes" those too.

Built to be shared: every round ends with a score card link, a WhatsApp/Instagram story image and a challenge link that lets a friend try to beat your score.

## How to play

- Drag your finger along a crack. Grout is laid wherever your finger passes close to it.
- A crack seals once 90% of it is covered.
- Open cracks leak water into the **seepage meter**. The round ends at 60 seconds or when the meter is full.
- Seal cracks within 1.5 s of each other to build a combo (up to x5). Staying close to the line gives an accuracy bonus of up to +50%.

| Crack | Points | Appears from |
|---|---|---|
| Normal | 10 | start |
| Problem (with a label) | 25 + a fix popup | 10 s |
| Zigzag | 20 | 15 s |
| Golden (vanishes after 2 s) | 50 | 20 s |

Cracks spawn faster every 10 seconds, and the last 10 seconds are **Rush Hour**.

Ranks: Naya Helper (0) → Mistri (300) → Senior Mistri (700) → Thekedaar (1,200) → Grout King (2,000).

## Features

- Canvas 2D game with a custom `requestAnimationFrame` loop (no game engine)
- Realistic floor: glossy ceramic tiles, tapered cracks with chipped edges, water that seeps and pools, wet grout smoothed by a trowel that dries lighter
- Sound effects and music synthesized with the Web Audio API (no audio files to download), plus voice lines
- Daily (resets at midnight IST) and all-time leaderboards
- Share page per score with its own preview image (`/s/[id]`), native share sheet with a WhatsApp fallback, 1080×1920 story image
- Challenge links: open a friend's score and the game tells you how much you need to beat it
- Installable as a web app (manifest + icons)
- Server-side score validation (see [Anti-cheat](#anti-cheat))

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Cache Components) + TypeScript
- Tailwind CSS v4
- PostgreSQL on [Supabase](https://supabase.com), accessed from the server with [`postgres`](https://github.com/porsager/postgres)
- `next/og` for the score-card images
- Vercel Analytics for events (`round_start`, `round_end`, `share_click`, `challenge_open`)

## Getting started

Requirements: Node.js 20+ and a Postgres database (a free Supabase project works).

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run db:migrate           # creates the tables
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Supabase use the **transaction pooler** (port `6543`): the direct host is IPv6-only and won't work from Vercel. |
| `ADMIN_SECRET` | yes | Long random string for the admin delete route. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Your public URL (e.g. `https://groutbhardenge.in`), used for absolute share-card links. Falls back to the Vercel production URL. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | Not used by the app today; kept for future client features. |
| `SARVAM_API_KEY` | no | Only for generating voice lines locally (`npm run voice:tts`). Not needed at runtime. |

All tables have row-level security enabled with no policies, so the public Supabase API cannot read or write them; only the server (via `DATABASE_URL`) can.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Applies `db/schema.sql` to `DATABASE_URL` |
| `npm run voice:split -- <file>` | Splits a reel's audio into phrases (`voice-src/clips/`) |
| `npm run voice:cut -- <file>` | Cuts the phrases listed in `voice-src/cues.json` into `public/sounds/voice/` |
| `npm run voice:tts` | Generates the remaining voice lines with Sarvam AI |

## Project structure

```
app/
  page.tsx                    Home + game + game-over overlay (one page, instant replay)
  leaderboard/page.tsx        Today / All-time boards
  s/[id]/page.tsx             Share landing page ("Mera record todo")
  s/[id]/opengraph-image.tsx  1200×630 score card for link previews
  api/session/route.ts        POST: start a round (session id + seed)
  api/score/route.ts          POST: submit a round · GET: public score info
  api/leaderboard/route.ts    GET ?scope=daily|all (cached 30 s at the edge)
  api/admin/delete/route.ts   Remove spam / offensive entries
game/
  config.ts                   All tuning constants (timings, leak rates, points, ranks)
  cracks.ts                   Seeded crack generator          ┐ pure functions, shared by
  scoring.ts                  Scoring + seepage simulation    ┘ the game and the server
  engine.ts                   Game loop, input, rendering
  render.ts                   Tiles, trowel, tags, backdrop
  audio.ts                    Synthesized sound + voice playback
components/                   React UI (home, game over, leaderboard, Mistri)
content/problems.json         Problem one-liners, fixes, voice lines, share text
lib/                          DB client, rate limiting, nickname filter, share helpers
db/schema.sql                 Tables and indexes
scripts/                      Migration and voice tools
public/sounds/voice/          Voice clips + manifest.json
```

## Anti-cheat

The game is deterministic: every round's crack layout comes from a seed the server hands out.

1. `POST /api/session` creates a session and returns a random seed.
2. At the end of the round, the client submits only the list of fills (crack id, time, accuracy), not a score.
3. The server rebuilds the crack schedule from the seed, checks every fill (the crack existed at that time, golden cracks weren't gone yet, no duplicates), replays the seepage meter to find when the round really ended, and **recomputes the score itself** with the same `scoring.ts` the game uses.
4. Sessions are single-use, expire after 10 minutes, and must be at least as old as the round was long.
5. Submissions are rate-limited to 10 per minute per IP (stored in Postgres), and nicknames are checked against a Hindi + English bad-word list.

This stops casual cheating. A determined player could still script a perfect round, which is acceptable for a meme game.

To remove an entry:

```bash
curl -X POST https://<your-domain>/api/admin/delete \
  -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"id":"abc123XY"}'        # or {"nickname":"..."} to remove all entries with that name
```

## Voice lines

Voice clips live in `public/sounds/voice/` and are listed in `manifest.json`; the game only requests clips that are in the manifest and skips the rest.

- **Reel lines** ("Grout bhar denge!", "Kitna gap hai ye?", "Ye paani nahi bharega?" …) are cut from the original reel. They are marked `"source": "reel"` in `content/problems.json` and are never AI-generated.
- **Other lines** are generated with [Sarvam AI](https://www.sarvam.ai) text-to-speech (`bulbul:v3`) from the Devanagari `say` text in the same file.

To change or add lines, edit `content/problems.json`, then run `npm run voice:cut` (reel) or `npm run voice:tts -- --force` (AI). See `public/sounds/voice/README.md` for the list of clip ids.

## Customising content

- **Problems:** add or edit entries in `content/problems.json` (no code changes needed). Keep jokes about everyday life, not about real people, religion, caste or politics.
- **Difficulty:** spawn rates live in `game/cracks.ts`; leak rates, combo window, points and rank thresholds in `game/config.ts`. Changing them changes scoring on both the client and the server.
- **Floor clutter:** `MAX_DRIED` in `game/engine.ts` sets how many filled cracks stay visible.

## Deploying to Vercel

1. Import the repository in Vercel.
2. Add `DATABASE_URL`, `ADMIN_SECRET` and `NEXT_PUBLIC_SITE_URL` as environment variables.
3. Run `npm run db:migrate` once against the production database.
4. Deploy. Enable Vercel Analytics in the project settings to collect the custom events.

## Credits

- Voice: [@nasim_tiles_industry](https://www.instagram.com/nasim_tiles_industry/), from the original reels that started the meme
- Additional voice lines: Sarvam AI
- Font: [Baloo 2](https://fonts.google.com/specimen/Baloo+2)
