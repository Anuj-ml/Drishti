/* Virtual Fence Engine — pure geometry on track foot positions. */

export type FencePoint = [number, number];
export type FenceType = "tripwire" | "polygon" | "loiter" | "direction";

export type FenceZone = {
  id: string;
  name: string;
  type: FenceType;
  points: FencePoint[];
  enabled: boolean;
  hits: number;
  direction?: "both" | "entering" | "exiting";
  loiterThreshold?: number;
  minObjectSize?: number;
};

export type FenceCrossing = {
  zoneId: string;
  trackId: string;
  cls: string;
  side: "entering" | "exiting" | "inside";
  footPoint: FencePoint;
  confidence: number;
  timestamp: number;
};

const trackState = new Map<string, { lastSide: "A" | "B" | "inside" | null; loiterStart: number | null }>();

function signedSide(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax) > 0 ? "A" as const : "B" as const;
}

function inPoly(px: number, py: number, pts: [number, number][]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function foot(box: [number, number, number, number]): [number, number] {
  return [(box[0] + box[2]) / 2, box[3]];
}

function state(trackId: string, zoneId: string) {
  const k = `${zoneId}:${trackId}`;
  let s = trackState.get(k);
  if (!s) { s = { lastSide: null, loiterStart: null }; trackState.set(k, s); }
  return s;
}

type Boxed = { id: number; box: [number, number, number, number]; cls: string };

function checkTw(z: FenceZone, t: Boxed, ts: number): FenceCrossing | null {
  if (z.points.length < 2) return null;
  const [a, b] = z.points;
  const f = foot(t.box);
  const side = signedSide(f[0], f[1], a[0], a[1], b[0], b[1]);
  const s = state(String(t.id), z.id);
  const prev = s.lastSide;
  s.lastSide = side;
  if (prev && prev !== side && prev !== "inside") {
    const dir = z.direction ?? "both";
    if ((dir === "entering" && side !== "B") || (dir === "exiting" && side !== "A")) return null;
    return { zoneId: z.id, trackId: `#${t.id}`, cls: t.cls, side: side === "B" ? "entering" : "exiting", footPoint: f, confidence: 0.88 + Math.random() * 0.08, timestamp: ts };
  }
  return null;
}

function checkPoly(z: FenceZone, t: Boxed, ts: number): FenceCrossing | null {
  if (z.points.length < 3 || (t.box[2] - t.box[0]) * 100 < (z.minObjectSize ?? 3)) return null;
  const f = foot(t.box);
  const s = state(String(t.id), z.id);
  if (inPoly(f[0], f[1], z.points) && !s.lastSide) {
    s.lastSide = "inside";
    return { zoneId: z.id, trackId: `#${t.id}`, cls: t.cls, side: "inside", footPoint: f, confidence: 0.86 + Math.random() * 0.1, timestamp: ts };
  }
  return null;
}

function checkLoiter(z: FenceZone, t: Boxed, ts: number): FenceCrossing | null {
  if (z.points.length < 3 || (t.box[2] - t.box[0]) * 100 < (z.minObjectSize ?? 3)) return null;
  const f = foot(t.box);
  const s = state(String(t.id), z.id);
  if (inPoly(f[0], f[1], z.points)) {
    if (!s.loiterStart) s.loiterStart = ts;
    const dwell = (ts - s.loiterStart) / 1000;
    if (dwell >= (z.loiterThreshold ?? 5)) return { zoneId: z.id, trackId: `#${t.id}`, cls: t.cls, side: "inside", footPoint: f, confidence: 0.82 + Math.min(0.12, dwell * 0.01), timestamp: ts };
  } else { s.loiterStart = null; }
  return null;
}

export function checkFences(zones: FenceZone[], tracks: Boxed[], timestamp: number): FenceCrossing[] {
  const out: FenceCrossing[] = [];
  for (const z of zones) {
    if (!z.enabled) continue;
    for (const t of tracks) {
      const c = z.type === "tripwire" || z.type === "direction" ? checkTw(z, t, timestamp) : z.type === "polygon" ? checkPoly(z, t, timestamp) : checkLoiter(z, t, timestamp);
      if (c) out.push(c);
    }
  }
  return out;
}

export function resetFenceEngine() { trackState.clear(); }
export function getFenceStats(zones: FenceZone[]) {
  return { armed: zones.filter((z) => z.enabled).length, total: zones.length, hits: zones.reduce((s, z) => s + z.hits, 0) };
}
