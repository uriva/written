import test from "node:test";
import assert from "node:assert/strict";
import {
  signWebhookPayload,
  verifyWebhookSignature,
} from "../src/lib/webhookSignature.ts";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ type: "post.created", data: { content: "hi" } });

test("signed payloads verify", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const header = signWebhookPayload(SECRET, timestamp, BODY);

  assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(verifyWebhookSignature(SECRET, header, BODY), true);
});

test("tampered bodies fail verification", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const header = signWebhookPayload(SECRET, timestamp, BODY);

  assert.equal(
    verifyWebhookSignature(SECRET, header, BODY.replace("hi", "bye")),
    false
  );
});

test("wrong secrets fail verification", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const header = signWebhookPayload(SECRET, timestamp, BODY);

  assert.equal(verifyWebhookSignature("whsec_other", header, BODY), false);
});

test("stale timestamps fail verification", () => {
  const timestamp = Math.floor(Date.now() / 1000) - 3600;
  const header = signWebhookPayload(SECRET, timestamp, BODY);

  assert.equal(verifyWebhookSignature(SECRET, header, BODY, 300), false);
  assert.equal(verifyWebhookSignature(SECRET, header, BODY, 7200), true);
});
