/* Manual frame annotations — authored by hand per feed, no detector involved.
   Each script is a keyframed bounding-box path on a fixed loop so boxes sit
   where the footage actually shows subjects. Event logs are intentionally NOT
   derived from these tracks (see store inference loop). */

import type { CamClass } from "./data";
import { hash, headingOf, type Tracked } from "./sim";
import { depthFromFootY } from "./sgm";

export const ANNOTATION_LOOP = 20; // seconds; matches the looping demo clips

type Key = { t: number; x: number; y: number; w: number; h: number };

export type AnnotatedScript = {
  id: string;
  cls: CamClass;
  conf: number;
  keys: Key[];
  from?: number; // visible window start (s, loop time)
  to?: number; // visible window end (s)
  plate?: string;
  faceScore?: number;
  speedKmh?: number; // override; otherwise derived from motion
  note?: string;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function interp(keys: Key[], t: number): Key {
  const ks = [...keys].sort((a, b) => a.t - b.t);
  if (t <= ks[0].t) return ks[0];
  if (t >= ks[ks.length - 1].t) return ks[ks.length - 1];
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i];
    const b = ks[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(0.001, b.t - a.t);
      return { t, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
    }
  }
  return ks[ks.length - 1];
}

const inWindow = (s: AnnotatedScript, t: number) => {
  const from = s.from ?? 0;
  const to = s.to ?? ANNOTATION_LOOP;
  if (from <= to) return t >= from && t <= to;
  return t >= from || t <= to; // wrapped window
};

export const ANNOTATIONS: Record<string, AnnotatedScript[]> = {
  /* c01 — roadside fence, highway behind it. Two lanes, opposite directions. */
  c01: [
    {
      id: "V-2201", cls: "vehicle", conf: 0.91, from: 0, to: 14, speedKmh: 68,
      keys: [
        { t: 0, x: -18, y: 63, w: 13, h: 6.5 },
        { t: 5, x: 22, y: 63, w: 13.5, h: 6.8 },
        { t: 10, x: 62, y: 64, w: 14, h: 7 },
        { t: 14, x: 104, y: 64, w: 14, h: 7 },
      ],
      note: "Sedan, far lane L→R",
    },
    {
      id: "V-2202", cls: "vehicle", conf: 0.89, from: 6, to: 20, speedKmh: 61,
      keys: [
        { t: 6, x: 104, y: 71, w: 17, h: 8.5 },
        { t: 11, x: 62, y: 71, w: 17, h: 8.5 },
        { t: 16, x: 18, y: 70, w: 16.5, h: 8.2 },
        { t: 20, x: -20, y: 70, w: 16, h: 8 },
      ],
      note: "SUV, near lane R→L",
    },
  ],

  /* c02 — rural road, single truck approaching + static gate attendant. */
  c02: [
    {
      id: "V-0871", cls: "vehicle", conf: 0.93, from: 0, to: 16, plate: "PB08 CB 4417", speedKmh: 32,
      keys: [
        { t: 0, x: 44, y: 54, w: 7, h: 4.5 },
        { t: 5, x: 41, y: 58, w: 12, h: 7 },
        { t: 10, x: 36, y: 62, w: 18, h: 10 },
        { t: 14, x: 28, y: 66, w: 24, h: 13 },
        { t: 16, x: -26, y: 68, w: 25, h: 13.5 },
      ],
      note: "Farm truck approaching gate",
    },
    {
      id: "P-1101", cls: "person", conf: 0.84, faceScore: 0.71, speedKmh: 0,
      keys: [{ t: 0, x: 73, y: 57, w: 4.8, h: 12 }, { t: 20, x: 73, y: 57, w: 4.8, h: 12 }],
      note: "Gate attendant, standing",
    },
  ],

  /* c03 — aerial night intersection. Small top-down vehicles on two axes. */
  c03: [
    {
      id: "V-3101", cls: "vehicle", conf: 0.88, speedKmh: 44,
      keys: [{ t: 0, x: 46, y: -8, w: 5, h: 3.2 }, { t: 10, x: 46, y: 52, w: 5, h: 3.2 }, { t: 20, x: 46, y: 108, w: 5, h: 3.2 }],
    },
    {
      id: "V-3102", cls: "vehicle", conf: 0.87, speedKmh: 41,
      keys: [{ t: 0, x: 56, y: 108, w: 5, h: 3.2 }, { t: 10, x: 56, y: 48, w: 5, h: 3.2 }, { t: 20, x: 56, y: -8, w: 5, h: 3.2 }],
    },
    {
      id: "V-3103", cls: "vehicle", conf: 0.9, speedKmh: 47,
      keys: [{ t: 0, x: 108, y: 44, w: 5.5, h: 3 }, { t: 10, x: 50, y: 44, w: 5.5, h: 3 }, { t: 20, x: -8, y: 44, w: 5.5, h: 3 }],
    },
    {
      id: "V-3104", cls: "vehicle", conf: 0.86, speedKmh: 39,
      keys: [{ t: 0, x: -8, y: 60, w: 5.5, h: 3 }, { t: 10, x: 52, y: 60, w: 5.5, h: 3 }, { t: 20, x: 108, y: 60, w: 5.5, h: 3 }],
    },
  ],

  /* c04 — ANPR lane, single blue pickup crossing slowly. */
  c04: [
    {
      id: "V-4401", cls: "vehicle", conf: 0.95, from: 0, to: 19, plate: "PB11 C 9021", speedKmh: 22,
      keys: [
        { t: 0, x: -24, y: 58, w: 20, h: 10 },
        { t: 8, x: 30, y: 60, w: 22, h: 11 },
        { t: 16, x: 88, y: 62, w: 23, h: 11.5 },
        { t: 19, x: 112, y: 62, w: 23, h: 11.5 },
      ],
      note: "Pickup, scan lane L→R",
    },
  ],

  /* c05 — dense fog, empty path. Accurate = no detections. */
  c05: [],

  /* c06 — static barbed-wire close-up. Accurate = no detections. */
  c06: [],

  /* c07 — parked vehicles by house + one walker. */
  c07: [
    {
      id: "V-5001", cls: "vehicle", conf: 0.92, plate: "HR26 DK 9031", speedKmh: 0,
      keys: [{ t: 0, x: 28, y: 60, w: 17, h: 9.5 }, { t: 20, x: 28, y: 60, w: 17, h: 9.5 }],
      note: "Parked pickup",
    },
    {
      id: "V-5002", cls: "vehicle", conf: 0.9, speedKmh: 0,
      keys: [{ t: 0, x: 56, y: 63, w: 14, h: 8 }, { t: 20, x: 56, y: 63, w: 14, h: 8 }],
      note: "Parked SUV",
    },
    {
      id: "P-5101", cls: "person", conf: 0.86, from: 2, to: 19, faceScore: 0.66, speedKmh: 5,
      keys: [
        { t: 2, x: -6, y: 66, w: 5.5, h: 13 },
        { t: 10, x: 40, y: 67, w: 5.5, h: 13 },
        { t: 18, x: 92, y: 68, w: 5.5, h: 13 },
        { t: 19, x: 104, y: 68, w: 5.5, h: 13 },
      ],
      note: "Walker crossing the yard",
    },
  ],

  /* c08 — low-angle pavement, legs/feet crossing. No faces visible. */
  c08: [
    {
      id: "P-6101", cls: "person", conf: 0.88, from: 0, to: 15, speedKmh: 4,
      keys: [
        { t: 0, x: -12, y: 28, w: 10, h: 62 },
        { t: 6, x: 30, y: 30, w: 11, h: 60 },
        { t: 12, x: 72, y: 30, w: 10, h: 60 },
        { t: 15, x: 105, y: 30, w: 10, h: 60 },
      ],
      note: "Legs L→R, low angle",
    },
    {
      id: "P-6102", cls: "person", conf: 0.86, from: 8, to: 20, speedKmh: 4,
      keys: [
        { t: 8, x: 105, y: 34, w: 9, h: 56 },
        { t: 14, x: 55, y: 34, w: 9, h: 56 },
        { t: 20, x: 5, y: 34, w: 9, h: 56 },
      ],
      note: "Legs R→L, low angle",
    },
  ],

  /* c09 — top-down B&W public space, small figures. */
  c09: [
    {
      id: "P-7001", cls: "person", conf: 0.82, speedKmh: 4,
      keys: [{ t: 0, x: 10, y: 20, w: 3.6, h: 5.2 }, { t: 10, x: 45, y: 35, w: 3.6, h: 5.2 }, { t: 20, x: 80, y: 50, w: 3.6, h: 5.2 }],
    },
    {
      id: "P-7002", cls: "person", conf: 0.84, speedKmh: 5,
      keys: [{ t: 0, x: 85, y: 15, w: 3.6, h: 5.2 }, { t: 10, x: 60, y: 40, w: 3.6, h: 5.2 }, { t: 20, x: 35, y: 65, w: 3.6, h: 5.2 }],
    },
    {
      id: "P-7003", cls: "person", conf: 0.81, speedKmh: 4,
      keys: [{ t: 0, x: 30, y: 90, w: 3.6, h: 5.2 }, { t: 10, x: 40, y: 55, w: 3.6, h: 5.2 }, { t: 20, x: 50, y: 20, w: 3.6, h: 5.2 }],
    },
    {
      id: "P-7004", cls: "person", conf: 0.83, speedKmh: 5,
      keys: [{ t: 0, x: 70, y: 85, w: 3.6, h: 5.2 }, { t: 10, x: 55, y: 60, w: 3.6, h: 5.2 }, { t: 20, x: 40, y: 35, w: 3.6, h: 5.2 }],
    },
    {
      id: "P-7005", cls: "person", conf: 0.79, speedKmh: 0,
      keys: [{ t: 0, x: 52, y: 48, w: 3.4, h: 5 }, { t: 20, x: 52, y: 48, w: 3.4, h: 5 }],
      note: "Standing figure",
    },
  ],

  /* c10 — street-level sidewalk, near + far pedestrians. */
  c10: [
    {
      id: "P-8101", cls: "person", conf: 0.89, from: 0, to: 18, faceScore: 0.58, speedKmh: 5,
      keys: [
        { t: 0, x: -8, y: 52, w: 7, h: 18 },
        { t: 10, x: 45, y: 54, w: 7.5, h: 19 },
        { t: 18, x: 100, y: 55, w: 7.5, h: 19 },
      ],
      note: "Near pedestrian L→R",
    },
    {
      id: "P-8102", cls: "person", conf: 0.87, from: 4, to: 20, faceScore: 0.55, speedKmh: 5,
      keys: [
        { t: 4, x: 105, y: 56, w: 6.5, h: 17 },
        { t: 12, x: 50, y: 56, w: 6.5, h: 17 },
        { t: 20, x: -5, y: 56, w: 6.5, h: 17 },
      ],
      note: "Near pedestrian R→L",
    },
    {
      id: "P-8103", cls: "person", conf: 0.81, speedKmh: 4,
      keys: [
        { t: 0, x: -6, y: 46, w: 4.5, h: 11 },
        { t: 12, x: 60, y: 47, w: 4.5, h: 11 },
        { t: 20, x: 100, y: 47, w: 4.5, h: 11 },
      ],
      note: "Far pedestrian L→R",
    },
  ],

  /* c11 — clear sky, single quad-rotor on a slow hover loop. */
  c11: [
    {
      id: "U-044", cls: "uas", conf: 0.93, speedKmh: 9,
      keys: [
        { t: 0, x: 48, y: 30, w: 7, h: 5 },
        { t: 5, x: 58, y: 27, w: 7, h: 5 },
        { t: 10, x: 52, y: 34, w: 7.2, h: 5.1 },
        { t: 15, x: 44, y: 32, w: 7, h: 5 },
        { t: 20, x: 48, y: 30, w: 7, h: 5 },
      ],
      note: "Quad-rotor hover circuit",
    },
  ],

  /* c12 — night dashcam. One oncoming car crosses mid-loop, then empty road. */
  c12: [
    {
      id: "V-9001", cls: "vehicle", conf: 0.88, from: 5, to: 13.5, speedKmh: 52,
      keys: [
        { t: 5, x: 47, y: 44, w: 3.5, h: 2.5 },
        { t: 8, x: 42, y: 50, w: 6, h: 4.5 },
        { t: 11, x: 30, y: 58, w: 11, h: 7 },
        { t: 13.5, x: 12, y: 66, w: 16, h: 10 },
      ],
      note: "Oncoming headlights, passes close",
    },
  ],
};

export const ANNOTATION_META: Record<string, { source: string; objects: number; note: string }> = {
  c01: { source: "manual", objects: 2, note: "2 lanes · opposite directions" },
  c02: { source: "manual", objects: 2, note: "1 approaching truck · 1 static attendant" },
  c03: { source: "manual", objects: 4, note: "Aerial intersection · 4 arms" },
  c04: { source: "manual", objects: 1, note: "Single pickup · scan lane" },
  c05: { source: "manual", objects: 0, note: "Fog-obscured · nothing verifiable" },
  c06: { source: "manual", objects: 0, note: "Static close-up · no subjects" },
  c07: { source: "manual", objects: 3, note: "2 parked · 1 walker" },
  c08: { source: "manual", objects: 2, note: "Low-angle legs · no faces" },
  c09: { source: "manual", objects: 5, note: "Top-down figures · no faces" },
  c10: { source: "manual", objects: 3, note: "Near + far pedestrians" },
  c11: { source: "manual", objects: 1, note: "Single UAS hover circuit" },
  c12: { source: "manual", objects: 1, note: "Oncoming car t=5–13.5s" },
};

export function annotationTime(tick: number) {
  return ((tick % ANNOTATION_LOOP) + ANNOTATION_LOOP) % ANNOTATION_LOOP;
}

function trailFor(script: AnnotatedScript, t: number, n = 12): [number, number][] {
  // Walk backwards from the current frame so a loop-wrap teleport breaks
  // the trail instead of streaking across the frame.
  const pts: [number, number][] = [];
  let prev: [number, number] | null = null;
  for (let k = 1; k <= n; k++) {
    const tt = (((t - k) % ANNOTATION_LOOP) + ANNOTATION_LOOP) % ANNOTATION_LOOP;
    if (!inWindow(script, tt)) break;
    const p = interp(script.keys, tt);
    const pt: [number, number] = [p.x + p.w / 2, p.y + p.h / 2];
    if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 22) break;
    pts.unshift(pt);
    prev = pt;
  }
  return pts;
}

export function getAnnotatedTracks(camId: string, tick: number): Tracked[] {
  const t = annotationTime(tick);
  const scripts = ANNOTATIONS[camId] ?? [];
  const out: Tracked[] = [];
  for (const s of scripts) {
    if (!inWindow(s, t)) continue;
    const p = interp(s.keys, t);
    const prev = interp(s.keys, Math.max(0, t - 0.5));
    const vx = (p.x - prev.x) * 2;
    const vy = (p.y - prev.y) * 2;
    const static_ = Math.hypot(vx, vy) < 0.05;
    const wobble = 0.008 * Math.sin(tick * 0.9 + (hash(s.id) % 6));
    const conf = clamp(s.conf + wobble, 0.3, 0.99);
    const footY = p.y + p.h;
    const { depthM, disparityPx, heightM } = depthFromFootY(camId, footY, p.w, p.h);
    const from = s.from ?? 0;
    const age = Math.floor(((t - from) % ANNOTATION_LOOP + ANNOTATION_LOOP) % ANNOTATION_LOOP);
    out.push({
      key: `man-${camId}-${s.id}`,
      id: s.id,
      cls: s.cls,
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      w: +p.w.toFixed(2),
      h: +p.h.toFixed(2),
      vx,
      vy,
      conf: +conf.toFixed(3),
      age,
      life: ANNOTATION_LOOP * 60,
      state: "track",
      trail: trailFor(s, t),
      plate: s.plate,
      faceScore: s.faceScore,
      speed: s.speedKmh ?? (static_ ? 0 : s.cls === "vehicle" ? Math.round(10 + Math.abs(vx) * 6) : s.cls === "uas" ? Math.round(4 + Math.hypot(vx, vy) * 4) : Math.round(2 + Math.abs(vx) * 2)),
      heading: static_ ? "–" : headingOf(vx, vy),
      depthM: +depthM.toFixed(1),
      disparityPx: +disparityPx.toFixed(1),
      heightM: +heightM.toFixed(2),
      manual: true,
    });
  }
  return out;
}
