/**
 * Offline ingestion: build data/knowledge.json for one creator.
 *
 * Phases (each cached under data/.cache so reruns resume cheaply):
 *   1. list    — enumerate channel videos via yt-dlp, select a substantive set
 *   2. fetch   — pull English transcripts (timestamps) via youtube-transcript-api
 *   3. chunk   — group segments into ~800-token chunks, keep start timestamps
 *   4. clean   — Claude Haiku tidies each chunk            (needs ANTHROPIC_API_KEY)
 *   5. meta    — Claude infers tone / niche / questions     (needs ANTHROPIC_API_KEY)
 *   6. embed   — OpenAI embeds each chunk                    (needs OPENAI_API_KEY)
 *   7. write   — data/knowledge.json
 *
 * Free phases (1-3) run with no keys, so you can de-risk the YouTube pull first.
 * Add keys and rerun to finish 4-7.
 *
 *   npm run ingest
 *   MAX_VIDEOS=20 npm run ingest        # smaller demo
 *   NO_CLEAN=1 npm run ingest           # skip LLM cleaning
 *   FORCE_LIST=1 / FORCE_TRANSCRIPTS=1  # bust a cache
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

import { chunkSegments, type Segment } from "../src/lib/chunk";
import { embedBatch, EMBEDDING_MODEL } from "../src/lib/embeddings";
import { CHAT_MODEL } from "../src/lib/prompt";
import type { Chunk, CreatorMeta, Knowledge } from "../src/lib/types";

dotenv.config({ path: ".env.local" });
const execFileP = promisify(execFile);

// ---- config -----------------------------------------------------------------
// One slug per creator. All inputs/outputs are namespaced by it, so creators
// never share a cache or a knowledge file.
const SLUG = process.env.SLUG ?? "parker";
const CHANNEL_URL =
  process.env.CHANNEL_URL ?? "https://www.youtube.com/@fulltimefilmmaker/videos";
const CREATOR_NAME = process.env.CREATOR_NAME ?? "Parker Walbeck";
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS ?? 45);
const MIN_DURATION = 180; // drop Shorts / clips
const MAX_DURATION = 7200; // drop multi-hour livestreams
const CLEAN_CONCURRENCY = 6;

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const CACHE = path.join(DATA, ".cache", SLUG);
const P = {
  videos: path.join(CACHE, "videos.json"),
  transcripts: path.join(CACHE, "transcripts.json"),
  chunks: path.join(CACHE, "chunks.json"),
  out: path.join(DATA, `knowledge-${SLUG}.json`),
  registry: path.join(DATA, "creators.json"),
};

const YT_DLP =
  process.env.YT_DLP_PATH ?? path.join(os.homedir(), ".local/bin/yt-dlp");
const VENV_PY = path.join(ROOT, ".venv/bin/python");

// ---- small utils ------------------------------------------------------------
const log = (m: string) => console.log(m);
function ensureDirs() {
  fs.mkdirSync(CACHE, { recursive: true });
}
function readJSON<T>(p: string): T | null {
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null;
}
function writeJSON(p: string, data: unknown) {
  fs.writeFileSync(p, JSON.stringify(data));
}
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return out;
}

// ---- phase 1: list ----------------------------------------------------------
interface VideoMeta {
  id: string;
  title: string;
  url: string;
}
interface VideosCache {
  channel: Partial<CreatorMeta>;
  videos: VideoMeta[];
}

async function listVideos(): Promise<VideosCache> {
  const cached = readJSON<VideosCache>(P.videos);
  if (cached && !process.env.FORCE_LIST) {
    log(`1. list    → cached (${cached.videos.length} videos)`);
    return cached;
  }
  log(`1. list    → querying ${CHANNEL_URL} …`);
  const { stdout } = await execFileP(
    YT_DLP,
    ["--flat-playlist", "-J", CHANNEL_URL],
    { maxBuffer: 1024 * 1024 * 256 },
  );
  const data = JSON.parse(stdout);
  const entries: any[] = data.entries ?? [];

  const selected = entries
    .filter((e) => e && e.id && e.title)
    .filter((e) => {
      const d = typeof e.duration === "number" ? e.duration : null;
      // keep if duration unknown, else enforce the substantive-length window
      return d === null || (d >= MIN_DURATION && d <= MAX_DURATION);
    })
    .slice(0, MAX_VIDEOS)
    .map<VideoMeta>((e) => ({
      id: e.id,
      title: e.title,
      url: `https://www.youtube.com/watch?v=${e.id}`,
    }));

  // Channel avatar: prefer the square profile photo (the "avatar" thumbnail),
  // not the wide banner. Normalize the googleusercontent size params to
  // `=s400-c` — the raw params yt-dlp returns sometimes don't render in <img>.
  const thumbs: any[] = data.thumbnails ?? [];
  const avatarThumb =
    thumbs.find((t) => String(t.id ?? "").includes("avatar")) ??
    thumbs.find((t) => t.width && t.width === t.height) ??
    thumbs.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const avatar = avatarThumb?.url
    ? `${String(avatarThumb.url).split("=")[0]}=s400-c`
    : undefined;

  const result: VideosCache = {
    channel: {
      name: CREATOR_NAME,
      handle: data.uploader_id ?? data.channel ?? undefined,
      channelUrl: data.channel_url ?? data.uploader_url ?? CHANNEL_URL,
      channelId: data.channel_id ?? data.id,
      avatarUrl: avatar,
    },
    videos: selected,
  };
  writeJSON(P.videos, result);
  log(`   selected ${selected.length}/${entries.length} videos`);
  return result;
}

// ---- phase 2: fetch transcripts --------------------------------------------
type TranscriptMap = Record<string, Segment[]>;

async function fetchTranscripts(videos: VideoMeta[]): Promise<TranscriptMap> {
  const cached = readJSON<TranscriptMap>(P.transcripts);
  const have = cached ? Object.keys(cached) : [];

  // NO_FETCH: skip the network phase entirely and use whatever's cached.
  // Useful when YouTube has IP-blocked us but we already have enough videos.
  if (process.env.NO_FETCH && cached) {
    log(`2. fetch   → skipped (NO_FETCH), using ${have.length} cached`);
    return cached;
  }

  const need = videos
    .map((v) => v.id)
    .filter((id) => process.env.FORCE_TRANSCRIPTS || !have.includes(id));

  if (need.length === 0 && cached) {
    log(`2. fetch   → cached (${have.length} transcripts)`);
    return cached;
  }
  log(`2. fetch   → ${need.length} transcript(s) via youtube-transcript-api …`);

  const idsTmp = path.join(CACHE, "_ids.json");
  const outTmp = path.join(CACHE, "_transcripts_new.json");
  writeJSON(idsTmp, need);

  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      VENV_PY,
      [path.join(ROOT, "scripts/_fetch_transcripts.py"), idsTmp, outTmp],
      { maxBuffer: 1024 * 1024 * 512 },
    );
    child.stderr?.on("data", (d) => process.stderr.write(d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`fetcher exited ${code}`)),
    );
  });

  const fresh = readJSON<TranscriptMap>(outTmp) ?? {};
  const merged = { ...(cached ?? {}), ...fresh };
  writeJSON(P.transcripts, merged);
  fs.rmSync(idsTmp, { force: true });
  fs.rmSync(outTmp, { force: true });
  return merged;
}

// ---- phase 3: chunk ---------------------------------------------------------
interface ChunkCache extends Chunk {
  cleaned: boolean;
}

function buildChunks(
  videos: VideoMeta[],
  transcripts: TranscriptMap,
): ChunkCache[] {
  const existing = readJSON<ChunkCache[]>(P.chunks);
  if (existing && !process.env.FORCE_CHUNKS) {
    log(`3. chunk   → cached (${existing.length} chunks)`);
    return existing;
  }
  const chunks: ChunkCache[] = [];
  for (const v of videos) {
    const segs = transcripts[v.id];
    if (!segs || segs.length === 0) continue;
    // Smaller chunks → less context shipped per question → lower cost.
    const raw = chunkSegments(segs, 550, 80);
    raw.forEach((rc, i) => {
      chunks.push({
        id: `${v.id}:${i}`,
        text: rc.text,
        videoId: v.id,
        videoTitle: v.title,
        videoUrl: v.url,
        startSeconds: rc.startSeconds,
        cleaned: false,
      });
    });
  }
  writeJSON(P.chunks, chunks);
  log(`3. chunk   → ${chunks.length} chunks from ${videos.length} videos`);
  return chunks;
}

// ---- phase 4: clean ---------------------------------------------------------
const CLEAN_SYSTEM = `You clean auto-generated YouTube transcript excerpts. Given a raw excerpt, return ONLY the cleaned text with:
- correct punctuation, capitalization, and sentence breaks
- filler words and false starts removed (um, uh, "you know", repeated words)
- obvious speech-to-text errors of technical terms fixed in context
Keep the speaker's first-person voice and every substantive point. Do NOT summarize, add, translate, or omit real content. Output the cleaned text and nothing else.`;

async function cleanChunks(
  anthropic: Anthropic,
  chunks: ChunkCache[],
): Promise<ChunkCache[]> {
  const todo = chunks.filter((c) => !c.cleaned);
  if (todo.length === 0) {
    log(`4. clean   → already clean`);
    return chunks;
  }
  log(`4. clean   → ${todo.length} chunk(s) via ${CHAT_MODEL} …`);
  let done = 0;
  await mapPool(todo, CLEAN_CONCURRENCY, async (c) => {
    try {
      const res = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: CLEAN_SYSTEM,
        messages: [{ role: "user", content: c.text }],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (text) c.text = text;
      c.cleaned = true;
    } catch (e) {
      // Leave raw text in place on failure; still usable for retrieval.
      c.cleaned = true;
    }
    if (++done % 25 === 0 || done === todo.length) {
      log(`   cleaned ${done}/${todo.length}`);
      writeJSON(P.chunks, chunks); // checkpoint
    }
  });
  writeJSON(P.chunks, chunks);
  return chunks;
}

// ---- phase 5: creator meta --------------------------------------------------
const DEFAULT_QUESTIONS = [
  "How do I land my first paying client?",
  "What gear should a beginner actually buy?",
  "How do I make my videos look more cinematic?",
  "How do I price my video work?",
];

async function inferMeta(
  anthropic: Anthropic | null,
  base: Partial<CreatorMeta>,
  chunks: ChunkCache[],
  videoCount: number,
): Promise<CreatorMeta> {
  const fallback: CreatorMeta = {
    name: base.name ?? CREATOR_NAME,
    handle: base.handle ?? "",
    channelUrl: base.channelUrl ?? CHANNEL_URL,
    channelId: base.channelId,
    avatarUrl: base.avatarUrl,
    niche: "filmmaking and the business of video",
    tone: ["direct", "practical", "encouraging"],
    oneLiner: `Trained on ${videoCount} videos from ${base.name ?? CREATOR_NAME}. Ask anything.`,
    videoCount,
    suggestedQuestions: DEFAULT_QUESTIONS,
  };
  if (!anthropic) {
    log(`5. meta    → no ANTHROPIC_API_KEY, using defaults`);
    return fallback;
  }
  log(`5. meta    → inferring tone / niche / questions …`);
  // Sample chunks spread across the catalog.
  const step = Math.max(1, Math.floor(chunks.length / 30));
  const sample = chunks
    .filter((_, i) => i % step === 0)
    .slice(0, 30)
    .map((c) => `• ${c.text.slice(0, 280)}`)
    .join("\n");

  try {
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 600,
      system: `You analyze a creator's transcript samples and output strict JSON only.`,
      messages: [
        {
          role: "user",
          content: `Creator: ${fallback.name}. Below are excerpts from their videos.

Return ONLY a JSON object with these keys:
- "niche": short phrase for what they teach (max 8 words)
- "tone": array of exactly 3 lowercase adjectives describing their voice
- "oneLiner": one friendly sentence for a header subhead, mentioning they're trained on ${videoCount} videos; under 110 chars
- "suggestedQuestions": array of 4 specific questions their audience would actually ask, in their domain

Excerpts:
${sample}`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return {
      ...fallback,
      niche: json.niche || fallback.niche,
      tone: Array.isArray(json.tone) && json.tone.length ? json.tone : fallback.tone,
      oneLiner: json.oneLiner || fallback.oneLiner,
      suggestedQuestions:
        Array.isArray(json.suggestedQuestions) && json.suggestedQuestions.length
          ? json.suggestedQuestions
          : fallback.suggestedQuestions,
    };
  } catch (e) {
    log(`   meta inference failed, using defaults: ${(e as Error).message}`);
    return fallback;
  }
}

// ---- phase 6+7: embed + write ----------------------------------------------
async function embedAndWrite(
  chunks: ChunkCache[],
  creator: CreatorMeta,
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    log(
      `\n6. embed   → SKIPPED: OPENAI_API_KEY not set.\n` +
        `   Transcripts + ${chunks.length} chunks are cached. ` +
        `Add OPENAI_API_KEY to .env.local and rerun to finish.`,
    );
    return;
  }
  log(`6. embed   → embedding ${chunks.length} chunks via ${EMBEDDING_MODEL} (paced for free tier) …`);
  const vectors = await embedBatch(chunks.map((c) => c.text), (d, t) =>
    log(`   embedded ${d}/${t}`),
  );

  const finalChunks: Chunk[] = chunks.map((c, i) => ({
    id: c.id,
    text: c.text,
    videoId: c.videoId,
    videoTitle: c.videoTitle,
    videoUrl: c.videoUrl,
    startSeconds: c.startSeconds,
    embedding: vectors[i],
  }));

  // Carry a previously built voice profile across re-ingests (npm run voice
  // writes it to the cache so it survives knowledge-file rebuilds).
  const voicePath = path.join(CACHE, "voice.json");
  if (fs.existsSync(voicePath)) {
    creator.voiceProfile = JSON.parse(fs.readFileSync(voicePath, "utf8"));
    log(`   carried voice profile from cache`);
  }

  const knowledge: Knowledge = {
    creator,
    chunks: finalChunks,
    generatedAt: new Date().toISOString(),
    embeddingModel: EMBEDDING_MODEL,
  };
  writeJSON(P.out, knowledge);
  const mb = (fs.statSync(P.out).size / 1e6).toFixed(1);
  log(`7. write   → data/knowledge-${SLUG}.json (${finalChunks.length} chunks, ${mb}MB)`);

  registerCreator(creator);
}

/**
 * Add this creator to data/creators.json so the app can render its page.
 * Only fills a slug that isn't there yet — never clobbers hand-tuned config
 * (e.g. a corrected avatar, polished subhead/intro, or curated questions).
 */
function registerCreator(creator: CreatorMeta) {
  const registry = readJSON<Record<string, unknown>>(P.registry) ?? {};
  if (registry[SLUG]) {
    log(`   creators.json already has "${SLUG}" — left as-is`);
    return;
  }
  registry[SLUG] = {
    slug: SLUG,
    code: String(Math.floor(100 + Math.random() * 900)), // unguessable URL suffix
    name: creator.name,
    handle: creator.handle,
    niche: creator.niche,
    tone: creator.tone,
    avatarUrl: creator.avatarUrl ?? "",
    videoCount: creator.videoCount,
    subhead: `Trained on ${creator.videoCount} videos from ${creator.name}. Ask anything.`,
    intro: `I'm ${creator.name}'s AI twin, trained on ${creator.niche}. Ask me anything.`,
    suggestedQuestions: creator.suggestedQuestions,
  };
  writeJSON(P.registry, registry);
  log(`   registered "${SLUG}" in creators.json`);
}

// ---- main -------------------------------------------------------------------
async function main() {
  ensureDirs();
  log(`\nIngesting ${CREATOR_NAME} — ${CHANNEL_URL}\n`);

  const { channel, videos } = await listVideos();
  const transcripts = await fetchTranscripts(videos);
  const withTranscripts = videos.filter((v) => transcripts[v.id]?.length);
  let chunks = buildChunks(withTranscripts, transcripts);

  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;
  if (anthropic && !process.env.NO_CLEAN) {
    chunks = await cleanChunks(anthropic, chunks);
  } else {
    log(`4. clean   → skipped (${anthropic ? "NO_CLEAN" : "no ANTHROPIC_API_KEY"})`);
  }

  const creator = await inferMeta(anthropic, channel, chunks, withTranscripts.length);
  await embedAndWrite(chunks, creator);
  log(`\nDone.`);
}

main().catch((e) => {
  console.error("\nIngestion failed:", e);
  process.exit(1);
});
