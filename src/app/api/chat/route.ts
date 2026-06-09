import Anthropic from "@anthropic-ai/sdk";
import { embedQuery } from "@/lib/embeddings";
import { loadKnowledge, retrieve, toCitations } from "@/lib/retrieval";
import { buildSystemPrompt, CHAT_MODEL } from "@/lib/prompt";
import { getCreator, DEFAULT_SLUG } from "@/lib/creators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cost knobs. Lower context + bounded memory + tighter output ≈ ~0.5¢/message.
const RETRIEVE_K = 5; // video excerpts sent as grounding context
const MAX_HISTORY_MESSAGES = 5; // memory window (≈ current + 2 prior turns)
const MAX_OUTPUT_TOKENS = 700; // answers are short; this is a safety ceiling

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Keep only the last N messages, starting on a user turn (API requirement). */
function capHistory(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
  let trimmed = messages.slice(-maxMessages);
  while (trimmed.length && trimmed[0].role !== "user") trimmed = trimmed.slice(1);
  return trimmed.length ? trimmed : messages.slice(-1);
}

function lastUserQuestion(body: any): string | null {
  if (typeof body?.question === "string" && body.question.trim()) {
    return body.question.trim();
  }
  const messages: ChatMessage[] = Array.isArray(body?.messages)
    ? body.messages
    : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].content?.trim()) {
      return messages[i].content.trim();
    }
  }
  return null;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = lastUserQuestion(body);
  if (!question) {
    return Response.json({ error: "No question provided" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  // The slug picks exactly one creator's box. Unknown slug → 404, no fallback
  // pile to leak across.
  const slug = typeof body?.slug === "string" ? body.slug : DEFAULT_SLUG;
  const creator = getCreator(slug);
  if (!creator) {
    return Response.json({ error: `Unknown creator: ${slug}` }, { status: 404 });
  }
  const knowledge = loadKnowledge(slug);

  const allMessages: ChatMessage[] = Array.isArray(body?.messages)
    ? body.messages.filter(
        (m: ChatMessage) =>
          (m.role === "user" || m.role === "assistant") && m.content?.trim(),
      )
    : [{ role: "user", content: question }];

  // Memory window: keep only the last few turns so cost doesn't grow with the
  // conversation. The retrieved video context (rebuilt every turn) carries the
  // grounding, so the model rarely needs older chat history. Must start on a
  // user message for the Anthropic API.
  const history = capHistory(allMessages, MAX_HISTORY_MESSAGES);

  // 1. embed question  2. retrieve  3. build prompt
  const queryEmbedding = await embedQuery(question);
  const top = retrieve(queryEmbedding, knowledge, RETRIEVE_K);
  const citations = toCitations(top, 3);
  const system = buildSystemPrompt(knowledge.creator, top);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const url = new URL(req.url);
  const wantStream = url.searchParams.get("stream") !== "0";

  // --- non-streaming JSON mode (handy for curl / terminal verification) ---
  if (!wantStream) {
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    const answer = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return Response.json({ answer, citations });
  }

  // --- streaming SSE mode (for the chat UI) ---
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        // Send sources up front so the UI can render the trust row immediately.
        send("sources", citations);

        const mStream = anthropic.messages.stream({
          model: CHAT_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        });
        mStream.on("text", (delta) => send("token", delta));
        await mStream.finalMessage();
        send("done", {});
      } catch (e) {
        send("error", { message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
