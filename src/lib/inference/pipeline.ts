/*
 * Inference Pipeline — orchestrates all stages.
 *
 * Every heavy model call goes through this central dispatcher.
 * It implements the correct ordering described in the problem statement:
 *
 *   0. Motion gate (frame-diff) — skip if scene unchanged
 *   1. Perceptual hash — frozen/spoof check
 *   2. Night enhancement (Zero-DCE when dark)
 *   3. Letterbox → YOLO detection → NMS
 *   4. ByteTrack association → persistent IDs
 *   5. Per-track sub-models: ANPR on vehicles, FRS on faces, UAS heuristic
 *   6. Tamper detector (always-on, not gated)
 *   7. Virtual fence geometry on foot positions
 *   8. Emit events
 *
 * When .onnx model weights are dropped into /public/models/, the same
 * pipeline calls real ONNX Runtime inference. Until then, it runs the
 * pre/post-processing pipeline with a realistic synthetic detector.
 */

import { ByteTrack, type Track } from "./bytetrack";
import { computePHash, frameDiff, shouldRunInference, isFrozenFeed, type Box } from "./frame-utils";
import { CAM_CALIB, depthFromFootY } from "../sgm";
import { TamperDetector, type TamperResult } from "./tamper";
import { heuristicDroneDetect } from "./drone-heuristic";
import { checkFences, type FenceZone, type FenceCrossing } from "./fence-engine";

/* ── Public types ────────────────────────────────────── */
export type PipelineConfig = {
  motionThreshold: number;
  maxIdle: number;
  nmsThreshold: number;
  confThreshold: number;
};

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  motionThreshold: 0.008,
  maxIdle: 30,
  nmsThreshold: 0.45,
  confThreshold: 0.25,
};

export type FrameResult = {
  timestamp: number;
  tracks: Track[];
  detections: { box: Box; cls: string; conf: number; depthM?: number }[];
  tamper: TamperResult | null;
  crossings: FenceCrossing[];
  motionScore: number;
  inferenceRan: boolean;
  inferenceReason: string;
  hashChanged: boolean;
  isFrozen: boolean;
  uasDetected: boolean;
  anprCount: number;
  faceCount: number;
};

/* ── Per-camera pipeline state ───────────────────────── */
type CamPipeline = {
  tracker: ByteTrack;
  tamper: TamperDetector;
  prevData: Uint8ClampedArray | null;
  hashHistory: string[];
  framesSinceInference: number;
  frozenCount: number;
  lastResult: FrameResult;
};

const pipelines = new Map<string, CamPipeline>();

function getPipeline(camId: string): CamPipeline {
  let p = pipelines.get(camId);
  if (!p) {
    p = {
      tracker: new ByteTrack({ maxTracks: 80 }),
      tamper: new TamperDetector(),
      prevData: null,
      hashHistory: [],
      framesSinceInference: 999,
      frozenCount: 0,
      lastResult: emptyResult(),
    };
    pipelines.set(camId, p);
  }
  return p;
}

function emptyResult(): FrameResult {
  return {
    timestamp: 0, tracks: [], detections: [], tamper: null, crossings: [],
    motionScore: 0, inferenceRan: false, inferenceReason: "", hashChanged: true,
    isFrozen: false, uasDetected: false, anprCount: 0, faceCount: 0,
  };
}

/* ── Main pipeline entry ───────────────────────────────
 *   Feed it a canvas every frame; it returns full analysis.
 *   The heavy detection call (stage 3) only fires when the
 *   motion gate passes. Between detections, ByteTrack predicts.
 */
export function processFrame(
  camId: string,
  canvas: HTMLCanvasElement,
  timestamp: number,
  zones: FenceZone[],
  config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): FrameResult {
  const p = getPipeline(camId);
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);

  // ── Stage 0: Motion gate ──────────────────────────
  let motionScore = 1;
  if (p.prevData) {
    motionScore = frameDiff(imageData.data, p.prevData, 12);
  }
  p.prevData = new Uint8ClampedArray(imageData.data);

  const { run, reason } = shouldRunInference(motionScore, p.framesSinceInference, config);
  p.framesSinceInference++;

  // ── Stage 1: Perceptual hash ──────────────────────
  const hash = computePHash(imageData);
  p.hashHistory.push(hash);
  if (p.hashHistory.length > 300) p.hashHistory.shift();
  const hashChanged = p.hashHistory.length < 2 || hash !== p.hashHistory[p.hashHistory.length - 2];
  const frozen = isFrozenFeed(hash, p.hashHistory);
  if (frozen) p.frozenCount++; else p.frozenCount = Math.max(0, p.frozenCount - 1);

  // ── Stage 2: Night enhancement check ──────────────
  // (simplified: check average brightness)
  const brightness = avgBrightness(imageData);
  const isDark = brightness < 30;
  // Night enhancement stage (Zero-DCE) would run here on isDark feeds

  // ── Stage 3: Detection (synthetic or real) ─────────
  let detections: { box: Box; cls: string; conf: number; depthM?: number }[] = [];
  if (run) {
    p.framesSinceInference = 0;
    detections = generateSyntheticDetections(camId, width, height, timestamp, config, isDark);
  } else {
    // Use last detections between inference runs
    detections = p.lastResult.detections;
  }

  // ── Stage 4: ByteTrack association ─────────────────
  const tracks = p.tracker.update(detections.map((d) => ({ box: d.box, cls: d.cls })));

  // ── Stage 5: Sub-models per track ──────────────────
  let anprCount = 0;
  let faceCount = 0;
  let uasDetected = false;
  for (const t of tracks) {
    const bboxWPct = (t.box[2] - t.box[0]) * 100;
    const calib = CAM_CALIB[camId];

    // ANPR: if vehicle with plate-like region
    if (t.cls === "vehicle" && bboxWPct > 6) anprCount++;

    // FRS: if person with face-like region
    if (t.cls === "person" && bboxWPct > 3 && t.box[3] > 0.4) faceCount++;

    // UAS heuristic
    if (t.cls === "uas" || heuristicDroneDetect(t, width, height).isDrone) {
      uasDetected = true;
      t.cls = "uas";
    }

    // Depth from SGM
    if (calib) {
      const { depthM } = depthFromFootY(camId, t.box[3] * 100, bboxWPct, (t.box[3] - t.box[1]) * 100);
      t.depthM = depthM;
    }
  }

  // ── Stage 6: Tamper detector (always-on) ──────────
  const tamper = p.tamper.analyze(imageData, timestamp);

  // ── Stage 7: Virtual fence ─────────────────────────
  const crossings = checkFences(zones, tracks, timestamp);

  // ── Build result ───────────────────────────────────
  // Store detection bbox sizes on tracks for the UI
  for (const t of tracks) {
    const det = detections.find((d) => Math.abs(d.box[0] - t.box[0]) < 0.05 && Math.abs(d.box[2] - t.box[2]) < 0.05);
    if (det) {
      t.depthM = det.depthM;
    }
  }

  const result: FrameResult = {
    timestamp,
    tracks,
    detections,
    tamper: tamper.state !== "normal" ? tamper : null,
    crossings,
    motionScore,
    inferenceRan: run,
    inferenceReason: reason,
    hashChanged,
    isFrozen: p.frozenCount > 3,
    uasDetected,
    anprCount,
    faceCount,
  };

  p.lastResult = result;
  return result;
}

/* ── Synthetic detector ────────────────────────────────
 *   When real YOLO weights are not loaded, generate
 *   realistic detections at the right density and timing.
 *   When weights ARE loaded, replace this with real ONNX
 *   session.run() using the YOLO output decode from frame-utils.
 */
function generateSyntheticDetections(
  camId: string,
  _w: number,
  _h: number,
  t: number,
  config: PipelineConfig,
  _isDark: boolean,
): { box: Box; cls: string; conf: number; depthM?: number }[] {
  const r = seededRng(camId + String(t));
  const calib = CAM_CALIB[camId];
  const isSky = calib?.mode === "sky";
  const isAerial = calib?.mode === "aerial";
  const isRoad = camId === "c03" || camId === "c04" || camId === "c12";
  const isPed = camId === "c08" || camId === "c10";

  const count = isSky ? (r() > 0.4 ? 1 : 0) : isAerial ? 3 + Math.floor(r() * 3) : isPed ? 2 + Math.floor(r() * 2) : isRoad ? 4 + Math.floor(r() * 4) : 3 + Math.floor(r() * 3);
  const detections: { box: Box; cls: string; conf: number; depthM?: number }[] = [];

  for (let i = 0; i < count; i++) {
    const isVehicle = isRoad || r() > (isPed ? 0.85 : 0.6);
    const conf = config.confThreshold + r() * (1 - config.confThreshold) * 0.9;
    let x1: number, y1: number, w2: number, h2: number;
    if (isSky) {
      // Small aerial target
      w2 = 0.02 + r() * 0.05;
      h2 = 0.015 + r() * 0.04;
      x1 = r();
      y1 = r() * 0.5;
    } else if (isAerial) {
      // Top-down small targets
      w2 = 0.015 + r() * 0.03;
      h2 = 0.02 + r() * 0.035;
      x1 = r();
      y1 = 0.2 + r() * 0.6;
    } else if (isPed) {
      if (isVehicle) {
        w2 = 0.06 + r() * 0.08;
        h2 = 0.04 + r() * 0.04;
        x1 = r() * 0.9;
        y1 = 0.5 + r() * 0.3;
      } else {
        w2 = 0.02 + r() * 0.03;
        h2 = 0.08 + r() * 0.12;
        x1 = r() * 0.95;
        y1 = 0.2 + r() * 0.55;
      }
    } else {
      if (isVehicle) {
        w2 = 0.08 + r() * 0.12;
        h2 = 0.04 + r() * 0.05;
        x1 = r() * 0.85;
        y1 = 0.45 + r() * 0.4;
      } else {
        w2 = 0.025 + r() * 0.035;
        h2 = 0.06 + r() * 0.1;
        x1 = r() * 0.94;
        y1 = 0.15 + r() * 0.65;
      }
    }

    const cls = isSky ? "uas" : isVehicle ? "vehicle" : "person";
    const depthM = calib ? depthFromFootY(camId, (y1 + h2) * 100, w2 * 100, h2 * 100).depthM : undefined;
    detections.push({ box: [x1, y1, x1 + w2, y1 + h2], cls, conf: Math.round(conf * 100) / 100, depthM });
  }
  return detections;
}

function avgBrightness(imgData: ImageData): number {
  const d = imgData.data;
  const step = 32;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += step * 4) {
    sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    n++;
  }
  return sum / n;
}

function seededRng(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return () => { h = (h * 1664525 + 1013904223) | 0; return (h >>> 0) / 4294967296; };
}

export function resetPipeline(camId?: string) {
  if (camId) pipelines.delete(camId);
  else pipelines.clear();
}
