/** Pretty-format a raw model ID like "claude-opus-4-6-20250415" → "Claude Opus 4" */
export function formatModelName(raw: string): string {
  // Strip date suffix (e.g. -20250415)
  const name = raw.replace(/-\d{8}$/, "");
  // Map known model families
  const families: [RegExp, string][] = [
    [/^claude-opus-4-6/, "Claude Opus 4.6"],
    [/^claude-sonnet-4-6/, "Claude Sonnet 4.6"],
    [/^claude-opus-4-5/, "Claude Opus 4.5"],
    [/^claude-sonnet-4-5/, "Claude Sonnet 4.5"],
    [/^claude-opus-4/, "Claude Opus 4"],
    [/^claude-sonnet-4/, "Claude Sonnet 4"],
    [/^claude-haiku-4-5/, "Claude Haiku 4.5"],
    [/^claude-haiku-4/, "Claude Haiku 4"],
    [/^claude-3[\.\-]5-sonnet/, "Claude 3.5 Sonnet"],
    [/^claude-3[\.\-]5-haiku/, "Claude 3.5 Haiku"],
    [/^claude-3[\.\-]5-opus/, "Claude 3.5 Opus"],
    [/^claude-3-opus/, "Claude 3 Opus"],
    [/^claude-3-sonnet/, "Claude 3 Sonnet"],
    [/^claude-3-haiku/, "Claude 3 Haiku"],
  ];
  for (const [re, label] of families) {
    if (re.test(name)) return label;
  }
  // Fallback: capitalize segments
  return name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/** Known context window limits (tokens) by model family */
export function getContextLimit(raw: string): number {
  if (/opus-4/.test(raw)) return 200_000;
  if (/sonnet-4/.test(raw)) return 200_000;
  if (/haiku-4/.test(raw)) return 200_000;
  if (/3[\.\-]5/.test(raw)) return 200_000;
  if (/3-opus/.test(raw)) return 200_000;
  return 200_000; // default
}

/** Format token count to a short human-readable string */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
