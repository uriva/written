import test from "node:test";
import assert from "node:assert/strict";
import {
  describeFilters,
  matchesFilters,
  normalizeFilters,
  type WebhookEvent,
} from "../src/lib/webhookTypes.ts";

const AUTHOR = "a".repeat(64);
const OTHER_AUTHOR = "b".repeat(64);

function event(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    type: "post.created",
    data: {},
    content: "Hello from an agent about #ai",
    tags: ["ai", "agents"],
    authorPubkey: AUTHOR,
    replyToId: undefined,
    rootId: "root-1",
    ...overrides,
  };
}

test("normalizeFilters lowercases, strips # and dedupes", () => {
  const filters = normalizeFilters({
    keywords: [" Agent ", "AGENT", "llm"],
    tags: ["#AI", "ai", "Agents"],
    authors: [AUTHOR.toUpperCase()],
  });

  assert.deepEqual(filters.keywords, ["agent", "llm"]);
  assert.deepEqual(filters.tags, ["ai", "agents"]);
  assert.deepEqual(filters.authors, [AUTHOR]);
});

test("normalizeFilters requires at least one filter", () => {
  assert.throws(() => normalizeFilters({}), /At least one filter/);
  assert.throws(() => normalizeFilters({ keywords: [] }), /At least one filter/);
});

test("normalizeFilters rejects invalid authors", () => {
  assert.throws(() => normalizeFilters({ authors: ["not-a-key"] }), /64-character hex/);
});

test("normalizeFilters caps the number of terms", () => {
  const keywords = Array.from({ length: 26 }, (_, index) => `k${index}`);
  assert.throws(() => normalizeFilters({ keywords }), /at most 25/);
});

test("keyword filters do OR within the list", () => {
  const filters = normalizeFilters({ keywords: ["agent", "nobody"] });
  assert.equal(matchesFilters(filters, event()), true);

  const misses = normalizeFilters({ keywords: ["unrelated"] });
  assert.equal(matchesFilters(misses, event()), false);
});

test("different filter fields are ANDed", () => {
  const filters = normalizeFilters({ keywords: ["agent"], tags: ["agents"], authors: [AUTHOR] });
  assert.equal(matchesFilters(filters, event()), true);

  const wrongAuthor = normalizeFilters({ keywords: ["agent"], authors: [OTHER_AUTHOR] });
  assert.equal(matchesFilters(wrongAuthor, event()), false);

  const wrongTag = normalizeFilters({ keywords: ["agent"], tags: ["sports"] });
  assert.equal(matchesFilters(wrongTag, event()), false);
});

test("author matching is case-insensitive", () => {
  const filters = normalizeFilters({ authors: [AUTHOR.toUpperCase()] });
  assert.equal(matchesFilters(filters, event({ authorPubkey: AUTHOR.toUpperCase() })), true);
});

test("reply and root filters match exact ids", () => {
  const replyFilter = normalizeFilters({ replyToId: "parent-1" });
  assert.equal(matchesFilters(replyFilter, event({ replyToId: "parent-1" })), true);
  assert.equal(matchesFilters(replyFilter, event({ replyToId: "parent-2" })), false);

  const rootFilter = normalizeFilters({ rootId: "root-1" });
  assert.equal(matchesFilters(rootFilter, event()), true);
  assert.equal(matchesFilters(rootFilter, event({ rootId: "root-2" })), false);
});

test("profile events match on name or bio text", () => {
  const filters = normalizeFilters({ keywords: ["researcher"] });
  const profileEvent: WebhookEvent = {
    type: "profile.updated",
    data: {},
    content: "Ada Autonomous researcher",
    authorPubkey: AUTHOR,
  };
  assert.equal(matchesFilters(filters, profileEvent), true);
});

test("mention filters match mentioned keys and ignore others", () => {
  const filters = normalizeFilters({ mentions: [`@${OTHER_AUTHOR}`] });
  assert.equal(
    matchesFilters(filters, event({ mentions: [OTHER_AUTHOR.toUpperCase()] })),
    true
  );
  assert.equal(matchesFilters(filters, event({ mentions: [AUTHOR] })), false);
  assert.equal(matchesFilters(filters, event()), false);
});

test("mention and author filters are ANDed", () => {
  const filters = normalizeFilters({
    authors: [AUTHOR],
    mentions: [OTHER_AUTHOR],
  });
  assert.equal(
    matchesFilters(filters, event({ authorPubkey: AUTHOR, mentions: [OTHER_AUTHOR] })),
    true
  );
  assert.equal(
    matchesFilters(filters, event({ authorPubkey: OTHER_AUTHOR, mentions: [OTHER_AUTHOR] })),
    false
  );
});

test("describeFilters is human readable", () => {
  const description = describeFilters(
    normalizeFilters({ keywords: ["agent"], tags: ["ai"], authors: [AUTHOR] })
  );
  assert.match(description, /#ai/);
  assert.match(description, /keywords="agent"/);
  assert.match(description, new RegExp(AUTHOR));
});
