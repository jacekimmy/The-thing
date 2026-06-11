// Apply hand-curated creator config (niche, tone, suggested questions, intro)
// on top of what ingest inferred. Patches BOTH data/creators.json (UI) and
// data/knowledge-<slug>.json (the chat voice reads tone/niche from there).
//
//   node scripts/apply_creator_overrides.mjs <slug>
import fs from "node:fs";

const OVERRIDES = {
  jason: {
    name: "Jason Yadlovski",
    niche: "DaVinci Resolve, especially audio and Fairlight",
    tone: ["clear", "calm", "makes hard things simple"],
    intro:
      "I'm Jason's AI twin, trained on his DaVinci Resolve videos. Ask me about Fairlight, audio cleanup, and making your edits sound right.",
    suggestedQuestions: [
      "Why does my dialogue sound muffled?",
      "How do I make my audio louder without clipping?",
      "How do I clean up background noise?",
    ],
  },
  rafael: {
    name: "Rafael Ludwig",
    niche: "Final Cut Pro, DaVinci Resolve, and camera gear",
    tone: ["honest", "no-fluff", "explains the why"],
    intro:
      "I'm Rafael's AI twin, trained on his videos. Ask me about Final Cut Pro, DaVinci Resolve, and camera gear.",
    suggestedQuestions: [
      "What camera should I buy for YouTube?",
      "How do I edit faster in Final Cut Pro?",
      "Should I fix it in camera or fix it in post?",
    ],
  },
  chris: {
    name: "Chris (Brooker Films)",
    niche: "Premiere Pro, After Effects, and filmmaking",
    tone: ["friendly", "practical", "beginner-welcoming"],
    intro:
      "I'm Chris's AI twin, trained on his Brooker Films tutorials. Ask me about Premiere, After Effects, and filmmaking.",
    // "Green screen" stays out: his current corpus only mentions keying in
    // passing, so that chip can't land a confident answer yet.
    suggestedQuestions: [
      "How do I make text 3D in After Effects?",
      "How do I do smooth speed ramps in Premiere Pro?",
      "How do I export with the right settings?",
    ],
  },
};

const slug = process.argv[2];
const o = OVERRIDES[slug];
if (!o) {
  console.error(`No overrides defined for "${slug}"`);
  process.exit(1);
}

// 1. creators.json (registry the UI reads)
const regPath = "data/creators.json";
const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
if (!reg[slug]) {
  console.error(`"${slug}" not in creators.json. Run ingest first.`);
  process.exit(1);
}
reg[slug] = {
  ...reg[slug],
  name: o.name,
  niche: o.niche,
  tone: o.tone,
  intro: o.intro,
  subhead: `Trained on ${reg[slug].videoCount} videos from ${o.name}. Ask anything.`,
  suggestedQuestions: o.suggestedQuestions,
};
fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");

// 2. knowledge-<slug>.json (the chat prompt reads creator.tone/niche here)
const kPath = `data/knowledge-${slug}.json`;
const k = JSON.parse(fs.readFileSync(kPath, "utf8"));
k.creator = { ...k.creator, name: o.name, niche: o.niche, tone: o.tone };
fs.writeFileSync(kPath, JSON.stringify(k));

console.log(`✅ ${slug}: overrides applied to creators.json + knowledge-${slug}.json`);
console.log(`   url: /${reg[slug].slug}-${reg[slug].code}`);
