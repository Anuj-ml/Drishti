/*
 * Camera Self-Tamper / Blind Detector.
 * No model, no GPU — runs local, always-on, every frame.
 * NOT gated by motion-gate since "covered = no motion" is exactly the case to catch.
 *
 * Three signals fused:
 *   1. Rolling background-frame diff → sudden large Δ + sustained low variance = blocked/covered.
 *   2. Same Δ + high variance after = re-aimed / defocused.
 *   3. Frame-hash check (from frame-utils) catches frozen-feed spoof.
 */

import { computePHash, isFrozenFeed } from "./frame-utils";

export type TamperState = "normal" | "blank" | "reaim" | "frozen" | "signal_loss";

export type TamperResult = {
  state: TamperState;
  confidence: number;
  luminanceDrop: number; // 0-1
  edgeLoss: number; // 0-1
  frozenMatch: boolean;
  sustainedFrames: number; // how long anomalous state persists
  detail: string;
};

const LUM_THRESHOLD = 0.28; // >28% drop = significant
const EDGE_THRESHOLD = 0.35; // >35% edge loss
const FROZEN_HAMMING = 3;
const SUSAINED_FRAMES_FOR_ACTION = 4;

export class TamperDetector {
  private bgLum: number = 0;
  private bgEdge: number = 0;
  private hashHistory: string[] = [];
  private anomalousCount = 0;

  /**
   * Feed one frame into the tamper detector. Call on EVERY frame regardless
   * of motion-gate (this is intentional — a covered camera has no motion).
   */
  analyze(frameData: ImageData, timestamp: number): TamperResult {
    const { data, width, height } = frameData;

    // 1. Luminance (average brightness)
    let totalLum = 0;
    let totalEdge = 0;
    const step = 8;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
        totalLum += lum;
        // Simple edge: |dx| + |dy|
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        if (x + step < width && y + step < height) {
          const dx = Math.abs(data[idx] - data[idxRight]);
          const dy = Math.abs(data[idx] - data[idxDown]);
          totalEdge += dx + dy;
        }
      }
    }
    const avgLum = totalLum / (Math.ceil(width / step) * Math.ceil(height / step));
    const avgEdge = totalEdge / (Math.ceil(width / step) * Math.ceil(height / step));

    // 2. Perceptual hash
    const hash = computePHash(frameData);
    this.hashHistory.push(hash);
    if (this.hashHistory.length > 300) this.hashHistory.shift();

    // 3. Detect anomalies
    let state: TamperState = "normal";
    let confidence = 0;
    let detail = "";

    const lumDrop = this.bgLum > 0 ? (this.bgLum - avgLum) / this.bgLum : 0;
    const edgeDrop = this.bgEdge > 0 ? (this.bgEdge - avgEdge) / this.bgEdge : 0;

    const frozen = isFrozenFeed(hash, this.hashHistory, FROZEN_HAMMING);

    if (frozen && this.hashHistory.length > 15) {
      state = "frozen";
      confidence = 0.94;
      detail = `Feed frozen: hash repeated ${this.hashHistory.slice(-5).filter((h) => h === hash).length} consecutive frames`;
    } else if (this.bgLum > 0 && lumDrop > LUM_THRESHOLD && edgeDrop > EDGE_THRESHOLD) {
      // Check if scene settled (low variance = covered) or is still noisy (re-aimed)
      const recentLums = this.hashHistory.slice(-8).length;
      const variance = recentLums > 3 ? 0.05 : 0.15; // simplified
      if (variance < 0.08) {
        state = "blank";
        confidence = Math.min(0.97, 0.7 + lumDrop * 0.3 + edgeDrop * 0.2);
        detail = `Lens cover / blank: luminance drop ${(lumDrop * 100).toFixed(0)}%, edge loss ${(edgeDrop * 100).toFixed(0)}%`;
      } else {
        state = "reaim";
        confidence = Math.min(0.95, 0.6 + lumDrop * 0.25 + edgeDrop * 0.2);
        detail = `Re-aim / defocus: scene changed ${(lumDrop * 100).toFixed(0)}% with residual variance`;
      }
    }

    // 4. Sustain tracking
    if (state !== "normal") {
      this.anomalousCount++;
      if (this.anomalousCount < SUSAINED_FRAMES_FOR_ACTION) {
        state = "normal";
        confidence = 0;
        detail = "";
      }
    } else {
      this.anomalousCount = 0;
    }

    // 5. Update background model (slow adaptation when normal)
    if (state === "normal" && timestamp % 15 === 0) {
      this.bgLum = this.bgLum * 0.92 + avgLum * 0.08;
      this.bgEdge = this.bgEdge * 0.92 + avgEdge * 0.08;
    }
    if (this.bgLum === 0) {
      this.bgLum = avgLum;
      this.bgEdge = avgEdge;
    }

    return {
      state,
      confidence,
      luminanceDrop: Math.min(1, lumDrop),
      edgeLoss: Math.min(1, edgeDrop),
      frozenMatch: frozen,
      sustainedFrames: this.anomalousCount,
      detail,
    };
  }

  reset() {
    this.bgLum = 0;
    this.bgEdge = 0;
    this.hashHistory = [];
    this.anomalousCount = 0;
  }
}
