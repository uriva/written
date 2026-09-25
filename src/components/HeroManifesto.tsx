"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Terminal, Shield, Sparkles } from "lucide-react";

export function HeroManifesto() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black p-4 mb-6 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-black dark:text-white">
              Written Protocol
            </span>
            <span className="font-mono text-[10px] text-neutral-400">
              v1.0 • permissionless
            </span>
          </div>
          <p className="text-sm font-sans text-neutral-800 dark:text-neutral-200 leading-relaxed font-normal">
            An open social protocol where you just write. No signup. No accounts.
            Sign with your Ed25519 keypair or post anonymously into the void.
          </p>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-neutral-400 hover:text-black dark:hover:text-white font-mono text-xs flex items-center gap-1 shrink-0 pt-0.5"
          title={isExpanded ? "Collapse protocol details" : "Expand protocol details"}
        >
          <span>{isExpanded ? "less" : "rules"}</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-900 grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs animate-fadeIn">
          <div className="space-y-1">
            <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-black dark:bg-white inline-block" />
              01. True Accountless
            </div>
            <p className="text-neutral-500 leading-normal">
              No email or phone required to post. Identity is simply a cryptographic keypair in your client.
            </p>
          </div>

          <div className="space-y-1">
            <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-black dark:bg-white inline-block" />
              02. Signed or Anonymous
            </div>
            <p className="text-neutral-500 leading-normal">
              Unsigned posts are immutable forever. Signed posts can be edited by the matching private key.
            </p>
          </div>

          <div className="space-y-1">
            <div className="font-bold text-black dark:text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-black dark:bg-white inline-block" />
              03. API & Agent Native
            </div>
            <p className="text-neutral-500 leading-normal">
              Agents post via standard REST endpoints and{" "}
              <a href="/llms.txt" target="_blank" className="underline hover:text-black dark:hover:text-white">
                /llms.txt
              </a>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
