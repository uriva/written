import { init, id } from "@instantdb/admin";
import schema from "@/instant.schema";
import {
  buildEditCanonicalMessage,
  buildPostCanonicalMessage,
  buildProfileCanonicalMessage,
  extractHashtags,
  isValidPubkey,
  verifyPayload,
} from "./crypto";

export const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID || "fe53f2bb-9774-47db-9ed6-8c7c2dab43a5";

export const API_URI =
  process.env.NEXT_PUBLIC_INSTANT_API_URI || "https://api.instantdb.uriv.me";

/**
 * The admin token is a server-only secret. It must be provided via the
 * environment; it is deliberately not hardcoded here (this repo is public).
 */
function createAdminDb() {
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN?.trim();
  if (!adminToken) {
    throw new Error(
      "INSTANT_APP_ADMIN_TOKEN is not set. Add it to .env.local (see .env.example) or your deployment environment."
    );
  }
  return init({ appId: APP_ID, adminToken, apiURI: API_URI, schema });
}

type AdminDb = ReturnType<typeof createAdminDb>;

let cachedAdminDb: AdminDb | null = null;

export function getAdminDb(): AdminDb {
  if (!cachedAdminDb) cachedAdminDb = createAdminDb();
  return cachedAdminDb;
}

/**
 * Lazily initialised so builds don't require secrets and so a missing token
 * produces a clear runtime error instead of a build-time crash.
 */
export const adminDb = new Proxy({} as AdminDb, {
  get(_target, prop) {
    const db = getAdminDb() as unknown as Record<string | symbol, unknown>;
    const value = db[prop];
    return typeof value === "function" ? value.bind(db) : value;
  },
});

export { id };

export interface CreatePostInput {
  content: string;
  authorPubkey?: string | null;
  signature?: string | null;
  createdAt?: number;
  replyToId?: string | null;
}

export interface EditPostInput {
  postId: string;
  newContent: string;
  authorPubkey: string;
  signature: string;
  updatedAt?: number;
}

export interface ProfileInput {
  pubkey: string;
  name: string;
  bio?: string | null;
  avatar?: string | null;
  signature?: string | null;
  updatedAt?: number;
}

export function parseTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags as string[];
  if (typeof tags !== "string") return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

async function buildTagTransactions(txs: any[], tagNames: string[], delta: 1 | -1) {
  for (const tagName of tagNames) {
    const tagRes = await adminDb.query({
      tags: {
        $: { where: { name: tagName }, limit: 1 },
      },
    });
    const existingTag = tagRes.tags?.[0];

    if (existingTag) {
      const postCount = Math.max(0, (existingTag.postCount || 0) + delta);
      txs.push(
        adminDb.tx.tags[existingTag.id].update({
          postCount,
          updatedAt: Date.now(),
        })
      );
    } else if (delta > 0) {
      txs.push(
        adminDb.tx.tags[id()].create({
          name: tagName,
          postCount: 1,
          updatedAt: Date.now(),
        })
      );
    }
  }
}

export async function createPostServer(input: CreatePostInput) {
  const content = (input.content || "").trim();
  if (!content) {
    throw new Error("Post content cannot be empty");
  }
  if (content.length > 2000) {
    throw new Error("Post content exceeds 2000 characters");
  }

  const createdAt = input.createdAt || Date.now();
  const replyToId = input.replyToId ? input.replyToId.trim() : null;
  const isSigned = Boolean(input.authorPubkey && input.signature);

  let verifiedPubkey: string | null = null;
  let verifiedSignature: string | null = null;

  if (isSigned) {
    const pubkey = input.authorPubkey!.trim().toLowerCase();
    const sig = input.signature!.trim().toLowerCase();

    if (!isValidPubkey(pubkey)) {
      throw new Error("Invalid Ed25519 public key format (expected 64-char hex)");
    }

    const canonicalMsg = buildPostCanonicalMessage({
      content,
      createdAt,
      replyToId,
    });

    const isValid = verifyPayload(sig, canonicalMsg, pubkey);
    if (!isValid) {
      throw new Error(
        `Cryptographic signature verification failed for public key ${pubkey}`
      );
    }

    verifiedPubkey = pubkey;
    verifiedSignature = sig;
  }

  const postId = id();
  const tagsList = extractHashtags(content);
  const tagsJson = JSON.stringify(tagsList);

  // Determine rootId
  let rootId = postId;
  if (replyToId) {
    const parentQuery = await adminDb.query({
      posts: {
        $: { where: { id: replyToId }, limit: 1 },
      },
    });
    const parentPost = parentQuery.posts?.[0];
    if (!parentPost) {
      throw new Error(`Parent post not found: ${replyToId}`);
    }
    rootId = parentPost.rootId || parentPost.id;
  }

  const txs: any[] = [
    adminDb.tx.posts[postId].create({
      content,
      createdAt,
      signed: isSigned,
      authorPubkey: verifiedPubkey || undefined,
      signature: verifiedSignature || undefined,
      replyToId: replyToId || undefined,
      rootId,
      tags: tagsJson,
    }),
  ];

  if (replyToId) {
    txs.push(adminDb.tx.posts[postId].link({ parent: replyToId }));
  }

  // If signed and profile exists, link post to profile
  if (verifiedPubkey) {
    const profileRes = await adminDb.query({
      profiles: {
        $: { where: { pubkey: verifiedPubkey } },
      },
    });
    if (profileRes.profiles?.[0]) {
      txs.push(
        adminDb.tx.posts[postId].link({ profile: profileRes.profiles[0].id })
      );
    }
  }

  // Update or create tags
  await buildTagTransactions(txs, tagsList, 1);

  await adminDb.transact(txs);

  return {
    id: postId,
    content,
    createdAt,
    signed: isSigned,
    authorPubkey: verifiedPubkey,
    signature: verifiedSignature,
    replyToId,
    rootId,
    tags: tagsList,
  };
}

export async function editPostServer(input: EditPostInput) {
  const newContent = (input.newContent || "").trim();
  if (!newContent) {
    throw new Error("Edited content cannot be empty");
  }
  if (newContent.length > 2000) {
    throw new Error("Edited content exceeds 2000 characters");
  }

  const { posts } = await adminDb.query({
    posts: {
      $: { where: { id: input.postId } },
    },
  });

  const post = posts?.[0];
  if (!post) {
    throw new Error(`Post not found with id ${input.postId}`);
  }

  if (!post.signed || !post.authorPubkey) {
    throw new Error(
      "Unsigned / anonymous posts are immutable and cannot be edited. Only signed posts can be edited by their keyholder."
    );
  }

  const authorPubkey = input.authorPubkey.trim().toLowerCase();
  if (authorPubkey !== post.authorPubkey.toLowerCase()) {
    throw new Error("Public key mismatch: only the author keyholder can edit this post");
  }

  const updatedAt = input.updatedAt || Date.now();
  const canonicalEditMsg = buildEditCanonicalMessage({
    postId: post.id,
    newContent,
    updatedAt,
  });

  const isValid = verifyPayload(input.signature.trim().toLowerCase(), canonicalEditMsg, authorPubkey);
  if (!isValid) {
    throw new Error("Cryptographic signature verification failed for edit action");
  }

  let editHistory: any[] = [];
  if (post.editHistory) {
    try {
      editHistory = JSON.parse(post.editHistory);
    } catch {
      editHistory = [];
    }
  }

  editHistory.push({
    content: post.content,
    signature: post.signature,
    authorPubkey: post.authorPubkey,
    updatedAt,
    editSignature: input.signature,
  });

  const newTagsList = extractHashtags(newContent);
  const tagsJson = JSON.stringify(newTagsList);

  const oldTagsList = parseTags(post.tags);
  const addedTags = newTagsList.filter((t) => !oldTagsList.includes(t));
  const removedTags = oldTagsList.filter((t) => !newTagsList.includes(t));

  const txs: any[] = [
    adminDb.tx.posts[post.id].update({
      content: newContent,
      updatedAt,
      signature: input.signature.trim().toLowerCase(),
      editHistory: JSON.stringify(editHistory),
      tags: tagsJson,
    }),
  ];

  await buildTagTransactions(txs, removedTags, -1);
  await buildTagTransactions(txs, addedTags, 1);

  await adminDb.transact(txs);

  return {
    id: post.id,
    content: newContent,
    createdAt: post.createdAt,
    updatedAt,
    authorPubkey: post.authorPubkey,
    signed: true,
    signature: input.signature,
    replyToId: post.replyToId || null,
    rootId: post.rootId || post.id,
    tags: newTagsList,
    editHistoryCount: editHistory.length,
  };
}

export async function upsertProfileServer(input: ProfileInput) {
  const pubkey = input.pubkey.trim().toLowerCase();
  if (!isValidPubkey(pubkey)) {
    throw new Error("Invalid Ed25519 public key format (expected 64-char hex)");
  }

  const name = (input.name || "").trim();
  if (!name) {
    throw new Error("Profile name cannot be empty");
  }

  const bio = (input.bio || "").trim();
  const avatar = (input.avatar || "").trim();
  const updatedAt = input.updatedAt || Date.now();

  // Signature verification if provided (API or signed client)
  if (input.signature) {
    const canonicalMsg = buildProfileCanonicalMessage({
      pubkey,
      name,
      bio,
      avatar,
      updatedAt,
    });
    const isValid = verifyPayload(input.signature.trim().toLowerCase(), canonicalMsg, pubkey);
    if (!isValid) {
      throw new Error("Cryptographic signature verification failed for profile update");
    }
  }

  const { profiles } = await adminDb.query({
    profiles: {
      $: { where: { pubkey } },
    },
  });

  const existingProfile = profiles?.[0];
  const profileId = existingProfile?.id || id();

  const data: any = {
    pubkey,
    name,
    bio: bio || undefined,
    avatar: avatar || undefined,
    signature: input.signature || undefined,
    updatedAt,
  };

  const txs: any[] = [];
  if (existingProfile) {
    txs.push(adminDb.tx.profiles[profileId].update(data));
  } else {
    txs.push(adminDb.tx.profiles[profileId].create(data));
  }

  // Link any unlinked posts with this authorPubkey to this profile
  const { posts } = await adminDb.query({
    posts: {
      $: { where: { authorPubkey: pubkey } },
    },
  });

  if (posts?.length) {
    for (const p of posts) {
      txs.push(adminDb.tx.posts[p.id].link({ profile: profileId }));
    }
  }

  await adminDb.transact(txs);

  return {
    id: profileId,
    pubkey,
    name,
    bio,
    avatar,
    updatedAt,
  };
}
