import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveUrlKey, urlKeyFor, listCreators } from "@/lib/creators";
import Chat from "./Chat";

// Pre-render a page per creator at its coded URL (e.g. /parker-602).
export function generateStaticParams() {
  return listCreators().map((c) => ({ slug: urlKeyFor(c) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const creator = resolveUrlKey(slug);
  if (!creator) return { title: "AI Twin" };
  return {
    title: `${creator.name} · AI Twin`,
    description: creator.subhead,
    robots: { index: false, follow: false }, // keep coded links out of search
  };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const creator = resolveUrlKey(slug);
  if (!creator) notFound();

  return <Chat creator={creator} urlKey={slug} />;
}
