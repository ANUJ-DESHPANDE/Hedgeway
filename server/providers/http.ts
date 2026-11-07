import type { DB } from "../db/index.js";
import { row } from "../db/index.js";
const pendingByDatabase = new WeakMap<DB, Map<string, Promise<unknown>>>();
export async function fetchText(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: init.signal || AbortSignal.timeout(12000),
    headers: {
      "User-Agent": "Hedgeway/2.0 personal research",
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > 3_000_000)
    throw new Error("Provider response too large");
  if (!response.body) throw new Error("Empty provider response");
  const reader = response.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 3_000_000) {
      await reader.cancel();
      throw new Error("Provider response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function json(url: string, init: RequestInit = {}) {
  return JSON.parse(await fetchText(url, init));
}
export async function cached<T>(
  db: DB,
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  let pending = pendingByDatabase.get(db);
  if (!pending) {
    pending = new Map();
    pendingByDatabase.set(db, pending);
  }
  const hit = row<{ payload: string; expires_at: number }>(
    db,
    "SELECT * FROM cache WHERE key=?",
    key,
  );
  if (hit && hit.expires_at > Date.now()) return JSON.parse(hit.payload);
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const promise = fn()
    .then((data) => {
      db.prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)").run(
        key,
        JSON.stringify(data),
        Date.now() + ttl,
      );
      return data;
    })
    .finally(() => pending!.delete(key));
  pending.set(key, promise);
  return promise;
}
