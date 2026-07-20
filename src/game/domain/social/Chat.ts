/**
 * Kid-safe chat (E5.5). Pure domain: the message model, a hard length cap,
 * and a filter applied at the boundary BEFORE any relay — profanity masking
 * and PII redaction (email/phone/URL). COPPA/child-safety is the design
 * driver (the target audience is ~11yo): the filter is deliberately
 * conservative (whole-word matching, a false-positive guard suite) so an
 * innocent word is never mangled, but a caught match is always masked, never
 * passed through. `HostSession` calls `buildChatMessage` on every intent and
 * NEVER stores/logs the raw or filtered text (see HostSession's dispatch —
 * only `{ peerId, kind }` ever reaches a log).
 */

import { err, ok, type Result } from "../Result";

export type ChatChannel = "say" | "party";

export const CHAT_CHANNELS: readonly ChatChannel[] = ["say", "party"];

export function isChatChannel(v: unknown): v is ChatChannel {
  return v === "say" || v === "party";
}

/** Generous for a kid-friendly chat line — enough for a sentence, short
 *  enough that a wall-of-text can't dominate the box or the wire. */
export const CHAT_MAX_LENGTH = 160;

export interface ChatMessage {
  readonly senderPeerId: string;
  readonly senderName: string;
  /** Already filtered (masked/redacted) — the only text ever displayed or
   *  relayed. */
  readonly text: string;
  readonly channel: ChatChannel;
  readonly timestamp: number;
}

export type ChatError =
  | { readonly kind: "Empty" }
  | { readonly kind: "TooLong"; readonly max: number };

// ---- Profanity word lists (EN/ES/DA starter sets, extend freely) ----
// Whole-word matched against a leet-normalized copy of the text (see
// `normalizeForDetection`) so "sh1t"/"a$$" are still caught, but the ORIGINAL
// text is what gets masked (same length, same casing/punctuation) — never
// substring matching, which is the classic "Scunthorpe problem" false
// positive (e.g. "ass" inside "class"/"assist"/"grass").
const PROFANITY_WORDS: Readonly<Record<"en" | "es" | "da", readonly string[]>> = {
  en: ["fuck", "shit", "bitch", "ass", "asshole", "damn", "hell", "bastard", "dick", "piss", "crap"],
  es: ["mierda", "puta", "puto", "joder", "cabron", "cabrón", "gilipollas", "coño", "polla"],
  da: ["lort", "satan", "fanden", "skide", "pikhoved", "kraftedeme", "møgso"],
};

const ALL_PROFANITY_WORDS = Object.values(PROFANITY_WORDS).flat();

/** 1:1 char substitution so a leet-spelled word still matches, while keeping
 *  the normalized string the SAME LENGTH as the original (positions line up
 *  1:1, so a match's index/length can mask the ORIGINAL text directly). */
const LEET_MAP: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  $: "s",
  "@": "a",
};

function normalizeForDetection(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    out += LEET_MAP[ch] ?? ch;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROFANITY_PATTERN = new RegExp(
  `\\b(${ALL_PROFANITY_WORDS.map(escapeRegExp).join("|")})\\b`,
  "gi",
);

/** Mask every profanity match IN PLACE — same length, same surrounding
 *  punctuation — matched against a leet-normalized copy so obvious evasion
 *  ("sh1t", "a$$") is still caught, but whole-word only so an innocent word
 *  containing the substring ("class", "assist", "grasshopper") is untouched. */
function maskProfanity(text: string): string {
  const normalized = normalizeForDetection(text);
  let result = "";
  let lastIndex = 0;
  PROFANITY_PATTERN.lastIndex = 0;
  for (const m of normalized.matchAll(PROFANITY_PATTERN)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    result += text.slice(lastIndex, start) + "*".repeat(end - start);
    lastIndex = end;
  }
  result += text.slice(lastIndex);
  return result;
}

// ---- PII redaction: email, URL, phone-number-like digit runs ----

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// http(s)://... or www.... or a bare domain-with-known-TLD ("example.com").
// Deliberately does NOT match a lone word with a dot in it that isn't a real
// TLD (e.g. "v1.2" or "3.14") — the TLD allowlist keeps that a false negative
// rather than mangling ordinary text with numbers/decimals in it.
const URL_PATTERN =
  /\b(?:https?:\/\/\S+|www\.\S+|[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|net|org|io|co|gg|dev|app)\b\S*)/gi;

// A run of digits (optionally separated by spaces/dashes/dots) totalling at
// least 7 digits reads as a phone number; shorter runs (item counts, levels,
// years like "2026") are left alone — the false-positive guard for ordinary
// game chatter ("I have 100 gold", "level 42").
const PHONE_PATTERN = /\b(?:\d[\s.-]?){7,}\d\b/g;

function redactPii(text: string): string {
  // Email FIRST — an email's domain half ("example.com") would otherwise
  // also match the bare-domain URL pattern and get redacted as "[link]".
  return text
    .replace(EMAIL_PATTERN, "[email]")
    .replace(URL_PATTERN, "[link]")
    .replace(PHONE_PATTERN, "[number]");
}

/** The kid-safe filter applied at the boundary BEFORE any relay: redact PII
 *  first (so a phone number/email/link never survives even unmasked), then
 *  mask profanity in whatever text remains. Pure — never throws, always
 *  returns text safe to display/relay. */
export function filterChatText(text: string): string {
  return maskProfanity(redactPii(text));
}

export interface BuildChatMessageArgs {
  readonly senderPeerId: string;
  readonly senderName: string;
  readonly text: string;
  readonly channel: ChatChannel;
  readonly timestamp: number;
}

/** Validate + filter a raw chat submission into a safe, relayable message.
 *  The length cap applies to the RAW (pre-filter) text a player typed — the
 *  filter only ever masks/redacts in place, it never shortens or lengthens
 *  past what the cap already bounded. */
export function buildChatMessage(args: BuildChatMessageArgs): Result<ChatMessage, ChatError> {
  const trimmed = args.text.trim();
  if (trimmed.length === 0) return err({ kind: "Empty" });
  if (trimmed.length > CHAT_MAX_LENGTH) {
    return err({ kind: "TooLong", max: CHAT_MAX_LENGTH });
  }
  return ok({
    senderPeerId: args.senderPeerId,
    senderName: args.senderName,
    text: filterChatText(trimmed),
    channel: args.channel,
    timestamp: args.timestamp,
  });
}
