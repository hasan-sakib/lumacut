const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

/**
 * A random 21-character id matching the schema's `Id` pattern (`[A-Za-z0-9_-]{1,64}`), like the
 * server's `new_id()`. Used for new clips, tracks, markers and link groups. Never called from
 * render paths: the project document stores the result, rendering only reads it.
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
