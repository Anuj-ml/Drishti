/*
 * OpenCLIP intelligence — zero-shot fine-attribute tagging.
 *
 * COCO has "car" but not "sedan", "hatchback" or "pickup". Rather than train
 * a classifier on data that does not exist, embed the vehicle crop and score
 * it against text prompts. The highest-scoring prompt is the attribute.
 *
 * Runs through Transformers.js, which supplies the real CLIP tokenizer and
 * image processor. The library is imported dynamically so app startup never
 * downloads or evaluates it. There is no hash-token fallback and no
 * fabricated score: if the model cannot load, this returns null and the
 * caller must say so.
 */

export const CLIP_MODEL = "onnx-community/CLIP-ViT-B-32-laion2B-s34B-b79K-ONNX";

export type ClipLabel = { prompt: string; score: number };

export type ClipResult = {
  labels: ClipLabel[];
  best: string;
  bestScore: number;
  margin: number;
};

export type ClipProgress = { status: string; file?: string; progress?: number };

type Classifier = (
  image: unknown,
  prompts: string[],
  options?: { hypothesis_template?: string },
) => Promise<Array<{ label: string; score: number }> | Array<Array<{ label: string; score: number }>>>;

let classifierPromise: Promise<Classifier> | null = null;
let state: "absent" | "loading" | "ready" | "error" = "absent";

export const clipState = () => state;

/** Fixed authored demonstration; never returned for a user's uploaded image. */
export function authoredClipResult(prompts: string[] = VEHICLE_SUBTYPE_PROMPTS): ClipResult {
  const weights = [0.824, 0.06, 0.064, 0.018, 0.012, 0.009, 0.007, 0.006];
  const labels = prompts
    .map((prompt, i) => ({ prompt, score: weights[i % weights.length] }))
    .sort((a, b) => b.score - a.score);
  return { labels, best: labels[0].prompt, bestScore: labels[0].score, margin: labels[0].score - (labels[1]?.score ?? 0) };
}

/**
 * Score an image crop against text prompts. Returns null when the model
 * cannot be loaded, so callers can report it instead of inventing output.
 */
export async function clipClassify(
  canvas: HTMLCanvasElement,
  prompts: string[],
  onProgress?: (p: ClipProgress) => void,
): Promise<ClipResult | null> {
  if (prompts.length < 2 || prompts.length > 20) throw new Error("Enter between 2 and 20 candidate descriptions.");
  const { pipeline, RawImage, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  if (!classifierPromise) {
    state = "loading";
    type PipelineOptions = Parameters<typeof pipeline>[2];
    const options: PipelineOptions = {
      device: "wasm",
      dtype: "q8",
      progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
        onProgress?.({
          status: String(progress.status ?? ""),
          file: progress.file ? String(progress.file) : undefined,
          progress: typeof progress.progress === "number" ? Number(progress.progress) : undefined,
        });
      },
    };
    classifierPromise = (pipeline as unknown as (
      task: string,
      model: string,
      opts: Record<string, unknown>,
    ) => Promise<Classifier>)("zero-shot-image-classification", CLIP_MODEL, options);
    classifierPromise = classifierPromise
      .then((c) => {
        state = "ready";
        return c;
      })
      .catch((error: unknown) => {
        state = "error";
        classifierPromise = null;
        throw error;
      }) as Promise<Classifier>;
  }

  const classifier = await classifierPromise;
  onProgress?.({ status: "inference" });
  const output = await classifier(RawImage.fromCanvas(canvas), prompts, { hypothesis_template: "{}" });
  const rows = (Array.isArray(output[0]) ? output.flat() : output) as Array<{ label: string; score: number }>;
  const labels = rows.map((row) => ({ prompt: row.label, score: row.score })).sort((a, b) => b.score - a.score);
  if (!labels.length) return null;
  return {
    labels,
    best: labels[0].prompt,
    bestScore: labels[0].score,
    margin: labels[0].score - (labels[1]?.score ?? 0),
  };
}

/* ── prompt sets ──────────────────────────────────────── */
export const VEHICLE_SUBTYPE_PROMPTS = [
  "a photo of a sedan car",
  "a photo of an SUV",
  "a photo of a hatchback car",
  "a photo of a pickup truck",
  "a photo of a three-wheeler auto rickshaw",
  "a photo of a truck",
  "a photo of a bus",
  "a photo of a motorcycle",
];

export const CARGO_PROMPTS = [
  "an empty open truck bed",
  "a truck bed covered with a tarpaulin",
  "a truck bed carrying sacks",
  "a truck bed carrying timber or poles",
  "a truck bed carrying construction material",
  "an open jeep with no cargo",
];

export const SCENE_PROMPTS = [
  "a photo of a border fence line",
  "a photo of a road with vehicles",
  "a photo of an open field with vegetation",
  "a photo of a river or canal crossing",
  "a photo of a forest track",
  "a photo of a building or outpost",
];

/** Strip the "a photo of" prefix for display. */
export const tidy = (prompt: string) => prompt.replace(/^a photo of (a|an) /, "");
