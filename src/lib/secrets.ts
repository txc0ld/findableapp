import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function normalizeKey(rawKey: string) {
  const trimmed = rawKey.trim();

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const base64Key = Buffer.from(trimmed, "base64");

    if (base64Key.length === 32) {
      return base64Key;
    }
  } catch {
    // Fall through to UTF-8 handling.
  }

  const utf8Key = Buffer.from(trimmed, "utf8");

  if (utf8Key.length === 32) {
    return utf8Key;
  }

  throw new Error("Encryption key must resolve to 32 bytes.");
}

export function encryptSecret(plaintext: string, rawKey: string) {
  const key = normalizeKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSecret(payload: string, rawKey: string) {
  const key = normalizeKey(rawKey);
  const buffer = Buffer.from(payload, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
