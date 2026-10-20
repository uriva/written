/**
 * Shared webhook types, filter normalization and matching.
 *
 * This module is intentionally dependency-free so it can be unit tested
 * without a database connection.
 */

export const WEBHOOK_EVENT_TYPES = [
  "post.created",
  "post.updated",
  "profile.updated",
  "webhook.test",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookFilters {
  /** Case-insensitive substrings matched against post content / profile text. */
  keywords?: string[];
  /** Hashtags (with or without a leading #). */
  tags?: string[];
  /** 64-char hex Ed25519 public keys. */
  authors?: string[];
  /** Only events whose text mentions one of these 64-char hex public keys. */
  mentions?: string[];
  /** Only events that are direct replies to this post id. */
  replyToId?: string;
  /** Only events inside this thread (root post id). */
  rootId?: string;
}

export interface NormalizedWebhookFilters {
  keywords: string[];
  tags: string[];
  authors: string[];
  mentions: string[];
  replyToId?: string;
  rootId?: string;
}

export const MAX_FILTER_TERMS = 25;
export const MAX_KEYWORD_LENGTH = 64;
export const MAX_TAG_LENGTH = 64;

export interface WebhookPost {
  id: string;
  content: string;
  authorPubkey: string | null;
  signed: boolean;
  signature?: string | null;
  createdAt: number;
  updatedAt?: number | null;
  replyToId?: string | null;
  rootId?: string | null;
  tags: string[];
  mentions?: string[];
  profile?: {
    name: string;
    bio?: string | null;
    avatar?: string | null;
  } | null;
  url?: string;
}

export interface WebhookProfile {
  pubkey: string;
  name: string;
  bio?: string | null;
  avatar?: string | null;
  updatedAt: number;
  url?: string;
}

export interface WebhookEventData {
  post?: WebhookPost;
  profile?: WebhookProfile;
  message?: string;
}

export interface WebhookEvent {
  type: WebhookEventType;
  data: WebhookEventData;
  /** Derived fields used for filter matching. */
  content?: string;
  tags?: string[];
  mentions?: string[];
  authorPubkey?: string;
  replyToId?: string;
  rootId?: string;
}

function cleanStringList(
  value: unknown,
  field: string,
  maxLength: number
): string[] {
  if (value === undefined || value === null) return [];

  const list = Array.isArray(value) ? value : [value];
  if (list.length > MAX_FILTER_TERMS) {
    throw new Error(`'filters.${field}' accepts at most ${MAX_FILTER_TERMS} entries`);
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (typeof entry !== "string") {
      throw new Error(`'filters.${field}' must be a string or an array of strings`);
    }
    let term = entry.trim();
    if (!term) continue;
    if (field === "tags") term = term.replace(/^#+/, "");
    if (term.length > maxLength) {
      throw new Error(`'filters.${field}' entries must be at most ${maxLength} characters`);
    }
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(term);
  }

  return cleaned;
}

function cleanId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`'filters.${field}' must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 128) {
    throw new Error(`'filters.${field}' is too long`);
  }
  return trimmed;
}

/**
 * Validate and normalize a user supplied filter object.
 * Throws a descriptive Error for invalid input.
 */
export function normalizeFilters(input: unknown): NormalizedWebhookFilters {
  if (input === undefined || input === null) {
    throw new Error(
      "A 'filters' object is required. Use at least one of: keywords, tags, authors, mentions, replyToId, rootId"
    );
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("'filters' must be an object");
  }

  const raw = input as Record<string, unknown>;
  const keywords = cleanStringList(raw.keywords, "keywords", MAX_KEYWORD_LENGTH).map(
    (k) => k.toLowerCase()
  );
  const tags = cleanStringList(raw.tags, "tags", MAX_TAG_LENGTH).map((t) =>
    t.toLowerCase()
  );
  const authors = cleanStringList(raw.authors, "authors", 64).map((a) =>
    a.toLowerCase()
  );
  const mentions = cleanStringList(raw.mentions, "mentions", 65).map((m) =>
    m.replace(/^@/, "").toLowerCase()
  );

  for (const author of authors) {
    if (!/^[0-9a-f]{64}$/.test(author)) {
      throw new Error(
        "'filters.authors' must contain 64-character hex Ed25519 public keys"
      );
    }
  }
  for (const mention of mentions) {
    if (!/^[0-9a-f]{64}$/.test(mention)) {
      throw new Error(
        "'filters.mentions' must contain 64-character hex Ed25519 public keys"
      );
    }
  }

  const replyToId = cleanId(raw.replyToId, "replyToId");
  const rootId = cleanId(raw.rootId, "rootId");

  if (
    !keywords.length &&
    !tags.length &&
    !authors.length &&
    !mentions.length &&
    !replyToId &&
    !rootId
  ) {
    throw new Error(
      "At least one filter is required. Use 'keywords', 'tags', 'authors', 'mentions', 'replyToId' or 'rootId'"
    );
  }

  return { keywords, tags, authors, mentions, replyToId, rootId };
}

export function parseStoredFilters(json: string | null | undefined): NormalizedWebhookFilters | null {
  if (!json) return null;
  try {
    return normalizeFilters(JSON.parse(json));
  } catch {
    return null;
  }
}

/** AND across filter types, OR within each list. */
export function matchesFilters(
  filters: NormalizedWebhookFilters,
  event: WebhookEvent
): boolean {
  if (filters.authors.length) {
    const author = (event.authorPubkey || "").toLowerCase();
    if (!author || !filters.authors.includes(author)) return false;
  }

  if (filters.tags.length) {
    const eventTags = (event.tags || []).map((t) => t.toLowerCase());
    if (!filters.tags.some((tag) => eventTags.includes(tag))) return false;
  }

  if ((filters.mentions || []).length) {
    const eventMentions = (event.mentions || []).map((m) => m.toLowerCase());
    if (!filters.mentions.some((mention) => eventMentions.includes(mention))) {
      return false;
    }
  }

  if (filters.keywords.length) {
    const haystack = (event.content || "").toLowerCase();
    if (!filters.keywords.some((keyword) => haystack.includes(keyword))) {
      return false;
    }
  }

  if (filters.replyToId && event.replyToId !== filters.replyToId) return false;
  if (filters.rootId && event.rootId !== filters.rootId) return false;

  return true;
}

export function describeFilters(filters: NormalizedWebhookFilters): string {
  const parts: string[] = [];
  if (filters.authors.length) parts.push(`authors=${filters.authors.join(",")}`);
  if ((filters.mentions || []).length) {
    parts.push(`mentions=${filters.mentions.join(",")}`);
  }
  if (filters.tags.length) parts.push(`tags=#${filters.tags.join(",#")}`);
  if (filters.keywords.length) parts.push(`keywords="${filters.keywords.join('","')}"`);
  if (filters.replyToId) parts.push(`replyTo=${filters.replyToId}`);
  if (filters.rootId) parts.push(`root=${filters.rootId}`);
  return parts.join(" ");
}
