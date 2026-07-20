/**
 * Chat item-link parsing & validation (E8.5, ADR 0005's one wire-touching
 * seam). A player who shift-clicks an item they own inserts a bracket token
 * — `[[item:<id>]]` — into their chat draft; that token rides the exact same
 * `ChatMsg`/`ChatMessage` wire shape chat already carries (E5.5, see
 * `domain/net/Protocol.ts`) as plain `text`, so there is NO new payload
 * shape. The only new surface is what a RECEIVER'S client does with that
 * text — this module is what makes it safe to promote a token into a
 * clickable, rarity-colored chip instead of just displaying it.
 *
 * Security (docs/UX_PLAN.md "Security follow-ups"): a chat line is
 * untrusted, already-host-filtered TEXT — matching the `[[item:...]]`
 * bracket syntax is NEVER sufficient on its own to render a link. Every
 * candidate id is looked up against the real `ItemRegistry` before it's
 * allowed to become a chip; anything that doesn't resolve (typo, stale id
 * from a since-removed item, or a hand-crafted token from a modified/hostile
 * client) degrades to its literal source text — never dropped, never
 * rendered as an interactive element. Pure, no DOM — `ui/ChatBox.ts` is the
 * only consumer that turns a resolved segment into a chip.
 */

import type { ItemRegistry } from "../items/ItemRegistry";

/** Only a well-formed candidate token is even considered for lookup — an id
 *  containing any other character (spaces, brackets, markup) never reaches
 *  `ItemRegistry.get`, so there's nothing to sanitize downstream. Bounded
 *  length keeps the token scan linear (no ReDoS surface). */
const ITEM_LINK_TOKEN_RE = /\[\[item:([A-Za-z0-9_-]{1,64})\]\]/g;

/** Same charset the token regex accepts — exported so `formatItemLinkToken`
 *  (building a token from an id the UI already trusts, e.g. the sender's own
 *  inventory) validates against the identical rule. */
export const ITEM_LINK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Builds the bracket token a chat draft embeds for a linked item. Returns
 *  `undefined` for an id outside the safe charset — defensive: the only
 *  intended caller already owns a real registry id (an item the sender
 *  holds), but this stays a pure boundary check rather than trusting the
 *  call site, matching every other pure-domain builder in this codebase. */
export function formatItemLinkToken(itemId: string): string | undefined {
  if (!ITEM_LINK_ID_PATTERN.test(itemId)) return undefined;
  return `[[item:${itemId}]]`;
}

export type ChatLineSegment =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "itemLink";
      readonly itemId: string;
      readonly displayName: string;
      readonly tier: number;
    };

/**
 * Splits chat text into plain-text and item-link segments, resolving every
 * candidate `[[item:id]]` token against `registry` BEFORE it's allowed to
 * become an `itemLink` segment. An unresolved token (unknown/removed id) is
 * emitted as a literal `text` segment carrying its original source text, so
 * a tampered or stale token is always visible, never silently swallowed and
 * never promoted to something clickable.
 */
export function parseChatLine(text: string, registry: ItemRegistry): ChatLineSegment[] {
  const segments: ChatLineSegment[] = [];
  let lastIndex = 0;
  ITEM_LINK_TOKEN_RE.lastIndex = 0;
  for (const match of text.matchAll(ITEM_LINK_TOKEN_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const candidateId = match[1] ?? "";
    if (start > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, start) });
    }

    const resolved = registry.get(candidateId);
    if (resolved.ok) {
      segments.push({
        kind: "itemLink",
        itemId: candidateId,
        displayName: resolved.value.displayName,
        tier: resolved.value.tier,
      });
    } else {
      segments.push({ kind: "text", value: raw });
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }
  if (segments.length === 0) segments.push({ kind: "text", value: text });
  return segments;
}
