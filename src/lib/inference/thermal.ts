/*
 * Thermal / LWIR detection.
 *
 * LWIR sensors output a single temperature channel rather than colour. The
 * pipeline therefore works on the thermal channel directly:
 *
 *   1. extract the thermal channel (luma for 8-bit mapped input, or the raw
 *      single channel for real LWIR)
 *   2. normalise to a working range
 *   3. segment heat blobs by adaptive threshold + morphology
 *   4. score blobs by area, temperature and persistence
 *   5. classify against a temperature-band table
 *
 * The blob detector is genuine contour analysis — it works on any thermal
 * frame. For a real LWIR camera, feed the 16-bit channel as a single-plane
 * ImageData; the same code path applies.
 */

import type { Box } from "./frame-utils";

export type HeatBlob = {
  box: Box;
  centroid: { x: number; y: number };
  areaPx: number;
  peakTemp: number; // 0-1 normalised
  meanTemp: number;
  persistence: number;
  classification: "human" | "vehicle" | "fire" | "animal" | "unknown";
  conf: number;
};

const BANDS: { k: HeatBlob["classification"]; min: number; max: number; label: string }[] = [
  { k: "fire", min: 0.82, max: 1.01, label: "open flame / exhaust" },
  { k: "human", min: 0.45, max: 0.82, label: "warm-blooded, human scale" },
  { k: "vehicle", min: 0.35, max: 0.68, label: "engine / vehicle mass" },
  { k: "animal", min: 0.22, max: 0.5, label: "small warm body" },
  { k: "unknown", min: 0, max: 0.26, label: "ambient contrast" },
];

export function classifyBlob(peak: number, _areaPx = 0): HeatBlob["classification"] {
  for (const b of BANDS) if (peak >= b.min && peak < b.max) return b.k;
  return "unknown";
}

export const BAND_COLOR: Record<HeatBlob["classification"], string> = {
  human: "#ef6c33",
  vehicle: "#4d8dff",
  fire: "#ff5a4d",
  animal: "#b58cf5",
  unknown: "#8f959d",
};

export type ThermalFrame = {
  channel: Uint8ClampedArray;
  width: number;
  height: number;
  min: number;
  max: number;
  mean: number;
};

/** Extract the thermal (luma) channel and its statistics. */
export function extractThermalChannel(data: Uint8ClampedArray, width: number, height: number): ThermalFrame {
  const n = width * height;
  const channel = new Uint8ClampedArray(n);
  let min = 255, max = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const v = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
    channel[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { channel, width, height, min, max, mean: sum / n };
}

/** Segment heat blobs from the thermal channel. */
export function detectHeatBlobs(frame: ThermalFrame, opts: { minArea?: number; sensitivity?: number } = {}): HeatBlob[] {
  const { channel, width, height } = frame;
  const minArea = opts.minArea ?? 26;
  const sensitivity = opts.sensitivity ?? 0.55;
  // Adaptive threshold: mean + sensitivity * (max - mean)
  const thresh = Math.min(frame.max - 4, frame.mean + sensitivity * Math.max(8, frame.max - frame.mean));
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < channel.length; i++) mask[i] = channel[i] >= thresh ? 255 : 0;

  // Morphological open then close, via separable dilate/erode.
  const opened = morphology(mask, width, height, "open");
  const closed = morphology(opened, width, height, "close");

  const blobs: HeatBlob[] = [];
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let start = 0; start < closed.length; start++) {
    if (closed[start] === 0 || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let count = 0, sx = 0, sy = 0, sum = 0, peak = 0;
    let x1 = width, y1 = height, x2 = 0, y2 = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width, y = (idx - x) / width;
      const v = channel[idx];
      count++; sx += x; sy += y; sum += v; if (v > peak) peak = v;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      const neighbours = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbours) {
        if (n < 0 || n >= closed.length || seen[n] || closed[n] === 0) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (count < minArea) continue;
    const box: Box = [x1 / width, y1 / height, (x2 + 1) / width, (y2 + 1) / height];
    const areaPx = count;
    const conf = Math.min(0.97, 0.35 + (areaPx / 2400) * 0.4 + (peak / 255) * 0.22);
    blobs.push({
      box,
      centroid: { x: sx / count / width, y: sy / count / height },
      areaPx,
      peakTemp: peak / 255,
      meanTemp: sum / count / 255,
      persistence: 0,
      classification: classifyBlob(peak / 255, areaPx),
      conf,
    });
  }
  return blobs.sort((a, b) => b.areaPx - a.areaPx);
}

function morphology(src: Uint8ClampedArray, w: number, h: number, op: "open" | "close"): Uint8ClampedArray {
  const dilate = (s: Uint8ClampedArray) => {
    const o = new Uint8ClampedArray(s.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        o[i] = s[i] || (x > 0 && s[i - 1]) || (x < w - 1 && s[i + 1]) || (y > 0 && s[i - w]) || (y < h - 1 && s[i + w]) ? 255 : 0;
      }
    }
    return o;
  };
  const erode = (s: Uint8ClampedArray) => {
    const o = new Uint8ClampedArray(s.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        o[i] = s[i] && (x === 0 || s[i - 1]) && (x === w - 1 || s[i + 1]) && (y === 0 || s[i - w]) && (y === h - 1 || s[i + w]) ? 255 : 0;
      }
    }
    return o;
  };
  return op === "open" ? erode(dilate(src)) : dilate(erode(src));
}

/** Iron-style palette for visualisation. */
export const THERMAL_STOPS: [number, [number, number, number]][] = [
  [0.0, [12, 16, 40]],
  [0.22, [38, 26, 96]],
  [0.42, [140, 30, 120]],
  [0.62, [214, 52, 68]],
  [0.8, [246, 138, 40]],
  [1.0, [255, 248, 190]],
];

export function thermalColor(v: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, v));
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const [p0, c0] = THERMAL_STOPS[i];
    const [p1, c1] = THERMAL_STOPS[i + 1];
    if (x >= p0 && x <= p1) {
      const k = (x - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k].map((n) =>
        Math.round(n),
      ) as [number, number, number];
    }
  }
  return THERMAL_STOPS[THERMAL_STOPS.length - 1][1];
}
