# AI Twin — demo engine

A single-creator chat experience trained on one creator's public YouTube
content. This repo currently contains the **engine** (ingestion → retrieval →
Claude answers with citations). The branded chat **UI** is the next session.

Current creator: **Parker Walbeck** (`@fulltimefilmmaker`).

## How it works

**Offline ingestion** (`scripts/ingest.ts`) produces `data/knowledge.json`:

1. **list** — enumerate channel videos with `yt-dlp`, select ~45 substantive
   ones (drops Shorts and multi-hour livestreams).
2. **fetch** — pull English transcripts with per-segment timestamps via
   `youtube-transcript-api` (uses YouTube's InnerTube API, which survives the
   rate-limiting that blocks `yt-dlp`'s caption endpoint). Paced + backed off.
3. **chunk** — group segments into ~800-token chunks, each keeping the start
   timestamp of its first segment (this powers the "jump to the clip" citation).
4. **clean** — Claude Haiku tidies each chunk (punctuation, filler, ASR errors).
5. **meta** — Claude infers tone words, niche, header copy, and 4 suggested
   questions from the actual transcripts.
6. **embed** — OpenAI `text-embedding-3-small` embeds each chunk.
7. **write** — everything lands in `data/knowledge.json`.

Each phase is cached under `data/.cache/`, so reruns resume cheaply. Phases 1–3
need no API keys.

**Live answer path** (`src/app/api/chat/route.ts` and `scripts/ask.ts`):
embed the question → cosine top-k over `knowledge.json` → build the system
prompt with retrieved chunks → stream from Claude Haiku 4.5 → return citations
with timestamped YouTube links.

## Setup

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install youtube-transcript-api
cp .env.local.example .env.local   # then fill in the two keys
```

`.env.local`:

```
ANTHROPIC_API_KEY=...   # Claude Haiku 4.5: chat answers + transcript cleaning
OPENAI_API_KEY=...      # text-embedding-3-small: embeds chunks + questions
```

> Two keys are required because RAG needs an embeddings model and Anthropic
> doesn't serve one; the answers themselves come from Claude.

`yt-dlp` is expected at `~/.local/bin/yt-dlp` (override with `YT_DLP_PATH`).

## Run

```bash
npm run ingest                       # build data/knowledge.json
MAX_VIDEOS=20 npm run ingest         # smaller/faster demo
NO_CLEAN=1 npm run ingest            # skip LLM cleaning

npm run ask -- "How do I land my first client?"   # terminal RAG check

npm run dev                          # then POST /api/chat
curl -s localhost:3000/api/chat?stream=0 \
  -H 'content-type: application/json' \
  -d '{"question":"What camera should a beginner buy?"}' | jq
```

`/api/chat` streams Server-Sent Events by default (`sources`, then `token`
deltas, then `done`); add `?stream=0` for a single JSON `{ answer, citations }`.

## Layout

```
scripts/ingest.ts            ingestion orchestrator
scripts/_fetch_transcripts.py  transcript fetcher (paced, backoff)
scripts/ask.ts               terminal RAG check
src/lib/chunk.ts             timestamp-preserving chunking
src/lib/embeddings.ts        OpenAI embeddings
src/lib/retrieval.ts         in-memory cosine search + citations
src/lib/prompt.ts            system prompt + model id
src/app/api/chat/route.ts    streaming chat endpoint
data/knowledge.json          generated knowledge base (gitignored until built)
```
