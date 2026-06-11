/**
 * Learn HOW a creator speaks from their raw YouTube transcripts and store a
 * voice profile the chat prompt uses to mimic them.
 *
 *   SLUG=parker npm run voice
 *
 * Samples openings, middles, and closings across their videos (raw captions,
 * before any cleanup, so tics and cadence survive), then has Claude produce a
 * structured style card plus verbatim exemplar lines. Writes the profile to:
 *   - data/.cache/<slug>/voice.json        (survives re-ingests)
 *   - data/knowledge-<slug>.json           (creator.voiceProfile, used live)
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL } from "../src/lib/prompt";
import type { VoiceProfile } from "../src/lib/types";

dotenv.config({ path: ".env.local" });

const SLUG = process.env.SLUG ?? "parker";
const ROOT = process.cwd();
const CACHE = path.join(ROOT, "data", ".cache", SLUG);
const SAMPLE_CHAR_BUDGET = 15000; // ≈ 3.7K tokens of raw speech

interface Segment {
  text: string;
  start: number;
}

function sampleSpeech(): string {
  const tPath = path.join(CACHE, "transcripts.json");
  if (!fs.existsSync(tPath)) {
    throw new Error(`No transcript cache at ${tPath}. Run ingest for ${SLUG} first.`);
  }
  const transcripts: Record<string, Segment[]> = JSON.parse(
    fs.readFileSync(tPath, "utf8"),
  );
  const videos = Object.values(transcripts).filter((s) => s.length > 20);

  // From each video: the opening (how they greet and frame), a middle window
  // (how they explain), and the ending (how they sign off).
  const pieces: string[] = [];
  for (const segs of videos) {
    const join = (xs: Segment[]) => xs.map((s) => s.text).join(" ");
    const mid = Math.floor(segs.length / 2);
    pieces.push(
      `[opening] ${join(segs.slice(0, 12))}`,
      `[middle] ${join(segs.slice(mid, mid + 10))}`,
      `[ending] ${join(segs.slice(-8))}`,
    );
  }

  // Round-robin until the budget is filled so many videos get represented.
  let out = "";
  for (const p of pieces) {
    if (out.length + p.length > SAMPLE_CHAR_BUDGET) break;
    out += p + "\n";
  }
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    process.exit(1);
  }
  const kPath = path.join(ROOT, "data", `knowledge-${SLUG}.json`);
  if (!fs.existsSync(kPath)) {
    console.error(`No data/knowledge-${SLUG}.json. Run ingest first.`);
    process.exit(1);
  }
  const knowledge = JSON.parse(fs.readFileSync(kPath, "utf8"));
  const name: string = knowledge.creator.name;

  console.log(`Sampling raw speech for ${name} (${SLUG}) ...`);
  const sample = sampleSpeech();
  console.log(`  sample: ${sample.length} chars`);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log(`Analyzing voice with ${CHAT_MODEL} ...`);
  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1400,
    system:
      "You are a dialect and speech-pattern analyst. You study HOW a person talks, not what they talk about. Output strict JSON only.",
    messages: [
      {
        role: "user",
        content: `Below are raw auto-caption excerpts from ${name}'s YouTube videos, tagged [opening] / [middle] / [ending]. Captions lack punctuation; infer sentence boundaries.

Analyze how ${name} speaks and return ONLY a JSON object with these keys:
- "styleSummary": 2-3 sentences describing their overall speaking style.
- "rhythm": one sentence on sentence length, pacing, and energy.
- "openings": 2-4 short patterns showing how they typically start a topic or answer (their actual constructions, not generic ones).
- "closings": 2-3 patterns showing how they wrap up or sign off.
- "catchphrases": 4-8 recurring phrases, verbal tics, or transitions they actually use (verbatim).
- "vocabulary": one sentence on register, slang, and technical level.
- "quirks": 2-5 distinctive habits (humor style, analogies, self-reference, audience address, etc).
- "exemplars": 8-10 verbatim lines from the excerpts that are distinctively THEM. Keep their exact words; only add punctuation and capitalization. Prefer lines with personality over plain facts. Each 8-30 words.

Rules: everything must come from the excerpts, no inventing. No em dashes anywhere.

Excerpts:
${sample}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const profile: VoiceProfile = JSON.parse(
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  );

  // Persist: cache (survives re-ingest) + live knowledge file.
  fs.writeFileSync(path.join(CACHE, "voice.json"), JSON.stringify(profile, null, 2));
  knowledge.creator.voiceProfile = profile;
  fs.writeFileSync(kPath, JSON.stringify(knowledge));

  console.log(`\n✅ voice profile saved for ${SLUG}`);
  console.log(`   style: ${profile.styleSummary}`);
  console.log(`   catchphrases: ${profile.catchphrases.slice(0, 5).join(" | ")}`);
  console.log(`   exemplars: ${profile.exemplars.length}`);
}

main().catch((e) => {
  console.error("\nFailed:", e);
  process.exit(1);
});
