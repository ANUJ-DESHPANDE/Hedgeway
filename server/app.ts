import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import type { Holding, Quote } from "../src/types.js";
import { backtest, portfolio, stress } from "./analytics.js";
import type { DB } from "./db/index.js";
import { audit, row, rows, transaction } from "./db/index.js";
import { instruments } from "./instruments.js";
import { parseCandles, parseHoldings, saveHoldings } from "./imports.js";
import {
  getIPOs,
  ipoDetail,
  ipoScoreboard,
  refreshIPOs,
} from "./providers/ipo.js";
import {
  exchangeToken,
  kiteConfigured,
  kiteCredentials,
  saveKiteCredentials,
  kiteConnected,
  syncHoldings,
} from "./providers/kite.js";
import { history, refreshQuotes, marketProvider } from "./providers/market.js";
import {
  feeds,
  getArticles,
  ingestNews,
  ingestReddit,
  runJob,
} from "./providers/research.js";
import { hash, passwordMatches, randomToken } from "./security.js";
import type { MarketStream } from "./providers/stream.js";
import { upstoxConfigured, saveUpstoxToken } from "./providers/upstox.js";
import { searchInstruments } from "./providers/instrument-search.js";
const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9&_.-]{1,30}$/);
const exchange = z.enum(["NSE", "BSE"]);
export function createApp(
  db: DB,
  options: {
    password?: string;
    origin?: string;
    secure?: boolean;
    local?: boolean;
    stream?: MarketStream;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const password = options.password ?? process.env.APP_PASSWORD ?? "";
  const origin =
    options.origin ?? process.env.APP_ORIGIN ?? "http://localhost:4100";
  const secure = options.secure ?? process.env.COOKIE_SECURE === "true";
  const local = options.local ?? !password;
  if (!local && password.length < 20)
    throw new Error(
      "APP_PASSWORD must contain at least 20 characters for remote access.",
    );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: secure ? [] : null,
        },
      },
      strictTransportSecurity: secure ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Request-Id", randomUUID());
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", version: "2.0.0" });
  });
  app.use("/api", (req, res, next) => {
    if (local && !["localhost", "127.0.0.1", "[::1]"].includes(req.hostname)) {
      res.status(403).json({
        error:
          "Local mode only accepts localhost. Configure authentication for remote deployment.",
      });
      return;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const supplied = req.get("origin");
      const allowed = new Set([
        origin,
        ...(local
          ? [
              "http://localhost:5173",
              "http://127.0.0.1:5173",
              "http://127.0.0.1:4100",
            ]
          : []),
      ]);
      if (!supplied || !allowed.has(supplied)) {
        res.status(403).json({ error: "Request origin is not allowed." });
        return;
      }
    }
    next();
  });
  const cookie = (req: express.Request) => {
    const match = req.headers.cookie?.match(
      /(?:^|;\s*)hedgeway_session=([a-f0-9]{64})(?:;|$)/,
    );
    return match?.[1] || "";
  };
  const authenticated = (req: express.Request) =>
    local ||
    !!row(
      db,
      "SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?",
      hash(cookie(req)),
      Date.now(),
    );
  app.get("/api/session", (req, res) =>
    res.json({ authenticated: authenticated(req), local }),
  );
  app.post(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 8,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    (req, res) => {
      const input = z.object({ password: z.string().max(200) }).parse(req.body);
      if (!password || !passwordMatches(input.password, password)) {
        res.status(401).json({ error: "Incorrect workspace password." });
        return;
      }
      const token = randomToken();
      db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?)").run(
        hash(token),
        Date.now() + 12 * 3600000,
      );
      res
        .cookie("hedgeway_session", token, {
          httpOnly: true,
          secure,
          sameSite: "lax",
          maxAge: 12 * 3600000,
          path: "/",
        })
        .json({ ok: true });
    },
  );
  app.use("/api", (req, res, next) => {
    if (!authenticated(req)) {
      res.status(401).json({ error: "Sign in to your workspace." });
      return;
    }
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
      hash(cookie(req)),
    );
    res.clearCookie("hedgeway_session", { path: "/" }).json({ ok: true });
  });

  const holdings = () =>
    rows<any>(db, "SELECT * FROM holdings").map((h) => ({
      symbol: h.symbol,
      exchange: h.exchange,
      quantity: h.quantity,
      averagePrice: h.average_price,
      sector: h.sector,
      source: h.source,
    })) as Holding[];
  const quotes = () =>
    rows<{
      payload: string;
    }>(db, "SELECT payload FROM quotes").map((q) =>
      JSON.parse(q.payload),
    ) as Quote[];
  app.get("/api/stream", (req, res) => {
    const stream = options.stream;
    if (!stream) {
      res.status(503).json({ error: "Streaming worker is unavailable." });
      return;
    }
    if (stream.listenerCount("quotes") >= 20) {
      res.status(429).json({ error: "Too many streaming tabs." });
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = (event: string, value: unknown) => {
      if (!authenticated(req)) {
        res.end();
        return;
      }
      if (res.writableLength > 1_000_000) {
        res.end();
        return;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    const quoteHandler = (q: Quote[]) => send("quotes", q),
      statusHandler = (s: unknown) => send("status", s),
      shutdown = () => res.end();
    stream.on("quotes", quoteHandler);
    stream.on("status", statusHandler);
    stream.on("shutdown", shutdown);
    statusHandler(stream.getStatus());
    const timer = setInterval(() => statusHandler(stream.getStatus()), 10000);
    res.on("close", () => {
      clearInterval(timer);
      stream.off("quotes", quoteHandler);
      stream.off("status", statusHandler);
      stream.off("shutdown", shutdown);
    });
  });
  app.post("/api/upstox/token", async (req, res) => {
    const { token } = z
      .object({ token: z.string().trim().min(20).max(6000) })
      .parse(req.body);
    await saveUpstoxToken(db, token);
    audit(db, "upstox.connect", "Validated token encrypted");
    await options.stream?.restart();
    res.json({ ok: true });
  });
  app.delete("/api/upstox", async (_req, res) => {
    db.prepare("DELETE FROM credentials WHERE provider='upstox'").run();
    await options.stream?.restart();
    res.json({ ok: true });
  });
  app.post("/api/market/provider", async (req, res) => {
    const { provider } = z
      .object({ provider: z.enum(["kite", "upstox"]) })
      .parse(req.body);
    db.prepare("INSERT OR REPLACE INTO cache VALUES(?,?,?)").run(
      "config:market-provider",
      JSON.stringify(provider),
      8640000000000000,
    );
    await options.stream?.restart();
    res.json({ ok: true });
  });
  app.get("/api/dashboard", (req, res) => {
    const q = quotes();
    const h = holdings();
    res.json({
      portfolio: portfolio(h, q),
      quotes: q,
      articles: getArticles(db).slice(0, 5),
      ipos: getIPOs(db).slice(0, 5),
      mode: "workspace",
    });
  });
  app.get("/api/instruments", (_req, res) =>
    res.json(
      instruments.map(([symbol, name, sector]) => ({
        symbol,
        name,
        sector,
        exchange: "NSE",
      })),
    ),
  );
  app.get("/api/instruments/search", async (req, res) => {
    const query = z.string().trim().min(2).max(80).parse(req.query.q);
    res.json(
      await searchInstruments(
        db,
        query,
        exchange.parse(req.query.exchange || "NSE"),
      ),
    );
  });
  app.get("/api/watchlist", (_req, res) =>
    res.json(rows(db, "SELECT * FROM watchlist ORDER BY created_at DESC")),
  );
  app.post("/api/watchlist", (req, res) => {
    const v = z
      .object({ symbol, exchange: exchange.default("NSE") })
      .parse(req.body);
    if (rows(db, "SELECT symbol FROM watchlist").length >= 100) {
      res.status(400).json({ error: "Watchlist limit is 100 instruments." });
      return;
    }
    db.prepare("INSERT OR IGNORE INTO watchlist VALUES(?,?,?)").run(
      v.symbol,
      v.exchange,
      new Date().toISOString(),
    );
    res.json({ ok: true });
  });
  app.delete("/api/watchlist/:exchange/:symbol", (req, res) => {
    db.prepare("DELETE FROM watchlist WHERE exchange=? AND symbol=?").run(
      exchange.parse(req.params.exchange),
      symbol.parse(req.params.symbol),
    );
    res.json({ ok: true });
  });
  app.post("/api/holdings/preview", (req, res) => {
    const { csv } = z
      .object({ csv: z.string().min(1).max(900000) })
      .parse(req.body);
    const parsed = parseHoldings(csv);
    const existing = new Set(
      holdings().map((h) => `${h.exchange}:${h.symbol}`),
    );
    const updated = parsed.filter((h) =>
      existing.has(`${h.exchange}:${h.symbol}`),
    ).length;
    res.json({ holdings: parsed, updated, added: parsed.length - updated });
  });
  app.post("/api/holdings/import", (req, res) => {
    const { csv } = z
      .object({ csv: z.string().min(1).max(900000) })
      .parse(req.body);
    const h = parseHoldings(csv);
    saveHoldings(db, h);
    res.json({ count: h.length });
  });
  app.delete("/api/holdings/:exchange/:symbol", (req, res) => {
    transaction(db, () => {
      db.prepare("DELETE FROM holdings WHERE exchange=? AND symbol=?").run(
        exchange.parse(req.params.exchange),
        symbol.parse(req.params.symbol),
      );
      audit(
        db,
        "holdings.delete",
        `${req.params.exchange}:${req.params.symbol}`,
      );
    });
    res.json({ ok: true });
  });
  app.get("/api/export", (req, res) => {
    const h = holdings();
    const cell = (v: unknown) => {
      const text = String(v);
      return `"${(/^[=+@\t\r-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
    };
    res
      .type("text/csv")
      .attachment("hedgeway-holdings.csv")
      .send(
        [
          "symbol,exchange,quantity,averagePrice,sector",
          ...h.map((p) =>
            [p.symbol, p.exchange, p.quantity, p.averagePrice, p.sector]
              .map(cell)
              .join(","),
          ),
        ].join("\r\n"),
      );
  });
  app.post("/api/quotes/refresh", async (_req, res) => {
    const ids = [
      ...new Set([
        ...holdings().map((h) => `${h.exchange}:${h.symbol}`),
        ...rows<{
          symbol: string;
          exchange: string;
        }>(db, "SELECT * FROM watchlist").map(
          (w) => `${w.exchange}:${w.symbol}`,
        ),
      ]),
    ];
    if (!ids.length)
      throw new Error("Add a watchlist instrument or import holdings first.");
    const result = await runJob(db, "Market quotes", async () => {
      const q = await refreshQuotes(db, ids.slice(0, 30));
      for (const quote of q) {
        if (quote.exchange !== "NSE") continue;
        db.prepare(
          "UPDATE alerts SET triggered_at=? WHERE symbol=? AND triggered_at IS NULL AND ((direction='above' AND target<=?) OR (direction='below' AND target>=?))",
        ).run(new Date().toISOString(), quote.symbol, quote.price, quote.price);
      }
      return q.length;
    });
    res.json(result);
  });
  app.get("/api/research", (req, res) => {
    const query = String(req.query.q || "").slice(0, 200),
      kind = String(req.query.kind || "");
    res.json(getArticles(db, query, kind, req.query.saved === "true"));
  });
  app.post("/api/research/refresh", async (_req, res) =>
    res.json(await ingestNews(db)),
  );
  app.post("/api/research/reddit", async (_req, res) =>
    res.json(await ingestReddit(db)),
  );
  app.post("/api/bookmarks/:id", (req, res) => {
    const id = z.string().max(100).parse(req.params.id);
    if (!row(db, "SELECT 1 FROM articles WHERE id=?", id)) {
      res.status(404).json({ error: "Article not found." });
      return;
    }
    db.prepare("INSERT OR IGNORE INTO bookmarks VALUES(?,?)").run(
      id,
      new Date().toISOString(),
    );
    res.json({ ok: true });
  });
  app.delete("/api/bookmarks/:id", (req, res) => {
    db.prepare("DELETE FROM bookmarks WHERE article_id=?").run(
      String(req.params.id),
    );
    res.json({ ok: true });
  });
  app.get("/api/ipos", (req, res) => res.json(getIPOs(db)));
  app.post("/api/ipos/refresh", async (_req, res) =>
    res.json(await runJob(db, "Xflot IPOs", () => refreshIPOs(db))),
  );
  app.get("/api/ipos/scoreboard", async (_req, res) =>
    res.json(await ipoScoreboard(db)),
  );
  app.get("/api/ipos/:slug", async (req, res) => {
    const slug = z
      .string()
      .regex(/^[a-z0-9-]{1,120}$/)
      .parse(req.params.slug);
    res.json(await ipoDetail(db, slug));
  });
  app.get("/api/ipos/:slug/snapshots", (req, res) =>
    res.json(
      rows<{
        payload: string;
      }>(
        db,
        "SELECT payload FROM ipo_snapshots WHERE slug=? ORDER BY observed_at DESC LIMIT 90",
        String(req.params.slug),
      ).map((x) => JSON.parse(x.payload)),
    ),
  );
  app.post("/api/lab", async (req, res) => {
    const v = z
      .object({
        symbol: symbol.default("NIFTYBEES"),
        lookback: z.number().int().min(5).max(200),
        costBps: z.number().min(0).max(200),
        csv: z.string().max(900000).optional(),
      })
      .parse(req.body);
    const data = v.csv
      ? {
          candles: parseCandles(v.csv),
          source: "User-imported daily prices",
          asOf: new Date().toISOString(),
        }
      : await history(db, v.symbol);
    res.json({
      ...backtest(data.candles, v.lookback, v.costBps),
      source: data.source,
      asOf: data.asOf,
      observations: data.candles.length,
      parameters: {
        symbol: v.symbol,
        lookback: v.lookback,
        costBps: v.costBps,
        riskFreeRate: 0.06,
      },
      inputHash: hash(JSON.stringify(data.candles)),
      inputPrices: data.candles,
    });
  });
  app.post("/api/stress", (req, res) => {
    const v = z
      .object({
        shocks: z.record(z.string().max(60), z.number().min(-100).max(100)),
      })
      .parse(req.body);
    res.json(stress(portfolio(holdings(), quotes()), v.shocks));
  });
  app.get("/api/notes", (_req, res) =>
    res.json(rows(db, "SELECT * FROM notes ORDER BY updated_at DESC")),
  );
  app.post("/api/notes", (req, res) => {
    const v = z
      .object({
        symbol,
        thesis: z.string().trim().min(1).max(3000),
        risk: z.string().max(2000),
        catalyst: z.string().max(2000),
      })
      .parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO notes VALUES(?,?,?,?,?,?)").run(
      id,
      v.symbol,
      v.thesis,
      v.risk,
      v.catalyst,
      new Date().toISOString(),
    );
    res.json({ id });
  });
  app.delete("/api/notes/:id", (req, res) => {
    db.prepare("DELETE FROM notes WHERE id=?").run(String(req.params.id));
    res.json({ ok: true });
  });
  app.get("/api/alerts", (_req, res) =>
    res.json(rows(db, "SELECT * FROM alerts ORDER BY created_at DESC")),
  );
  app.post("/api/alerts", (req, res) => {
    const v = z
      .object({
        symbol,
        direction: z.enum(["above", "below"]),
        target: z.number().finite().positive(),
      })
      .parse(req.body);
    const id = randomUUID();
    db.prepare("INSERT INTO alerts VALUES(?,?,?,?,NULL,?)").run(
      id,
      v.symbol,
      v.direction,
      v.target,
      new Date().toISOString(),
    );
    res.json({ id });
  });
  app.delete("/api/alerts/:id", (req, res) => {
    db.prepare("DELETE FROM alerts WHERE id=?").run(String(req.params.id));
    res.json({ ok: true });
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      kite: { configured: kiteConfigured(db), connected: kiteConnected(db) },
      upstox: upstoxConfigured(db),
      marketProvider: marketProvider(db),
      stream: options.stream?.getStatus() || null,
      reddit: Boolean(
        process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
      ),
      scheduler: process.env.ENABLE_SCHEDULER === "true",
      feeds,
      jobs: rows(db, "SELECT * FROM jobs ORDER BY started_at DESC LIMIT 30"),
      database: {
        holdings: row<any>(db, "SELECT count(*) n FROM holdings")!.n,
        articles: row<any>(db, "SELECT count(*) n FROM articles")!.n,
        ipoSnapshots: row<any>(db, "SELECT count(*) n FROM ipo_snapshots")!.n,
      },
      auth: local ? "Local loopback" : "Password-protected",
      callback: `${origin}/api/kite/callback`,
    }),
  );
  app.post("/api/kite/credentials", async (req, res) => {
    const value = z
      .object({
        apiKey: z
          .string()
          .trim()
          .regex(/^[a-zA-Z0-9_-]{8,128}$/),
        apiSecret: z.string().trim().min(8).max(512),
      })
      .parse(req.body);
    saveKiteCredentials(db, value.apiKey, value.apiSecret);
    await options.stream?.restart();
    res.json({ ok: true });
  });
  app.delete("/api/kite/credentials", async (_req, res) => {
    transaction(db, () => {
      db.prepare("DELETE FROM credentials WHERE provider='kite-app'").run();
      db.prepare("DELETE FROM broker_session").run();
      db.prepare("DELETE FROM oauth_states").run();
    });
    await options.stream?.restart();
    res.json({ ok: true });
  });
  app.post("/api/kite/connect", (req, res) => {
    if (!kiteConfigured(db))
      throw new Error("Save your Kite app credentials in Integrations first.");
    const state = randomToken();
    db.prepare("DELETE FROM oauth_states WHERE expires_at<?").run(Date.now());
    db.prepare("INSERT INTO oauth_states VALUES(?,?,?)").run(
      hash(state),
      local ? "local" : hash(cookie(req)),
      Date.now() + 10 * 60000,
    );
    const params = new URLSearchParams({
      v: "3",
      api_key: kiteCredentials(db).apiKey,
      redirect_params: `state=${state}`,
    });
    res.json({ url: `https://kite.zerodha.com/connect/login?${params}` });
  });
  app.get("/api/kite/callback", async (req, res) => {
    const state = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(req.query.state);
    const record = row<{
      session_hash: string;
    }>(
      db,
      "SELECT session_hash FROM oauth_states WHERE state_hash=? AND expires_at>?",
      hash(state),
      Date.now(),
    );
    if (
      !record ||
      record.session_hash !== (local ? "local" : hash(cookie(req)))
    ) {
      res
        .status(403)
        .send(
          "Kite connection state expired or does not match this browser. Try again.",
        );
      return;
    }
    db.prepare("DELETE FROM oauth_states WHERE state_hash=?").run(hash(state));
    await exchangeToken(
      db,
      z.string().min(1).max(200).parse(req.query.request_token),
    );
    res.redirect("/?kite=connected");
  });
  app.post("/api/kite/sync", async (_req, res) =>
    res.json(await runJob(db, "Kite holdings", () => syncHoldings(db))),
  );
  app.delete("/api/kite", (_req, res) => {
    db.prepare("DELETE FROM broker_session").run();
    audit(db, "kite.disconnect", "Local token removed");
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
            .slice(0, 500),
        });
        return;
      }
      const e = err as Error & {
        status?: number;
      };
      res.status(e.status === 413 ? 413 : 400).json({
        error:
          e.status === 413
            ? "Upload too large. Maximum request size is 1 MB."
            : e.message?.startsWith("SQLITE")
              ? "Database operation failed."
              : e.message || "Request failed.",
      });
    },
  );
  return app;
}
