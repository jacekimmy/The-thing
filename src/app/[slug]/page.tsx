import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCreator, listCreatorSlugs } from "@/lib/creators";
import Chat from "./Chat";

// Pre-render a page per known creator.
export function generateStaticParams() {
  return listCreatorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const creator = getCreator(slug);
  if (!creator) return { title: "AI Twin" };
  return {
    title: `${creator.name} · AI Twin`,
    description: creator.subhead,
  };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const creator = getCreator(slug);
  if (!creator) notFound();

  return <Chat creator={creator} />;
}
