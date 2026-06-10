import fs from "node:fs";
import path from "node:path";
import type { CreatorConfig } from "./types";

// The registry of "photos" that drop into the one frame. Loaded once.
let registry: Record<string, CreatorConfig> | null = null;

function load(): Record<string, CreatorConfig> {
  if (registry) return registry;
  const file = path.join(process.cwd(), "data", "creators.json");
  registry = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    CreatorConfig
  >;
  return registry;
}

/** Public config for one creator by base slug, or null if unknown. */
export function getCreator(slug: string): CreatorConfig | null {
  return load()[slug] ?? null;
}

/**
 * Resolve a URL segment like "parker-602" to its creator, validating the
 * 3-digit code. Returns null on unknown slug or wrong/missing code, so a bare
 * "/parker" or a guessed code 404s. Splits on the LAST hyphen so multi-word
 * slugs (e.g. "matt-johnson-602") still work.
 */
export function resolveUrlKey(urlKey: string): CreatorConfig | null {
  const i = urlKey.lastIndexOf("-");
  if (i < 1) return null;
  const slug = urlKey.slice(0, i);
  const code = urlKey.slice(i + 1);
  const creator = load()[slug];
  return creator && creator.code === code ? creator : null;
}

/** The public URL segment for a creator, e.g. "parker-602". */
export function urlKeyFor(creator: CreatorConfig): string {
  return `${creator.slug}-${creator.code}`;
}

/** All creators (e.g. for static generation). */
export function listCreators(): CreatorConfig[] {
  return Object.values(load());
}
