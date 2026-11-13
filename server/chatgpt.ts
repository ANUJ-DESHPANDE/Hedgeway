import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify,
} from "node:crypto";
import type { Express } from "express";
import type { DB } from "./db/index.js";
import { row, rows } from "./db/index.js";
import { encrypt, decrypt } from "./security.js";
import { json } from "./providers/http.js";
const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
type Account = {
  clientId: string;
  subject: string;
  email?: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  scopes: string[];
  expiresAt: number;
};
type Pending = {
  state: string;
  nonce: string;
  verifier: string;
  redirect: string;
  clientId: string;
  subject?: string;
  expiresAt: number;
};
function read<T>(db: DB, key: string): T | null {
  const found = row<{ encrypted_value: string }>(
    db,
    "SELECT encrypted_value FROM credentials WHERE provider=?",
    key,
  );
  return found ? JSON.parse(decrypt(found.encrypted_value)) : null;
}
function save(db: DB, key: string, value: unknown) {
  db.prepare("INSERT OR REPLACE INTO credentials VALUES(?,?,?)").run(
    key,
    encrypt(JSON.stringify(value)),
    new Date().toISOString(),
  );
}
export function validateChatGPTIdentity(
  token: string,
  jwks: { keys: unknown[] },
  clientId: string,
  nonce: string,
  now = Date.now(),
) {
  const pieces = token.split(".");
  if (pieces.length !== 3) throw new Error("Invalid ChatGPT identity token");
  const header = JSON.parse(Buffer.from(pieces[0], "base64url").toString());
  const claims = JSON.parse(Buffer.from(pieces[1], "base64url").toString());
  if (header.alg !== "RS256" || typeof header.kid !== "string")
    throw new Error("Unsupported ChatGPT identity signature");
  const key = jwks.keys.find(
    (k: any) =>
      k.kid === header.kid &&
      k.kty === "RSA" &&
      (!k.use || k.use === "sig") &&
      (!k.alg || k.alg === "RS256"),
  );
  if (
    !key ||
    !verify(
      "RSA-SHA256",
      Buffer.from(`${pieces[0]}.${pieces[1]}`),
      createPublicKey({ key: key as any, format: "jwk" }),
      Buffer.from(pieces[2], "base64url"),
    )
  )
    throw new Error("Invalid ChatGPT identity signature");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== issuer ||
    !audiences.includes(clientId) ||
    claims.nonce !== nonce ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= now ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    (claims.nbf && claims.nbf * 1000 > now + 30000)
  )
    throw new Error("ChatGPT identity claims did not match this sign-in");
  return {
    subject: claims.sub as string,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
}
export function chatGPTStatus(db: DB) {
  const accounts = rows<{ provider: string }>(
    db,
    "SELECT provider FROM credentials WHERE provider LIKE 'chatgpt-account:%'",
  ).flatMap((x) => {
    try {
      const a = read<Account>(db, x.provider);
      return a
        ? [
            {
              clientId: a.clientId,
              label: a.email || "ChatGPT account",
              inferenceConsent: a.scopes.includes("chatgpt.tokens.use.direct"),
              expiresAt: a.expiresAt,
            },
          ]
        : [];
    } catch {
      return [];
    }
  });
  return {
    accounts,
    connected: accounts.length > 0,
    inferenceEnabled: false,
    reason:
      "Included-only credit controls must be verified in ChatGPT before generation can be enabled. No subscription inference requests are made by this version.",
    usageUrl: "https://chatgpt.com/settings/usage",
  };
}
export function chatGPTRoutes(app: Express, db: DB, local: boolean) {
  app.get("/api/chatgpt/status", (_req, res) => res.json(chatGPTStatus(db)));
  app.post("/api/chatgpt/connect", (req, res) => {
    if (!local)
      throw new Error(
        "ChatGPT subscription sign-in is available on the local installation only.",
      );
    const selected =
      typeof req.body.clientId === "string"
        ? read<Account>(db, `chatgpt-account:${req.body.clientId}`)
        : null;
    if (req.body.clientId && !selected)
      throw new Error(
        "Select a saved ChatGPT account or start a new connection.",
      );
    let host = read<{ id: string }>(db, "chatgpt-host");
    if (!host) {
      host = { id: `urn:uuid:${randomUUID()}` };
      save(db, "chatgpt-host", host);
    }
    const state = randomBytes(32).toString("base64url"),
      nonce = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    const port = req.socket.localPort;
    if (!port) throw new Error("Local callback listener is unavailable");
    const redirect = `http://127.0.0.1:${port}/api/chatgpt/callback`;
    const pending: Pending = {
      state,
      nonce,
      verifier,
      redirect,
      clientId: selected?.clientId || "dynamic_agent_client",
      subject: selected?.subject,
      expiresAt: Date.now() + 600000,
    };
    save(db, "chatgpt-pending", pending);
    const query = new URLSearchParams({
      client_id: pending.clientId,
      ext_agent_host_id: host.id,
      response_type: "code",
      redirect_uri: redirect,
      scope:
        "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      resource,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    if (selected) query.set("id_token_hint", selected.idToken);
    else query.set("agent_name_hint", "Hedgeway");
    res.json({ url: `${issuer}/api/accounts/authorize?${query}` });
  });
  app.get("/api/chatgpt/callback", async (req, res) => {
    if (!local) throw new Error("Local ChatGPT callback required");
    const pending = read<Pending>(db, "chatgpt-pending");
    if (
      !pending ||
      pending.expiresAt < Date.now() ||
      typeof req.query.state !== "string" ||
      req.query.state !== pending.state
    )
      throw new Error(
        "This ChatGPT sign-in expired or did not match. Start it again from Settings.",
      );
    db.prepare("DELETE FROM credentials WHERE provider=?").run(
      "chatgpt-pending",
    );
    if (req.query.error) return res.redirect("/#Integrations");
    const supplied =
      typeof req.query.client_id === "string" ? req.query.client_id : "";
    const clientId =
      pending.clientId === "dynamic_agent_client" ? supplied : pending.clientId;
    if (
      !clientId ||
      clientId === "dynamic_agent_client" ||
      (supplied && supplied !== clientId) ||
      typeof req.query.code !== "string"
    )
      throw new Error(
        "ChatGPT registration did not return the expected account.",
      );
    const result = await json(`${issuer}/api/accounts/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: req.query.code,
        code_verifier: pending.verifier,
        redirect_uri: pending.redirect,
        resource,
      }).toString(),
    });
    if (
      typeof result.id_token !== "string" ||
      typeof result.access_token !== "string" ||
      typeof result.refresh_token !== "string" ||
      typeof result.expires_in !== "number" ||
      result.expires_in <= 0 ||
      typeof result.scope !== "string"
    )
      throw new Error(
        "ChatGPT returned an incomplete connection. No credentials were saved.",
      );
    const discovery = await json(`${issuer}/.well-known/openid-configuration`);
    const keysUrl = new URL(discovery.jwks_uri);
    if (keysUrl.origin !== issuer || keysUrl.protocol !== "https:")
      throw new Error("Unexpected ChatGPT identity key endpoint");
    const identity = validateChatGPTIdentity(
      result.id_token,
      await json(keysUrl.href),
      clientId,
      pending.nonce,
    );
    if (pending.subject && identity.subject !== pending.subject)
      throw new Error(
        "The signed-in account does not match the selected connection.",
      );
    save(db, `chatgpt-account:${clientId}`, {
      clientId,
      ...identity,
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      idToken: result.id_token,
      scopes: result.scope.split(" "),
      expiresAt: Date.now() + result.expires_in * 1000,
    } satisfies Account);
    res.redirect("/#Integrations");
  });
  app.post("/api/chatgpt/models", async (req, res) => {
    const clientId =
      typeof req.body.clientId === "string" ? req.body.clientId : "";
    const account = read<Account>(db, `chatgpt-account:${clientId}`);
    if (!account) throw new Error("Connect ChatGPT first.");
    if (account.expiresAt <= Date.now() + 30000)
      throw new Error(
        "Reauthorize this ChatGPT connection before discovering models.",
      );
    if (!account.scopes.includes("chatgpt.tokens.use.direct"))
      throw new Error("ChatGPT inference consent was not granted.");
    const result = await json(`${resource}/models`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    res.json({
      models: Array.isArray(result.models)
        ? result.models
            .filter(
              (m: any) =>
                m.visibility === "list" &&
                typeof m.slug === "string" &&
                typeof m.display_name === "string",
            )
            .map((m: any) => ({ id: m.slug, name: m.display_name }))
        : [],
      inferenceEnabled: false,
    });
  });
}
