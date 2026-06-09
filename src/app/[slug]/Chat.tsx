"use client";

import { useEffect, useRef } from "react";
import type { CreatorConfig } from "@/lib/types";
import { useChat } from "@/lib/useChat";
import Header from "@/components/chat/Header";
import EmptyState from "@/components/chat/EmptyState";
import Message from "@/components/chat/Message";
import Composer from "@/components/chat/Composer";

// Edit this to your studio name when you send the demo.
const BRAND = "Twin Studio";

export default function Chat({ creator }: { creator: CreatorConfig }) {
  const { messages, isStreaming, send } = useChat(creator.slug);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstName = creator.name.split(" ")[0];

  // Stick to the bottom as messages stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <main className="app">
      <Header creator={creator} />

      <div
        className={`chat-scroll${messages.length === 0 ? " is-empty" : ""}`}
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <EmptyState creator={creator} onPick={send} />
        ) : (
          messages.map((m) => (
            <Message
              key={m.id}
              message={m}
              avatarUrl={creator.avatarUrl}
              creatorName={creator.name}
            />
          ))
        )}
      </div>

      <Composer
        onSend={send}
        disabled={isStreaming}
        placeholder={`Ask ${firstName} anything…`}
      />

      <footer className="footer">
        Built by {BRAND}. Lite demo on public content. The full version also
        learns your courses.
      </footer>
    </main>
  );
}
