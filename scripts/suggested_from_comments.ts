/**
 * Build a creator's 4 suggested questions from their REAL YouTube comments,
 * instead of inferring them from transcripts. Pulls top comments from a sample
 * of the creator's videos, keeps the question-like ones, and has Claude pick
 * the 4 that best represent what the audience actually asks AND that the bot
 * can answer from the creator's content.
 *
 *   SLUG=patrick npm run questions
 *
 * Writes the result into data/creators.json (<slug>.suggestedQuestions).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL } from "../src/lib/prompt";

dotenv.config({ path: ".env.local" });
const execFileP = promisify(execFile);

const SLUG = process.env.SLUG ?? "parker";
const SAMPLE_VIDEOS = Number(process.env.COMMENT_VIDEOS ?? 14);
const YT_DLP =
  process.env.YT_DLP_PATH ?? path.join(os.homedir(), ".local/bin/yt-dlp");
const ROOT = process.cwd();

interface VideoMeta {
  id: string;
  title: string;
}

async function commentsFor(videoId: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP(
      YT_DLP,
      [
        "-J",
        "--write-comments",
        "--extractor-args",
        "youtube:comment_sort=top;max_comments=40,40,0",
        "--skip-download",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { maxBuffer: 1024 * 1024 * 128 },
    );
    const info = JSON.parse(stdout);
    return (info.comments ?? []).map((c: { text?: string }) => c.text ?? "");
  } catch {
    return [];
  }
}

function looksLikeQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 12 || t.length > 240) return false;
  if (!t.includes("?")) return false;
  // Drop link/error/spam-ish noise.
  if (/https?:\/\//i.test(t)) return false;
  if (/403|forbidden|error code|refund|scam/i.test(t)) return false;
  return true;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }
  const registryPath = path.join(ROOT, "data", "creators.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const creator = registry[SLUG];
  if (!creator) {
    console.error(`No "${SLUG}" in creators.json — run ingest first.`);
    process.exit(1);
  }

  const videosCache = path.join(ROOT, "data", ".cache", SLUG, "videos.json");
  const videos: VideoMeta[] = JSON.parse(
    fs.readFileSync(videosCache, "utf8"),
  ).videos;
  const sample = videos.slice(0, SAMPLE_VIDEOS);

  console.log(`Pulling comments from ${sample.length} videos for "${SLUG}" …`);
  const questions = new Set<string>();
  for (let i = 0; i < sample.length; i++) {
    const texts = await commentsFor(sample[i].id);
    const qs = texts.filter(looksLikeQuestion);
    qs.forEach((q) => questions.add(q.replace(/\s+/g, " ").trim()));
    console.log(`  [${i + 1}/${sample.length}] ${sample[i].id} → +${qs.length} questions (pool: ${questions.size})`);
  }

  const pool = [...questions].slice(0, 120);
  if (pool.length < 4) {
    console.error("Not enough question comments found — leaving existing questions.");
    process.exit(1);
  }

  console.log(`\nAsking ${CHAT_MODEL} to pick the best 4 …`);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 500,
    system:
      "You curate suggested questions for a chat demo of a creator's AI twin. Output strict JSON only.",
    messages: [
      {
        role: "user",
        content: `Creator: ${creator.name}, who teaches ${creator.niche}.

Below are REAL audience questions pulled from their YouTube comments. Choose or lightly rewrite the 4 best to use as suggested-question chips.

Requirements:
- Must be genuine things this audience asks, in ${creator.name}'s domain.
- Must be answerable from general how-to video content (NOT about a broken link, a specific bug, pricing/refunds, or one obscure plugin setting).
- FULLY SELF-CONTAINED: each question must make complete sense on its own with zero prior context. REJECT or rewrite anything that says "this tool", "this plugin", "this preset", "this video", "it", "the new feature", or otherwise points at something the reader can't see. Name the actual topic instead.
- Clear, concise, and broadly useful to a newcomer.
- Vary them so they cover different topics the creator is known for.
- No em dashes.

Return ONLY a JSON array of exactly 4 strings.

Audience questions:
${pool.map((q) => `- ${q}`).join("\n")}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  const final: string[] = arr.slice(0, 4).map((s: string) => String(s).trim());

  creator.suggestedQuestions = final;
  registry[SLUG] = creator;
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

  console.log(`\n✅ Updated ${SLUG}.suggestedQuestions:`);
  final.forEach((q, i) => console.log(`   ${i + 1}. ${q}`));
}

main().catch((e) => {
  console.error("\nFailed:", e);
  process.exit(1);
});
