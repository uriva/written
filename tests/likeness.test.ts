import test from "node:test";
import assert from "node:assert/strict";
import {
  scorePostsByRandomWalk,
  rankPostsByLikeness,
  type VoteEdge,
} from "../src/lib/likeness.ts";
import {
  buildVoteCanonicalMessage,
  generateKeyPair,
  signPayload,
  verifyPayload,
} from "../src/lib/crypto.ts";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const CAROL = "c".repeat(64);

test("buildVoteCanonicalMessage and Ed25519 signature verification", () => {
  const kp = generateKeyPair();
  const msg = buildVoteCanonicalMessage({
    postId: "post-123",
    value: 1,
    updatedAt: 1700000000000,
  });
  assert.equal(msg, "WRITTEN_VOTE:post-123:1:1700000000000");
  const sig = signPayload(msg, kp.privateKey);
  assert.equal(verifyPayload(sig, msg, kp.publicKey), true);
  assert.equal(
    verifyPayload(
      sig,
      buildVoteCanonicalMessage({ postId: "post-123", value: -1, updatedAt: 1700000000000 }),
      kp.publicKey
    ),
    false
  );
});

test("multi-hop signed random walk: A -> p1 -> B -> p3 -> C -> p5 discovers p5 directly on the graph", () => {
  const votes: VoteEdge[] = [
    // Alice and Bob both upvote p1 and p2
    { postId: "p1", voterPubkey: ALICE, value: 1 },
    { postId: "p1", voterPubkey: BOB, value: 1 },
    { postId: "p2", voterPubkey: ALICE, value: 1 },
    { postId: "p2", voterPubkey: BOB, value: 1 },
    // Bob and Carol both upvote p3 and p4
    { postId: "p3", voterPubkey: BOB, value: 1 },
    { postId: "p3", voterPubkey: CAROL, value: 1 },
    { postId: "p4", voterPubkey: BOB, value: 1 },
    { postId: "p4", voterPubkey: CAROL, value: 1 },
    // Carol upvotes p5 (neither Alice nor Bob voted on p5 yet)
    { postId: "p5", voterPubkey: CAROL, value: 1 },
  ];

  const postScores = scorePostsByRandomWalk(ALICE, votes, [], {
    hops: 4,
    numWalks: 4000,
    shrinkage: 0,
  });

  assert.ok((postScores.get("p3") ?? 0) > 0, "p3 liked by Bob gets positive walk hits");
  assert.ok(
    (postScores.get("p5") ?? 0) > 0,
    "p5 liked by Carol gets positive walk hits via A -> p1 -> B -> p3 -> C -> p5"
  );
});

test("spam network isolation: disconnected botnet gets 0 walk hits, and 1 downvote flips botnet posts negative", () => {
  const bots = Array.from({ length: 50 }, (_, i) =>
    (i + 100).toString(16).padStart(64, "0")
  );
  const votes: VoteEdge[] = [
    { postId: "good-1", voterPubkey: ALICE, value: 1 },
    { postId: "good-1", voterPubkey: BOB, value: 1 },
  ];

  // 50 bots all upvote spam-1 and spam-2 together
  for (const bot of bots) {
    votes.push({ postId: "spam-1", voterPubkey: bot, value: 1 });
    votes.push({ postId: "spam-2", voterPubkey: bot, value: 1 });
  }

  // Case 1: Disconnected spam network is unreachable from Alice's walks -> score 0
  const disconnectedScores = scorePostsByRandomWalk(ALICE, votes, [], {
    hops: 4,
    numWalks: 3000,
  });
  assert.equal(
    disconnectedScores.get("spam-2") ?? 0,
    0,
    "Disconnected 50-bot network receives 0 walk visits from Alice"
  );

  // Case 2: Bob (Alice's peer) downvotes spam-1 (-1).
  // Walks from Alice -> good-1 (+1) -> Bob (+1) -> spam-1 (-1) -> bot (+1) -> spam-2 (+1)
  // arrive at spam-2 with a negative sign!
  votes.push({ postId: "spam-1", voterPubkey: BOB, value: -1 });
  const afterDownvoteScores = scorePostsByRandomWalk(ALICE, votes, [], {
    hops: 4,
    numWalks: 5000,
    shrinkage: 0,
  });

  assert.ok(
    (afterDownvoteScores.get("spam-2") ?? 0) < 0,
    "spam-2 upvoted by the 50 bots gets negative net hits from Alice's walks"
  );

  const now = Date.now();
  const ranked = rankPostsByLikeness(
    [
      { id: "spam-2", createdAt: now },
      { id: "good-1", createdAt: now - 60_000 },
    ],
    afterDownvoteScores,
    now
  );
  assert.equal(ranked[0]?.id, "good-1");
  assert.equal(ranked[1]?.id, "spam-2");
});

test("author edges in graph: new zero-vote posts from liked authors rank positive, and from downvoted authors rank negative", () => {
  const SPAM_AUTHOR = "9".repeat(64);
  const votes: VoteEdge[] = [
    // Alice upvoted Bob's first post
    { postId: "bob-post-1", voterPubkey: ALICE, value: 1 },
    // Alice downvoted Spammer's first post
    { postId: "spam-post-1", voterPubkey: ALICE, value: -1 },
  ];

  // Posts table includes authorPubkey (which adds Author <-> Post +1 edges)
  const posts = [
    { id: "bob-post-1", authorPubkey: BOB, createdAt: 1000 },
    { id: "bob-post-2-new", authorPubkey: BOB, createdAt: 2000 }, // 0 explicit votes!
    { id: "spam-post-1", authorPubkey: SPAM_AUTHOR, createdAt: 1000 },
    { id: "spam-post-2-new", authorPubkey: SPAM_AUTHOR, createdAt: 2000 }, // 0 explicit votes!
  ];

  const scores = scorePostsByRandomWalk(ALICE, votes, posts, {
    hops: 3,
    numWalks: 4000,
    shrinkage: 0,
  });

  assert.ok(
    (scores.get("bob-post-2-new") ?? 0) > 0,
    "Bob's brand new zero-vote post is discovered via Alice -> bob-post-1 -> Bob -> bob-post-2-new"
  );
  assert.ok(
    (scores.get("spam-post-2-new") ?? 0) < 0,
    "Spammer's brand new zero-vote post is pre-buried via Alice -(-1)-> spam-post-1 -> Spammer -> spam-post-2-new"
  );
});
