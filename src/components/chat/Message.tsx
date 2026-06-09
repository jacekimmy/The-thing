import { Fragment, type ReactNode } from "react";
import type { ChatMessage } from "@/lib/useChat";
import type { Citation } from "@/lib/types";
import { sanitizeText } from "@/lib/text";

// --- tiny, dependency-free rich text (bold, paragraphs, simple bullets) ----
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${key}-${i}`}>{part}</Fragment>
    ),
  );
}

function renderRich(content: string): ReactNode[] {
  return content
    .trim()
    .split(/\n{2,}/)
    .map((block, bi) => {
      const lines = block.split("\n");
      const isList =
        lines.length > 0 && lines.every((l) => /^\s*[-•]\s+/.test(l));
      if (isList) {
        return (
          <ul key={bi}>
            {lines.map((l, li) => (
              <li key={li}>{inline(l.replace(/^\s*[-•]\s+/, ""), `${bi}-${li}`)}</li>
            ))}
          </ul>
        );
      }
      const header = block.match(/^#{1,6}\s+(.*)$/);
      if (header) {
        return (
          <p key={bi}>
            <strong>{inline(header[1], `${bi}-h`)}</strong>
          </p>
        );
      }
      return (
        <p key={bi}>
          {lines.map((l, li) => (
            <Fragment key={li}>
              {li > 0 && <br />}
              {inline(l, `${bi}-${li}`)}
            </Fragment>
          ))}
        </p>
      );
    });
}

function streamingView(content: string): ReactNode[] {
  // While tokens arrive, keep it simple: lines + inline bold + a live caret.
  const lines = content.split("\n");
  return lines.map((l, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {inline(l, `s-${li}`)}
    </Fragment>
  ));
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 1.5v7l6-3.5z" />
    </svg>
  );
}

function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="sources">
      <span className="sources-label">Sources</span>
      <div className="source-chips">
        {citations.map((c, i) => (
          <a
            key={i}
            className="source-chip"
            href={c.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`${c.videoTitle} · ${c.label}`}
          >
            <span className="source-play">
              <PlayIcon />
            </span>
            <span className="source-title">{c.videoTitle}</span>
            <span className="source-time">{c.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function Message({
  message,
  avatarUrl,
  creatorName,
}: {
  message: ChatMessage;
  avatarUrl: string;
  creatorName: string;
}) {
  if (message.role === "user") {
    return (
      <div className="msg-row user">
        <div className="bubble user">{message.content}</div>
      </div>
    );
  }

  const empty = message.content.length === 0;
  const text = sanitizeText(message.content);
  return (
    <>
      <div className="msg-row bot">
        <span className="mini-avatar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt={creatorName} />
        </span>
        <div className="bubble bot">
          {empty && message.streaming ? (
            <span className="thinking" aria-label="Thinking">
              <span />
              <span />
              <span />
            </span>
          ) : message.streaming ? (
            <>
              {streamingView(text)}
              <span className="caret" />
            </>
          ) : (
            renderRich(text)
          )}
        </div>
      </div>
      {message.citations && !message.streaming && (
        <Sources citations={message.citations} />
      )}
    </>
  );
}
