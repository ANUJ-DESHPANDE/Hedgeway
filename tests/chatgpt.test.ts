import { generateKeyPairSync, sign } from "node:crypto";
import { expect, it } from "vitest";
import { validateChatGPTIdentity } from "../server/chatgpt";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "test-key",
  alg: "RS256",
};
function token(extra: Record<string, unknown> = {}) {
  const h = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "test-key" }),
  ).toString("base64url");
  const p = Buffer.from(
    JSON.stringify({
      iss: "https://auth.openai.com",
      aud: "client",
      nonce: "nonce",
      sub: "user",
      exp: 2000000000,
      ...extra,
    }),
  ).toString("base64url");
  return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), keys.privateKey).toString("base64url")}`;
}
it("accepts only the verified identity bound to the current client and nonce", () => {
  expect(
    validateChatGPTIdentity(
      token(),
      { keys: [jwk] },
      "client",
      "nonce",
      1000000000000,
    ).subject,
  ).toBe("user");
});
it("rejects replay, wrong account audience and expired identities", () => {
  for (const extra of [
    { nonce: "old" },
    { aud: "another-app" },
    { exp: 1 },
    { iss: "https://attacker.invalid" },
  ])
    expect(() =>
      validateChatGPTIdentity(
        token(extra),
        { keys: [jwk] },
        "client",
        "nonce",
        1000000000000,
      ),
    ).toThrow();
});
it("rejects forged signatures", () => {
  expect(() =>
    validateChatGPTIdentity(
      token().slice(0, -20) + "AAAAAAAAAAAAAAAAAAAA",
      { keys: [jwk] },
      "client",
      "nonce",
    ),
  ).toThrow();
});
