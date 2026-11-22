// Nickname checks: 3–16 chars, simple charset, Hindi (Latin script) + English bad-word list.
// Matching is done on a normalised form so "Ch00t1ya" or "b.c" are caught too.

const SUBSTRING_WORDS = [
  // English
  "fuck", "fuk", "shit", "bitch", "bastard", "asshole", "dick", "cock", "pussy", "cunt",
  "slut", "whore", "nigg", "faggot", "porn", "retard", "boob", "penis", "vagina", "sex",
  // Hindi / Hinglish (avoid stems that appear in real names, e.g. Gandhi, Muthu)
  "chutiy", "chutia", "chod", "bhosd", "bhosad", "madarch", "madarc", "behenc", "bhenc",
  "bhanch", "gaand", "lund", "lauda", "lavda", "lawda", "randi", "raand", "harami",
  "haraami", "kamina", "kutiya", "chinal", "jhant", "tatti", "chuchi", "bsdk", "bkl",
  "tmkc", "bhadwa", "bhadva", "hijda",
];

// Short words only blocked as the whole name (or a whole word) to avoid false positives.
const EXACT_WORDS = [
  "bc", "mc", "mkc", "gay", "ass", "rape", "kutta", "kamine", "saala", "sala", "ullu",
  "suar", "loda", "gand", "chut", "chutiya",
];

function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s");
}

export type NickCheck = { ok: true; nickname: string } | { ok: false; reason: string };

export function checkNickname(raw: unknown): NickCheck {
  if (typeof raw !== "string") return { ok: false, reason: "Naam daalo" };
  const nickname = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (nickname.length < 3 || nickname.length > 16) return { ok: false, reason: "Naam 3 se 16 letters ka ho" };
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(nickname)) return { ok: false, reason: "Sirf letters, numbers, _ . -" };

  const norm = normalise(nickname);
  const squashed = norm.replace(/[^a-z]/g, "");
  if (SUBSTRING_WORDS.some((w) => squashed.includes(w))) return { ok: false, reason: "Yeh naam nahi chalega" };
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  if (EXACT_WORDS.some((w) => squashed === w || words.includes(w))) {
    return { ok: false, reason: "Yeh naam nahi chalega" };
  }
  return { ok: true, nickname };
}
