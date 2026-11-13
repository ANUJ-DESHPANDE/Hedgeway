import { useEffect, useRef, useState } from "react";
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
import { Panel } from "../ui";
import "../chat.css";
export default function AIDesk({
  requestedThread,
  seed,
  go,
  show,
  compact = false,
}: {
  requestedThread?: string;
  compact?: boolean;
  seed: {
    question: string;
    symbol: string;
    scan?: ScanReference;
    chartSnapshotId?: string;
    articleId?: string;
  } | null;
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
    [refreshResearch, setRefreshResearch] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pendingQuestion, setPendingQuestion] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [settingsOpen, setSettingsOpen] = useState(false),
    [askFailed, setAskFailed] = useState(false),
    [threadId, setThreadId] = useState(""),
    [threads, setThreads] = useState<{ id: string; title: string }[]>([]),
    [runs, setRuns] = useState<AIRun[]>([]),
    [coverage, setCoverage] = useState<AIRun["coverage"] | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(
    Boolean(seed || requestedThread),
  );
  const [articleId, setArticleId] = useState(seed?.articleId);
  const [chartSnapshotId, setChartSnapshotId] = useState(seed?.chartSnapshotId);
  const previousSeed = useRef(seed);
  const conversationGeneration = useRef(0);
  useEffect(() => {
    if (!seed) return;
    const previous = previousSeed.current;
    if (
      previous?.symbol === seed.symbol &&
      previous?.question === seed.question &&
      previous?.scan?.id === seed.scan?.id &&
      previous?.chartSnapshotId === seed.chartSnapshotId &&
      previous?.articleId === seed.articleId
    )
      return;
    previousSeed.current = seed;
    conversationGeneration.current++;
    // A new instrument starts its own conversation rather than mixing theses.
    setQuestion(seed.question);
    setSymbol(seed.symbol);
    setScan(seed.scan || null);
    setChartSnapshotId(seed.chartSnapshotId);
    setArticleId(seed.articleId);
    setThreadId("");
    setRuns([]);
    setError("");
  }, [seed]);
  useEffect(() => {
    if (!requestedThread) return;
    previousSeed.current = null;
    const generation = ++conversationGeneration.current;
    setBusy(true);
    api<AIRun[]>(`/ai/threads/${requestedThread}`)
      .then((saved) => {
        if (generation !== conversationGeneration.current) return;
        setRuns(saved);
        setThreadId(requestedThread);
        setQuestion("");
        setScan(saved.at(-1)?.scan || null);
        setChartSnapshotId(saved.at(-1)?.chartSnapshotId);
        setArticleId(saved.at(-1)?.articleId);
        setSymbol(saved.at(-1)?.symbol || "");
        setApproach(saved.at(-1)?.approach || "learn");
      })
      .catch((e) => {
        if (generation === conversationGeneration.current) setError(e.message);
      })
      .finally(() => setBusy(false));
  }, [requestedThread]);
  useEffect(() => {
    if (seed || requestedThread) {
      setDraftLoaded(true);
      return;
    }
    let active = true;
    const generation = conversationGeneration.current;
    api<{
      question: string;
      symbol: string;
      threadId: string;
      approach: "learn" | "research" | "challenge";
      scan: ScanReference | null;
      chartSnapshotId?: string;
      articleId?: string;
    } | null>("/ai/draft")
      .then(async (draft) => {
        if (!active || !draft || generation !== conversationGeneration.current)
          return;
        const saved = draft.threadId
          ? await api<AIRun[]>(`/ai/threads/${draft.threadId}`).catch(() => [])
          : [];
        if (!active || generation !== conversationGeneration.current) return;
        setQuestion(draft.question);
        setSymbol(draft.symbol);
        setApproach(draft.approach);
        setScan(draft.scan);
        setChartSnapshotId(draft.chartSnapshotId);
        setArticleId(draft.articleId);
        setThreadId(draft.threadId);
        setRuns(saved);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setDraftLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => {
      void api("/ai/draft", {
        method: "PUT",
        body: JSON.stringify({
          question,
          symbol,
          threadId,
          approach,
          scan,
          chartSnapshotId,
          articleId,
        }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [
    draftLoaded,
    question,
    symbol,
    threadId,
    approach,
    scan,
    chartSnapshotId,
    articleId,
  ]);
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
  useEffect(() => {
    if (!pendingQuestion) return;
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [pendingQuestion]);
  async function ask() {
    if (busy || question.trim().length < 5) return;
    setPendingQuestion(question);
    setAskFailed(false);
    setBusy(true);
    setError("");
    const generation = conversationGeneration.current;
    try {
      const result = await post<AIRun>("/ai/ask", {
        ...(chartSnapshotId ? { chartSnapshotId } : {}),
        ...(articleId ? { articleId } : {}),
        question,
        symbol,
        includePortfolio,
        approach,
        refreshResearch,
        ...(scan ? { scanId: scan.id } : {}),
        ...(threadId ? { threadId } : {}),
      });
      if (generation !== conversationGeneration.current) {
        await refresh();
        return;
      }
      setRuns((r) => [...r, result]);
      setThreadId(result.threadId);
      setQuestion("");
      await refresh();
    } catch (e) {
      if (generation === conversationGeneration.current) {
        const message = (e as Error).message;
        setError(
          /timeout|timed out|abort/i.test(message)
            ? "The model took too long to respond. Your question is still here. You can try again when you’re ready."
            : message,
        );
        setAskFailed(true);
      }
    } finally {
      setPendingQuestion("");
      setBusy(false);
    }
  }
  return (
    <section
      className={`hedgeway-chat ${compact ? "chat-compact" : "chat-full"}`}
      aria-label="Market conversation"
    >
      <div className="chat-toolbar">
        <div className="button-row">
          <button
            disabled={busy}
            onClick={() => {
              previousSeed.current = null;
              conversationGeneration.current++;
              setThreadId("");
              setRuns([]);
              setQuestion("");
              setScan(null);
              setChartSnapshotId(undefined);
              setArticleId(undefined);
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
                previousSeed.current = null;
                const generation = ++conversationGeneration.current;
                setBusy(true);
                setError("");
                try {
                  const saved = id
                    ? await api<AIRun[]>(`/ai/threads/${id}`)
                    : [];
                  if (generation !== conversationGeneration.current) return;
                  setQuestion("");
                  setRuns(saved);
                  setThreadId(id);
                  setScan(saved.at(-1)?.scan || null);
                  setChartSnapshotId(saved.at(-1)?.chartSnapshotId);
                  setArticleId(saved.at(-1)?.articleId);
                  setSymbol(
                    saved.at(-1)?.symbol || saved.at(-1)?.scan?.symbol || "",
                  );
                  setApproach(saved.at(-1)?.approach || "learn");
                } catch (e) {
                  if (generation === conversationGeneration.current)
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

      {articleId && (
        <div className="chat-context-strip">
          Selected source attached{" "}
          <button
            aria-label="Remove source context"
            onClick={() => setArticleId(undefined)}
          >
            ×
          </button>
        </div>
      )}
      {chartSnapshotId && (
        <div className="chat-context-strip">
          {symbol} · attached chart snapshot{" "}
          <button
            aria-label="Remove chart context"
            onClick={() => setChartSnapshotId(undefined)}
          >
            ×
          </button>
        </div>
      )}
      <div className="chat-messages" aria-label="Conversation history">
        {!runs.length && !pendingQuestion && (
          <div className="chat-welcome">
            <Sparkles size={28} strokeWidth={1.5} />
            <h2>Let’s think it through.</h2>
            <p>
              {symbol
                ? `Ask anything about ${symbol}, or explore the market.`
                : "A little clarity for your next market question."}
            </p>
            <div className="chat-suggestions">
              {[
                "What’s moving the market?",
                "Explain VWAP simply",
                "Challenge my trade idea",
              ].map((text) => (
                <button
                  type="button"
                  key={text}
                  disabled={busy}
                  onClick={() => setQuestion(text)}
                >
                  {text}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        {runs.map((run) => (
          <div className="chat-turn" key={run.id}>
            <div className="chat-user-message">
              <span className="chat-sr-only">You: </span>
              {run.question}
            </div>
            <Report run={run} followUp={setQuestion} />
          </div>
        ))}
        {pendingQuestion && (
          <div className="chat-turn">
            <div className="chat-user-message">{pendingQuestion}</div>
            <div className="chat-progress" role="status">
              <Sparkles size={17} />
              <span>
                {elapsed < 10
                  ? "Reading the evidence"
                  : elapsed < 35
                    ? "Connecting the sources"
                    : "Still working through your question"}{" "}
                · {elapsed}s
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="chat-composer-wrap">
        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            {askFailed && (
              <button
                type="button"
                disabled={busy || !status?.configured}
                onClick={() => void ask()}
              >
                Try again
              </button>
            )}
          </div>
        )}
        <form
          className="ai-question chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label className="chat-input-label">
            <span className="chat-sr-only">
              What would you like to understand?
            </span>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              minLength={5}
              maxLength={4000}
              required
              disabled={!!pendingQuestion}
              placeholder={
                runs.length
                  ? "Ask a follow-up…"
                  : "Ask about the market, a stock, or an idea…"
              }
            />
          </label>
          <div className="chat-composer-actions">
            <select
              aria-label="Conversation approach"
              value={approach}
              disabled={busy}
              onChange={(e) => setApproach(e.target.value as typeof approach)}
            >
              <option value="learn">Teach me</option>
              <option value="research">Read the evidence</option>
              <option value="challenge">Challenge my thinking</option>
            </select>
            <button
              type="button"
              className="chat-settings-button"
              aria-expanded={settingsOpen}
              aria-controls="chat-settings"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              Settings{symbol ? ` · ${symbol}` : ""}
            </button>
            <button
              className="primary chat-send"
              aria-label="Analyze evidence"
              title="Analyze evidence"
              disabled={
                busy || !status?.configured || question.trim().length < 5
              }
            >
              <Send size={17} />
              <span className="chat-sr-only">Analyze evidence</span>
            </button>
          </div>
        </form>
        {status?.configured === false && !settingsOpen && (
          <button
            className="chat-connect-hint"
            onClick={() => setSettingsOpen(true)}
          >
            Connect an AI model to start chatting <ArrowUpRight size={12} />
          </button>
        )}
        <p className="chat-footnote">
          AI can make mistakes. Check the sources before acting.
        </p>
        <div
          className="chat-settings"
          id="chat-settings"
          hidden={!settingsOpen}
        >
          <label>
            Focus symbol · optional
            <input
              value={symbol}
              onChange={(e) => {
                previousSeed.current = null;
                conversationGeneration.current++;
                setSymbol(e.target.value.toUpperCase());
                setScan(null);
                setChartSnapshotId(undefined);
                setArticleId(undefined);
                setThreadId("");
                setRuns([]);
              }}
              placeholder="All research"
              maxLength={30}
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
          <label className="checkbox-label">
            <input
              type="checkbox"
              disabled={status?.provider !== "openai"}
              checked={includePortfolio}
              onChange={(e) => setIncludePortfolio(e.target.checked)}
            />
            Include my holdings and position-size assumptions in the context
            sent to {status?.provider === "openai" ? "OpenAI" : "Google"}
          </label>
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
          <details className="disclosure">
            <summary>
              Sources & coverage{coverage ? ` · ${coverage.items} items` : ""}
            </summary>
            <p>
              Answers use stored news and forum excerpts from the last seven
              days, last-received prices and any saved setup scan for the
              selected symbol. Full articles are not automatically included.
            </p>
            <p className="subtle">
              Learning selects up to 12 recent excerpts; challenge mode 24 and
              research 50. Follow-ups retrieve recent and relevant earlier turns
              within a compact context budget. Full discussions stay saved here.
            </p>
            <button className="text-button" onClick={() => go("Research")}>
              Review source feed <ArrowUpRight size={14} />
            </button>
          </details>
          <details
            className="disclosure compact"
            open={status?.configured === false}
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
      </div>
    </section>
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
      title="Hedgeway"
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
          <p className="subtle chat-usage">
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
