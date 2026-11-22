// Small client-side persistence helpers. Every access is guarded: storage can be
// blocked in private tabs or in-app browsers (WhatsApp, Instagram).

function get(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

let memDevice: string | null = null;

export function getDeviceId() {
  let id = get("gbd:device");
  if (!id) {
    id = memDevice ?? crypto.randomUUID();
    memDevice = id;
    set("gbd:device", id);
  }
  return id;
}

export function getNickname() {
  return get("gbd:nick") ?? "";
}

export function setNickname(n: string) {
  set("gbd:nick", n);
}

export function getMyScoreIds(): string[] {
  try {
    return JSON.parse(get("gbd:mine") ?? "[]");
  } catch {
    return [];
  }
}

export function addMyScoreId(id: string) {
  const ids = [id, ...getMyScoreIds().filter((x) => x !== id)].slice(0, 200);
  set("gbd:mine", JSON.stringify(ids));
}

export interface LastPositions {
  day: string;
  dailyPos: number;
  allTimePos: number;
  bestScore: number;
}

export function getPositions(): LastPositions | null {
  try {
    return JSON.parse(get("gbd:pos") ?? "null");
  } catch {
    return null;
  }
}

export function setPositions(p: LastPositions) {
  set("gbd:pos", JSON.stringify(p));
}

export function istDayClient() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
