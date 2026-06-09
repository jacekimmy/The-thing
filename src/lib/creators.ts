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

/** Public config for one creator, or null if the slug is unknown. */
export function getCreator(slug: string): CreatorConfig | null {
  return load()[slug] ?? null;
}

/** All known creator slugs (e.g. for static generation). */
export function listCreatorSlugs(): string[] {
  return Object.keys(load());
}

export const DEFAULT_SLUG = "parker";
