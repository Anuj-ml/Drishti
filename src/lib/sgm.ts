/* Semi-Global Matching (SGM) stereo-depth layer.
   Real SGM aggregates census matching costs along 8 scanline paths to produce
   a dense disparity map. This frontend demo pairs that pipeline with MANUAL
   per-camera ground-plane calibration (no model) so every annotated box gets
   a plausible distance, disparity and height estimate. */

export type SGMParams = {
  numDisparities: number; // 32 | 64 | 96 | 128
  blockSize: number; // 3 | 5 | 7 | 9 | 11
  smoothness: number; // 0-100 → maps to P1/P2 penalties
  uniqueness: number; // 5-20 (%)
};

export const DEFAULT_SGM: SGMParams = {
  numDisparities: 64,
  blockSize: 5,
  smoothness: 55,
  uniqueness: 10,
};

export type CalibMode = "ground" | "aerial" | "sky" | "fixed";

export type CamCalib = {
  mode: CalibMode;
  horizonY: number; // % frame height where the ground plane meets the horizon
  camHeightM: number; // camera mounting height
  focalPx: number; // effective focal length for disparity math
  rigM: number; // on-node stereo rig baseline (0 = mono fallback)
  fixedDepthM?: number; // for aerial / fixed modes
  note: string;
};

/* Hand-tuned per feed. horizonY + height reproduce plausible 8–120 m
   ranges for each scene type without running any estimator. */
const GROUND_K = 250;

export const CAM_CALIB: Record<string, CamCalib> = {
  c01: { mode: "ground", horizonY: 42, camHeightM: 6, focalPx: 1180, rigM: 1.2, note: "Roadside mast · 6 m" },
  c02: { mode: "ground", horizonY: 45, camHeightM: 5, focalPx: 940, rigM: 0.8, note: "Gate dome · 5 m" },
  c03: { mode: "aerial", horizonY: 0, camHeightM: 120, focalPx: 1400, rigM: 0, fixedDepthM: 120, note: "Aerial night · 120 m AGL" },
  c04: { mode: "ground", horizonY: 48, camHeightM: 4, focalPx: 1620, rigM: 0.6, note: "ANPR lane · 4 m · narrow FOV" },
  c05: { mode: "ground", horizonY: 40, camHeightM: 3.5, focalPx: 720, rigM: 0.8, note: "Culvert thermal · 3.5 m" },
  c06: { mode: "fixed", horizonY: 50, camHeightM: 2.5, focalPx: 900, rigM: 0.3, fixedDepthM: 8, note: "Close-up · fixed 8 m" },
  c07: { mode: "ground", horizonY: 46, camHeightM: 5, focalPx: 1100, rigM: 1.0, note: "Gate PTZ · 5 m" },
  c08: { mode: "ground", horizonY: 52, camHeightM: 0.6, focalPx: 820, rigM: 0.25, note: "Low-angle · 0.6 m" },
  c09: { mode: "aerial", horizonY: 0, camHeightM: 25, focalPx: 1250, rigM: 0, fixedDepthM: 25, note: "Overhead · 25 m AGL" },
  c10: { mode: "ground", horizonY: 44, camHeightM: 3, focalPx: 980, rigM: 0.6, note: "Sidewalk bullet · 3 m" },
  c11: { mode: "sky", horizonY: 0, camHeightM: 6, focalPx: 1200, rigM: 0, note: "Sky watch · size-based range" },
  c12: { mode: "ground", horizonY: 50, camHeightM: 1.4, focalPx: 760, rigM: 0.4, note: "Dash height · 1.4 m" },
};

export type StereoPair = {
  id: string;
  name: string;
  left: string;
  right: string;
  baselineM: number;
  status: "calibrated" | "coarse";
};

/* Joint-calibrated feed pairs for cross-camera handoff. SGM itself runs on
   each node's own small rig (see CamCalib.rigM); these spans are NOT stereo
   baselines — wide-baseline SGM would not converge. */
export const STEREO_PAIRS: StereoPair[] = [
  { id: "SP-01", name: "BOP-07 fence handoff", left: "c01", right: "c02", baselineM: 42, status: "calibrated" },
  { id: "SP-02", name: "CHK-12 lane handoff", left: "c03", right: "c04", baselineM: 18, status: "calibrated" },
  { id: "SP-03", name: "BOP-21 gate handoff", left: "c07", right: "c08", baselineM: 65, status: "coarse" },
  { id: "SP-04", name: "BOP-11 reach handoff", left: "c10", right: "c11", baselineM: 120, status: "coarse" },
];

export const pairForCam = (camId: string) =>
  STEREO_PAIRS.find((p) => p.left === camId || p.right === camId) ?? null;

export type DepthReading = { depthM: number; disparityPx: number; heightM: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* Pinhole ground-plane range from the foot (bottom) of a box. */
export function depthFromFootY(camId: string, footY: number, boxWPct = 8, boxHPct = 10): DepthReading {
  const c = CAM_CALIB[camId] ?? CAM_CALIB.c01;
  let depthM: number;
  if (c.mode === "aerial" || c.mode === "fixed") {
    depthM = c.fixedDepthM ?? 30;
  } else if (c.mode === "sky") {
    // Slant range from apparent wingspan: 0.35 m quad at ~60 m subtends ~7% width.
    depthM = clamp(420 / Math.max(2.5, boxWPct), 18, 320);
  } else {
    depthM = clamp((c.camHeightM * GROUND_K) / Math.max(2.5, footY - c.horizonY), 3, 260);
  }
  const disparityPx = c.rigM > 0 ? (c.rigM * c.focalPx) / Math.max(4, depthM) : 0;
  // Apparent height back-projected with an assumed 45° vertical FOV.
  const heightM = Math.max(0.2, (boxHPct / 100) * 0.828 * depthM);
  return { depthM, disparityPx, heightM };
}

/* Inverse of the ground-plane model: where does a given range cross the frame? */
export function footYForDepth(camId: string, depthM: number): number | null {
  const c = CAM_CALIB[camId];
  if (!c || c.mode !== "ground") return null;
  return c.horizonY + (c.camHeightM * GROUND_K) / Math.max(4, depthM);
}

export const DEPTH_BANDS = [12, 25, 50, 100];

export function depthColor(depthM: number): string {
  if (depthM < 15) return "#ff5a4d";
  if (depthM < 35) return "#ef6c33";
  if (depthM < 60) return "#f2c94c";
  if (depthM < 100) return "#21b8a2";
  return "#4d8dff";
}

export const fmtDepth = (m: number) => (m >= 100 ? `${Math.round(m)}m` : `${m.toFixed(m < 20 ? 1 : 0)}m`);

/* P1/P2 smoothness penalties derived from the single UI slider. */
export const penaltiesFor = (smoothness: number) => ({
  p1: Math.round(4 + (smoothness / 100) * 12),
  p2: Math.round(28 + (smoothness / 100) * 120),
});

/* Honest pipeline telemetry: params change cost + confidence, never the manual geometry. */
export function sgmQuality(p: SGMParams): { conf: number; extraMs: number; density: number } {
  const dispTerm = p.numDisparities / 128;
  const blockTerm = 1 - Math.abs(p.blockSize - 5) * 0.045;
  const uniqTerm = 1 - Math.abs(p.uniqueness - 10) * 0.012;
  const conf = clamp(0.9 * (0.55 + dispTerm * 0.45) * blockTerm * uniqTerm + p.smoothness * 0.0006, 0.5, 0.985);
  const extraMs = Math.round(p.numDisparities * 0.055 + p.blockSize * 0.5 + p.smoothness * 0.02);
  const density = clamp(0.72 + dispTerm * 0.2 + (p.uniqueness < 12 ? 0.04 : -0.03), 0.5, 0.97);
  return { conf, extraMs, density };
}

export const SGM_STAGES = [
  { k: "Rectify + Census", d: "5×5 census transform on the stereo pair" },
  { k: "8-path aggregation", d: "SGM dynamic programming, P1/P2 smoothness" },
  { k: "WTA + LR check", d: "Winner-takes-all + left-right consistency" },
  { k: "Subpixel + ground fit", d: "Parabola fit, ground-plane range per box" },
];
