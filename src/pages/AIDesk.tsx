import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, number, post, remove, timestamp } from "../api";
import type { AIRun, ScanReference } from "../intelligence-types";
import type { Page } from "../navigation";
import { Empty, Panel } from "../ui";
export default function AIDesk({
  seed,
  go,
  show,
}: {
  seed: { question: string; symbol: string; scan?: ScanReference } | null;
  go: (page: Page) => void;
  show: (message: string, error?: boolean) => void;
}) {
  const [status, setStatus] = useState<{
      configured: boolean;
      model: string;
      provider?: string;
    } | null>(null),
    [key, setKey] = useState(""),
    [model, setModel] = useState("gemini-3.8-flash"),
    [question, setQuestion] = useState(seed?.question || ""),
    [symbol, setSymbol] = useState(seed?.symbol || ""),
    [scan, setScan] = useState<ScanReference | null>(seed?.scan || null),
    [includePortfolio, setIncludePortfolio] = useState(false),
    [approach, setApproach] = useState<"learn" | "research" | "challenge">(
      "learn",
    ),
    [refreshResearch, setRefreshResearch] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [threadId, setThreadId] = useState(""),
    [threads, setThreads] = useState<{ id: string; title: string }[]>([]),
    [runs, setRuns] = useState<AIRun[]>([]),
    [coverage, setCoverage] = useState<AIRun["coverage"] | null>(null);
  const refresh = () =>
    Promise.all([api("/ai/status"), api("/ai/threads")]).then(([s, t]) => {
      setStatus(s);
      setModel(s.model);
      setThreads(t);
    });
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    api(`/ai/coverage${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`)
      .then((v) => {
        if (active) setCoverage(v);
      })
      .catch(() => {
        if (active) setCoverage(null);
      });
    return () => {
      active = false;
    };
  }, [symbol, runs.length]);
  async function ask() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<AIRun>("/ai/ask", {
        question,
        symbol,
        includePortfolio,
        approach,
        refreshResearch,
        ...(scan ? { scanId: scan.id } : {}),
        ...(threadId ? { threadId } : {}),
      });
      setRuns((r) => [...r, result]);
      setThreadId(result.threadId);
      setQuestion("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Panel
        title="Your thinking partner for the market"
        sub="Learn the concepts. Talk through the evidence. Build your own judgment."
      >
        <div className="integration-body">
          <div className="button-row">
            <span className="tag">
              {coverage
                ? `${coverage.items} recent items · ${coverage.publishers} sources`
                : "Checking source coverage…"}
            </span>
            <button className="text-button" onClick={() => go("Research")}>
              Review source feed <ArrowUpRight size={14} />
            </button>
          </div>
          <p>
            Answers use stored news and forum excerpts from the last seven days,
            last-received prices and any saved setup scan for the selected
            symbol. Full articles are not automatically included.
          </p>
          <details
            className="disclosure compact"
            open={status ? !status.configured : undefined}
          >
            <summary>
              {status?.configured
                ? `AI connection · ${status.model}`
                : "Connect an AI model"}
            </summary>
            <p>
              Google Gemini can explain the research already in your workspace.
              Use a free-tier Google AI Studio project with billing disabled.
              Keys stay encrypted on this server. Free quotas apply; we never
              switch to a paid model when a quota runs out. Google may use
              free-tier submissions to improve its products.
            </p>
            <form
              className="token-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await post("/ai/credentials", {
                    key,
                    model,
                    provider: "gemini",
                  });
                  setKey("");
                  await refresh();
                  show("AI connection saved.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Google AI Studio key
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  minLength={20}
                  required
                  placeholder="Paste your API key"
                />
              </label>
              <label>
                Model
                <select
                  value={
                    model.startsWith("gemini-") ? model : "gemini-3.8-flash"
                  }
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="gemini-3.8-flash">
                    Gemini 3.8 Flash · research & reasoning
                  </option>
                  <option value="gemini-3.5-flash-lite">
                    Gemini 3.5 Flash-Lite · faster summaries
                  </option>
                </select>
              </label>
              <div className="button-row">
                <button disabled={busy || !key}>Check & save connection</button>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get an API key <ArrowUpRight size={14} />
                </a>
                {status?.configured && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await remove("/ai/credentials");
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove saved key
                  </button>
                )}
              </div>
            </form>
          </details>
        </div>
      </Panel>
      <div className="toolbar">
        <div className="button-row">
          <button
            disabled={busy}
            onClick={() => {
              setThreadId("");
              setRuns([]);
              setQuestion("");
              setScan(null);
              setError("");
            }}
          >
            <Plus size={15} />
            New discussion
          </button>
          {threads.length > 0 && (
            <select
              aria-label="Saved discussions"
              value={threadId}
              disabled={busy}
              onChange={async (e) => {
                const id = e.target.value;
                setBusy(true);
                setError("");
                try {
                  const saved = id
                    ? await api<AIRun[]>(`/ai/threads/${id}`)
                    : [];
                  setRuns(saved);
                  setThreadId(id);
                  setScan(saved.at(-1)?.scan || null);
                  setSymbol(
                    saved.at(-1)?.symbol || saved.at(-1)?.scan?.symbol || "",
                  );
                  setApproach(saved.at(-1)?.approach || "learn");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="">Choose a saved discussion</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
        {threadId && (
          <button
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Delete this saved discussion?")) return;
              setBusy(true);
              setError("");
              try {
                await remove(`/ai/threads/${threadId}`);
                setThreadId("");
                setRuns([]);
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={14} />
            Delete discussion
          </button>
        )}
      </div>
      {!runs.length && (
        <div className="prompt-grid">
          {[
            "What are the strongest themes in the latest news, and what contradicts them?",
            "Which catalysts deserve attention, and what evidence is still missing?",
            "Help me challenge a dip-and-rebound thesis before I act.",
            "Teach me why a price below its recent average is not automatically a bargain.",
            "Explain VWAP, volume confirmation and invalidation in simple terms.",
            "Walk me through how fees and a stop-loss change a short-term trade.",
          ].map((text) => (
            <button key={text} onClick={() => setQuestion(text)}>
              <Sparkles size={16} />
              <span>{text}</span>
            </button>
          ))}
        </div>
      )}
      {runs.map((run, index) =>
        index === runs.length - 1 ? (
          <Report key={run.id} run={run} followUp={setQuestion} />
        ) : (
          <details className="disclosure" key={run.id}>
            <summary>{run.question}</summary>
            <Report run={run} followUp={setQuestion} />
          </details>
        ),
      )}
      <Panel
        title={runs.length ? "Ask a follow-up" : "Ask your research question"}
      >
        <form
          className="ai-question"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <div
            className="conversation-modes"
            aria-label="Conversation approach"
          >
            {(
              [
                ["learn", "Teach me", "Plain English, examples and the why"],
                [
                  "research",
                  "Read the evidence",
                  "Sources, catalysts and uncertainty",
                ],
                [
                  "challenge",
                  "Challenge my thinking",
                  "Assumptions, downside and alternatives",
                ],
              ] as const
            ).map(([value, title, detail]) => (
              <button
                type="button"
                key={value}
                aria-pressed={approach === value}
                className={approach === value ? "active" : ""}
                onClick={() => setApproach(value)}
              >
                <strong>{title}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          <label>
            What would you like to understand?
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              minLength={5}
              maxLength={4000}
              required
              placeholder="For example: What supports a rebound in INFY, and what would weaken that view?"
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={refreshResearch}
              onChange={(e) => setRefreshResearch(e.target.checked)}
            />
            Refresh source feeds before answering · cached for five minutes
          </label>
          <div className="button-row">
            <label>
              Focus symbol · optional
              <input
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setScan(null);
                }}
                placeholder="All research"
                maxLength={30}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includePortfolio}
                onChange={(e) => setIncludePortfolio(e.target.checked)}
              />
              Include my holdings and position-size assumptions in the context
              sent to {status?.provider === "openai" ? "OpenAI" : "Google"}
            </label>
          </div>
          {scan && (
            <p className="notice">
              Pinned scan: {scan.exchange}:{scan.symbol} ·{" "}
              {timestamp(scan.asOf)}. This discussion uses that saved result
              even if a newer scan exists.{" "}
              <button type="button" onClick={() => setScan(null)}>
                Use latest available scan
              </button>
            </p>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="primary"
              disabled={
                busy || !status?.configured || question.trim().length < 5
              }
            >
              <Send size={15} />
              {busy ? "Reading evidence…" : "Analyze evidence"}
            </button>
            <span className="subtle">
              Learning selects up to 12 recent excerpts; challenge mode 24 and
              research 50. Follow-ups use up to 12 prior turns within a compact
              context budget. Full discussions stay saved here.
            </span>
          </div>
        </form>
      </Panel>
    </>
  );
}
function Report({
  run,
  followUp,
}: {
  run: AIRun;
  followUp: (question: string) => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const cite = (ids: string[]) =>
    ids.map((id) => (
      <button
        className="citation"
        key={id}
        onClick={() => {
          setSourcesOpen(true);
          requestAnimationFrame(() =>
            document
              .getElementById(`source-${run.id}-${id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          );
        }}
      >
        {id}
      </button>
    ));
  return (
    <Panel
      title={run.question}
      sub={`${run.model} · ${timestamp(run.createdAt)}`}
      action={
        <button
          onClick={() => {
            const content =
              `# ${run.question}\n\n${run.answer.summary}\n\n` +
              run.answer.findings
                .map(
                  (f) =>
                    `## ${f.heading}\n${f.assessment}\n\n${f.implication}\n`,
                )
                .join("\n") +
              "\n## Risks\n" +
              run.answer.risks.map((r) => "- " + r).join("\n") +
              "\n\n## Sources\n" +
              run.sources
                .map(
                  (s) =>
                    `${s.id}: ${s.title} — ${s.source} (${s.asOf}) ${s.url || ""}`,
                )
                .join("\n");
            const url = URL.createObjectURL(
              new Blob([content], { type: "text/markdown" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `hedgeway-learning-${run.id}.md`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Save learning note
        </button>
      }
    >
      <div className="ai-report">
        <p className="ai-summary">{run.answer.summary}</p>
        {!!run.coverage.failedSources?.length && (
          <p className="notice">
            Coverage gap: {run.coverage.failedSources.join(", ")} failed their
            last refresh. This answer cannot represent those missing updates.
          </p>
        )}
        {run.usage && (
          <p className="subtle">
            This turn: {number(run.usage.inputTokens, 0)} input tokens ·{" "}
            {number(run.usage.outputTokens, 0)} output tokens (including
            reported thinking). Quotas are set by the model provider.
          </p>
        )}
        <div className="evidence-findings">
          {run.answer.findings.map((f, i) => (
            <section key={i}>
              <span className={`tag ${f.kind === "hypothesis" ? "amber" : ""}`}>
                {f.kind === "observation"
                  ? "Sourced observation"
                  : f.kind === "explanation"
                    ? "Learning note"
                    : "Possible explanation"}
              </span>
              <h3>{f.heading}</h3>
              <p>{f.assessment}</p>
              <p className="subtle">{f.implication}</p>
              <div>{cite(f.evidenceIds)}</div>
            </section>
          ))}
        </div>
        <div className="two-columns">
          <section>
            <h3>What could weaken this view?</h3>
            <ul className="readable-list">
              {run.answer.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>What to watch next</h3>
            {run.answer.scenarios.map((s, i) => (
              <div className="scenario" key={i}>
                <strong>If {s.condition}</strong>
                <p>{s.whatItWouldMean}</p>
                {cite(s.evidenceIds)}
              </div>
            ))}
          </section>
        </div>
        <details className="disclosure">
          <summary>Questions worth investigating</summary>
          <ul className="readable-list">
            {run.answer.openQuestions.map((q, i) => (
              <li key={i}>
                <button
                  className="text-button"
                  onClick={() => {
                    followUp(q);
                    document
                      .querySelector(".ai-question")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {q} <ArrowUpRight size={13} />
                </button>
              </li>
            ))}
          </ul>
        </details>
        <details
          className="disclosure"
          open={sourcesOpen}
          onToggle={(e) => setSourcesOpen(e.currentTarget.open)}
        >
          <summary>Evidence & coverage · {run.sources.length} items</summary>
          <p className="subtle">
            {run.coverage.items} news/forum excerpts from{" "}
            {run.coverage.publishers} sources. Source publication range:{" "}
            {timestamp(run.coverage.oldest)} – {timestamp(run.coverage.newest)}.
            These are excerpts, not full-article reads.
          </p>
          <ul className="evidence-list">
            {run.sources.map((source) => (
              <li id={`source-${run.id}-${source.id}`} key={source.id}>
                <span className="tag">{source.id}</span>
                <div>
                  <strong>{source.title}</strong>
                  <small>
                    {source.source} · {source.sourceCategory || source.kind} ·{" "}
                    {timestamp(source.asOf)}
                  </small>
                  <p>{source.content}</p>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open original source <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {run.usage && (
            <p className="subtle">
              API usage: {number(run.usage.inputTokens, 0)} input /{" "}
              {number(run.usage.outputTokens, 0)} output tokens.
            </p>
          )}
        </details>
        <p className="disclaimer">
          AI interpretation can be wrong. Source links support review; they do
          not prove that the model’s reasoning is correct.
        </p>
      </div>
    </Panel>
  );
}
