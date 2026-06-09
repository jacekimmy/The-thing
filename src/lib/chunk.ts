// Group timestamped transcript segments into retrieval-sized chunks.
// Each chunk keeps the start time of its first segment so a citation can
// deep-link to the exact moment in the video.

export interface Segment {
  text: string;
  start: number;
  duration: number;
}

export interface RawChunk {
  text: string;
  startSeconds: number;
}

// ~4 chars per token is a good-enough estimate for English captions.
const charsPerToken = 4;

export function chunkSegments(
  segments: Segment[],
  targetTokens = 800,
  overlapTokens = 120,
): RawChunk[] {
  const targetChars = targetTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;

  // Normalize: trim, drop empties, collapse the rolling-duplicate lines that
  // auto-captions sometimes emit (a line repeated as the next line's prefix).
  const segs = segments
    .map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((s) => s.text.length > 0);

  const chunks: RawChunk[] = [];
  let buf: Segment[] = [];
  let bufChars = 0;

  const flush = () => {
    if (buf.length === 0) return;
    chunks.push({
      text: buf.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim(),
      startSeconds: buf[0].start,
    });
  };

  for (const seg of segs) {
    buf.push(seg);
    bufChars += seg.text.length + 1;
    if (bufChars >= targetChars) {
      flush();
      // Carry the tail of this chunk forward as overlap for continuity.
      const carried: Segment[] = [];
      let carriedChars = 0;
      for (let i = buf.length - 1; i >= 0; i--) {
        carriedChars += buf[i].text.length + 1;
        carried.unshift(buf[i]);
        if (carriedChars >= overlapChars) break;
      }
      buf = carried;
      bufChars = carriedChars;
    }
  }
  // Flush remainder, but fold a tiny trailing chunk into the previous one.
  if (buf.length > 0) {
    const remainderChars = buf.reduce((n, s) => n + s.text.length + 1, 0);
    if (remainderChars < targetChars * 0.35 && chunks.length > 0) {
      const last = chunks[chunks.length - 1];
      last.text = `${last.text} ${buf.map((s) => s.text).join(" ")}`
        .replace(/\s+/g, " ")
        .trim();
    } else {
      flush();
    }
  }
  return chunks;
}
