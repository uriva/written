import test from "node:test";
import assert from "node:assert/strict";
import { extractMentions, formatMention } from "../src/lib/mentions.ts";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

test("extractMentions finds @pubkey mentions and dedupes", () => {
  const text = `hello @${ALICE.toUpperCase()} and @${BOB}, again @${ALICE}`;
  assert.deepEqual(extractMentions(text), [ALICE, BOB]);
});

test("extractMentions ignores invalid and email-like mentions", () => {
  assert.deepEqual(extractMentions("hello @abc and @not-a-key"), []);
  assert.deepEqual(extractMentions(`email foo@${ALICE}`), []);
  assert.deepEqual(extractMentions(`@${ALICE}garbage`), []);
});

test("extractMentions handles punctuation around mentions", () => {
  assert.deepEqual(extractMentions(`(@${ALICE}), @${BOB}!`), [ALICE, BOB]);
});

test("formatMention shortens long keys", () => {
  const formatted = formatMention(ALICE);
  assert.match(formatted, /^@aaaaaaaa…aaaaaa$/);
});
