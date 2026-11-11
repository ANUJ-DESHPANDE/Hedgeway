import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
import protobuf from "protobufjs";
import type { DB } from "../db/index.js";
import { row, rows, transaction } from "../db/index.js";
import { decrypt, hash } from "../security.js";
import {
  resolveUpstox,
  upstoxConfigured,
  upstoxRequest,
  upstoxToken,
} from "./upstox.js";
import { marketProvider } from "./market.js";
import { kiteConnected, kiteInstrument, kiteCredentials } from "./kite.js";
import type { Quote } from "../../src/types.js";
import { instruments } from "../instruments.js";

const root = protobuf.parse(
  readFileSync(
    fileURLToPath(new URL("./proto/MarketDataFeed.proto", import.meta.url)),
    "utf8",
  ),
).root;
root.addJSON(protobuf.common.get("google/protobuf/wrappers.proto")!.nested!);
const feedType = root.lookupType(
  "com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse",
);
export type NormalizedTick = {
  key: string;
  price: number;
  previousClose: number;
  asOf: string;
};
export function decodeUpstox(data: Uint8Array): NormalizedTick[] {
  const message = feedType.toObject(feedType.decode(data), {
    longs: Number,
  }) as any;
  return Object.entries(message.feeds || {}).flatMap(
    ([key, f]: [string, any]) => {
      const tick =
        f.ltpc || f.fullFeed?.marketFF?.ltpc || f.fullFeed?.indexFF?.ltpc;
      const time = Number(tick?.ltt || message.currentTs);
      if (
        !tick ||
        !Number.isFinite(tick.ltp) ||
        tick.ltp <= 0 ||
        !Number.isFinite(tick.cp) ||
        tick.cp <= 0 ||
        !Number.isFinite(time) ||
        time <= 0
      )
        return [];
      return [
        {
          key,
          price: tick.ltp,
          previousClose: tick.cp,
          asOf: new Date(time).toISOString(),
        },
      ];
    },
  );
}
// NSE/BSE equity full packets, documented by Kite Connect v3. No guessed token/price fallback.
export function decodeKite(data: Buffer): NormalizedTick[] {
  if (data.length === 1) return [];
  if (data.length < 2) throw new Error("Truncated Kite frame");
  const count = data.readUInt16BE(0),
    result: NormalizedTick[] = [];
  let offset = 2;
  for (let i = 0; i < count; i++) {
    if (offset + 2 > data.length)
      throw new Error("Truncated Kite packet length");
    const size = data.readUInt16BE(offset);
    offset += 2;
    if (offset + size > data.length) throw new Error("Truncated Kite packet");
    const p = data.subarray(offset, offset + size);
    offset += size;
    if (size !== 184) continue;
    const price = p.readInt32BE(4) / 100,
      previousClose = p.readInt32BE(40) / 100,
      time = p.readUInt32BE(60) * 1000;
    if (price > 0 && previousClose > 0 && time > 0)
      result.push({
        key: String(p.readUInt32BE(0)),
        price,
        previousClose,
        asOf: new Date(time).toISOString(),
      });
  }
  return result;
}
export type StreamStatus = {
  provider: string;
  state: string;
  message: string;
  lastTickAt: string | null;
  lastHeartbeatAt: string | null;
  subscriptions: number;
};
export class MarketStream extends EventEmitter {
  status: StreamStatus = {
    provider: "Upstox",
    state: "disconnected",
    message: "Connect a live market-data provider.",
    lastTickAt: null,
    lastHeartbeatAt: null,
    subscriptions: 0,
  };
  private socket: WebSocket | null = null;
  private generation = 0;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private maintenance: ReturnType<typeof setInterval> | null = null;
  private publishTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setInterval> | null = null;
  private identity = "";
  private connecting = false;
  private stopped = false;
  private mapping = new Map<
    string,
    { symbol: string; exchange: string; name: string }
  >();
  private latest = new Map<string, Quote>();
  private dirty = false;
  private persistDirty = false;
  constructor(private db: DB) {
    super();
    this.setMaxListeners(50);
  }
  getStatus() {
    return { ...this.status };
  }
  private update(values: Partial<StreamStatus>) {
    Object.assign(this.status, values);
    this.emit("status", this.getStatus());
  }
  provider() {
    return marketProvider(this.db);
  }
  start() {
    this.stopped = false;
    this.maintenance = setInterval(() => {
      if (
        this.status.lastHeartbeatAt &&
        Date.now() - Date.parse(this.status.lastHeartbeatAt) > 45000 &&
        this.socket?.readyState === WebSocket.OPEN
      ) {
        this.update({
          state: "stale",
          message: "No broker heartbeat for 45 seconds; reconnecting.",
        });
        this.socket.terminate();
      }
      if (
        this.status.state === "live" &&
        this.status.lastTickAt &&
        Date.now() - Date.parse(this.status.lastTickAt) >= 120000
      )
        this.update({
          state: "snapshot",
          message:
            "Broker connected; no recent trades. Check each quote’s timestamp.",
        });
      this.safeEnsure();
    }, 10000);
    this.publishTimer = setInterval(() => {
      if (this.dirty) {
        this.dirty = false;
        this.emit("quotes", [...this.latest.values()]);
      }
    }, 100);
    this.persistTimer = setInterval(() => this.persist(), 1000);
    this.safeEnsure();
  }
  stop() {
    this.stopped = true;
    this.generation++;
    for (const t of [this.maintenance, this.publishTimer, this.persistTimer])
      if (t) clearInterval(t);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retireSocket();
    this.persist();
    this.identity = "";
    this.emit("shutdown");
    this.update({ state: "disconnected", message: "Stream stopped." });
  }
  private retireSocket() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners();
      socket.on("error", () => {});
      socket.terminate();
    }
  }
  async restart() {
    this.identity = "";
    await this.ensure();
  }
  private persist() {
    if (!this.persistDirty) return;
    this.persistDirty = false;
    transaction(this.db, () => {
      for (const q of this.latest.values()) {
        this.db
          .prepare("INSERT OR REPLACE INTO quotes VALUES(?,?,?,?)")
          .run(
            q.symbol,
            q.exchange,
            JSON.stringify(q),
            new Date().toISOString(),
          );
        if (q.exchange === "NSE" && Date.now() - Date.parse(q.asOf) < 120000)
          this.db
            .prepare(
              "UPDATE alerts SET triggered_at=? WHERE symbol=? AND triggered_at IS NULL AND ((direction='above' AND target<=?) OR (direction='below' AND target>=?))",
            )
            .run(new Date().toISOString(), q.symbol, q.price, q.price);
      }
    });
  }
  async ensure() {
    if (this.stopped || this.connecting) return;
    const provider = this.provider();
    if (provider === "yahoo") {
      this.generation++;
      this.retireSocket();
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.persist();
      this.latest.clear();
      this.dirty = false;
      this.update({
        provider: "Yahoo research",
        state: "research",
        subscriptions: 0,
        lastTickAt: null,
        lastHeartbeatAt: null,
        message:
          "Unofficial snapshots, not streaming. Add NSE companies in Markets, then use Refresh quotes. Data may be delayed or unavailable.",
      });
      return;
    }
    const ready =
      provider === "upstox"
        ? upstoxConfigured(this.db)
        : kiteConnected(this.db);
    const ids = rows<{ symbol: string; exchange: string }>(
      this.db,
      "SELECT symbol,exchange FROM holdings UNION SELECT symbol,exchange FROM watchlist",
    )
      .map((x) => `${x.exchange}:${x.symbol}`)
      .sort()
      .slice(0, 500);
    const credential =
      provider === "upstox"
        ? ready
          ? hash(upstoxToken(this.db))
          : ""
        : row<{ encrypted_token: string }>(
            this.db,
            "SELECT encrypted_token FROM broker_session WHERE id=1",
          )?.encrypted_token || "";
    const identity = hash(provider + credential + ids.join(","));
    if (
      ready &&
      ids.length &&
      identity === this.identity &&
      (this.socket || this.retryTimer)
    )
      return;
    this.generation++;
    const generation = this.generation;
    this.retireSocket();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.identity = identity;
    this.persist();
    this.latest.clear();
    this.dirty = false;
    this.mapping.clear();
    if (!ready || !ids.length) {
      this.update({
        provider: provider === "kite" ? "Kite" : "Upstox",
        state: "disconnected",
        subscriptions: 0,
        message: !ready
          ? "Connect your market-data provider in Integrations."
          : "Add holdings or watchlist instruments to start streaming.",
      });
      return;
    }
    this.connecting = true;
    this.update({
      provider: provider === "kite" ? "Kite" : "Upstox",
      state: "connecting",
      message: "Resolving instruments and connecting to the broker.",
      subscriptions: 0,
    });
    try {
      let url: string;
      const unresolved: string[] = [];
      if (provider === "upstox") {
        for (const id of ids) {
          try {
            const i = await resolveUpstox(this.db, id);
            const [exchange, symbol] = id.split(":");
            this.mapping.set(i.instrument_key, {
              symbol,
              exchange,
              name: i.name,
            });
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith("No exact Upstox equity match")
            )
              unresolved.push(id);
            else throw error;
          }
        }
        const auth = await upstoxRequest(
          this.db,
          "/v3/feed/market-data-feed/authorize",
        );
        const parsed = new URL(auth.authorized_redirect_uri);
        if (
          parsed.protocol !== "wss:" ||
          !parsed.hostname.endsWith(".upstox.com")
        )
          throw new Error("Unexpected broker WebSocket endpoint.");
        url = parsed.toString();
      } else {
        for (const id of ids) {
          const [exchange, symbol] = id.split(":");
          try {
            const i = await kiteInstrument(this.db, symbol, exchange);
            this.mapping.set(String(i.token), {
              symbol,
              exchange,
              name: i.name,
            });
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith("No Kite equity match")
            )
              unresolved.push(id);
            else throw error;
          }
        }
        const saved = row<{ encrypted_token: string }>(
          this.db,
          "SELECT encrypted_token FROM broker_session WHERE id=1",
        )!;
        url = `wss://ws.kite.trade?${new URLSearchParams({ api_key: kiteCredentials(this.db).apiKey, access_token: decrypt(saved.encrypted_token) })}`;
      }
      if (!this.mapping.size)
        throw new Error(
          "No valid instruments resolved. Check symbols in Markets.",
        );
      const missing = unresolved.length
        ? ` Unresolved: ${unresolved.slice(0, 5).join(", ")}${unresolved.length > 5 ? "…" : ""}. Remove or correct these in Markets.`
        : "";
      if (generation !== this.generation || this.stopped) return;
      const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
      const socket = new WebSocket(url, {
        handshakeTimeout: 15000,
        maxPayload: 3_000_000,
        agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
      });
      this.socket = socket;
      socket.on("open", () => {
        this.retry = 0;
        this.update({
          state: "connected",
          message: "Broker connected; waiting for exchange ticks." + missing,
          lastHeartbeatAt: new Date().toISOString(),
          subscriptions: this.mapping.size,
        });
        if (provider === "upstox")
          socket.send(
            Buffer.from(
              JSON.stringify({
                guid: "hedgeway",
                method: "sub",
                data: {
                  mode: "ltpc",
                  instrumentKeys: [...this.mapping.keys()],
                },
              }),
            ),
          );
        else {
          const tokens = [...this.mapping.keys()].map(Number);
          socket.send(JSON.stringify({ a: "subscribe", v: tokens }));
          socket.send(JSON.stringify({ a: "mode", v: ["full", tokens] }));
        }
      });
      socket.on("ping", () => {
        this.status.lastHeartbeatAt = new Date().toISOString();
      });
      socket.on("pong", () => {
        this.status.lastHeartbeatAt = new Date().toISOString();
      });
      socket.on("message", (raw, binary) => {
        this.status.lastHeartbeatAt = new Date().toISOString();
        if (!binary) {
          try {
            const message = JSON.parse(raw.toString());
            if (message.type === "error") {
              this.update({
                state: "error",
                message:
                  "Broker stream rejected a request. Verify data entitlement.",
              });
              socket.terminate();
            }
          } catch {
            /* Non-quote notices are not rendered. */
          }
          return;
        }
        try {
          const ticks =
            provider === "upstox"
              ? decodeUpstox(raw as Buffer)
              : decodeKite(raw as Buffer);
          for (const tick of ticks) {
            const item = this.mapping.get(tick.key);
            if (!item) continue;
            const key = `${item.exchange}:${item.symbol}`,
              old = this.latest.get(key);
            if (old && tick.asOf < old.asOf) continue;
            const q: Quote = {
              ...item,
              price: tick.price,
              previousClose: tick.previousClose,
              change: (tick.price / tick.previousClose - 1) * 100,
              sector:
                instruments.find((x) => x[0] === item.symbol)?.[2] ||
                "Unclassified",
              currency: "INR",
              asOf: tick.asOf,
              source: `${this.status.provider} WebSocket`,
            };
            this.latest.set(key, q);
            this.dirty = true;
            this.persistDirty = true;
          }
          if (ticks.length) {
            const newest = Math.max(
              ...[...this.latest.values()].map((q) => Date.parse(q.asOf)),
            );
            const fresh =
              Number.isFinite(newest) && Date.now() - newest < 120000;
            this.update({
              state: fresh ? "live" : "snapshot",
              message:
                (fresh
                  ? "Receiving recent exchange trades."
                  : "Broker connected; last trades are older than two minutes. The market may be closed or this instrument inactive.") +
                missing,
              lastTickAt: Number.isFinite(newest)
                ? new Date(newest).toISOString()
                : null,
            });
          }
        } catch {
          this.update({
            state: "error",
            message: "Broker sent an unsupported or malformed data frame.",
          });
          socket.terminate();
        }
      });
      socket.on("error", () =>
        this.update({
          state: "error",
          message:
            "Broker connection failed. Check network access, token validity and market-data entitlement.",
        }),
      );
      socket.on("close", () => {
        if (generation === this.generation && !this.stopped) {
          this.socket = null;
          this.schedule();
        }
      });
    } catch (e) {
      if (generation === this.generation) {
        this.update({
          state: "error",
          message: e instanceof Error ? e.message : "Stream setup failed.",
        });
        this.schedule();
      }
    } finally {
      this.connecting = false;
    }
  }
  private safeEnsure() {
    void this.ensure().catch(() =>
      this.update({
        state: "error",
        message:
          "Unable to initialize the live feed. Check provider credentials and encryption configuration.",
      }),
    );
  }
  private schedule() {
    if (this.stopped) return;
    this.retry++;
    const delay = Math.min(60, 2 ** Math.min(this.retry, 6));
    this.update({
      state: "reconnecting",
      message: `Reconnecting in ${delay}s. ${this.status.message}`.slice(
        0,
        240,
      ),
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.identity = "";
      this.safeEnsure();
    }, delay * 1000);
  }
}
