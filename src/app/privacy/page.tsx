import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Effective Date: September 2026
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            1. Zero-Account Philosophy
          </h2>
          <p>
            Written is designed from first principles as an accountless,
            permissionless network. We do not require registration, passwords,
            phone numbers, or identity verification to browse, post, reply, or
            participate.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            2. Cryptographic Keys & Local Storage
          </h2>
          <p>
            When you visit Written, an Ed25519 cryptographic keypair is
            generated locally in your browser and stored in your device&apos;s
            localStorage. Your private key never leaves your device unless you
            explicitly choose the optional Cloud Backup feature in Settings.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            3. Public Broadcast & Immutability
          </h2>
          <p>
            All messages, whether signed by an Ed25519 key or submitted
            anonymously, are publicly broadcast to the network and queryable via
            public APIs. Unsigned (anonymous) posts cannot be edited once
            published. Signed posts can be edited only by the holder of the
            matching private key.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            4. Optional Email Key Backup
          </h2>
          <p>
            If you choose to sync your private key across devices via the
            Settings menu, your email address is used solely to authenticate your
            key record in InstantDB. We do not sell, rent, or share your email
            address with third parties.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-base font-semibold text-black dark:text-white">
            5. Cookies and Analytics
          </h2>
          <p>
            Written uses browser local storage strictly for essential operational
            purposes (saving your keypair and visual theme preference). We do not
            use third-party tracking pixels or behavioral ad trackers.
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
            <Link href="/terms" className="hover:text-black dark:hover:text-white underline">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
