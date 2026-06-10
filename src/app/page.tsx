import type { Metadata } from "next";
import Landing, { BRAND } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: `${BRAND} · Your content, answering in your voice`,
  description:
    "Turn your video library into an AI twin that answers your audience in your voice, with a citation to the exact moment you said it.",
};

// The root sells the tool. Creator demos stay on their coded links.
export default function Home() {
  return <Landing />;
}
