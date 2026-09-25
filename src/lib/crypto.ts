import { ed25519 } from "@noble/curves/ed25519.js";

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

export interface KeyPair {
  privateKey: string; // 64-char hex
  publicKey: string;  // 64-char hex
}

export function generateKeyPair(): KeyPair {
  const { secretKey, publicKey } = ed25519.keygen();
  return {
    privateKey: bytesToHex(secretKey),
    publicKey: bytesToHex(publicKey),
  };
}

export function getPublicKeyFromPrivateKey(privateKeyHex: string): string {
  const secretKey = hexToBytes(privateKeyHex);
  const pubKey = ed25519.getPublicKey(secretKey);
  return bytesToHex(pubKey);
}

export function isValidPubkey(pubkey: string): boolean {
  if (!pubkey || typeof pubkey !== "string") return false;
  const clean = pubkey.trim().replace(/^0x/, "");
  if (clean.length !== 64) return false;
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

export function isValidPrivateKey(privkey: string): boolean {
  if (!privkey || typeof privkey !== "string") return false;
  const clean = privkey.trim().replace(/^0x/, "");
  if (clean.length !== 64) return false;
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

export function signPayload(message: string, privateKeyHex: string): string {
  const privBytes = hexToBytes(privateKeyHex);
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = ed25519.sign(msgBytes, privBytes);
  return bytesToHex(sigBytes);
}

export function verifyPayload(
  signatureHex: string,
  message: string,
  publicKeyHex: string
): boolean {
  try {
    if (!signatureHex || !publicKeyHex || !message) return false;
    const sigBytes = hexToBytes(signatureHex);
    const pubBytes = hexToBytes(publicKeyHex);
    const msgBytes = new TextEncoder().encode(message);
    return ed25519.verify(sigBytes, msgBytes, pubBytes);
  } catch {
    return false;
  }
}

// Canonical message generators to ensure deterministic signatures
export function buildPostCanonicalMessage(params: {
  content: string;
  createdAt: number;
  replyToId?: string | null;
}): string {
  return `WRITTEN_POST:${params.content.trim()}:${params.createdAt}:${params.replyToId || ""}`;
}

export function buildEditCanonicalMessage(params: {
  postId: string;
  newContent: string;
  updatedAt: number;
}): string {
  return `WRITTEN_EDIT:${params.postId}:${params.newContent.trim()}:${params.updatedAt}`;
}

export function buildProfileCanonicalMessage(params: {
  pubkey: string;
  name: string;
  bio?: string | null;
  avatar?: string | null;
  updatedAt: number;
}): string {
  return `WRITTEN_PROFILE:${params.pubkey.toLowerCase()}:${params.name.trim()}:${(params.bio || "").trim()}:${(params.avatar || "").trim()}:${params.updatedAt}`;
}

// Hashtag extraction
export function extractHashtags(text: string): string[] {
  if (!text) return [];
  // Match #tag where tag starts with letter/number/underscore, allowing unicode
  const matches = text.match(/#[a-zA-Z0-9_\p{L}]+/gu);
  if (!matches) return [];
  const unique = new Set(
    matches.map((t) => t.slice(1).toLowerCase().trim()).filter(Boolean)
  );
  return Array.from(unique);
}

export function formatShortKey(pubkey?: string | null): string {
  if (!pubkey) return "anonymous";
  const clean = pubkey.trim().replace(/^0x/, "");
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}
