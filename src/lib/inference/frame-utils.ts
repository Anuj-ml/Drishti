/*
 * Frame Utilities — Video processing fundamentals.
 *
 * Every heavy detector/segmentor call flows through these utilities first.
 * They are deliberately dependency-free (Canvas API only) so they run
 * identically in Web Workers, main thread, or test harnesses.
 */

/* ── Canvas pool for zero-allocation reuse ────────────── */
const canvasPool: HTMLCanvasElement[] = [];

function acquireCanvas(w: number, h: number) {
  if (canvasPool.length) {
    const c = canvasPool.pop()!;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function releaseCanvas(c: HTMLCanvasElement) {
  if (canvasPool.length < 4) canvasPool.push(c);
}

/* ── Type helpers ──────────────────────────────────────── */
export type FrameData = {
  width: number;
  height: number;
  data: ImageData;
  source: "video" | "image" | "canvas" | "raw";
  timestamp: number;
};

export type Box = [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1

export type SegmentResult = {
  box: Box;
  cls: string;
  clsId: number;
  conf: number;
  mask?: number[][]; // polygon vertices in 0-1
  embedding?: Float32Array; // face 512-d if available
};

/* ── 1. Frame sampling / motion gate ─────────────────────
 *   Frame-diff gate decides send-or-skip: the biggest single
 *   optimization in the pipeline. Heavy models never run unless
 *   the scene actually changed.
 */
export function frameDiff(current: Uint8ClampedArray, previous: Uint8ClampedArray, pixelStep = 16): number {
  if (current.length !== previous.length) return 1;
  let diff = 0;
  const len = current.length;
  for (let i = 0; i < len; i += pixelStep * 4) {
    diff += Math.abs(current[i] - previous[i]);
    diff += Math.abs(current[i + 1] - previous[i + 1]);
    diff += Math.abs(current[i + 2] - previous[i + 2]);
  }
  const samples = len / (pixelStep * 4);
  return diff / (samples * 255 * 3); // normalized 0-1
}

export function shouldRunInference(
  motionScore: number,
  lastInferenceAge: number, // frames since last run
  config: { motionThreshold: number; maxIdle: number } = { motionThreshold: 0.008, maxIdle: 30 },
): { run: boolean; reason: string } {
  if (motionScore > config.motionThreshold) return { run: true, reason: "motion" };
  if (lastInferenceAge >= config.maxIdle) return { run: true, reason: "recheck" };
  return { run: false, reason: "skip" };
}

/* ── 2. Perceptual hash (pHash) ──────────────────────────
 *   Catches frozen / duplicated / spoofed replay frames.
 *   Dual-use: same check feeds self-tamper (frozen feed) AND
 *   cyber spoof-detect (replayed loop). Build once, use everywhere.
 */
export function computePHash(imageData: ImageData, size = 8): string {
  const { data, width, height } = imageData;
  // Step 1: grayscale
  const gray = new Float32Array(size * size);
  const sw = width / size;
  const sh = height / size;
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const sx = Math.floor(gx * sw);
      const sy = Math.floor(gy * sh);
      const idx = (sy * width + sx) * 4;
      gray[gy * size + gx] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
    }
  }
  // Step 2: DCT (simplified 8x8)
  const dct = new Float32Array(size * size);
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          sum +=
            gray[y * size + x] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }
      dct[v * size + u] = sum;
    }
  }
  // Step 3: hash from top-left 8x8 minus DC
  const dc = dct[0];
  const mean = (dct.reduce((a, b) => a + b, 0) - dc) / (size * size - 1);
  let hash = "";
  for (let i = 1; i < size * size; i++) {
    hash += dct[i] > mean ? "1" : "0";
  }
  return hash;
}

export function hammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) d++;
  }
  return d;
}

export function isFrozenFeed(currentHash: string, recentHashes: string[], maxHamming = 3): boolean {
  if (recentHashes.length < 3) return false;
  const last3 = recentHashes.slice(-3);
  return last3.every((h) => hammingDistance(currentHash, h) <= maxHamming);
}

export function isSpoofedReplay(currentHash: string, longHistory: string[], window = 600): boolean {
  const recent = longHistory.slice(-window);
  for (let i = 0; i < recent.length - 10; i++) {
    if (hammingDistance(currentHash, recent[i]) <= 2 && recent[i + 10] !== recent[i]) {
      return true; // same frame appeared earlier with different neighbors = replay
    }
  }
  return false;
}

/* ── 3. Letterbox resize to 640×640 (YOLO standard) ─────
 *   Keeps aspect ratio, pads with gray (114) not stretch.
 */
export function letterboxToSize(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetSize = 640,
): { canvas: HTMLCanvasElement; padX: number; padY: number; scale: number } {
  const canvas = acquireCanvas(targetSize, targetSize);
  const ctx = canvas.getContext("2d")!;
  // Fill with letterbox gray
  ctx.fillStyle = "#757575";
  ctx.fillRect(0, 0, targetSize, targetSize);
  const scale = Math.min(targetSize / srcW, targetSize / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const padX = (targetSize - dw) / 2;
  const padY = (targetSize - dh) / 2;
  ctx.drawImage(source, padX, padY, dw, dh);
  return { canvas, padX, padY, scale };
}

/** Normalize box coordinates from letterboxed output back to 0-1 range of original frame. */
export function unletterbox(
  box: [number, number, number, number],
  padX: number,
  padY: number,
  scale: number,
  targetSize = 640,
): Box {
  const x1 = (box[0] - padX) / scale / (targetSize / scale);
  const y1 = (box[1] - padY) / scale / (targetSize / scale);
  const x2 = (box[2] - padX) / scale / (targetSize / scale);
  const y2 = (box[3] - padY) / scale / (targetSize / scale);
  return [
    Math.max(0, Math.min(1, x1)),
    Math.max(0, Math.min(1, y1)),
    Math.max(0, Math.min(1, x2)),
    Math.max(0, Math.min(1, y2)),
  ];
}

/* ── 4. Extract crop from source for sub-models ────────── */
export function cropRegion(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  box: Box,
  padding = 0.05,
): HTMLCanvasElement {
  const x1 = Math.max(0, box[0] - padding) * srcW;
  const y1 = Math.max(0, box[1] - padding) * srcH;
  const w = Math.min(srcW - x1, (box[2] - box[0] + 2 * padding) * srcW);
  const h = Math.min(srcH - y1, (box[3] - box[1] + 2 * padding) * srcH);
  const canvas = acquireCanvas(Math.round(w), Math.round(h));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, x1, y1, w, h, 0, 0, Math.round(w), Math.round(h));
  return canvas;
}

/* ── 5. Normalize tensor (ImageNet mean/std) ───────────── */
export function normalizeForModel(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const std = [255.0, 255.0, 255.0];
  const out = new Float32Array(3 * canvas.height * canvas.width);
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    out[i] = data[i * 4] / std[0];
    out[i + canvas.width * canvas.height] = data[i * 4 + 1] / std[1];
    out[i + 2 * canvas.width * canvas.height] = data[i * 4 + 2] / std[2];
  }
  return out;
}

/* ── 6. Batch frames for remote GPU ────────────────────── */
export type BatchedFrame = {
  index: number;
  tensor: Float32Array;
  originalWidth: number;
  originalHeight: number;
  padX: number;
  padY: number;
  scale: number;
};

export function batchFrames(
  sources: { source: CanvasImageSource; w: number; h: number }[],
  targetSize = 640,
  maxBatch = 8,
): BatchedFrame[] {
  return sources.slice(0, maxBatch).map((s, i) => {
    const { canvas, padX, padY, scale } = letterboxToSize(s.source, s.w, s.h, targetSize);
    const tensor = normalizeForModel(canvas);
    releaseCanvas(canvas);
    return { index: i, tensor, originalWidth: s.w, originalHeight: s.h, padX, padY, scale };
  });
}

/* ── 7. Decode YOLO output tensor ────────────────────────
 *   Standard YOLO output shape: [1, 84, 8400] for COCO (4 box + 80 classes)
 *   For seg models: output0 = [1, 84, 8400], output1 = [1, 32, 160, 160]
 *   We handle the detection head here; mask reconstruction is in the mask module.
 */
export type RawDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  clsId: number;
  conf: number;
};

export function decodeYOLOOutput(
  output: Float32Array,
  inputSize: number,
  numClasses: number,
  confThreshold = 0.25,
): RawDetection[] {
  // Shape: [1, 4+numClasses, 8400] — column-major in ONNX convention
  const numAnchors = 8400;
  const stride = 4 + numClasses;
  const detections: RawDetection[] = [];
  for (let i = 0; i < numAnchors; i++) {
    const cx = output[0 * stride + i];
    const cy = output[1 * stride + i];
    const w = output[2 * stride + i];
    const h = output[3 * stride + i];
    let maxConf = 0;
    let maxCls = 0;
    for (let c = 0; c < numClasses; c++) {
      const conf = output[(4 + c) * stride + i];
      if (conf > maxConf) {
        maxConf = conf;
        maxCls = c;
      }
    }
    if (maxConf < confThreshold) continue;
    detections.push({
      x1: (cx - w / 2) / inputSize,
      y1: (cy - h / 2) / inputSize,
      x2: (cx + w / 2) / inputSize,
      y2: (cy + h / 2) / inputSize,
      clsId: maxCls,
      conf: maxConf,
    });
  }
  return detections;
}

/* ── 8. Non-Maximum Suppression ────────────────────────── */
export function nms(detections: RawDetection[], iouThreshold = 0.45): RawDetection[] {
  const sorted = [...detections].sort((a, b) => b.conf - a.conf);
  const kept: RawDetection[] = [];
  const suppressed = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (sorted[i].clsId !== sorted[j].clsId) continue;
      if (iou(sorted[i], sorted[j]) > iouThreshold) suppressed.add(j);
    }
  }
  return kept;
}

function iou(a: RawDetection, b: RawDetection): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-6);
}

/* ── 9. Unpack YOLO-seg mask coefficients ────────────────
 *   For YOLO26n-seg the output is [1, 4+nc+32, 8400]
 *   where the 32 mask coefficients + prototype masks [1, 32, 160, 160]
 *   produce per-pixel masks via sigmoid(coefficients · prototypes).
 *   Here we extract the coefficient slice; the mask product is done
 *   on the prototype tensor in the mask pipeline.
 */
export function extractMaskCoefficients(
  output: Float32Array,
  inputSize: number,
  numClasses: number,
  numMaskCoeffs = 32,
): { detections: RawDetection[]; coefficients: Float32Array[] } {
  const numAnchors = 8400;
  const stride = 4 + numClasses + numMaskCoeffs;
  const detections: RawDetection[] = [];
  const coefficients: Float32Array[] = [];
  for (let i = 0; i < numAnchors; i++) {
    const cx = output[0 * stride + i];
    const cy = output[1 * stride + i];
    const w = output[2 * stride + i];
    const h = output[3 * stride + i];
    let maxConf = 0;
    let maxCls = 0;
    for (let c = 0; c < numClasses; c++) {
      const conf = output[(4 + c) * stride + i];
      if (conf > maxConf) {
        maxConf = conf;
        maxCls = c;
      }
    }
    if (maxConf < 0.25) continue;
    const coeff = new Float32Array(numMaskCoeffs);
    for (let m = 0; m < numMaskCoeffs; m++) {
      coeff[m] = output[(4 + numClasses + m) * stride + i];
    }
    detections.push({
      x1: (cx - w / 2) / inputSize,
      y1: (cy - h / 2) / inputSize,
      x2: (cx + w / 2) / inputSize,
      y2: (cy + h / 2) / inputSize,
      clsId: maxCls,
      conf: maxConf,
    });
    coefficients.push(coeff);
  }
  return { detections, coefficients };
}

/** Reconstruct binary mask polygon from prototype coefficients. */
export function reconstructMaskFromCoefficients(
  coeffs: Float32Array,
  prototype: Float32Array,
  protoW: number,
  protoH: number,
  maskW: number,
  maskH: number,
): number[][] {
  const numCoeffs = coeffs.length;
  const protoChannelSize = protoW * protoH;
  const mask = new Float32Array(protoW * protoH);
  for (let i = 0; i < protoW * protoH; i++) {
    let val = 0;
    for (let c = 0; c < numCoeffs && c < 32; c++) {
      val += coeffs[c] * prototype[c * protoChannelSize + i];
    }
    mask[i] = 1 / (1 + Math.exp(-val)); // sigmoid
  }
  // Downsample mask to 64×64 and extract contour via marching squares
  return downsampleToPolygon(mask, protoW, protoH, maskW, maskH, 64);
}

function downsampleToPolygon(mask: Float32Array, srcW: number, srcH: number, tgtW: number, tgtH: number, gridSize: number): number[][] {
  const grid = new Float32Array(gridSize * gridSize);
  const cellW = tgtW / gridSize;
  const cellH = tgtH / gridSize;
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const sx = Math.floor((gx / gridSize) * srcW);
      const sy = Math.floor((gy / gridSize) * srcH);
      const idx = Math.min(sy, srcH - 1) * srcW + Math.min(sx, srcW - 1);
      grid[gy * gridSize + gx] = mask[idx] > 0.5 ? 1 : 0;
    }
  }
  // Marching squares: extract boundary points
  const pts: [number, number][] = [];
  for (let gy = 0; gy < gridSize - 1; gy++) {
    for (let gx = 0; gx < gridSize - 1; gx++) {
      const tl = grid[gy * gridSize + gx];
      const tr = grid[gy * gridSize + gx + 1];
      const bl = grid[(gy + 1) * gridSize + gx];
      const br = grid[(gy + 1) * gridSize + gx + 1];
      const code = tl * 8 + tr * 4 + br * 2 + bl;
      if (code === 0 || code === 15) continue;
      const cx = (gx + 0.5) * cellW;
      const cy = (gy + 0.5) * cellH;
      if ([1, 2, 4, 7, 8, 11, 13, 14].includes(code)) {
        pts.push([cx / tgtW, cy / tgtH]);
      }
    }
  }
  return pts;
}
