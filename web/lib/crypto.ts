/**
 * Symmetric encryption for secrets we must store and later read back —
 * currently users' Notion integration tokens.
 *
 * A Notion token grants read access to that user's workspace pages, so it is
 * never written to the database in plaintext. Hashing isn't an option here
 * (unlike passwords) because the sync job needs the original value, so this
 * uses AES-256-GCM: authenticated encryption, meaning tampering with a stored
 * ciphertext is detected at decrypt time rather than silently producing garbage.
 *
 * Stored format: base64(iv).base64(authTag).base64(ciphertext)
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the size GCM is specified for

/**
 * Derives the 32-byte key from ENCRYPTION_KEY.
 *
 * Read lazily rather than at module load so that importing this file (e.g. in a
 * build step or a route that never encrypts) doesn't crash a deployment that
 * hasn't set the variable yet.
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY must be set to a random string of at least 32 characters. " +
        "Generate one with: openssl rand -base64 32"
    );
  }
  // SHA-256 gives a uniform 32-byte key regardless of how the env var is formatted.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value");
  }

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Shows the last 4 characters only, for confirming which token is connected. */
export function maskToken(token: string): string {
  if (token.length <= 4) return "••••";
  return `••••••••${token.slice(-4)}`;
}
