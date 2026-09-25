const ADJECTIVES = [
  "Swift",
  "Bright",
  "Solar",
  "Cosmic",
  "Noble",
  "Silver",
  "Gentle",
  "Bold",
  "Warm",
  "Deep",
  "Clear",
  "Brave",
  "Silent",
  "Golden",
  "Lucid",
  "Vivid",
];

const NOUNS = [
  "Falcon",
  "River",
  "Cedar",
  "Orion",
  "Echo",
  "Atlas",
  "Sage",
  "Nova",
  "Harbor",
  "Summit",
  "Beacon",
  "Zephyr",
  "Sparrow",
  "Loom",
  "Breeze",
  "Pioneer",
];

export function pubkeyToFriendlyName(pubkey?: string | null): string {
  if (!pubkey) return "Anonymous";
  const clean = pubkey.trim().toLowerCase().replace(/^0x/, "");
  if (!clean || clean.length < 8) return "User";
  
  let num = 0;
  for (let i = 0; i < Math.min(clean.length, 16); i++) {
    num = (num * 33 + clean.charCodeAt(i)) >>> 0;
  }

  const adj = ADJECTIVES[num % ADJECTIVES.length];
  const noun = NOUNS[(num >>> 5) % NOUNS.length];
  return `${adj} ${noun}`;
}

export function getAuthorInitials(name: string): string {
  if (!name || name === "Anonymous") return "A";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
