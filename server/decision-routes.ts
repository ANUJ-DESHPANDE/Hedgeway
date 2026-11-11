import type express from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DB } from "./db/index.js";
import { row, rows } from "./db/index.js";
import {
  aiProvider,
  aiStatus,
  askAI,
  buildEvidence,
  saveAI,
} from "./intelligence.js";
import { analyzeSetup, defaultSetup } from "../src/trading.js";
import { chartData } from "./providers/chart.js";
import { intraday } from "./providers/intraday.js";
const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9&_.-]{1,30}$/);
const parameters = z.object({
  barMinutes: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  lookback: z.number().int().min(5).max(120),
  confirmationBars: z.number().int().min(2).max(5),
  minDipPct: z.number().min(0).max(10),
  minReboundPct: z.number().min(0).max(10),
  minVolumeRatio: z.number().min(0).max(10),
  costBps: z.number().min(0).max(200),
  capital: z.number().positive().max(1e9),
  riskBudget: z.number().positive().max(1e7),
});
export function decisionRoutes(app: express.Express, db: DB) {
  app.get("/api/market/chart", async (req, res) => {
    const v = z
      .object({
        symbol,
        exchange: z.enum(["NSE", "BSE"]).default("NSE"),
        interval: z.enum(["1", "3", "5", "1d"]).default("5"),
      })
      .parse(req.query);
    res.json({
      ...(await chartData(db, v.symbol, v.exchange, v.interval)),
      symbol: v.symbol,
      exchange: v.exchange,
      interval: v.interval,
    });
  });
  app.get("/api/ai/status", (_req, res) => res.json(aiStatus(db)));
  app.post("/api/ai/credentials", async (req, res) => {
    const v = z
      .object({
        key: z.string().trim().min(20).max(6000),
        model: z.string().regex(/^(gemini|gpt)-[a-zA-Z0-9.-]{1,80}$/),
        provider: z.enum(["gemini", "openai"]).default("gemini"),
      })
      .parse(req.body);
    await saveAI(db, v.key, v.model, v.provider);
    res.json({ ok: true });
  });
  app.delete("/api/ai/credentials", (_req, res) => {
    db.prepare("DELETE FROM credentials WHERE provider=?").run(aiProvider(db));
    res.json({ ok: true });
  });
  app.get("/api/ai/coverage", (req, res) =>
    res.json(
      buildEvidence(
        db,
        req.query.symbol ? symbol.parse(req.query.symbol) : "",
        false,
      ).coverage,
    ),
  );
  app.post(
    "/api/ai/ask",
    rateLimit({
      windowMs: 3600000,
      limit: Math.max(
        1,
        Math.min(120, Number(process.env.AI_REQUESTS_PER_HOUR) || 120),
      ),
      message: {
        error:
          "The hourly AI limit has been reached. Please try again after the current hour-long window resets.",
      },
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const input = z
        .object({
          question: z.string().trim().min(5).max(4000),
          approach: z.enum(["learn", "research", "challenge"]).default("learn"),
          refreshResearch: z.boolean().default(true),
          symbol: z.union([symbol, z.literal("")]).default(""),
          includePortfolio: z.boolean().default(false),
          threadId: z.string().uuid().optional(),
          scanId: z.string().uuid().optional(),
        })
        .parse(req.body);
      res.json(await askAI(db, input));
    },
  );
  app.get("/api/ai/threads", (_req, res) =>
    res.json(
      rows(db, "SELECT * FROM ai_threads ORDER BY created_at DESC LIMIT 50"),
    ),
  );
  app.get("/api/ai/threads/:id", (req, res) =>
    res.json(
      rows<{ payload: string }>(
        db,
        "SELECT payload FROM ai_runs WHERE thread_id=? ORDER BY created_at DESC LIMIT 100",
        z.string().uuid().parse(req.params.id),
      )
        .reverse()
        .map((r) => JSON.parse(r.payload)),
    ),
  );
  app.delete("/api/ai/threads/:id", (req, res) => {
    db.prepare("DELETE FROM ai_threads WHERE id=?").run(
      z.string().uuid().parse(req.params.id),
    );
    res.json({ ok: true });
  });
  app.get("/api/scanner/history", (_req, res) =>
    res.json(
      rows(
        db,
        "SELECT id,symbol,exchange,created_at AS createdAt,json_extract(payload,'$.state') AS state FROM scanner_runs ORDER BY created_at DESC LIMIT 40",
      ),
    ),
  );
  app.get("/api/scanner/history/:id", (req, res) => {
    const saved = row<{ payload: string }>(
      db,
      "SELECT payload FROM scanner_runs WHERE id=?",
      z.string().uuid().parse(req.params.id),
    );
    if (!saved)
      return res.status(404).json({
        error: "That saved scan is no longer available. Run a new check.",
      });
    res.json(JSON.parse(saved.payload));
  });
  app.post("/api/scanner", async (req, res) => {
    const v = z
      .object({
        symbols: z
          .array(z.object({ symbol, exchange: z.enum(["NSE", "BSE"]) }))
          .min(1)
          .max(8),
        parameters: parameters.default(defaultSetup),
      })
      .parse(req.body);
    const result = [];
    for (const item of v.symbols) {
      try {
        const data = await intraday(
          db,
          item.symbol,
          item.exchange,
          v.parameters.barMinutes,
        );
        const analysis = {
          id: randomUUID(),
          ...item,
          ...analyzeSetup(data.bars, v.parameters),
          source: data.source,
          fetchedAt: data.fetchedAt,
          createdAt: new Date().toISOString(),
        };
        if (data.source.startsWith("Yahoo") && analysis.metrics) {
          analysis.state = "stale";
          analysis.summary =
            "Research snapshot only — Yahoo is not a live broker feed. These conditions are not a current entry signal.";
          analysis.checks = analysis.checks.map((c) =>
            c.label === "Complete, recent bars"
              ? {
                  ...c,
                  passed: false,
                  detail:
                    "Yahoo research snapshots have no guaranteed delivery latency.",
                }
              : c,
          );
        }
        db.prepare("INSERT INTO scanner_runs VALUES(?,?,?,?,?)").run(
          analysis.id,
          item.symbol,
          item.exchange,
          JSON.stringify(analysis),
          analysis.createdAt,
        );
        result.push(analysis);
      } catch (error) {
        result.push({
          ...item,
          error:
            error instanceof Error
              ? error.message
              : "Could not load intraday candles.",
        });
      }
    }
    db.prepare(
      "DELETE FROM scanner_runs WHERE id NOT IN (SELECT id FROM scanner_runs ORDER BY created_at DESC LIMIT 1000)",
    ).run();
    res.json(result);
  });
}
