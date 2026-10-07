import type { CamClass } from "./data";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export type Tracked = {
  key: string;
  id: string;
  cls: CamClass;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  conf: number;
  age: number;
  life: number;
  state: "track" | "fence" | "handoff" | "idle";
  trail: [number, number][];
  plate?: string;
  faceScore?: number;
  speed: number;
  heading: string;
  depthM?: number;
  disparityPx?: number;
  heightM?: number;
  manual?: boolean;
};

const STATE = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const headingOf = (vx: number, vy: number) =>
  STATE[(Math.round(((Math.atan2(vy, vx) * 180) / Math.PI + 360) / 45) % 8 + 8) % 8];

const STATES = ["PB", "HR", "RJ", "PB", "HR", "DL", "UP", "PJ"];
const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";

export function plate(r: () => number) {
  const L = () => LETTERS[Math.floor(r() * LETTERS.length)];
  return `${STATES[Math.floor(r() * STATES.length)]}${10 + Math.floor(r() * 60)} ${L()}${L()} ${1000 + Math.floor(r() * 8999)}`;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function seedWorld(count: number, seed: number, hasRoad: boolean): Tracked[] {
  const r = rng(seed);
  const out: Tracked[] = [];
  for (let i = 0; i < count; i++) out.push(spawn(r, i, hasRoad, true));
  return out;
}

function spawn(r: () => number, i: number, hasRoad: boolean, initial = false): Tracked {
  const vehicle = r() > (hasRoad ? 0.45 : 0.72);
  const dir = r() > 0.5 ? 1 : -1;
  const scale = vehicle ? 1 : 0.55 + r() * 0.4;
  const y = vehicle ? (hasRoad ? 58 + r() * 22 : 30 + r() * 50) : 40 + r() * 45;
  const w = (vehicle ? 16 + r() * 10 : 4 + r() * 3.4) * scale;
  const h = (vehicle ? 8 + r() * 4 : 9 + r() * 5) * scale;
  const speed = vehicle ? 0.55 + r() * 0.75 : 0.14 + r() * 0.2;
  return {
    key: `s${i}-${Math.floor(r() * 1e6)}`,
    id: `${vehicle ? "V" : "P"}-${(1042 + i * 37 + Math.floor(r() * 90)).toString().padStart(4, "0")}`,
    cls: vehicle ? "vehicle" : "person",
    x: initial ? r() * 100 : dir > 0 ? -w - 2 : 102,
    y: clamp(y, 18, 88),
    w,
    h,
    vx: dir * speed,
    vy: (r() - 0.5) * (vehicle ? 0.03 : 0.05),
    conf: 0.58 + r() * 0.4,
    age: initial ? Math.floor(r() * 40) : 0,
    life: 120 + Math.floor(r() * 260),
    state: "track",
    trail: [],
    speed: vehicle ? Math.round(14 + speed * 34) : Math.round(3 + speed * 9),
    heading: "",
    plate: vehicle && r() > 0.25 ? plate(r) : undefined,
    faceScore: !vehicle && r() > 0.62 ? 0.42 + r() * 0.52 : undefined,
  };
}

export function stepWorld(tracks: Tracked[], seed: number, hasRoad: boolean): Tracked[] {
  const r = rng(seed);
  const next: Tracked[] = [];
  for (const t of tracks) {
    const age = t.age + 1;
    if (age > t.life || t.x > 118 || t.x < -18) continue;
    let { vx, vy, conf } = t;
    vx += (r() - 0.5) * 0.02;
    vy += (r() - 0.5) * 0.012;
    vy = clamp(vy, -0.09, 0.09);
    conf = clamp(conf + (r() - 0.5) * 0.035, 0.31, 0.99);
    const x = t.x + vx;
    const y = clamp(t.y + vy, 16, 90);
    const trail: [number, number][] = [...t.trail, [t.x, t.y] as [number, number]].slice(-16);
    next.push({
      ...t,
      x,
      y,
      vx,
      vy,
      conf,
      age,
      trail,
      heading: headingOf(vx, vy),
      state: age < 6 ? "handoff" : t.state === "fence" && age - t.life < 400 ? "fence" : "track",
    });
  }
  // keep density alive
  const want = hasRoad ? 6 : 5;
  if (next.length < want) next.push(spawn(r, next.length + Math.floor(r() * 999), hasRoad));
  return next;
}

export const fmtClock = (d: Date) =>
  `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;

export const ago = (t: number) => {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export const fmtDur = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(
    s % 60,
  ).padStart(2, "0")}`;

/* ── analytic series (deterministic per range) ───────── */
export type Range = "6h" | "24h" | "7d" | "30d";

export function series(range: Range) {
  const r = rng(hash(range));
  const n = range === "6h" ? 12 : range === "24h" ? 24 : range === "7d" ? 7 : 30;
  const labels: string[] = [];
  const people: number[] = [];
  const vehicles: number[] = [];
  const alerts: number[] = [];
  for (let i = 0; i < n; i++) {
    if (range === "7d" || range === "30d") labels.push(range === "7d" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] : `D${i + 1}`);
    else labels.push(`${String((i * (range === "6h" ? 0.5 : 1)) % 24).padStart(2, "0")}${range === "6h" ? ":30" : ":00"}`);
    const night = range !== "7d" && range !== "30d" ? (i > 17 || i < 5 ? 1.9 : 1) : 1;
    const p = Math.round((16 + r() * 34) * night);
    people.push(p);
    vehicles.push(Math.round((10 + r() * 26) * (night > 1 ? 0.6 : 1.25)));
    alerts.push(Math.round(p * 0.11 + r() * 5));
  }
  return { labels, people, vehicles, alerts };
}

export const CLASS_MIX = [
  { k: "Two-wheeler", v: 24 },
  { k: "Passenger", v: 21 },
  { k: "Light goods", v: 18 },
  { k: "Tractor / farm", v: 15 },
  { k: "Bus / van", v: 12 },
  { k: "Heavy goods", v: 10 },
];

export const CONF_HIST = [3, 7, 12, 22, 38, 61, 88, 112, 96, 58, 31, 14];

export const SECTOR_LOAD = [
  { k: "Sector 4", v: 812 },
  { k: "Sector 7", v: 1204 },
  { k: "Sector 2", v: 470 },
  { k: "Sector 9", v: 283 },
  { k: "Sector 1", v: 156 },
];
