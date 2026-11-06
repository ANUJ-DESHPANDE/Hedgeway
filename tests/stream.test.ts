import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import protobuf from "protobufjs";
import { openDatabase, row } from "../server/db/index.js";
import { decrypt } from "../server/security.js";

const sockets = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class Socket extends EventEmitter {
    static OPEN = 1;
    readyState = 0;
    sent: unknown[] = [];
    constructor(public url: string) {
      super();
      sockets.instances.push(this);
    }
    send(value: unknown) {
      this.sent.push(value);
    }
    terminate() {
      this.readyState = 3;
      this.emit("close");
    }
  }
  return { default: Socket };
});
import {
  decodeKite,
  decodeUpstox,
  MarketStream,
} from "../server/providers/stream.js";
import {
  resolveUpstox,
  saveUpstoxToken,
  upstoxQuotes,
} from "../server/providers/upstox.js";

const proto = protobuf.parse(
  readFileSync(
    new URL("../server/providers/proto/MarketDataFeed.proto", import.meta.url),
    "utf8",
  ),
).root;
proto.addJSON(protobuf.common.get("google/protobuf/wrappers.proto")!.nested!);
const feed = proto.lookupType(
  "com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse",
);
const encode = (value: unknown) =>
  feed.encode(feed.fromObject(value as Record<string, unknown>)).finish();
const databases: ReturnType<typeof openDatabase>[] = [];
const streams: MarketStream[] = [];
const db = () => {
  const value = openDatabase(":memory:");
  databases.push(value);
  return value;
};
afterEach(() => {
  streams.splice(0).forEach((s) => s.stop());
  databases.splice(0).forEach((d) => d.close());
  sockets.instances.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("binary exchange feed decoders", () => {
  it("decodes Kite equity prices in paise and the exchange timestamp", () => {
    const frame = Buffer.alloc(188);
    frame.writeUInt16BE(1, 0);
    frame.writeUInt16BE(184, 2);
    frame.writeUInt32BE(408065, 4);
    frame.writeInt32BE(155525, 8);
    frame.writeInt32BE(150000, 44);
    frame.writeUInt32BE(1794000000, 64);
    expect(decodeKite(frame)).toEqual([
      {
        key: "408065",
        price: 1555.25,
        previousClose: 1500,
        asOf: new Date(1794000000 * 1000).toISOString(),
      },
    ]);
  });
  it("ignores broker heartbeat packets", () =>
    expect(decodeKite(Buffer.from([0]))).toEqual([]));
  it("rejects truncated binary messages", () => {
    expect(() => decodeKite(Buffer.from([0, 1, 0, 184]))).toThrow("Truncated");
    expect(() => decodeKite(Buffer.from([0, 1, 0]))).toThrow("Truncated");
  });
  it("does not invent previous close or timestamp for LTP-only frames", () => {
    const b = Buffer.alloc(12);
    b.writeUInt16BE(1);
    b.writeUInt16BE(8, 2);
    expect(decodeKite(b)).toEqual([]);
  });
  it("decodes Upstox LTPC protobuf with the last-trade timestamp", () => {
    const currentTs = 1794000000000;
    const data = encode({
      currentTs,
      feeds: {
        "NSE_EQ|TEST": { ltpc: { ltp: 123.5, cp: 120, ltt: 1793999990000 } },
      },
    });
    expect(decodeUpstox(data)).toEqual([
      {
        key: "NSE_EQ|TEST",
        price: 123.5,
        previousClose: 120,
        asOf: new Date(1793999990000).toISOString(),
      },
    ]);
  });
  it("ignores market-status frames and nonpositive prices", () => {
    expect(
      decodeUpstox(
        encode({ type: 2, marketInfo: { segmentStatus: { NSE_EQ: 2 } } }),
      ),
    ).toEqual([]);
    expect(
      decodeUpstox(
        encode({
          currentTs: 1000,
          feeds: { x: { ltpc: { ltp: 0, cp: 100 } } },
        }),
      ),
    ).toEqual([]);
  });
});

describe("live provider boundaries", () => {
  it("stays disconnected without credentials and never inserts mock quotes", async () => {
    const database = db();
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "");
    const stream = new MarketStream(database);
    streams.push(stream);
    await stream.ensure();
    expect(stream.getStatus().state).toBe("disconnected");
    expect(sockets.instances).toHaveLength(0);
    expect(row<any>(database, "SELECT count(*) n FROM quotes")!.n).toBe(0);
  });
  it("validates a token before encrypting it in durable storage", async () => {
    const database = db();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: "success", data: {} })),
        ),
    );
    const secret = "real-format-test-token-not-an-account";
    await saveUpstoxToken(database, secret);
    const saved = row<any>(
      database,
      "SELECT encrypted_value FROM credentials WHERE provider='upstox'",
    )!;
    expect(saved.encrypted_value).not.toContain(secret);
    expect(decrypt(saved.encrypted_value)).toBe(secret);
  });
  it("does not save rejected provider credentials", async () => {
    const database = db();
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(saveUpstoxToken(database, "invalid-token")).rejects.toThrow(
      "401",
    );
    expect(row(database, "SELECT * FROM credentials")).toBeUndefined();
  });
  it("refuses fuzzy instrument matches", async () => {
    const database = db();
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "success",
            data: [
              {
                name: "Different",
                instrument_key: "NSE_EQ|X",
                trading_symbol: "INFYOTHER",
                exchange: "NSE",
                exchange_token: "123",
                segment: "NSE_EQ",
              },
            ],
          }),
        ),
      ),
    );
    await expect(resolveUpstox(database, "NSE:INFY")).rejects.toThrow(
      "No exact",
    );
  });
  it("maps REST quotes through the resolved instrument key", async () => {
    const database = db();
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "test");
    const instrument = {
      name: "Infosys",
      instrument_key: "NSE_EQ|TEST",
      trading_symbol: "INFY",
      exchange: "NSE",
      exchange_token: "123",
      segment: "NSE_EQ",
    };
    database
      .prepare("INSERT INTO cache VALUES(?,?,?)")
      .run(
        "upstox-instrument:NSE:INFY",
        JSON.stringify(instrument),
        Date.now() + 100000,
      );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "success",
            data: {
              "NSE_EQ:INFY": {
                instrument_token: "NSE_EQ|TEST",
                last_price: 1500,
                ohlc: { close: 1450 },
                timestamp: "2026-11-06T10:00:00+05:30",
              },
            },
          }),
        ),
      ),
    );
    const q = await upstoxQuotes(database, ["NSE:INFY"]);
    expect(q[0]).toMatchObject({
      symbol: "INFY",
      exchange: "NSE",
      price: 1500,
      asOf: "2026-11-06T04:30:00.000Z",
    });
  });
  it("streams valid symbols despite a typo, persists quotes and evaluates alerts", async () => {
    vi.useFakeTimers();
    vi.stubEnv("UPSTOX_ACCESS_TOKEN", "test");
    vi.stubEnv("MARKET_PROVIDER", "upstox");
    const database = db();
    database
      .prepare("INSERT INTO watchlist VALUES(?,?,?)")
      .run("INFY", "NSE", new Date().toISOString());
    database
      .prepare("INSERT INTO watchlist VALUES(?,?,?)")
      .run("INVALIDSYMBOL", "NSE", new Date().toISOString());
    database
      .prepare("INSERT INTO alerts VALUES(?,?,?,?,NULL,?)")
      .run("alert-1", "INFY", "above", 1400, new Date().toISOString());
    database.prepare("INSERT INTO cache VALUES(?,?,?)").run(
      "upstox-instrument:NSE:INFY",
      JSON.stringify({
        name: "Infosys",
        instrument_key: "NSE_EQ|TEST",
        trading_symbol: "INFY",
        exchange: "NSE",
        exchange_token: "123",
        segment: "NSE_EQ",
      }),
      Date.now() + 100000,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async (url: string) =>
          new Response(
            JSON.stringify({
              status: "success",
              data: url.includes("/instruments/search")
                ? []
                : { authorized_redirect_uri: "wss://feed.upstox.com/test" },
            }),
          ),
      ),
    );
    const stream = new MarketStream(database);
    streams.push(stream);
    const listener = vi.fn();
    stream.on("quotes", listener);
    stream.start();
    await vi.advanceTimersByTimeAsync(1);
    const socket = sockets.instances[0];
    expect(socket).toBeDefined();
    socket.readyState = 1;
    socket.emit("open");
    expect(JSON.parse(socket.sent[0].toString()).data.instrumentKeys).toEqual([
      "NSE_EQ|TEST",
    ]);
    socket.emit(
      "message",
      Buffer.from(
        encode({
          currentTs: Date.now(),
          feeds: { "NSE_EQ|TEST": { ltpc: { ltp: 1500, cp: 1450 } } },
        }),
      ),
      true,
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(listener).toHaveBeenCalled();
    expect(stream.getStatus().state).toBe("live");
    expect(stream.getStatus().message).toContain("NSE:INVALIDSYMBOL");
    expect(
      JSON.parse(row<any>(database, "SELECT payload FROM quotes")!.payload)
        .price,
    ).toBe(1500);
    expect(
      row<any>(database, "SELECT triggered_at FROM alerts")!.triggered_at,
    ).not.toBeNull();
  });
});
