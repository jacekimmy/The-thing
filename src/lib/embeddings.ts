// Hosted embeddings via Voyage. One small HTTPS call, no native binaries —
// so the serverless function stays tiny and deploys anywhere. Used for both
// ingestion (embed chunks) and query time (embed the question).
export const EMBEDDING_MODEL = "voyage-3.5-lite";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 100; // inputs per request (well within Voyage's per-request cap)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedOnce(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        input_type: inputType,
      }),
    });

    if (res.status === 429 && attempt < 4) {
      await sleep(21_000); // respect the 3 req/min free limit, then retry
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Voyage embeddings failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
    };
    return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

/** Embed a single question at query time. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedOnce([text], "query");
  return vec;
}

/**
 * Embed many chunks at ingestion, batched. One-time cost; the result is cached
 * in the knowledge file, so it never runs in production.
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    out.push(...(await embedOnce(batch, "document")));
    onProgress?.(out.length, texts.length);
  }
  return out;
}
