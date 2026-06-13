// The product brand, in a plain module (no "use client") so both server
// components (metadata) and client components can import the real string.
export const BRAND = "Lexicon";

// Trailing portion of the wordmark rendered in the accent color. If BRAND
// doesn't end with it, the whole word renders in ink.
export const BRAND_ACCENT = "icon";
