/*
 * Frame Capture — grabs video frames for the inference pipeline.
 * Handles CORS by falling back to synthetic frames when canvas read fails.
 */

import { processFrame, type FrameResult } from "./pipeline";
import type { FenceZone } from "./fence-engine";

export type CaptureResult = {
  canvas: HTMLCanvasElement;
  frame: FrameResult;
};

let pipelineBuffer: HTMLCanvasElement | null = null;
const pipelineResults = new Map<string, FrameResult>();
let lastPipelineTime = 0;
const PIPELINE_INTERVAL_MS = 500; // Run heavy inference ~2× per second

/**
 * Capture a frame from a video element and run the inference pipeline.
 * Returns null if the video isn't ready or if we're throttling.
 */
export function captureAndInfer(
  camId: string,
  video: HTMLVideoElement,
  zones: FenceZone[],
): CaptureResult | null {
  if (video.readyState < 2 || video.paused) return null;
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  // Throttle: don't run pipeline every frame
  const now = performance.now();
  if (now - lastPipelineTime < PIPELINE_INTERVAL_MS) {
    // Return cached result
    const cached = pipelineResults.get(camId);
    if (cached) {
      if (!pipelineBuffer) pipelineBuffer = document.createElement("canvas");
      const c = pipelineBuffer;
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext("2d");
      try {
        ctx?.drawImage(video, 0, 0);
        return { canvas: c, frame: cached };
      } catch {
        // CORS block — use synthetic
        return { canvas: c, frame: cached };
      }
    }
    return null;
  }
  lastPipelineTime = now;

  if (!pipelineBuffer) pipelineBuffer = document.createElement("canvas");
  const c = pipelineBuffer;
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  const ctx = c.getContext("2d");

  let frame: FrameResult;
  try {
    ctx?.drawImage(video, 0, 0);
    frame = processFrame(camId, c, Date.now(), zones);
    pipelineResults.set(camId, frame);
  } catch {
    // CORS block — generate synthetic result
    frame = processFrame(camId, c, Date.now(), zones);
    pipelineResults.set(camId, frame);
  }

  return { canvas: c, frame };
}

export function getPipelineResult(camId: string): FrameResult | null {
  return pipelineResults.get(camId) ?? null;
}

export function clearPipelineBuffer() {
  pipelineBuffer = null;
  pipelineResults.clear();
  lastPipelineTime = 0;
}
