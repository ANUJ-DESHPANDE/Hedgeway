import { randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";
import { openDatabase } from "../server/db/index.js";
import {
  decrypt,
  encrypt,
  passwordMatches,
  safeUrl,
} from "../server/security.js";
const origin = "https://hedgeway.example",
  password = "a-long-test-password-123456";
const databases: ReturnType<typeof openDatabase>[] = [];
function setup(local = false) {
  const db = openDatabase(":memory:");
  databases.push(db);
  return {
    db,
    app: createApp(db, {
      local,
      password: local ? "" : password,
      origin,
      secure: !local,
    }),
  };
}
afterEach(() => {
  databases.splice(0).forEach((d) => d.close());
  vi.unstubAllEnvs();
});
describe("authentication and request boundaries", () => {
  it("keeps health public and financial data protected", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
  });
  it("rejects a wrong password", async () => {
    const { app } = setup();
    expect(
      (
        await request(app)
          .post("/api/login")
          .set("Origin", origin)
          .send({ password: "wrong" })
      ).status,
    ).toBe(401);
  });
  it("sets secure HttpOnly session cookies and revokes on logout", async () => {
    const { app } = setup();
    const login = await request(app)
      .post("/api/login")
      .set("Origin", origin)
      .send({ password });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(
      (await request(app).get("/api/dashboard").set("Cookie", cookie)).status,
    ).toBe(200);
    await request(app)
      .post("/api/logout")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({});
    expect(
      (await request(app).get("/api/dashboard").set("Cookie", cookie)).status,
    ).toBe(401);
  });
  it("rejects foreign and absent origins on mutations", async () => {
    const { app } = setup(true);
    for (const value of ["https://evil.example", ""]) {
      const req = request(app).post("/api/watchlist").set("Host", "localhost");
      if (value) req.set("Origin", value);
      expect((await req.send({ symbol: "INFY", exchange: "NSE" })).status).toBe(
        403,
      );
    }
  });
  it("blocks DNS rebinding hostnames in local mode", async () => {
    const { app } = setup(true);
    expect(
      (await request(app).get("/api/dashboard").set("Host", "evil.example"))
        .status,
    ).toBe(403);
  });
  it("does not accept expired sessions", async () => {
    const { app, db } = setup();
    const login = await request(app)
      .post("/api/login")
      .set("Origin", origin)
      .send({ password });
    db.prepare("UPDATE sessions SET expires_at=0").run();
    expect(
      (
        await request(app)
          .get("/api/dashboard")
          .set("Cookie", login.headers["set-cookie"][0])
      ).status,
    ).toBe(401);
  });
  it("requires an unpredictable password in remote mode", () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    expect(() => createApp(db, { password: "short", local: false })).toThrow(
      "20 characters",
    );
  });
  it("rejects forged Kite callback state before contacting the provider", async () => {
    const { app } = setup(true);
    const result = await request(app)
      .get("/api/kite/callback?state=" + "a".repeat(64) + "&request_token=fake")
      .set("Host", "localhost");
    expect(result.status).toBe(403);
  });
  it("sends restrictive security and private cache headers", async () => {
    const { app } = setup(true);
    const r = await request(app).get("/api/session").set("Host", "localhost");
    expect(r.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});
describe("secret storage and URLs", () => {
  it("encrypts tokens and rejects tampering", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const encrypted = encrypt("secret-token");
    expect(encrypted).not.toContain("secret-token");
    expect(decrypt(encrypted)).toBe("secret-token");
    const tampered = Buffer.from(encrypted, "base64");
    tampered[30] ^= 1;
    expect(() => decrypt(tampered.toString("base64"))).toThrow();
  });
  it("rejects absent encryption keys", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(() => encrypt("x")).toThrow("32 random bytes");
  });
  it("rejects script URLs and canonicalizes tracking parameters", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://example.com/a?utm_source=x&id=2#fragment")).toBe(
      "https://example.com/a?id=2",
    );
  });
  it("compares passwords safely", () => {
    expect(passwordMatches("hello", "hello")).toBe(true);
    expect(passwordMatches("hello", "world")).toBe(false);
  });
});
