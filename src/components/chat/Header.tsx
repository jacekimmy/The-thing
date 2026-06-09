import type { CreatorConfig } from "@/lib/types";

export default function Header({ creator }: { creator: CreatorConfig }) {
  return (
    <header className="site-header stagger">
      <span className="avatar-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={creator.avatarUrl} alt={creator.name} />
      </span>
      <div className="creator-line">
        <span className="creator-name">{creator.name}</span>
        <span className="ai-pill">AI</span>
      </div>
    </header>
  );
}
