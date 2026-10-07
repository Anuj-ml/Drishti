/*
 * Incident intelligence — cross-camera incident assembly and response planning.
 *
 * Two related models:
 *
 *   INCIDENT GRAPH   — relates separately-raised alerts into one evolving
 *                      incident: causal edges, identity edges, and object
 *                      custody transfers across cameras.
 *
 *   RESPONSE TWIN    — a planning surface over the same incident: projected
 *                      subject path, uncertainty growth, patrol geometry and
 *                      an earliest-feasible intercept solution.
 *
 * Coordinates on the planning map are in map units. `M_PER_UNIT` converts to
 * metres so the intercept maths is dimensionally honest.
 */

export type IncidentNodeType =
  | "uas"
  | "payload"
  | "person"
  | "vehicle"
  | "object"
  | "plate"
  | "location"
  | "system";

export type EdgeKind = "causal" | "identity" | "custody" | "spatial";

export type IncidentNode = {
  id: string;
  type: IncidentNodeType;
  lane: number;
  t: number; // seconds from incident start
  label: string;
  detail: string;
  cam: string;
  conf: number;
  evidence: string;
  meta: [string, string][];
};

export type IncidentEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  kind: EdgeKind;
  conf: number;
};

export type CustodyLink = {
  id: string;
  from: string;
  to: string;
  action: string;
  t: number;
  cam: string;
  conf: number;
  evidence: string;
};

export type IncidentLane = {
  key: string;
  label: string;
  layer: "air" | "ground" | "vehicle" | "c2";
  camera: string;
};

export type Incident = {
  id: string;
  ref: string;
  title: string;
  subtitle: string;
  severity: "critical" | "high" | "medium";
  startedAt: string;
  durationSec: number;
  sector: string;
  lanes: IncidentLane[];
  nodes: IncidentNode[];
  edges: IncidentEdge[];
  custody: CustodyLink[];
  summary: string[];
};

export const NODE_STYLE: Record<IncidentNodeType, { color: string; glyph: string; label: string }> = {
  uas: { color: "#f2c94c", glyph: "U", label: "Air object" },
  payload: { color: "#f2c94c", glyph: "P", label: "Payload" },
  person: { color: "#ef6c33", glyph: "P", label: "Person" },
  vehicle: { color: "#4d8dff", glyph: "V", label: "Vehicle" },
  object: { color: "#b58cf5", glyph: "O", label: "Object" },
  plate: { color: "#21b8a2", glyph: "#", label: "Plate read" },
  location: { color: "#d92d20", glyph: "L", label: "Location" },
  system: { color: "#0e6d61", glyph: "S", label: "Platform" },
};

export const EDGE_STYLE: Record<EdgeKind, { label: string; color: string; dash: string }> = {
  causal: { label: "caused", color: "#e4a72c", dash: "6 4" },
  identity: { label: "identifies", color: "#21b8a2", dash: "" },
  custody: { label: "custody", color: "#b58cf5", dash: "2 3" },
  spatial: { label: "moved to", color: "#8fa5a0", dash: "8 4" },
};

/* ──────────────────────────────────────────────────────────
   DEMONSTRATION INCIDENT
   One night, one drone drop, one pickup vehicle. Assembled by
   the platform from alerts raised on four separate cameras.
   ────────────────────────────────────────────────────────── */

export const DEMO_INCIDENT: Incident = {
  id: "INC-2026-0117",
  ref: "DEMO-INC-2026-0117-7C2A",
  title: "Air-drop to vehicle relay.",
  subtitle: "Aerial release, ground recovery and a departing pickup — assembled across five cameras as a single chain.",
  severity: "critical",
  startedAt: "2026-01-17 02:38:41 IST",
  durationSec: 190,
  sector: "Sector 4 · Punjab",
  lanes: [
    { key: "air", label: "AIRSPACE", layer: "air", camera: "BOP-11 / CAM-06" },
    { key: "drop", label: "DROP ZONE", layer: "ground", camera: "BOP-07 / CAM-01" },
    { key: "recovery", label: "RECOVERY", layer: "ground", camera: "BOP-07 / CAM-02" },
    { key: "vehicle", label: "VEHICLE", layer: "vehicle", camera: "CHK-12 / CAM-06" },
    { key: "c2", label: "COMMAND", layer: "c2", camera: "SITUATION ROOM" },
  ],
  nodes: [
    {
      id: "n1", type: "uas", lane: 0, t: 0,
      label: "UAS-044 detected",
      detail: "Small airborne track at 240 m AGL, 18 m/s on a holding pattern over the feeder corridor.",
      cam: "BOP-11 / CAM-06", conf: 0.93, evidence: "MP4 · 00:00–00:06",
      meta: [["Class", "Quad-rotor"], ["Altitude", "240 m AGL"], ["Speed", "18 m/s"], ["Trajectory", "Orbital / hold"]],
    },
    {
      id: "n2", type: "payload", lane: 0, t: 6,
      label: "Payload separation",
      detail: "Secondary descending track detached from the UAS. Ballistic projection computed from release vector.",
      cam: "BOP-11 / CAM-06", conf: 0.92, evidence: "MP4 · 00:06–00:11",
      meta: [["Release point", "31.4408 N / 74.4171 E"], ["Mass estimate", "0.8–1.4 kg"], ["Projection", "CEP 7.4 m"]],
    },
    {
      id: "n3", type: "location", lane: 1, t: 18,
      label: "DZ-04 auto-flagged",
      detail: "Ground intercept ellipse created from ballistic projection and pushed to the virtual-fence engine as a new exclusion zone.",
      cam: "BOP-07 / CAM-01", conf: 0.89, evidence: "GEOJSON · DZ-04",
      meta: [["Zone", "DZ-04"], ["Radius", "7.4 m"], ["Fence km", "13.2"], ["Auto-armed", "Yes"]],
    },
    {
      id: "n4", type: "person", lane: 1, t: 42,
      label: "Person P-42 enters",
      detail: "Single subject approached DZ-04 from the treeline side after a 24-second static hold.",
      cam: "BOP-07 / CAM-01", conf: 0.88, evidence: "MP4 · 00:42–01:08",
      meta: [["Track", "#P-42"], ["Dwell prior", "24 s"], ["Heading", "SE toward DZ-04"], ["Face quality", "Below FRS gate"]],
    },
    {
      id: "n5", type: "object", lane: 1, t: 68,
      label: "Object custody transfer",
      detail: "Segmentation-mask overlap between the dropped object and P-42 persisted 3.2 s through the pickup motion.",
      cam: "BOP-07 / CAM-01", conf: 0.84, evidence: "MP4 · 01:08–01:14",
      meta: [["Action", "Pickup"], ["Overlap duration", "3.2 s"], ["Object ID", "OBJ-118"], ["Confidence", "0.84"]],
    },
    {
      id: "n6", type: "vehicle", lane: 2, t: 104,
      label: "White pickup V-18",
      detail: "Light goods vehicle arrived at the recovery road and stopped 40 m from the drop point with lights off.",
      cam: "BOP-07 / CAM-02", conf: 0.91, evidence: "MP4 · 01:44–02:12",
      meta: [["Track", "#V-18"], ["Class", "Light goods / pickup"], ["Colour", "White"], ["Stopped", "40 m from DZ-04"]],
    },
    {
      id: "n7", type: "object", lane: 2, t: 126,
      label: "Payload loaded",
      detail: "Custody passed from P-42 to V-18 at the load bed. Object embedding matched across the two camera views.",
      cam: "BOP-07 / CAM-02", conf: 0.86, evidence: "MP4 · 02:06–02:14",
      meta: [["Action", "Load"], ["Custody", "P-42 → V-18"], ["Match method", "Object embedding"], ["Occlusion", "Partial, reacquired"]],
    },
    {
      id: "n8", type: "plate", lane: 3, t: 143,
      label: "PB08 CB 4417",
      detail: "Plate read at the scan lane. Matches lookout register entry from case 118/24 at 0.91 confidence.",
      cam: "CHK-12 / CAM-06", conf: 0.91, evidence: "IMG · plate crop",
      meta: [["Plate", "PB08 CB 4417"], ["State", "Punjab"], ["Registry", "Watchlist / Lookout"], ["OCR", "0.94"]],
    },
    {
      id: "n9", type: "vehicle", lane: 3, t: 151,
      label: "Departure vector",
      detail: "V-18 exited the scan lane eastbound at 38 km/h. Direction consistent with the feeder corridor toward the district road.",
      cam: "CHK-12 / CAM-04", conf: 0.87, evidence: "MP4 · 02:31–02:42",
      meta: [["Heading", "E / 078°"], ["Speed", "38 km/h"], ["Occupants", "2"], ["Route", "Feeder corridor"]],
    },
    {
      id: "n10", type: "system", lane: 4, t: 178,
      label: "Incident assembled",
      detail: "Nine observations from five cameras resolved into one incident graph. Custody chain complete; no orphan alerts remain.",
      cam: "INCIDENT GRAPH", conf: 0.99, evidence: "GRAPH · 11 nodes / 10 relations",
      meta: [["Observations", "9"], ["Graph nodes", "11"], ["Relations", "10"], ["Cameras", "5"]],
    },
    {
      id: "n11", type: "system", lane: 4, t: 182,
      label: "Intercept plan ready",
      detail: "Response twin solved an earliest-feasible intercept against Patrol Alpha-2 and issued a tasking recommendation.",
      cam: "RESPONSE TWIN", conf: 0.95, evidence: "PLAN · 1 route / 3 options",
      meta: [["Intercept", "Gate 6 culvert"], ["QRT", "Alpha-2"], ["Margin", "+35 s"], ["Confidence", "0.82"]],
    },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2", relation: "released", kind: "causal", conf: 0.92 },
    { id: "e2", from: "n2", to: "n3", relation: "projected to", kind: "spatial", conf: 0.89 },
    { id: "e3", from: "n3", to: "n4", relation: "approach at", kind: "causal", conf: 0.88 },
    { id: "e4", from: "n4", to: "n5", relation: "picked up", kind: "custody", conf: 0.84 },
    { id: "e5", from: "n4", to: "n6", relation: "approached", kind: "causal", conf: 0.87 },
    { id: "e6", from: "n5", to: "n7", relation: "carried into", kind: "custody", conf: 0.86 },
    { id: "e7", from: "n6", to: "n8", relation: "identified by", kind: "identity", conf: 0.91 },
    { id: "e8", from: "n6", to: "n9", relation: "departed", kind: "causal", conf: 0.87 },
    { id: "e9", from: "n9", to: "n11", relation: "triggered", kind: "causal", conf: 0.95 },
    { id: "e10", from: "n5", to: "n10", relation: "linked in", kind: "causal", conf: 0.99 },
  ],
  custody: [
    {
      id: "c1", from: "UAS-044", to: "GROUND / DZ-04", action: "Release",
      t: 6, cam: "BOP-11 / CAM-06", conf: 0.92, evidence: "Ballistic projection, CEP 7.4 m",
    },
    {
      id: "c2", from: "GROUND / DZ-04", to: "PERSON P-42", action: "Pickup",
      t: 68, cam: "BOP-07 / CAM-01", conf: 0.84, evidence: "Mask overlap 3.2 s through pickup motion",
    },
    {
      id: "c3", from: "PERSON P-42", to: "VEHICLE V-18", action: "Load",
      t: 126, cam: "BOP-07 / CAM-02", conf: 0.86, evidence: "Object embedding re-acquired across cameras",
    },
    {
      id: "c4", from: "VEHICLE V-18", to: "ROUTING / feeder corridor", action: "Depart",
      t: 151, cam: "CHK-12 / CAM-04", conf: 0.87, evidence: "Departure vector 078°, 38 km/h",
    },
  ],
  summary: [
    "An unmanned aircraft held position over the feeder corridor, released a payload, and departed.",
    "A single subject approached the projected drop zone after a static hold and removed the object.",
    "The object was transferred to a white pickup 40 metres away and the vehicle departed eastbound.",
    "The plate matches a lookout register entry. Four cameras produced one incident, not four alerts.",
  ],
};

/* ──────────────────────────────────────────────────────────
   RESPONSE TWIN
   ────────────────────────────────────────────────────────── */

export type MapPoint = [number, number];
export type GeoPoint = [number, number]; // [latitude, longitude]

export const M_PER_UNIT = 2.4;
export const MAP_ANCHOR: GeoPoint = [31.4408, 74.4171];

// Georeference the illustrative response geometry around a real OSM area.
// These are NOT surveyed BOP positions; keep that distinction visible in UI.
export function mapPointToGeo([x, y]: MapPoint): GeoPoint {
  const latitude = MAP_ANCHOR[0] - ((y - MAP.height / 2) * M_PER_UNIT) / 111_320;
  const longitude = MAP_ANCHOR[1] +
    ((x - MAP.width / 2) * M_PER_UNIT) / (111_320 * Math.cos((MAP_ANCHOR[0] * Math.PI) / 180));
  return [latitude, longitude];
}

export const MAP = {
  width: 1200,
  height: 720,
  terrain: [
    "M0 0 H1200 V720 H0 Z",
    "M0 120 C 180 96, 320 168, 470 150 S 760 92, 980 132 L 1200 118 V0 H0 Z",
    "M0 720 L0 604 C 150 588, 290 640, 420 622 S 700 578, 900 612 L 1200 598 V720 Z",
    "M760 214 C 812 198, 902 210, 968 236 S 1082 292, 1200 282 L 1200 392 C 1074 402, 968 372, 882 344 S 776 288, 760 214 Z",
  ],
  roads: [
    { id: "r1", d: "M-10 468 C 160 452, 300 486, 452 462 S 738 398, 922 372 L 1210 352", label: "Feeder corridor" },
    { id: "r2", d: "M286 720 C 300 640, 328 560, 372 500 S 432 424, 462 372", label: "Patrol track" },
    { id: "r3", d: "M922 372 C 986 322, 1044 252, 1102 148", label: "District road" },
    { id: "r4", d: "M452 462 C 512 494, 596 512, 682 508 S 842 482, 916 452", label: "Canal embankment" },
  ],
  fence: "M40 322 C 182 304, 292 338, 402 322 S 638 272, 782 288 S 1044 336, 1180 316",
  cameras: [
    { id: "c06", code: "BOP-11 / CAM-06", pos: [206, 214] as MapPoint, angle: 118, fov: 46 },
    { id: "c01", code: "BOP-07 / CAM-01", pos: [452, 372] as MapPoint, angle: 24, fov: 54 },
    { id: "c02", code: "BOP-07 / CAM-02", pos: [716, 396] as MapPoint, angle: 262, fov: 50 },
    { id: "c04", code: "CHK-12 / CAM-06", pos: [922, 372] as MapPoint, angle: 28, fov: 58 },
    { id: "c03", code: "CHK-12 / CAM-04", pos: [990, 402] as MapPoint, angle: 195, fov: 44 },
  ],
  sites: [
    { id: "bop11", name: "BOP-11", pos: [168, 258] as MapPoint },
    { id: "bop07", name: "BOP-07", pos: [512, 336] as MapPoint },
    { id: "chk12", name: "CHK-12", pos: [878, 336] as MapPoint },
    { id: "gate6", name: "Gate 6", pos: [820, 428] as MapPoint },
    { id: "dz04", name: "DZ-04", pos: [494, 424] as MapPoint },
  ],
};

export type ResponseSubject = {
  id: string;
  label: string;
  position: MapPoint;
  heading: string;
  speedKmh: number;
  trackHistory: MapPoint[];
  projectedPath: MapPoint[];
  uncertaintyM: number;
  growthPerSec: number;
};

export type ResponsePatrol = {
  id: string;
  callsign: string;
  position: MapPoint;
  speedKmh: number;
  strength: string;
  role: string;
  routeName: string;
};

export type InterceptPlan = {
  point: MapPoint;
  pointName: string;
  etaSubjectSec: number;
  etaPatrolSec: number;
  marginSec: number;
  distanceM: number;
  uncertaintyAtInterceptM: number;
  probability: number;
  routeName: string;
  standoffM: number;
  feasible: boolean;
};

export const SUBJECT: ResponseSubject = {
  id: "V-18",
  label: "White pickup V-18 · PB08 CB 4417",
  position: [492, 458],
  heading: "E / 078°",
  speedKmh: 38,
  trackHistory: [
    [352, 496], [382, 486], [414, 476], [448, 470], [474, 462], [492, 458],
  ],
  projectedPath: [
    [492, 458], [548, 442], [612, 424], [676, 408], [742, 396], [812, 384], [882, 374], [956, 364], [1032, 358], [1120, 352],
  ],
  uncertaintyM: 42,
  growthPerSec: 1.15,
};

export const PATROLS: ResponsePatrol[] = [
  {
    id: "A-2", callsign: "Patrol Alpha-2", position: [300, 596],
    speedKmh: 52, strength: "QRT · 6 + tracker dog", role: "Intercept",
    routeName: "Patrol track → Gate 6",
  },
  {
    id: "B-1", callsign: "Patrol Bravo-1", position: [612, 604],
    speedKmh: 46, strength: "Section · 8", role: "Containment",
    routeName: "Canal embankment",
  },
  {
    id: "C-3", callsign: "Post Charlie-3", position: [1044, 268],
    speedKmh: 34, strength: "Check post · 4", role: "Block",
    routeName: "District road",
  },
];

export const INTERCEPT_OPTIONS = [
  { id: "gate6", name: "Gate 6 culvert", point: [812, 384] as MapPoint, note: "Choke point on the feeder corridor" },
  { id: "emb", name: "Canal embankment", point: [612, 424] as MapPoint, note: "Fast approach, limited cover" },
  { id: "chk", name: "District road junction", point: [956, 364] as MapPoint, note: "Longest lead time, firm ground" },
];

/* ── Intercept solver ─────────────────────────────────────
   Earliest feasible intercept: walk the subject's projected
   path accumulating distance, and find the first point at
   which the patrol can arrive before (or with enough margin
    against) the subject. Straight-line patrol distance is a lower
    bound on travel time and therefore an optimistic planning estimate.
   ────────────────────────────────────────────────────────── */

export function computeIntercept(
  subject: ResponseSubject,
  patrol: ResponsePatrol,
  opts: { standoffM: number; targetPoint?: MapPoint; pointName?: string; routeName?: string },
): InterceptPlan | null {
  const subjectMs = Math.max(0.5, subject.speedKmh / 3.6);
  const patrolMs = Math.max(0.5, patrol.speedKmh / 3.6);
  const path = subject.projectedPath;
  if (path.length < 2) return null;

  let accumulated = 0;

  const evaluate = (point: MapPoint, distanceM: number, pointName: string): InterceptPlan => {
    const subjectDist = distanceM + opts.standoffM;
    const patrolDist = Math.hypot(point[0] - patrol.position[0], point[1] - patrol.position[1]) * M_PER_UNIT + opts.standoffM;
    const etaSubject = subjectDist / subjectMs;
    const etaPatrol = patrolDist / patrolMs;
    const margin = etaSubject - etaPatrol;
    const uncertainty = subject.uncertaintyM + subject.growthPerSec * etaSubject;
    // This is a relative planning score, not a calibrated probability.
    const score = Math.max(0.12, Math.min(0.97, 1 - uncertainty / (Math.max(0, margin) * subjectMs * .4 + uncertainty + 1)));
    return {
      point: [point[0], point[1]],
      pointName,
      etaSubjectSec: etaSubject,
      etaPatrolSec: etaPatrol,
      marginSec: margin,
      distanceM: subjectDist,
      uncertaintyAtInterceptM: uncertainty,
      probability: margin >= 0 ? score : .12,
      routeName: opts.routeName ?? patrol.routeName,
      standoffM: opts.standoffM,
      feasible: margin >= 0,
    };
  };

  if (opts.targetPoint) {
    // Project the nominated location onto the subject's path and measure
    // *along* that path. A target off the corridor is not a valid intercept.
    let closest = { offset: Infinity, along: 0 };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const projection = Math.max(0, Math.min(1,
        ((opts.targetPoint[0] - a[0]) * dx + (opts.targetPoint[1] - a[1]) * dy) / (length * length),
      ));
      const px = a[0] + dx * projection;
      const py = a[1] + dy * projection;
      const offset = Math.hypot(opts.targetPoint[0] - px, opts.targetPoint[1] - py);
      if (offset < closest.offset) closest = { offset, along: accumulated + projection * length * M_PER_UNIT };
      accumulated += length * M_PER_UNIT;
    }
    const result = evaluate(opts.targetPoint, closest.along, opts.pointName ?? "Nominated point");
    if (closest.offset > 35) return { ...result, feasible: false, probability: .12 };
    return result;
  }

  for (let i = 1; i < path.length; i++) {
    const segLen = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) * M_PER_UNIT;
    accumulated += segLen;
    const candidate = evaluate(path[i], accumulated, opts.pointName ?? `Corridor waypoint ${i}`);
    if (candidate.feasible) return candidate;
  }

  // Show an honest non-viable plan at the path limit rather than a null state.
  return evaluate(path[path.length - 1], accumulated, opts.pointName ?? "Path limit");
}

/** Closed polygon around the projected path, with radius growing along it. */
export function uncertaintyConePoints(path: MapPoint[], startRadius: number, growthPerUnit: number): MapPoint[] {
  if (path.length < 2) return [];
  const left: MapPoint[] = [];
  const right: MapPoint[] = [];
  let travelled = 0;
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    if (i > 0) travelled += Math.hypot(x - path[i - 1][0], y - path[i - 1][1]);
    const dx = i < path.length - 1 ? path[i + 1][0] - x : x - path[i - 1][0];
    const dy = i < path.length - 1 ? path[i + 1][1] - y : y - path[i - 1][1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const r = startRadius + travelled * growthPerUnit;
    left.push([x + nx * r, y + ny * r]);
    right.push([x - nx * r, y - ny * r]);
  }
  return [...left, ...right.reverse()];
}

/** SVG path retained for consumers that render in local map coordinates. */
export function uncertaintyCone(path: MapPoint[], startRadius: number, growthPerUnit: number): string {
  const points = uncertaintyConePoints(path, startRadius, growthPerUnit);
  return points.length ? `M${points.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")} Z` : "";
}

export function routePath(points: MapPoint[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
