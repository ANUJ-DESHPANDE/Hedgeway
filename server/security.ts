import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export function passwordMatches(input: string, expected: string) {
  return timingSafeEqual(Buffer.from(hash(input)), Buffer.from(hash(expected)));
}
function key() {
  const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || "", "base64");
  if (k.length !== 32)
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must contain 32 random bytes encoded as base64.",
    );
  return k;
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export function decrypt(value: string) {
  const data = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export function safeUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()])
      if (k.startsWith("utm_") || ["fbclid", "gclid"].includes(k))
        u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}
