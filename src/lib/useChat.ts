"use client";

import { useCallback, useRef, useState } from "react";
import type { Citation } from "./types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  streaming?: boolean;
  error?: boolean;
}

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

/** Chat state + SSE streaming against /api/chat, scoped to one creator slug. */
export function useChat(slug: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streamingRef.current) return;

      const userMsg: ChatMessage = { id: nextId(), role: "user", content };
      const botId = nextId();
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: botId, role: "assistant", content: "", streaming: true },
      ]);
      streamingRef.current = true;
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, messages: history }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Parse the SSE stream: blocks separated by a blank line, each with
        // an `event:` and a `data:` line.
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            let event = "message";
            let data = "";
            for (const line of raw.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            const payload = JSON.parse(data);

            if (event === "sources") {
              patch(botId, (m) => ({ ...m, citations: payload as Citation[] }));
            } else if (event === "token") {
              patch(botId, (m) => ({ ...m, content: m.content + payload }));
            } else if (event === "error") {
              patch(botId, (m) => ({
                ...m,
                content: m.content || "Something went wrong. Please try again.",
                error: true,
                streaming: false,
              }));
            }
          }
        }
        patch(botId, (m) => ({ ...m, streaming: false }));
      } catch {
        patch(botId, (m) => ({
          ...m,
          content:
            m.content || "I couldn't reach the server just now. Try again?",
          error: true,
          streaming: false,
        }));
      } finally {
        streamingRef.current = false;
        setStreaming(false);
      }
    },
    [messages, patch, slug],
  );

  return { messages, isStreaming, send };
}
