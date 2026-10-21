/**
 * Personalized post ranking via Signed Random Walks on the User <-> Post vote graph.
 *
 * Votes (+1 = "more of this", -1 = "less of this") form a signed bipartite graph
 * between users (pubkeys) and posts.
 *
 * Starting from `viewer` with sign = +1:
 *   1. Step from User -> Post they voted on (multiplying sign by their vote +1/-1).
 *   2. Step from Post -> another User who voted on that post (multiplying sign by +1/-1).
 *   3. Repeat for a few hops (with restart probability 1 - alpha).
 *
 * The net signed visits that land on each Post IS the post's score.
 * No separate user-to-user likeness matrix is ever needed.
 */

export interface VoteEdge {
  postId: string;
  voterPubkey: string;
  value: 1 | -1;
}

export interface RankablePost {
  id: string;
  authorPubkey: string | null;
  createdAt: number;
}

export interface WalkOptions {
  /** Continuation probability at each hop. Default: 0.6. */
  alpha?: number;
  /** Number of User -> Post -> User hops. Default: 3. */
  hops?: number;
  /** Number of Monte Carlo random walks to fire from viewer. Default: 2000. */
  numWalks?: number;
  /** Degree shrinkage k so a single lucky overlap doesn't get 100% flow. Default: 2. */
  shrinkage?: number;
  /** Treat a signed post's author as an implicit +1 vote on their own post. Default: true. */
  implicitAuthorVote?: boolean;
  /** Deterministic PRNG seed. */
  seed?: number;
}

/**
 * Run signed random walks starting at `viewerPubkey` on the User <-> Post vote graph
 * and return the net signed landing score for each post.
 */
export function scorePostsByRandomWalk(
  viewerPubkey: string,
  votes: Iterable<VoteEdge>,
  posts: Iterable<RankablePost> = [],
  options: WalkOptions = {}
): Map<string, number> {
  const viewer = viewerPubkey.trim().toLowerCase();
  const alpha = options.alpha ?? 0.6;
  const hops = options.hops ?? 3;
  const numWalks = options.numWalks ?? 2000;
  const shrinkage = options.shrinkage ?? 2;
  const implicitAuthorVote = options.implicitAuthorVote ?? true;

  // Adjacency lists for the bipartite graph:
  // user -> posts they voted on
  // post -> users who voted on it
  const userToPosts = new Map<string, Array<{ postId: string; value: 1 | -1 }>>();
  const postToUsers = new Map<string, Array<{ user: string; value: 1 | -1 }>>();
  const seen = new Set<string>();

  const addEdge = (user: string, postId: string, value: 1 | -1) => {
    const key = `${user}:${postId}`;
    if (seen.has(key)) return;
    seen.add(key);

    let uList = userToPosts.get(user);
    if (!uList) {
      uList = [];
      userToPosts.set(user, uList);
    }
    uList.push({ postId, value });

    let pList = postToUsers.get(postId);
    if (!pList) {
      pList = [];
      postToUsers.set(postId, pList);
    }
    pList.push({ user, value });
  };

  for (const v of votes) {
    if (v.value === 1 || v.value === -1) {
      addEdge(v.voterPubkey.toLowerCase(), v.postId, v.value);
    }
  }

  if (implicitAuthorVote) {
    for (const p of posts) {
      if (p.authorPubkey) {
        addEdge(p.authorPubkey.toLowerCase(), p.id, 1);
      }
    }
  }

  const startEdges = userToPosts.get(viewer);
  if (!startEdges || startEdges.length === 0) {
    return new Map();
  }

  // Fast xorshift32 PRNG
  let state = (options.seed ?? 42) >>> 0 || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  const postHits = new Map<string, number>();

  for (let w = 0; w < numWalks; w++) {
    let currentUser = viewer;
    let sign: 1 | -1 = 1;

    for (let hop = 0; hop < hops; hop++) {
      const uEdges = userToPosts.get(currentUser);
      if (!uEdges || uEdges.length === 0) break;

      // Shrinkage: terminate walk with probability shrinkage / (deg + shrinkage)
      if (shrinkage > 0 && rand() * (uEdges.length + shrinkage) >= uEdges.length) {
        break;
      }

      // Step User -> Post
      const postStep = uEdges[Math.floor(rand() * uEdges.length)]!;
      sign = (sign * postStep.value) as 1 | -1;

      // Record signed visit on the post!
      postHits.set(postStep.postId, (postHits.get(postStep.postId) ?? 0) + sign);

      // Stop with restart probability (1 - alpha)
      if (rand() >= alpha) break;

      // Step Post -> User
      const pEdges = postToUsers.get(postStep.postId);
      if (!pEdges || pEdges.length === 0) break;

      if (shrinkage > 0 && rand() * (pEdges.length + shrinkage) >= pEdges.length) {
        break;
      }

      const userStep = pEdges[Math.floor(rand() * pEdges.length)]!;
      sign = (sign * userStep.value) as 1 | -1;
      currentUser = userStep.user;
    }
  }

  const postScores = new Map<string, number>();
  for (const [postId, hits] of postHits) {
    const score = hits / numWalks;
    if (Math.abs(score) > 1e-4) {
      postScores.set(postId, score);
    }
  }

  return postScores;
}

/**
 * Combine signed random-walk score with recency so relevant posts rise and
 * negatively-scored posts sink to the bottom.
 */
export function rankPostsByLikeness<
  T extends { id: string; createdAt: number; authorPubkey?: string | null }
>(
  posts: T[],
  postScores: Map<string, number>,
  _now = Date.now()
): Array<T & { likenessScore: number }> {
  const scored = posts.map((post) => {
    const likenessScore = postScores.get(post.id) ?? 0;
    return {
      ...post,
      likenessScore: Math.round(likenessScore * 1000) / 1000,
    };
  });

  const BOOST_WINDOW_MS = 24 * 3600 * 1000;
  return scored.sort((a, b) => {
    // Negatively-scored posts sink below non-negative posts
    const aNeg = a.likenessScore < -0.005;
    const bNeg = b.likenessScore < -0.005;
    if (aNeg !== bNeg) return aNeg ? 1 : -1;

    const aRank = a.createdAt + a.likenessScore * BOOST_WINDOW_MS;
    const bRank = b.createdAt + b.likenessScore * BOOST_WINDOW_MS;
    if (bRank !== aRank) return bRank - aRank;
    return b.createdAt - a.createdAt;
  });
}
