"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Hash, Search } from "lucide-react";
import { db } from "@/lib/db";

interface TagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tag: string) => void;
  activeTag: string | null;
}

export function TagsModal({
  isOpen,
  onClose,
  onSelectTag,
  activeTag,
}: TagsModalProps) {
  const [filter, setFilter] = useState("");

  const { data, isLoading } = db.useQuery({
    tags: {
      $: {
        order: { postCount: "desc" },
        limit: 100,
      },
    },
  });

  const allTags = data?.tags || [];
  const filteredTags = allTags.filter((t: any) =>
    t.name.toLowerCase().includes(filter.toLowerCase().trim())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-none p-6 text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="font-mono text-base font-bold flex items-center gap-2">
            <Hash className="w-4 h-4" />
            <span>Tags</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Search filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-3" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search tags..."
              className="w-full pl-8 pr-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-xs font-mono focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
            />
          </div>

          {/* Tags list */}
          {isLoading ? (
            <div className="py-8 text-center font-mono text-xs text-neutral-400">
              Loading tags...
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="py-8 text-center font-mono text-xs text-neutral-400">
              {filter ? "No matching tags" : "No tags yet. Use #tag in any post."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredTags.map((tag: any) => {
                const isSelected = activeTag === tag.name;
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      onSelectTag(tag.name);
                      onClose();
                    }}
                    className={`font-mono text-xs px-2.5 py-1.5 border transition-all flex items-center gap-2 ${
                      isSelected
                        ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white font-bold"
                        : "bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-black dark:text-white hover:border-black dark:hover:border-white"
                    }`}
                  >
                    <span>#{tag.name}</span>
                    <span className="text-[10px] text-neutral-400">
                      {tag.postCount || 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
