/**
 * Strip em/en dashes from rendered text. The system prompt already asks the
 * model to avoid them, but this guarantees none ever reach the screen — a dash
 * joining two clauses becomes a comma, which reads naturally.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/\s*[—–]\s*/g, ", ") // em/en dash → comma
    .replace(/\s+--\s+/g, ", ") // " -- " used as a dash
    .replace(/\s+,/g, ",") // tidy: space before comma
    .replace(/,\s*,/g, ",") // tidy: doubled commas
    .replace(/,\s*([.!?;:])/g, "$1") // tidy: comma hugging other punctuation
    .replace(/^\s*,\s*/, "") // tidy: a stray leading comma
    .replace(/[ \t]{2,}/g, " ");
}
