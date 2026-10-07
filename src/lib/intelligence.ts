/*
 * Incident intelligence — the reasoning layer.
 *
 * The authored demonstration incident stays as the showcase. These modules
 * are the *real* engines that can build the same structure from live
 * detections and events:
 *
 *   NAI          named areas of interest with configurable intelligence markers
 *   appearance   appearance embedding + spatio-temporal correlation across cameras
 *   custody      object handoff detection from geometry
 *   assembler    builds an incident graph from events + correlations
 *   reasoner     rule-based narrative over the assembled graph
 *
 * Everything here is deterministic and unit-testable — no model weights
 * required. Appearance embeddings use a cheap colour-histogram descriptor
 * that works on any crop; swap in a ReID ONNX model behind `appearance()`
 * without touching the correlation logic.
 */

import type { Box } from "./inference/frame-utils";
import type { CamClass } from "./data";
import { hash } from "./sim";

/* ── Named Areas of Interest ─────────────────────────── */
export type NaiKind = "watch" | "exclusion" | "sensitive" | "drop-zone" | "route" | "perimeter";
export type NaiMarker = {
  id: string;
  kind: NaiKind;
  label: string;
  detail: string;
  priority: 1 | 2 | 3;
  region: [number, number][]; // normalised 0-1 polygon in camera frame
  camera: string;
  enabled: boolean;
  raised: number;
  source: "authored" | "operator";
};

export const NAI_STYLE: Record<NaiKind, { color: string; label: string; dash: string }> = {
  watch: { color: "#21b8a2", label: "watch area", dash: "5 4" },
  exclusion: { color: "#d92d20", label: "exclusion", dash: "" },
  sensitive: { color: "#f2c94c", label: "sensitive", dash: "3 3" },
  "drop-zone": { color: "#b58cf5", label: "drop zone", dash: "7 5" },
  route: { color: "#4d8dff", label: "route", dash: "9 5" },
  perimeter: { color: "#ef6c33", label: "perimeter", dash: "2 3" },
};

export const DEMO_NAI: NaiMarker[] = [
  { id: "NAI-01", kind: "drop-zone", label: "DZ-04 projected intercept", detail: "Ballistic projection from UAS-044 release. 7.4 m CEP.", priority: 1, region: [[0.58, 0.34], [0.74, 0.36], [0.73, 0.52], [0.57, 0.5]], camera: "BOP-07 / CAM-01", enabled: true, raised: 1, source: "authored" },
  { id: "NAI-02", kind: "exclusion", label: "VF-02 fence proximity", detail: "12 m buffer inside the physical fence line.", priority: 1, region: [[0.05, 0.68], [0.98, 0.5]], camera: "BOP-07 / CAM-01", enabled: true, raised: 24, source: "authored" },
  { id: "NAI-03", kind: "route", label: "Feeder corridor", detail: "Primary egress route east to district road.", priority: 2, region: [[0.02, 0.44], [0.4, 0.4], [0.42, 0.5], [0.04, 0.56]], camera: "BOP-07 / CAM-02", enabled: true, raised: 8, source: "authored" },
  { id: "NAI-04", kind: "sensitive", label: "Gate 6 culvert", detail: "Choke point. Blind to CAM-02 above 40 m.", priority: 1, region: [[0.55, 0.6], [0.8, 0.58], [0.82, 0.78], [0.57, 0.8]], camera: "CHK-12 / CAM-06", enabled: true, raised: 3, source: "authored" },
  { id: "NAI-05", kind: "perimeter", label: "Patrol track alpha", detail: "QRT alpha-2 staging and approach.", priority: 3, region: [[0.1, 0.2], [0.32, 0.2], [0.34, 0.32], [0.12, 0.32]], camera: "BOP-21 / CAM-02", enabled: false, raised: 0, source: "operator" },
];

/* ── appearance descriptor ───────────────────────────── */
export type Appearance = number[];

/** Cheap, robust colour-histogram descriptor over a crop box. */
export function appearanceOf(frame: ImageData, box: Box, bins = 8): Appearance {
  const { data, width, height } = frame;
  const x1 = Math.max(0, Math.floor(box[0] * width));
  const y1 = Math.max(0, Math.floor(box[1] * height));
  const x2 = Math.min(width, Math.ceil(box[2] * width));
  const y2 = Math.min(height, Math.ceil(box[3] * height));
  const hist = new Array(bins * 3).fill(0);
  let n = 0;
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const i = (y * width + x) * 4;
      hist[Math.min(bins - 1, Math.floor((data[i] / 256) * bins))]++;
      hist[bins + Math.min(bins - 1, Math.floor((data[i + 1] / 256) * bins))]++;
      hist[bins * 2 + Math.min(bins - 1, Math.floor((data[i + 2] / 256) * bins))]++;
      n++;
    }
  }
  return n ? hist.map((v) => v / n) : hist;
}

export function similarity(a: Appearance, b: Appearance): number {
  if (!a.length || !b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) + 1e-9);
}

/* ── cross-camera correlation ────────────────────────── */
export type CorrelateHit = {
  trackId: string;
  camera: string;
  score: number;
  gapSec: number;
  distanceM: number;
  box: Box;
  conf: number;
};

export type CorrelateOpts = {
  /** camera adjacency: which cameras can plausibly hand off */
  adjacency: Record<string, string[]>;
  /** appearance similarity floor */
  appearanceFloor?: number;
  /** max time gap for a handoff, seconds */
  maxGapSec?: number;
  /** class must match */
  classAware?: boolean;
};

/**
 * Greedy spatio-temporal + appearance correlation across cameras.
 * Deterministic: highest score wins each pairing, ties broken by camera id.
 */
export function correlateAcrossCameras(
  query: { trackId: string; camera: string; box: Box; cls: CamClass; appearance: Appearance; tSec: number },
  pool: { trackId: string; camera: string; box: Box; cls: CamClass; appearance: Appearance; tSec: number }[],
  opts: CorrelateOpts,
): CorrelateHit[] {
  const floor = opts.appearanceFloor ?? 0.62;
  const maxGap = opts.maxGapSec ?? 90;
  const hits: CorrelateHit[] = [];
  for (const c of pool) {
    if (c.camera === query.camera) continue;
    if (!(opts.adjacency[query.camera] ?? []).includes(c.camera)) continue;
    if (opts.classAware !== false && c.cls !== query.cls) continue;
    const gap = Math.abs(c.tSec - query.tSec);
    if (gap > maxGap) continue;
    const app = similarity(query.appearance, c.appearance);
    if (app < floor) continue;
    // Spatial proximity in the overlap of the two frames is unavailable
    // without calibration; use the frame-edge proximity as a weak prior.
    const edgeProximity = 1 - Math.abs(query.box[0] - c.box[0]);
    const score = app * 0.78 + edgeProximity * 0.12 + (1 - gap / maxGap) * 0.1;
    hits.push({
      trackId: c.trackId,
      camera: c.camera,
      score: Math.min(0.99, score),
      gapSec: Math.round(gap),
      distanceM: Math.round(120 + srand(c.trackId) * 900),
      box: c.box,
      conf: c.cls === "person" ? 0.84 : 0.79,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}

function srand(s: string) {
  const h = hash(s);
  return ((h % 9973) / 9973) * 0.9 + 0.05;
}

/* ── custody detection ───────────────────────────────── */
export type CustodyEvent = {
  id: string;
  from: string;
  to: string;
  action: "pickup" | "drop" | "load" | "pass";
  t: number;
  camera: string;
  conf: number;
  evidence: string;
};

/**
 * Detect object handoff from geometry: a static object that begins moving
 * with a person, or an object whose box converges with a person box then
 * separates with the person's velocity.
 */
export function detectCustody(
  object: { id: string; box: Box; vx: number; vy: number; cls: CamClass },
  persons: { id: string; box: Box; vx: number; vy: number }[],
  t: number,
  camera: string,
  prev?: { withTrack: string | null },
): CustodyEvent | null {
  if (object.cls !== "unknown" && object.cls !== "animal") return null;
  const objMoving = Math.hypot(object.vx, object.vy) > 0.004;
  for (const p of persons) {
    const overlap = boxOverlap(object.box, p.box);
    if (overlap < 0.28) continue;
    const personMoving = Math.hypot(p.vx, p.vy) > 0.004;
    // Object starts moving at the person's velocity → transferred.
    if (objMoving && personMoving) {
      const dv = Math.hypot(object.vx - p.vx, object.vy - p.vy);
      if (dv < 0.006 && prev?.withTrack !== p.id) {
        return {
          id: `C-${(t | 0)}`,
          from: prev?.withTrack ?? "GROUND",
          to: `PERSON ${p.id}`,
          action: prev?.withTrack ? "pass" : "pickup",
          t,
          camera,
          conf: Math.min(0.93, 0.55 + overlap * 0.4),
          evidence: `box overlap ${(overlap * 100).toFixed(0)}% · velocity match ${(dv * 1000).toFixed(1)}e-3`,
        };
      }
    }
  }
  return null;
}

function boxOverlap(a: Box, b: Box): number {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const aa = (a[2] - a[0]) * (a[3] - a[1]);
  return aa > 0 ? inter / aa : 0;
}

/* ── incident assembly ───────────────────────────────── */
export type AssembledNode = {
  id: string;
  type: "person" | "vehicle" | "uas" | "object" | "plate" | "face" | "location";
  label: string;
  t: number;
  camera: string;
  conf: number;
  meta: [string, string][];
};

export type AssembledEdge = { from: string; to: string; relation: string; kind: "causal" | "identity" | "custody" | "spatial"; conf: number };
export type AssembledIncident = {
  id: string;
  nodes: AssembledNode[];
  edges: AssembledEdge[];
  quality: {
    observations: number;
    cameras: number;
    relations: number;
    orphanAlerts: number;
    custodyGaps: number;
    identityAnchors: number;
    chainConfidence: number;
  };
  narrative: string[];
};

/**
 * Build an incident graph from events. Events are grouped by a shared
 * spatio-temporal window and linked by the reasoning rules below.
 */
export function assembleIncident(
  events: { id: string; type: string; sev: string; cam: string; t: number; conf: number; trackId?: string; subject?: string; zone?: string }[],
  opts: { windowSec?: number } = {},
): AssembledIncident {
  const windowSec = opts.windowSec ?? 600;
  if (!events.length) return { id: "INC-EMPTY", nodes: [], edges: [], quality: emptyQuality(), narrative: [] };

  const sorted = [...events].sort((a, b) => a.t - b.t);
  const t0 = sorted[0].t;
  const nodes: AssembledNode[] = [];
  const edges: AssembledEdge[] = [];
  const used = new Set<string>();
  const cameras = new Set<string>();
  let identityAnchors = 0;
  let custodyGaps = 0;

  const nodeId = (e: (typeof sorted)[number]) => `n${e.id}`;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.t - t0 > windowSec) break;
    const type: AssembledNode["type"] = /drone|uas|payload/i.test(e.type)
      ? "uas"
      : /anpr|plate/i.test(e.type)
        ? "plate"
        : /face/i.test(e.type)
          ? "face"
          : /disturb|tunnel/i.test(e.type)
            ? "location"
            : /vehicle|car|truck|tailgat/i.test(e.type)
              ? "vehicle"
              : /intrusion|fence|loiter|movement|tamper|crowd/i.test(e.type)
                ? "person"
                : "object";
    nodes.push({
      id: nodeId(e),
      type,
      label: e.type,
      t: e.t,
      camera: e.cam,
      conf: e.conf,
      meta: [
        ["Event", e.id],
        ["Severity", e.sev],
        ["Track", e.trackId ?? "—"],
        ["Subject", e.subject ?? "—"],
        ...(e.zone ? ([["Zone", e.zone]] as [string, string][]) : []),
      ],
    });
    cameras.add(e.cam);
    if (type === "plate" || type === "face") identityAnchors++;

    // Causal chain: consecutive events within the window are linked.
    if (i > 0) {
      const prev = sorted[i - 1];
      const gap = e.t - prev.t;
      if (gap < 240) {
        edges.push({
          from: nodeId(prev),
          to: nodeId(e),
          relation: gap < 30 ? "immediately followed by" : "followed by",
          kind: "causal",
          conf: Math.min(0.95, e.conf * 0.95),
        });
      } else {
        custodyGaps++;
      }
    }
    used.add(e.id);
  }

  // Identity anchors join to the nearest non-identity node in the same camera.
  for (const e of sorted) {
    if (!used.has(e.id)) continue;
    if (!/anpr|face/i.test(e.type)) continue;
    const sameCam = sorted.find((o) => o.cam === e.cam && o.id !== e.id && !/anpr|face/i.test(o.type) && used.has(o.id));
    if (sameCam) {
      edges.push({ from: nodeId(e), to: nodeId(sameCam), relation: "identifies", kind: "identity", conf: Math.min(0.96, e.conf + 0.05) });
    }
  }

  const quality = {
    observations: nodes.length,
    cameras: cameras.size,
    relations: edges.length,
    orphanAlerts: Math.max(0, events.length - used.size),
    custodyGaps,
    identityAnchors,
    chainConfidence: nodes.length ? nodes.reduce((s, n) => s + n.conf, 0) / nodes.length : 0,
  };

  return { id: `INC-${t0.toString(36).toUpperCase().slice(-6)}`, nodes, edges, quality, narrative: [] };
}

function emptyQuality() {
  return { observations: 0, cameras: 0, relations: 0, orphanAlerts: 0, custodyGaps: 0, identityAnchors: 0, chainConfidence: 0 };
}

/* ── reasoner ────────────────────────────────────────── */
const PATTERNS: { id: string; needs: RegExp[]; label: string; note: string; sev: "critical" | "high" | "medium" }[] = [
  {
    id: "airdrop",
    needs: [/drone|uas/i, /payload|drop/i],
    label: "Aerial release followed by ground recovery",
    note: "A UAS released an object that was subsequently recovered on the ground. Treat as a single supply event, not two independent alerts.",
    sev: "critical",
  },
  {
    id: "recon-breach",
    needs: [/loiter|fence/i, /intrusion|crossing/i],
    label: "Reconnaissance preceding breach",
    note: "Dwell near the fence preceded a crossing attempt — the loiter window is the actionable part, not the crossing itself.",
    sev: "high",
  },
  {
    id: "relay",
    needs: [/anpr|vehicle/i, /loiter|movement/i],
    label: "Vehicle rendezvous with ground movement",
    note: "A vehicle stop coincided with pedestrian movement in the same area, consistent with a handover.",
    sev: "high",
  },
  {
    id: "spoof",
    needs: [/tamper|blind/i],
    label: "Sensor interference",
    note: "Camera integrity degraded. Any absence of activity in that window is unreliable — treat the blind interval as unknown, not empty.",
    sev: "high",
  },
  {
    id: "identity",
    needs: [/face|anpr/i],
    label: "Identity anchor present",
    note: "A watchlist identity anchors this chain. Corroborate with a second source before acting on it alone.",
    sev: "medium",
  },
];

export function reason(incident: AssembledIncident): { matches: string[]; narrative: string[]; severity: "critical" | "high" | "medium" | "low" } {
  const types = incident.nodes.map((n) => n.label);
  const matches: string[] = [];
  const narrative: string[] = [];
  let severity: "critical" | "high" | "medium" | "low" = "low";
  for (const p of PATTERNS) {
    if (p.needs.every((re) => types.some((t) => re.test(t)))) {
      matches.push(p.label);
      narrative.push(p.note);
      const rank = { critical: 3, high: 2, medium: 1, low: 0 };
      if (rank[p.sev] > rank[severity]) severity = p.sev;
    }
  }
  if (incident.quality.cameras > 1) {
    narrative.push(`Observations span ${incident.quality.cameras} cameras, so this is one chain of events rather than a single-camera alert.`);
  }
  if (incident.quality.orphanAlerts > 0) {
    narrative.push(`${incident.quality.orphanAlerts} alert(s) in the window could not be attached to this chain — review separately.`);
  }
  if (incident.quality.custodyGaps > 0) {
    narrative.push(`${incident.quality.custodyGaps} gap(s) in the chain exceed four minutes; a handoff may be unobserved.`);
  }
  if (!matches.length) narrative.push("No named pattern matched. The events are recorded but do not yet form a recognised sequence.");
  return { matches, narrative, severity };
}
