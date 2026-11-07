import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, row } from "../server/db/index";
import { askAI, buildEvidence, validateAnswer } from "../server/intelligence";
import { storeArticles } from "../server/providers/research";
const databases: ReturnType<typeof openDatabase>[] = [];
function setup() {
  const db = openDatabase(":memory:");
  databases.push(db);
  storeArticles(db, [
    {
      id: "real-source-fixture",
      title: "Infosys reports quarterly results",
      url: "https://example.com/infosys",
      source: "Test publisher",
      kind: "article",
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      summary: "A short test excerpt, not a live article.",
      symbols: ["INFY"],
      sentiment: 0,
    },
  ]);
  db.prepare("INSERT INTO holdings VALUES(?,?,?,?,?,?,?)").run(
    "INFY",
    "NSE",
    98765,
    1400,
    "Technology",
    "csv",
    new Date().toISOString(),
  );
  return db;
}
const answer = {
  summary: "A bounded interpretation.",
  findings: [
    {
      heading: "Results reported",
      kind: "observation",
      assessment: "The source reports results.",
      implication: "Read the filing for detail.",
      evidenceIds: ["S1"],
    },
  ],
  risks: ["One source is insufficient."],
  scenarios: [
    {
      condition: "the filing confirms the figures",
      whatItWouldMean: "The account has stronger primary support.",
      evidenceIds: ["S1"],
    },
  ],
  openQuestions: ["What does the original filing say?"],
};
function response(a: unknown = answer) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(a) }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  );
}
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("evidence-grounded AI boundary", () => {
  it("uses source excerpts and excludes portfolio context by default", () => {
    const db = setup();
    const packet = buildEvidence(db, "INFY");
    expect(packet.coverage.excerptOnly).toBe(true);
    expect(packet.sources).toHaveLength(1);
    expect(JSON.stringify(packet)).not.toContain("98765");
    expect(
      buildEvidence(db, "INFY", true).sources.some((s) => s.id === "P1"),
    ).toBe(true);
  });
  it("rejects invented citations and unsupported observations", () => {
    const sources = buildEvidence(setup()).sources;
    expect(() =>
      validateAnswer(
        {
          ...answer,
          findings: [{ ...answer.findings[0], evidenceIds: ["S999"] }],
        },
        sources,
      ),
    ).toThrow("outside");
    expect(() =>
      validateAnswer(
        { ...answer, findings: [{ ...answer.findings[0], evidenceIds: [] }] },
        sources,
      ),
    ).toThrow("without a source");
  });
  it("never generates a substitute answer when no API credential exists", async () => {
    const db = setup();
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      askAI(db, {
        question: "Explain the evidence",
        symbol: "",
        includePortfolio: false,
      }),
    ).rejects.toThrow("Connect");
    expect(fetch).not.toHaveBeenCalled();
    expect(row<any>(db, "SELECT count(*) n FROM ai_runs")!.n).toBe(0);
  });
  it("saves a sourced discussion, disables provider storage and sends no tools or private holdings by default", async () => {
    const db = setup();
    vi.stubEnv("OPENAI_API_KEY", "test-not-a-real-api-key");
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);
    const result = await askAI(db, {
      question: "Explain the evidence",
      symbol: "INFY",
      includePortfolio: false,
    });
    expect(result.sources[0].url).toBe("https://example.com/infosys");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body).not.toHaveProperty("tools");
    expect(body.instructions).toContain("untrusted");
    expect(body.input).not.toContain("98765");
    expect(row<any>(db, "SELECT count(*) n FROM ai_runs")!.n).toBe(1);
    db.prepare("DELETE FROM ai_threads WHERE id=?").run(result.threadId);
    expect(row<any>(db, "SELECT count(*) n FROM ai_runs")!.n).toBe(0);
  });
  it("does not carry private earlier summaries into a follow-up with portfolio sharing disabled", async () => {
    const db = setup();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetch);
    const first = await askAI(db, {
      question: "Use my holdings",
      symbol: "",
      includePortfolio: true,
    });
    await askAI(db, {
      question: "Use only public evidence now",
      symbol: "",
      includePortfolio: false,
      threadId: first.threadId,
    });
    const input = JSON.parse(JSON.parse(fetch.mock.calls[1][1].body).input);
    expect(input.previousDiscussion).toEqual([]);
    expect(input.evidence.some((s: any) => s.id === "P1")).toBe(false);
  });
  it("does not persist malformed model output and releases its request lock", async () => {
    const db = setup();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(async () =>
          response({
            ...answer,
            findings: [{ ...answer.findings[0], evidenceIds: ["fake"] }],
          }),
        )
        .mockImplementationOnce(async () => response()),
    );
    await expect(
      askAI(db, {
        question: "Explain evidence",
        symbol: "",
        includePortfolio: false,
      }),
    ).rejects.toThrow("outside");
    expect(row<any>(db, "SELECT count(*) n FROM ai_runs")!.n).toBe(0);
    await expect(
      askAI(db, {
        question: "Explain evidence again",
        symbol: "",
        includePortfolio: false,
      }),
    ).resolves.toHaveProperty("answer");
  });
});

it("omits private sizing assumptions from scanner context unless explicitly shared", () => {
  const db = setup();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO scanner_runs VALUES(?,?,?,?,?)").run(
    "scan",
    "INFY",
    "NSE",
    JSON.stringify({
      asOf: now,
      parameters: { capital: 76543, riskBudget: 123 },
      plan: { quantity: 9, risk: 123, reward: 500, entry: 100 },
    }),
    now,
  );
  const publicContext = buildEvidence(db, "INFY", false).sources.find(
    (s) => s.id === "T1",
  )!.content;
  expect(publicContext).not.toContain("76543");
  expect(publicContext).not.toContain("riskBudget");
  expect(publicContext).toContain("entry");
  expect(
    buildEvidence(db, "INFY", true).sources.find((s) => s.id === "T1")!.content,
  ).toContain("76543");
});
