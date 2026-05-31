/**
 * Aliases for built-in channel names, accepted everywhere a channel name is a
 * user input: `--channels`, `channels_disabled`, and config `channels:` keys.
 * Maps an alias → its canonical key (the key used in BUILTIN_CHANNELS).
 *
 * `agy` is the terminal command for Google's Antigravity CLI; `antigravity` is
 * the canonical channel key (descriptive; shown in docs and `mmr config`).
 */
export const CHANNEL_ALIASES: Record<string, string> = {
  agy: 'antigravity',
}

/** Normalize a channel name to its canonical key (identity if not an alias). */
export function normalizeChannelName(name: string): string {
  return CHANNEL_ALIASES[name] ?? name
}
