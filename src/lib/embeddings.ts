// Local embeddings via transformers.js — runs a small open model on-device.
// No API key, no quota, free, offline after the first model download.
// Same interface as before (embedQuery / embedBatch / EMBEDDING_MODEL) so the
// ingest script and /api/chat don't need to care where vectors come from.
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// all-MiniLM-L6-v2: 384-dim, ~23MB, symmetric (no query/passage prefixes),
// solid general-purpose retrieval quality. Cosine similarity downstream.
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractorPromise;
}

async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  // Mean-pool token embeddings and L2-normalize → cosine == dot product.
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

/** Embed a single string (the user's question at query time). */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text]);
  return vec;
}

/**
 * Embed many strings in batches (ingestion). The model runs locally, so the
 * batch size just bounds peak memory; progress is reported per batch.
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
  batchSize = 32,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vecs = await embed(batch);
    out.push(...vecs);
    onProgress?.(Math.min(i + batch.length, texts.length), texts.length);
  }
  return out;
}
