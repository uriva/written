/**
 * Mentions are written as @<64-char hex Ed25519 public key>.
 *
 * Written has no global usernames, so a raw key is the only unambiguous
 * mention target. Friendly names are derived on read and are not unique.
 */

export const MENTION_REGEX_SOURCE = "@[0-9a-fA-F]{64}(?![a-zA-Z0-9_])";

const MENTION_RE = /(^|[^a-zA-Z0-9_])@([0-9a-fA-F]{64})(?![a-zA-Z0-9_])/g;

/** Extract unique lowercased public keys mentioned in a piece of text. */
export function extractMentions(content: string): string[] {
  if (!content) return [];

  const mentions: string[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(MENTION_RE)) {
    const pubkey = match[2]!.toLowerCase();
    if (seen.has(pubkey)) continue;
    seen.add(pubkey);
    mentions.push(pubkey);
  }

  return mentions;
}

/** Short display form for a mention, e.g. @a1b2c3d4…9f0e1d. */
export function formatMention(pubkey: string): string {
  if (pubkey.length <= 18) return `@${pubkey}`;
  return `@${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
}
