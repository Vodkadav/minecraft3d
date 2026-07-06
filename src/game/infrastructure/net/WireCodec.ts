/**
 * Wire codec for the trystero adapter. trystero 0.25 JSON-encodes object
 * payloads (only a TOP-LEVEL TypedArray/Blob rides as binary), so a nested
 * Uint8Array — the welcome snapshot's ChunkDelta.data — would arrive as a
 * `{"0":7,...}` husk and fail Protocol validation. This codec deep-replaces
 * Uint8Arrays with a tagged form before send and restores them on receive.
 *
 * ponytail: bytes travel as plain number arrays (~4x the octets, one-off
 * welcome traffic at family scale); switch to base64 if payloads get heavy.
 */

const TAG = "__u8";

export function encodeWire(value: unknown): unknown {
  if (value instanceof Uint8Array) return { [TAG]: Array.from(value) };
  if (Array.isArray(value)) return value.map(encodeWire);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encodeWire(v)]),
    );
  }
  return value;
}

export function decodeWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeWire);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const tagged = record[TAG];
    if (Array.isArray(tagged) && Object.keys(record).length === 1) {
      return new Uint8Array(tagged as number[]);
    }
    return Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, decodeWire(v)]),
    );
  }
  return value;
}
