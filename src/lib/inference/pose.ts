/*
 * Pose / skeletal analysis.
 *
 * COCO 17-keypoint topology. The skeleton is drawn as bones with per-bone
 * confidence so a low-confidence limb reads as faint rather than absent.
 * Keypoints are smoothed with an exponential filter to remove per-frame
 * jitter, and the centroid + orientation are derived from the skeleton
 * rather than the bounding box — a crouching subject has a very different
 * centroid than their box suggests.
 */

export const KP = {
  nose: 0, lEye: 1, rEye: 2, lEar: 3, rEar: 4,
  lShoulder: 5, rShoulder: 6, lElbow: 7, rElbow: 8, lWrist: 9, rWrist: 10,
  lHip: 11, rHip: 12, lKnee: 13, rKnee: 14, lAnkle: 15, rAnkle: 16,
} as const;

export const BONES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4],
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
];

export type Keypoint = { x: number; y: number; c: number };
export type Pose = {
  trackId: string;
  kp: Keypoint[];
  centroid: { x: number; y: number };
  orientation: number;
  posture: "standing" | "crouching" | "prone" | "reaching" | "carrying" | "unknown";
  conf: number;
  bbox: [number, number, number, number];
};

const L = KP.lShoulder, R = KP.rShoulder, LH = KP.lHip, RH = KP.rHip;
const LA = KP.lAnkle, RA = KP.rAnkle, LW = KP.lWrist, RW = KP.rWrist, NOSE = KP.nose;

export function classifyPosture(kp: Keypoint[]): Pose["posture"] {
  const shoulderY = (kp[L].c + kp[R].c) / 2 > 0.35 ? (kp[L].y + kp[R].y) / 2 : null;
  const hipY = (kp[LH].c + kp[RH].c) / 2 > 0.35 ? (kp[LH].y + kp[RH].y) / 2 : null;
  const ankleY = (kp[LA].c + kp[RA].c) / 2 > 0.35 ? (kp[LA].y + kp[RA].y) / 2 : null;
  if (hipY === null || ankleY === null) return "unknown";
  const torso = shoulderY !== null ? shoulderY - hipY : 0;
  const span = hipY - ankleY;
  if (torso !== 0 && span > 0 && torso / span > 0.85) return "prone";
  if (span > 0 && torso / span < 0.28) return "crouching";
  const wrist = Math.max(kp[LW].c, kp[RW].c);
  if (wrist > 0.4 && shoulderY !== null && (kp[LW].c > 0.4 ? kp[LW].y : 1e6) < shoulderY + 0.02) return "reaching";
  if (torso > 0 && span > 0 && torso / span > 0.5 && torso / span < 0.8) return "carrying";
  return "standing";
}

export function poseCentroid(kp: Keypoint[]) {
  const use = [L, R, LH, RH, LA, RA, NOSE];
  let sx = 0, sy = 0, sw = 0;
  for (const i of use) {
    if (kp[i].c < 0.3) continue;
    sx += kp[i].x * kp[i].c;
    sy += kp[i].y * kp[i].c;
    sw += kp[i].c;
  }
  if (sw < 0.2) return { x: kp[NOSE].x, y: kp[NOSE].y };
  return { x: sx / sw, y: sy / sw };
}

export function poseOrientation(kp: Keypoint[]) {
  const dx = kp[R].x - kp[L].x;
  const dy = kp[R].y - kp[L].y;
  const usable = Math.min(kp[L].c, kp[R].c) > 0.3;
  if (!usable) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function poseConfidence(kp: Keypoint[]) {
  const core = [L, R, LH, RH, LA, RA];
  return core.reduce((s, i) => s + kp[i].c, 0) / core.length;
}

/** Exponential smoothing across frames for one track. */
export class PoseSmoother {
  private prev = new Map<string, Keypoint[]>();
  smooth(trackId: string, kp: Keypoint[], alpha = 0.45): Keypoint[] {
    const p = this.prev.get(trackId);
    const out = kp.map((k, i) => {
      if (!p || !p[i]) return k;
      return { x: p[i].x * (1 - alpha) + k.x * alpha, y: p[i].y * (1 - alpha) + k.y * alpha, c: k.c };
    });
    this.prev.set(trackId, out);
    return out;
  }
  forget(trackId: string) { this.prev.delete(trackId); }
  reset() { this.prev.clear(); }
}

export const POSTURE_NOTE: Record<Pose["posture"], string> = {
  standing: "upright",
  crouching: "crouched",
  prone: "prone / crawling",
  reaching: "reaching up",
  carrying: "load carried",
  unknown: "insufficient keypoints",
};

export const POSTURE_COLOR: Record<Pose["posture"], string> = {
  standing: "#ef6c33",
  crouching: "#f2c94c",
  prone: "#d92d20",
  reaching: "#f0a63c",
  carrying: "#b58cf5",
  unknown: "#8f959d",
};

/* ── synthetic pose generator for authored demonstrations ── */
export function syntheticPose(trackId: string, box: [number, number, number, number], t: number, phase: number): Pose {
  const [x1, y1, x2, y2] = box;
  const w = x2 - x1, h = y2 - y1;
  const lean = Math.sin(t * 0.9 + phase) * 0.06;
  const at = (fx: number, fy: number): Keypoint => ({ x: x1 + w * (fx + lean * fy), y: y1 + h * fy, c: 0.6 + 0.35 * Math.abs(Math.sin(phase + fy * 3)) });
  const kp: Keypoint[] = [
    at(0.5, 0.05), at(0.42, 0.09), at(0.58, 0.09), at(0.36, 0.13), at(0.64, 0.13),
    at(0.4, 0.26), at(0.6, 0.26),
    at(0.34, 0.44), at(0.66, 0.44),
    at(0.3, 0.6), at(0.7, 0.6),
    at(0.44, 0.55), at(0.56, 0.55),
    at(0.43, 0.78), at(0.57, 0.78),
    at(0.42, 0.98), at(0.58, 0.98),
  ];
  return {
    trackId, kp,
    centroid: poseCentroid(kp),
    orientation: poseOrientation(kp),
    posture: classifyPosture(kp),
    conf: poseConfidence(kp),
    bbox: box,
  };
}
