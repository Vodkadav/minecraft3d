/**
 * Room-invite codes (ADR 0002 §4). No backend means no browsable world list:
 * the host derives a short shareable code from worldId + a session nonce, and
 * joiners type/paste it. Derived via the domain hash32 so the same
 * worldId+nonce always yields the same code (host can re-show it), and the
 * alphabet drops 0/O/1/I so codes survive being read aloud or handwritten.
 */

import { hash32 } from "../rng/hash";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 8;

/** Deterministic 8-char uppercase invite code for a hosted world session. */
export function makeRoomCode(worldId: string, nonce: number): string {
  const idInts = [...worldId].map((c) => c.codePointAt(0) ?? 0);
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[hash32(i, nonce, ...idInts) % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

/** Shape check only (length + alphabet); lowercase input is normalized. */
export function isValidRoomCode(s: string): boolean {
  const code = s.toUpperCase();
  return (
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((c) => ROOM_CODE_ALPHABET.includes(c))
  );
}
