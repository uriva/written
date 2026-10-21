import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  posts,
  profiles,
  tags,
  votes,
  type EditHistoryEntry,
} from "@/db/schema";
import {
  buildEditCanonicalMessage,
  buildPostCanonicalMessage,
  buildProfileCanonicalMessage,
  buildVoteCanonicalMessage,
  extractHashtags,
  isValidPubkey,
  verifyPayload,
} from "./crypto";
import { extractMentions } from "./mentions";
import {
  scorePostsByRandomWalk,
  rankPostsByLikeness,
  type VoteEdge,
} from "./likeness";

export interface PostDTO {
  id: string;
  content: string;
  authorPubkey: string | null;
  signature: string | null;
  signed: boolean;
  createdAt: number;
  updatedAt: number | null;
  replyToId: string | null;
  rootId: string;
  tags: string[];
  mentions: string[];
  editHistory?: EditHistoryEntry[];
  profile: {
    name: string;
    bio: string | null;
    avatar: string | null;
  } | null;
  replies?: PostDTO[];
  repliesCount?: number;
  parent?: PostDTO | null;
  upvotesCount?: number;
  downvotesCount?: number;
  viewerVote?: 1 | -1 | 0;
  likenessScore?: number;
}

export interface ProfileDTO {
  id: string;
  pubkey: string;
  name: string;
  bio: string | null;
  avatar: string | null;
  updatedAt: number;
}

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

export interface ListPostsParams {
  tag?: string | null;
  author?: string | null;
  mentions?: string | null;
  excludeAuthor?: string | null;
  replyTo?: string | null;
  topLevel?: boolean;
  q?: string | null;
  before?: number;
  since?: number;
  limit?: number;
  order?: "asc" | "desc";
  viewer?: string | null;
  rank?: "for-you" | "latest";
}

export interface VoteInput {
  postId: string;
  voterPubkey: string;
  value: -1 | 0 | 1;
  signature: string;
  updatedAt?: number;
}

type PostRow = typeof posts.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string");
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function toProfileDTO(row: ProfileRow | undefined): PostDTO["profile"] {
  if (!row) return null;
  return {
    name: row.name,
    bio: row.bio ?? null,
    avatar: row.avatar ?? null,
  };
}

function toPostDTO(
  row: PostRow,
  profile: ProfileRow | undefined,
  repliesCount = 0
): PostDTO {
  return {
    id: row.id,
    content: row.content,
    authorPubkey: row.authorPubkey ?? null,
    signature: row.signature ?? null,
    signed: Boolean(row.signed),
    createdAt: Number(row.createdAt),
    updatedAt: row.updatedAt === null ? null : Number(row.updatedAt),
    replyToId: row.replyToId ?? null,
    rootId: row.rootId || row.id,
    tags: row.tags ?? [],
    mentions: row.mentions ?? [],
    profile: toProfileDTO(profile),
    repliesCount,
  };
}

function toProfileRecord(row: ProfileRow): ProfileDTO {
  return {
    id: row.pubkey,
    pubkey: row.pubkey,
    name: row.name,
    bio: row.bio ?? null,
    avatar: row.avatar ?? null,
    updatedAt: Number(row.updatedAt),
  };
}

async function profilesByPubkeys(
  pubkeys: Array<string | null | undefined>
): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(pubkeys.filter((key): key is string => Boolean(key)))];
  if (!unique.length) return new Map();

  const rows = await getDb()
    .select()
    .from(profiles)
    .where(inArray(profiles.pubkey, unique));
  return new Map(rows.map((row) => [row.pubkey, row]));
}

async function replyCountsFor(postIds: string[]): Promise<Map<string, number>> {
  if (!postIds.length) return new Map();
  const rows = await getDb()
    .select({ replyToId: posts.replyToId, replies: count() })
    .from(posts)
    .where(inArray(posts.replyToId, postIds))
    .groupBy(posts.replyToId);

  return new Map(
    rows
      .filter((row): row is { replyToId: string; replies: number } => Boolean(row.replyToId))
      .map((row) => [row.replyToId, Number(row.replies)])
  );
}

interface VoteSummary {
  upvotes: number;
  downvotes: number;
  viewerVote: 1 | -1 | 0;
}

async function voteSummariesFor(
  postIds: string[],
  viewerPubkey?: string | null
): Promise<Map<string, VoteSummary>> {
  const result = new Map<string, VoteSummary>();
  if (!postIds.length) return result;

  const cleanViewer =
    viewerPubkey && isValidPubkey(viewerPubkey) ? viewerPubkey.trim().toLowerCase() : null;

  try {
    const rows = await getDb()
      .select({
        postId: votes.postId,
        voterPubkey: votes.voterPubkey,
        value: votes.value,
      })
      .from(votes)
      .where(inArray(votes.postId, postIds));

    for (const row of rows) {
      let summary = result.get(row.postId);
      if (!summary) {
        summary = { upvotes: 0, downvotes: 0, viewerVote: 0 };
        result.set(row.postId, summary);
      }
      if (row.value > 0) summary.upvotes += 1;
      else if (row.value < 0) summary.downvotes += 1;
      if (cleanViewer && row.voterPubkey.toLowerCase() === cleanViewer) {
        summary.viewerVote = row.value > 0 ? 1 : row.value < 0 ? -1 : 0;
      }
    }
  } catch {
    // Gracefully degrade if votes table is not yet migrated
  }

  return result;
}

async function personalizedScoresFor(
  viewerPubkey: string,
  candidateRows: PostRow[]
): Promise<Map<string, number>> {
  try {
    const db = getDb();
    const [voteRows, recentPostRows] = await Promise.all([
      db
        .select({
          postId: votes.postId,
          voterPubkey: votes.voterPubkey,
          value: votes.value,
        })
        .from(votes)
        .orderBy(desc(votes.updatedAt))
        .limit(10_000),
      db
        .select({
          id: posts.id,
          authorPubkey: posts.authorPubkey,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(eq(posts.signed, true))
        .orderBy(desc(posts.createdAt))
        .limit(1_000),
    ]);

    const edges: VoteEdge[] = voteRows
      .filter((r) => r.value === 1 || r.value === -1)
      .map((r) => ({
        postId: r.postId,
        voterPubkey: r.voterPubkey,
        value: (r.value > 0 ? 1 : -1) as 1 | -1,
      }));

    const postMap = new Map<string, { id: string; authorPubkey: string | null; createdAt: number }>();
    for (const p of recentPostRows) {
      postMap.set(p.id, {
        id: p.id,
        authorPubkey: p.authorPubkey,
        createdAt: Number(p.createdAt),
      });
    }
    for (const p of candidateRows) {
      postMap.set(p.id, {
        id: p.id,
        authorPubkey: p.authorPubkey,
        createdAt: Number(p.createdAt),
      });
    }

    return scorePostsByRandomWalk(
      viewerPubkey,
      edges,
      postMap.values()
    );
  } catch {
    return new Map();
  }
}

export async function listPosts(params: ListPostsParams = {}): Promise<PostDTO[]> {
  const db = getDb();
  const conditions: SQL[] = [];
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 300);

  if (params.author) {
    conditions.push(eq(posts.authorPubkey, params.author.toLowerCase()));
  }
  if (params.replyTo !== undefined) {
    conditions.push(
      params.replyTo === null ? isNull(posts.replyToId) : eq(posts.replyToId, params.replyTo)
    );
  }
  if (params.topLevel) conditions.push(isNull(posts.replyToId));
  if (params.before) conditions.push(lt(posts.createdAt, params.before));
  if (params.since) conditions.push(gt(posts.createdAt, params.since));
  if (params.tag) {
    conditions.push(sql`${posts.tags} @> ARRAY[${params.tag.toLowerCase()}]::text[]`);
  }
  if (params.mentions) {
    conditions.push(
      sql`${posts.mentions} @> ARRAY[${params.mentions.toLowerCase()}]::text[]`
    );
  }
  if (params.excludeAuthor) {
    conditions.push(
      or(
        isNull(posts.authorPubkey),
        ne(posts.authorPubkey, params.excludeAuthor.toLowerCase())
      )!
    );
  }
  if (params.q) {
    conditions.push(ilike(posts.content, `%${params.q}%`));
  }

  const cleanViewer =
    params.viewer && isValidPubkey(params.viewer)
      ? params.viewer.trim().toLowerCase()
      : null;

  const order = params.order ?? (params.since ? "asc" : "desc");
  const rows = await db
    .select()
    .from(posts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(order === "asc" ? asc(posts.createdAt) : desc(posts.createdAt))
    .limit(limit);

  const postIds = rows.map((row) => row.id);
  const [profileMap, replyMap, voteMap, likenessScores] = await Promise.all([
    profilesByPubkeys(rows.map((row) => row.authorPubkey)),
    replyCountsFor(postIds),
    voteSummariesFor(postIds, cleanViewer),
    cleanViewer ? personalizedScoresFor(cleanViewer, rows) : Promise.resolve(new Map<string, number>()),
  ]);

  const dtos = rows.map((row) => {
    const v = voteMap.get(row.id);
    const rawScore = likenessScores.get(row.id) ?? 0;
    return {
      ...toPostDTO(row, profileMap.get(row.authorPubkey ?? ""), replyMap.get(row.id) ?? 0),
      upvotesCount: v?.upvotes ?? 0,
      downvotesCount: v?.downvotes ?? 0,
      viewerVote: v?.viewerVote ?? 0,
      likenessScore: Math.round(rawScore * 1000) / 1000,
    };
  });

  if (cleanViewer && params.rank !== "latest" && !params.since) {
    return rankPostsByLikeness(dtos, likenessScores);
  }

  return dtos;
}

export interface ThreadResult {
  post: PostDTO;
  parent: PostDTO | null;
  grandParent: PostDTO | null;
}

export async function getPostThread(
  postId: string,
  viewerPubkey?: string | null
): Promise<ThreadResult | null> {
  const db = getDb();
  const [focal] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!focal) return null;

  const cleanViewer =
    viewerPubkey && isValidPubkey(viewerPubkey)
      ? viewerPubkey.trim().toLowerCase()
      : null;

  const rootId = focal.rootId || focal.id;
  const rows = await db
    .select()
    .from(posts)
    .where(or(eq(posts.id, rootId), eq(posts.rootId, rootId)))
    .orderBy(asc(posts.createdAt));

  const postIds = rows.map((row) => row.id);
  const [profileMap, voteMap, likenessScores] = await Promise.all([
    profilesByPubkeys(rows.map((row) => row.authorPubkey)),
    voteSummariesFor(postIds, cleanViewer),
    cleanViewer ? personalizedScoresFor(cleanViewer, rows) : Promise.resolve(new Map<string, number>()),
  ]);
  const byId = new Map<string, PostDTO>();

  for (const row of rows) {
    const v = voteMap.get(row.id);
    const rawScore = likenessScores.get(row.id) ?? 0;
    byId.set(row.id, {
      ...toPostDTO(row, profileMap.get(row.authorPubkey ?? "")),
      upvotesCount: v?.upvotes ?? 0,
      downvotesCount: v?.downvotes ?? 0,
      viewerVote: v?.viewerVote ?? 0,
      likenessScore: Math.round(rawScore * 1000) / 1000,
      replies: [],
    });
  }

  for (const row of rows) {
    if (!row.replyToId || row.id === rootId) continue;
    const post = byId.get(row.id);
    const parent = byId.get(row.replyToId);
    if (post && parent) parent.replies!.push(post);
  }

  for (const post of byId.values()) {
    post.repliesCount = post.replies?.length ?? 0;
    if (cleanViewer && post.replies && post.replies.length > 1) {
      post.replies = rankPostsByLikeness(post.replies, likenessScores);
    }
  }

  const focalDTO = byId.get(focal.id);
  if (!focalDTO) return null;

  const parent = focal.replyToId ? byId.get(focal.replyToId) ?? null : null;
  const grandParent = parent?.replyToId ? byId.get(parent.replyToId) ?? null : null;

  return { post: focalDTO, parent, grandParent };
}

async function adjustTag(
  tx: Transaction,
  name: string,
  delta: 1 | -1,
  now: number
): Promise<void> {
  if (delta > 0) {
    await tx
      .insert(tags)
      .values({ name, postCount: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: tags.name,
        set: { postCount: sql`${tags.postCount} + 1`, updatedAt: now },
      });
    return;
  }

  await tx
    .update(tags)
    .set({ postCount: sql`GREATEST(${tags.postCount} - 1, 0)`, updatedAt: now })
    .where(eq(tags.name, name));
}

export async function createPostServer(input: CreatePostInput): Promise<PostDTO> {
  const content = (input.content || "").trim();
  if (!content) throw new Error("Post content cannot be empty");
  if (content.length > 2000) throw new Error("Post content exceeds 2000 characters");

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

    const canonicalMsg = buildPostCanonicalMessage({ content, createdAt, replyToId });
    if (!verifyPayload(sig, canonicalMsg, pubkey)) {
      throw new Error(
        `Cryptographic signature verification failed for public key ${pubkey}`
      );
    }

    verifiedPubkey = pubkey;
    verifiedSignature = sig;
  }

  const db = getDb();
  const postId = randomUUID();
  let rootId: string = postId;
  if (replyToId) {
    const [parent] = await db
      .select({ id: posts.id, rootId: posts.rootId })
      .from(posts)
      .where(eq(posts.id, replyToId))
      .limit(1);
    if (!parent) throw new Error(`Parent post not found: ${replyToId}`);
    rootId = parent.rootId || parent.id;
  }
  const tagList = extractHashtags(content);
  const mentionList = extractMentions(content);
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx.insert(posts).values({
      id: postId,
      content,
      authorPubkey: verifiedPubkey,
      signature: verifiedSignature,
      signed: isSigned,
      createdAt,
      replyToId,
      rootId,
      tags: tagList,
      mentions: mentionList,
      editHistory: [],
    });

    for (const tag of tagList) {
      await adjustTag(tx, tag, 1, now);
    }
  });

  const [profileMap] = await Promise.all([profilesByPubkeys([verifiedPubkey])]);

  return toPostDTO(
    {
      id: postId,
      content,
      authorPubkey: verifiedPubkey,
      signature: verifiedSignature,
      signed: isSigned,
      createdAt,
      updatedAt: null,
      replyToId,
      rootId,
      tags: tagList,
      mentions: mentionList,
      editHistory: [],
    },
    verifiedPubkey ? profileMap.get(verifiedPubkey) : undefined
  );
}

export async function editPostServer(input: EditPostInput): Promise<PostDTO & {
  editHistoryCount: number;
}> {
  const newContent = (input.newContent || "").trim();
  if (!newContent) throw new Error("Edited content cannot be empty");
  if (newContent.length > 2000) throw new Error("Edited content exceeds 2000 characters");

  const db = getDb();
  const [post] = await db.select().from(posts).where(eq(posts.id, input.postId)).limit(1);

  if (!post) throw new Error(`Post not found with id ${input.postId}`);
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
  const signature = input.signature.trim().toLowerCase();
  const canonicalEditMsg = buildEditCanonicalMessage({
    postId: post.id,
    newContent,
    updatedAt,
  });

  if (!verifyPayload(signature, canonicalEditMsg, authorPubkey)) {
    throw new Error("Cryptographic signature verification failed for edit action");
  }

  const editHistory: EditHistoryEntry[] = [...(post.editHistory ?? [])];
  editHistory.push({
    content: post.content,
    signature: post.signature ?? null,
    authorPubkey: post.authorPubkey,
    updatedAt,
    editSignature: input.signature,
  });

  const newTags = extractHashtags(newContent);
  const newMentions = extractMentions(newContent);
  const oldTags = parseTags(post.tags);
  const addedTags = newTags.filter((tag) => !oldTags.includes(tag));
  const removedTags = oldTags.filter((tag) => !newTags.includes(tag));
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        content: newContent,
        updatedAt,
        signature,
        editHistory,
        tags: newTags,
        mentions: newMentions,
      })
      .where(eq(posts.id, post.id));

    for (const tag of removedTags) await adjustTag(tx, tag, -1, now);
    for (const tag of addedTags) await adjustTag(tx, tag, 1, now);
  });

  const [profileMap] = await Promise.all([profilesByPubkeys([post.authorPubkey])]);

  return {
    ...toPostDTO(
      {
        ...post,
        content: newContent,
        updatedAt,
        signature,
        editHistory,
        tags: newTags,
        mentions: newMentions,
      },
      profileMap.get(post.authorPubkey)
    ),
    editHistoryCount: editHistory.length,
  };
}

export async function upsertProfileServer(input: ProfileInput): Promise<ProfileDTO> {
  const pubkey = input.pubkey.trim().toLowerCase();
  if (!isValidPubkey(pubkey)) {
    throw new Error("Invalid Ed25519 public key format (expected 64-char hex)");
  }

  const name = (input.name || "").trim();
  if (!name) throw new Error("Profile name cannot be empty");

  const bio = (input.bio || "").trim();
  const avatar = (input.avatar || "").trim();
  const updatedAt = input.updatedAt || Date.now();

  if (input.signature) {
    const canonicalMsg = buildProfileCanonicalMessage({
      pubkey,
      name,
      bio,
      avatar,
      updatedAt,
    });
    if (!verifyPayload(input.signature.trim().toLowerCase(), canonicalMsg, pubkey)) {
      throw new Error("Cryptographic signature verification failed for profile update");
    }
  }

  const values = {
    pubkey,
    name,
    bio: bio || null,
    avatar: avatar || null,
    signature: input.signature?.trim().toLowerCase() ?? null,
    updatedAt,
  };

  const [row] = await getDb()
    .insert(profiles)
    .values(values)
    .onConflictDoUpdate({
      target: profiles.pubkey,
      set: {
        name: values.name,
        bio: values.bio,
        avatar: values.avatar,
        signature: values.signature,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return toProfileRecord(row!);
}

export async function listTags(): Promise<
  Array<{ id: string; name: string; postCount: number; updatedAt: number }>
> {
  const rows = await getDb()
    .select()
    .from(tags)
    .orderBy(desc(tags.postCount))
    .limit(100);

  return rows.map((row) => ({
    id: row.name,
    name: row.name,
    postCount: row.postCount,
    updatedAt: Number(row.updatedAt),
  }));
}

export async function getProfile(pubkey: string): Promise<{
  pubkey: string;
  profile: ProfileDTO | null;
  postCount: number;
  recentPosts: PostDTO[];
  mentionCount: number;
  mentionedPosts: PostDTO[];
}> {
  const clean = pubkey.toLowerCase().trim();
  const db = getDb();

  const [
    [profile],
    [postCountRow],
    [mentionCountRow],
    recentPosts,
    mentionedPosts,
  ] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.pubkey, clean)).limit(1),
    db
      .select({ value: count() })
      .from(posts)
      .where(eq(posts.authorPubkey, clean)),
    db
      .select({ value: count() })
      .from(posts)
      .where(
        and(
          sql`${posts.mentions} @> ARRAY[${clean}]::text[]`,
          or(isNull(posts.authorPubkey), ne(posts.authorPubkey, clean))
        )
      ),
    listPosts({ author: clean, limit: 50 }),
    listPosts({ mentions: clean, excludeAuthor: clean, limit: 50 }),
  ]);

  return {
    pubkey: clean,
    profile: profile ? toProfileRecord(profile) : null,
    postCount: Number(postCountRow?.value ?? 0),
    recentPosts,
    mentionCount: Number(mentionCountRow?.value ?? 0),
    mentionedPosts,
  };
}

export async function votePostServer(input: VoteInput): Promise<{
  postId: string;
  voterPubkey: string;
  value: -1 | 0 | 1;
  upvotesCount: number;
  downvotesCount: number;
  likenessScore: number;
}> {
  const postId = (input.postId || "").trim();
  if (!postId) throw new Error("Post id is required");

  const voterPubkey = (input.voterPubkey || "").trim().toLowerCase();
  if (!isValidPubkey(voterPubkey)) {
    throw new Error("Invalid Ed25519 public key format (expected 64-char hex)");
  }

  const value = input.value;
  if (value !== 1 && value !== -1 && value !== 0) {
    throw new Error("Vote value must be 1 (more of this), -1 (less of this), or 0 (clear)");
  }

  const signature = (input.signature || "").trim().toLowerCase();
  if (!signature) {
    throw new Error("Cryptographic signature is required to vote");
  }

  const updatedAt = input.updatedAt || Date.now();
  const canonicalMsg = buildVoteCanonicalMessage({ postId, value, updatedAt });
  if (!verifyPayload(signature, canonicalMsg, voterPubkey)) {
    throw new Error("Cryptographic signature verification failed for vote action");
  }

  const db = getDb();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error(`Post not found: ${postId}`);

  if (value === 0) {
    await db
      .delete(votes)
      .where(and(eq(votes.postId, postId), eq(votes.voterPubkey, voterPubkey)));
  } else {
    await db
      .insert(votes)
      .values({
        postId,
        voterPubkey,
        value,
        signature,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [votes.postId, votes.voterPubkey],
        set: {
          value,
          signature,
          updatedAt,
        },
      });
  }

  const [summaries, likenessScores] = await Promise.all([
    voteSummariesFor([postId], voterPubkey),
    personalizedScoresFor(voterPubkey, [post]),
  ]);

  const summary = summaries.get(postId);
  const rawScore = likenessScores.get(postId) ?? 0;

  return {
    postId,
    voterPubkey,
    value,
    upvotesCount: summary?.upvotes ?? 0,
    downvotesCount: summary?.downvotes ?? 0,
    likenessScore: Math.round(rawScore * 1000) / 1000,
  };
}

export async function pingDatabase(): Promise<void> {
  await getDb().execute(sql`select 1`);
}
