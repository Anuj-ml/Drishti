/*
 * Model registry — loads ONNX weights when present, degrades otherwise.
 *
 * IMPORTANT: onnxruntime-web must never be imported statically. When this app
 * is built as a single inlined HTML file, a top-level ort import evaluates its
 * WASM loader during module startup, which can throw and leave the whole
 * console blank. ort is therefore loaded lazily, on first model use.
 *
 *   yolo26n-seg.onnx   person/vehicle + instance masks
 *   yolo26n-pose.onnx  + 17 COCO keypoints
 *   plate_detect.onnx  ANPR plate localiser
 *   clip-vit-b32.onnx  CLIP ViT-B/32
 */

import type * as ortTypes from "onnxruntime-web";

export type ModelId = "detect" | "pose" | "plate" | "clip";
export type OrtModule = typeof import("onnxruntime-web");

type Entry = {
  id: ModelId;
  url: string;
  session: ortTypes.InferenceSession | null;
  loading: Promise<ortTypes.InferenceSession | null> | null;
  state: "absent" | "loading" | "ready" | "error";
};

const registry: Record<ModelId, Entry> = {
  detect: { id: "detect", url: "/models/yolo26n-seg.onnx", session: null, loading: null, state: "absent" },
  pose: { id: "pose", url: "/models/yolo26n-pose.onnx", session: null, loading: null, state: "absent" },
  plate: { id: "plate", url: "/models/plate_detect.onnx", session: null, loading: null, state: "absent" },
  clip: { id: "clip", url: "/models/clip-vit-b32.onnx", session: null, loading: null, state: "absent" },
};

const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.mjs";
let ortPromise: Promise<OrtModule> | null = null;

/** Lazily obtain onnxruntime-web so app startup never evaluates its loader. */
export async function ort(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = (import(/* @vite-ignore */ ORT_URL) as Promise<OrtModule>).then((mod) => {
      try {
        mod.env.wasm.numThreads = 1;
        mod.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
      } catch {
        /* older builds expose env differently; session creation will report it */
      }
      return mod;
    });
  }
  return ortPromise;
}

const providers: readonly string[] = ["wasm"];

export function modelState(id: ModelId) {
  return registry[id].state;
}

export async function loadModel(id: ModelId): Promise<ortTypes.InferenceSession | null> {
  const entry = registry[id];
  if (entry.session) return entry.session;
  if (entry.loading) return entry.loading;
  entry.state = "loading";
  entry.loading = (async () => {
    try {
      const mod = await ort();
      const session = await mod.InferenceSession.create(entry.url, {
        executionProviders: [...providers],
        graphOptimizationLevel: "all",
      });
      entry.session = session;
      entry.state = "ready";
      return session;
    } catch {
      entry.state = "absent";
      entry.loading = null;
      return null;
    }
  })();
  return entry.loading;
}

/** Attempt every model so `modelState()` reflects reality after mount. */
export async function probeModels(): Promise<Record<ModelId, string>> {
  await Promise.all((Object.keys(registry) as ModelId[]).map((id) => loadModel(id)));
  return Object.fromEntries(
    (Object.keys(registry) as ModelId[]).map((id) => [id, registry[id].state]),
  ) as Record<ModelId, string>;
}

/** YOLO input tensor from a letterboxed canvas, normalised to 0..1. */
export async function toTensor(canvas: HTMLCanvasElement): Promise<ortTypes.Tensor> {
  const mod = await ort();
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const n = canvas.width * canvas.height;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = data[i * 4] / 255;
    out[i + n] = data[i * 4 + 1] / 255;
    out[i + 2 * n] = data[i * 4 + 2] / 255;
  }
  return new mod.Tensor("float32", out, [1, 3, canvas.height, canvas.width]);
}
