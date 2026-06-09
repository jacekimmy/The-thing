/**
 * Terminal RAG check — proves retrieval + Claude answer + citations end to end,
 * without the web UI.
 *
 *   npm run ask -- "How do I land my first client?"
 */
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

import { embedQuery } from "../src/lib/embeddings";
import { retrieve, toCitations } from "../src/lib/retrieval";
import { buildSystemPrompt, CHAT_MODEL } from "../src/lib/prompt";
import { loadKnowledge } from "../src/lib/retrieval";

dotenv.config({ path: ".env.local" });

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error('Usage: npm run ask -- "your question"');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in .env.local");
    process.exit(1);
  }

  const slug = process.env.SLUG ?? "parker";
  const knowledge = loadKnowledge(slug);
  console.log(`\n\x1b[2mCreator:\x1b[0m ${knowledge.creator.name} (${slug})  ` +
    `\x1b[2m(${knowledge.chunks.length} chunks, ${knowledge.creator.videoCount} videos)\x1b[0m`);
  console.log(`\x1b[1m\x1b[38;5;209mQ:\x1b[0m ${question}\n`);

  const queryEmbedding = await embedQuery(question);
  const top = retrieve(queryEmbedding, knowledge, 5);
  const citations = toCitations(top, 3);
  const system = buildSystemPrompt(knowledge.creator, top);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  process.stdout.write("\x1b[1mA:\x1b[0m ");
  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: question }],
  });
  stream.on("text", (t) => process.stdout.write(t));
  const final = await stream.finalMessage();

  console.log("\n\n\x1b[2m── Sources ──\x1b[0m");
  for (const c of citations) {
    console.log(`  \x1b[38;5;209m▶\x1b[0m ${c.videoTitle}  \x1b[2m${c.label}\x1b[0m`);
    console.log(`    \x1b[2m${c.videoUrl}\x1b[0m`);
  }
  console.log(`\n\x1b[2mRetrieval scores:\x1b[0m ${top.map((t) => t.score.toFixed(3)).join(", ")}`);

  // Real cost (Haiku 4.5: $1/M input, $5/M output). Embedding cost is negligible.
  const inTok = final.usage.input_tokens;
  const outTok = final.usage.output_tokens;
  const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5;
  console.log(
    `\x1b[2mTokens:\x1b[0m ${inTok} in + ${outTok} out  ` +
      `\x1b[1m\x1b[38;5;209m≈ ${(cost * 100).toFixed(3)}¢ / message\x1b[0m`,
  );
}

main().catch((e) => {
  console.error("\nError:", e);
  process.exit(1);
});
