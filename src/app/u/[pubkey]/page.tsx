import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/repo";
import { formatShortKey, isValidPubkey } from "@/lib/crypto";

export const dynamic = "force-dynamic";

async function loadProfile(pubkey: string) {
  return getProfile(pubkey);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}): Promise<Metadata> {
  const { pubkey } = await params;
  const clean = pubkey.toLowerCase();
  if (!isValidPubkey(clean)) return { title: "Profile — written" };

  try {
    const { profile } = await loadProfile(clean);
    const name = profile?.name || formatShortKey(clean);
    return {
      title: `${name} — written`,
      description: profile?.bio || `Posts by ${name} on the Written protocol.`,
    };
  } catch {
    return { title: "Profile — written" };
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = await params;
  const clean = pubkey.toLowerCase();
  if (!isValidPubkey(clean)) notFound();

  const { profile, postCount, recentPosts, mentionCount, mentionedPosts } =
    await loadProfile(clean);
  const name = profile?.name || formatShortKey(clean);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono text-sm hover:underline">
            ← written
          </Link>
          <span className="font-mono text-[11px] text-neutral-400">
            {postCount} post{postCount === 1 ? "" : "s"}
            {mentionCount > 0
              ? ` · ${mentionCount} mention${mentionCount === 1 ? "" : "s"}`
              : ""}
          </span>
        </div>
      </header>

      <main className="max-w-2xl w-full mx-auto px-4 py-8">
        <section className="flex items-start gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
          {profile?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar}
              alt={name}
              className="w-16 h-16 object-cover border border-neutral-200 dark:border-neutral-800"
            />
          ) : (
            <div className="w-16 h-16 grid place-items-center border border-neutral-200 dark:border-neutral-800 font-mono text-lg">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">{name}</h1>
            {profile?.bio && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 whitespace-pre-wrap">
                {profile.bio}
              </p>
            )}
            <p className="font-mono text-[11px] text-neutral-400 mt-2 break-all">{clean}</p>
            <p className="font-mono text-[11px] text-neutral-400 mt-1">
              {profile ? "profile signed" : "no public profile"} ·{" "}
              <a href={`/api/profiles/${clean}`} className="underline">
                JSON
              </a>
            </p>
          </div>
        </section>

        {recentPosts.length === 0 ? (
          <p className="text-sm text-neutral-500 py-10 text-center">
            No posts from this key yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {recentPosts.map((post) => (
              <li key={post.id} className="py-4">
                <Link href={`/post/${post.id}`} className="block group">
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap group-hover:underline">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2 font-mono text-[11px] text-neutral-400">
                    <time dateTime={new Date(post.createdAt).toISOString()}>
                      {new Date(post.createdAt).toLocaleString()}
                    </time>
                    {post.updatedAt && <span>edited</span>}
                    {post.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {mentionCount > 0 && (
          <section className="mt-10">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-neutral-400 mb-3">
              Mentions ({mentionCount})
            </h2>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border-t border-neutral-200 dark:border-neutral-800">
              {mentionedPosts.map((post) => (
                <li key={`mention-${post.id}`} className="py-4">
                  <Link href={`/post/${post.id}`} className="block group">
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap group-hover:underline">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-3 mt-2 font-mono text-[11px] text-neutral-400">
                      <span>
                        {post.profile?.name ||
                          (post.authorPubkey
                            ? formatShortKey(post.authorPubkey)
                            : "anonymous")}
                      </span>
                      <time dateTime={new Date(post.createdAt).toISOString()}>
                        {new Date(post.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
