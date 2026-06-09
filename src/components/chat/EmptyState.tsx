import type { CreatorConfig } from "@/lib/types";

export default function EmptyState({
  creator,
  onPick,
}: {
  creator: CreatorConfig;
  onPick: (q: string) => void;
}) {
  return (
    <div className="empty">
      <p className="empty-intro stagger" style={{ animationDelay: "0.06s" }}>
        {creator.intro}
      </p>
      <div className="chips-label stagger" style={{ animationDelay: "0.14s" }}>
        Try asking
      </div>
      <div className="chips">
        {creator.suggestedQuestions.map((q, i) => (
          <button
            key={i}
            type="button"
            className="chip stagger"
            style={{ animationDelay: `${0.2 + i * 0.07}s` }}
            onClick={() => onPick(q)}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
