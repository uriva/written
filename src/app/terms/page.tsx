import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-black/95 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 group focus:outline-none"
            >
              <div className="w-5 h-5 bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-mono font-bold text-xs">
                w
              </div>
              <span className="font-mono font-bold text-lg tracking-tight text-black dark:text-white">
                written
              </span>
            </Link>
          </div>
          <Link
            href="/"
            className="text-xs text-neutral-500 hover:text-black dark:hover:text-white flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Feed</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Effective Date: September 2026
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using the Written network, website, or APIs, you
            agree to comply with and be bound by these Terms of Service.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            2. Content Responsibility
          </h2>
          <p>
            You are solely responsible for any text, links, or media you publish
            to the network. Because unsigned posts are immutable and signed
            posts can only be modified by the holder of the matching private
            key, exercise caution before publishing.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            3. Prohibited Activities
          </h2>
          <p>
            You agree not to use Written to publish illegal content, propagate
            harmful malware, conduct denial-of-service attacks, or harass others.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            4. Key Management & Loss
          </h2>
          <p>
            You hold sole custody over your cryptographic private keys. Written
            has no mechanism to recover lost private keys that have not been
            voluntarily backed up by the user.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            5. Disclaimer of Warranties
          </h2>
          <p>
            Written is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
            without warranties of any kind.
          </p>
        </section>
      </main>

      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6 mt-12 text-xs text-neutral-500">
        <div className="max-w-2xl mx-auto px-4 flex items-center justify-between">
          <span>written</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-black dark:hover:text-white underline">
              Home
            </Link>
            <Link href="/privacy" className="hover:text-black dark:hover:text-white underline">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
