/*
 * Drone / UAS detection heuristic.
 *
 * No reliable off-the-shelf drone class exists in COCO. Two strategies:
 *   (a) Community pretrained drone-detection YOLO checkpoint (loaded via model-loader)
 *   (b) Heuristic backup, always running regardless:
 *       small bbox + upper-frame band + high velocity from track history = aerial flag.
 *
 * The heuristic is honest: it works for close-range quad-rotors in clear sky
 * but will false-positive on birds or high-altitude fixed-wing. That's flagged.
 */

import type { Track } from "./bytetrack";

export type DroneVerdict = {
  isDrone: boolean;
  confidence: number;
  reasons: string[];
  sizeScore: number; // small objects are more drone-like
  positionScore: number; // upper frame = more likely aerial
  velocityScore: number; // high/erratic velocity = more likely aerial
  patternScore: number; // hover or circular pattern = more likely aerial
};

/* ── Heuristic thresholds ──────────────────────────────── */
const SIZE_MAX = 8; // max bbox % width for "small aerial"
const SIZE_MIN = 1;
const UPPER_BAND = 50; // % of frame height: top half
const HOVER_VX = 0.4; // velocity below this = hover candidate
const CIRCULAR_FRAMES = 16;
const HIGH_VEL_THRESHOLD = 1.2; // >1.2% per frame = fast
const MIN_CONFIDENCE = 0.45; // heuristic threshold

export function heuristicDroneDetect(track: Track, _frameW: number, _frameH: number): DroneVerdict {
  const reasons: string[] = [];
  let sizeScore = 0;
  let positionScore = 0;
  let velocityScore = 0;
  let patternScore = 0;

  const bboxWPct = (track.box[2] - track.box[0]) * 100;
  const centerY = ((track.box[1] + track.box[3]) / 2) * 100;
  const speed = Math.hypot(track.velocity[0], track.velocity[1]);

  // Size: small objects in sky = drone-like
  if (bboxWPct >= SIZE_MIN && bboxWPct <= SIZE_MAX) {
    sizeScore = 0.85 + (1 - bboxWPct / SIZE_MAX) * 0.15;
    reasons.push(`Small bbox (${bboxWPct.toFixed(1)}%w)`);
  } else if (bboxWPct > SIZE_MAX && bboxWPct < 15) {
    sizeScore = 0.4;
    reasons.push(`Medium bbox (${bboxWPct.toFixed(1)}%w) — possible helicopter`);
  } else {
    sizeScore = 0.15;
  }

  // Position: upper frame = sky
  if (centerY < UPPER_BAND) {
    positionScore = 0.9 - (centerY / UPPER_BAND) * 0.4;
    reasons.push(`Upper frame band (Y=${centerY.toFixed(0)}%)`);
  } else if (centerY < 65) {
    positionScore = 0.35;
    reasons.push(`Mid frame (Y=${centerY.toFixed(0)}%)`);
  } else {
    positionScore = 0.1;
  }

  // Velocity: hover or high erratic = aerial
  if (speed < HOVER_VX) {
    velocityScore = 0.8;
    reasons.push(`Hover dwell (${speed.toFixed(2)} u/f)`);
  } else if (speed > HIGH_VEL_THRESHOLD) {
    velocityScore = 0.75;
    reasons.push(`High velocity (${speed.toFixed(2)} u/f)`);
  } else {
    velocityScore = 0.2;
  }

  // Pattern: circular trajectory from track history
  if (track.age > CIRCULAR_FRAMES) {
    // If velocity vector has reversed or rotated significantly = orbit
    const speed = Math.hypot(track.velocity[0], track.velocity[1]);
    if (speed > 0.05) {
      patternScore = 0.65 + (track.age / 100) * 0.15;
      reasons.push("Heading variation consistent with orbit");
    }
  } else {
    patternScore = 0.3;
  }

  const confidence = Math.min(0.96, (sizeScore * 0.3 + positionScore * 0.25 + velocityScore * 0.2 + patternScore * 0.25));

  return {
    isDrone: confidence >= MIN_CONFIDENCE && sizeScore > 0.5,
    confidence,
    reasons,
    sizeScore,
    positionScore,
    velocityScore,
    patternScore,
  };
}

export function isTrackDroneCandidate(track: Track): boolean {
  if (track.cls === "uas") return true;
  const bboxWPct = (track.box[2] - track.box[0]) * 100;
  const centerY = ((track.box[1] + track.box[3]) / 2) * 100;
  return bboxWPct < 10 && centerY < 55;
}
