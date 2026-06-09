import fs from "node:fs";
import path from "node:path";
import type { Chunk, Citation, Knowledge } from "./types";

// One in-memory box per slug. Each request opens exactly one creator's file —
// there is no shared pool, so two creators can never bleed into each other.
const cache = new Map<string, Knowledge>();

/** Load knowledge-<slug>.json once per slug and keep it in memory. */
export function loadKnowledge(slug: string): Knowledge {
  const cached = cache.get(slug);
  if (cached) return cached;

  // Guard the slug so it can only ever name a file, never traverse paths.
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Invalid creator slug: ${slug}`);
  }
  const file = path.join(process.cwd(), "data", `knowledge-${slug}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `data/knowledge-${slug}.json not found — run \`SLUG=${slug} npm run ingest\` first.`,
    );
  }
  const knowledge = JSON.parse(fs.readFileSync(file, "utf8")) as Knowledge;
  cache.set(slug, knowledge);
  return knowledge;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export interface ScoredChunk extends Chunk {
  score: number;
}

/** Top-k chunks by cosine similarity to the query embedding (one creator only). */
export function retrieve(
  queryEmbedding: number[],
  knowledge: Knowledge,
  k = 7,
): ScoredChunk[] {
  const scored: ScoredChunk[] = [];
  for (const chunk of knowledge.chunks) {
    if (!chunk.embedding) continue;
    scored.push({ ...chunk, score: cosine(queryEmbedding, chunk.embedding) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Collapse retrieved chunks into at most `max` distinct-video citations,
 * each linking to the earliest cited moment in that video.
 */
export function toCitations(chunks: ScoredChunk[], max = 3): Citation[] {
  const byVideo = new Map<string, ScoredChunk>();
  for (const c of chunks) {
    const existing = byVideo.get(c.videoId);
    if (!existing || c.startSeconds < existing.startSeconds) {
      byVideo.set(c.videoId, c);
    }
  }
  return [...byVideo.values()]
    .slice(0, max)
    .map((c) => {
      const t = Math.floor(c.startSeconds);
      const sep = c.videoUrl.includes("?") ? "&" : "?";
      return {
        videoTitle: c.videoTitle,
        videoUrl: `${c.videoUrl}${sep}t=${t}s`,
        startSeconds: c.startSeconds,
        label: mmss(c.startSeconds),
      };
    });
}
