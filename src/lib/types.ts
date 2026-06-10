// Shared types for ingestion + app. One knowledge.json drives the whole demo.

export interface Chunk {
  id: string;            // `${videoId}:${index}`
  text: string;          // cleaned transcript text for this chunk
  videoId: string;
  videoTitle: string;
  videoUrl: string;      // canonical watch URL (no timestamp)
  startSeconds: number;  // start of the chunk → powers "jump to clip" citation
  embedding?: number[];  // text-embedding-3-small vector (1536 dims)
}

export interface CreatorMeta {
  name: string;
  handle: string;            // e.g. "@fulltimefilmmaker"
  channelUrl: string;
  channelId?: string;
  avatarUrl?: string;
  niche: string;             // short phrase, e.g. "filmmaking & video business"
  tone: string[];            // 2-3 inferred tone words
  oneLiner: string;          // subhead copy for the header
  videoCount: number;        // number of videos actually ingested
  suggestedQuestions: string[];
}

/**
 * Public, lightweight per-creator config — the "photo in the frame".
 * Keyed by slug in data/creators.json. Rendered by the header/empty-state
 * WITHOUT loading the heavy knowledge file.
 */
export interface CreatorConfig {
  slug: string;
  code: string;              // 3-digit URL suffix so links aren't guessable
  name: string;
  handle: string;
  niche: string;
  tone: string[];
  avatarUrl: string;
  videoCount: number;
  subhead: string;           // header subline
  intro: string;             // empty-state intro line
  suggestedQuestions: string[];
}

export interface Knowledge {
  creator: CreatorMeta;
  chunks: Chunk[];
  generatedAt: string;
  embeddingModel: string;
}

// A citation surfaced to the UI: a chunk's source with a timestamped link.
export interface Citation {
  videoTitle: string;
  videoUrl: string;          // includes &t=<startSeconds>s
  startSeconds: number;
  label: string;             // e.g. "12:34"
}
