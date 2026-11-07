import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const image = process.env.SMOKE_IMAGE || "hedgeway:ci";
const name = `hedgeway-smoke-${randomBytes(5).toString("hex")}`;
const volume = `${name}-data`;
const password = randomBytes(32).toString("base64url");
const origin = "https://hedgeway.test";
const env = {
  ...process.env,
  APP_PASSWORD: password,
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const docker = (...args) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let created = false;
let base = "";
let cookie = "";
async function req(path, options = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(5000),
  });
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await req("/api/health")).ok) return;
    } catch {}
    if (
      i % 10 === 0 &&
      docker("inspect", "--format", "{{.State.Running}}", name) !== "true"
    )
      throw new Error("Container stopped before becoming healthy");
    await delay(100);
  }
  throw new Error("Container did not become healthy");
}
try {
  docker(
    "run",
    "-d",
    "--name",
    name,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--tmpfs",
    "/tmp",
    "-p",
    "127.0.0.1::4100",
    "-v",
    `${volume}:/app/data`,
    "-e",
    "APP_PASSWORD",
    "-e",
    "TOKEN_ENCRYPTION_KEY",
    "-e",
    `APP_ORIGIN=${origin}`,
    "-e",
    "COOKIE_SECURE=true",
    "-e",
    "ENABLE_SCHEDULER=false",
    image,
  );
  created = true;
  base = `http://${docker("port", name, "4100/tcp")}`;
  await ready();
  assert.notEqual(docker("exec", name, "id", "-u"), "0");
  assert.equal((await req("/api/dashboard")).status, 401);
  const page = await req("/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Hedgeway/);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const login = await req("/api/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  cookie = setCookie.split(";")[0];
  const dashboard = await (await req("/api/dashboard")).json();
  assert.equal(dashboard.quotes.length, 0);
  assert.equal(dashboard.portfolio.positions.length, 0);
  const ai = await (await req("/api/ai/status")).json();
  assert.equal(ai.configured, false);
  assert.equal(typeof ai.model, "string");
  assert.deepEqual(await (await req("/api/ai/threads")).json(), []);
  assert.deepEqual(await (await req("/api/scanner/history")).json(), []);
  const denied = await req("/api/notes", {
    method: "POST",
    headers: { Origin: "https://foreign.test" },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const note = await req("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      symbol: "TEST",
      thesis: "Isolated container persistence check",
      risk: "Test fixture",
      catalyst: "Test fixture",
    }),
  });
  assert.equal(note.status, 200);
  const id = (await note.json()).id;
  const stream = await req("/api/stream");
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  assert.match(
    new TextDecoder().decode((await reader.read()).value),
    /event: status/,
  );
  await reader.cancel();
  docker("restart", name);
  base = `http://${docker("port", name, "4100/tcp")}`;
  await ready();
  const notes = await (await req("/api/notes")).json();
  assert.ok(notes.some((n) => n.id === id));
  await req("/api/logout", { method: "POST", body: "{}" });
  assert.equal((await req("/api/dashboard")).status, 401);
  console.log(
    "Container smoke passed: non-root/read-only runtime, static UI, health, authentication, secure cookies, CSRF rejection, empty real-data state, SSE, persistent SQLite and logout.",
  );
} catch (error) {
  if (created)
    execFileSync(
      "docker",
      ["--host=unix:///var/run/docker.sock", "logs", "--tail", "20", name],
      { env, stdio: "inherit" },
    );
  throw error;
} finally {
  if (created) docker("rm", "-f", name);
  try {
    docker("volume", "rm", volume);
  } catch {}
}
