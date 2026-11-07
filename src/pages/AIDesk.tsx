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
import type { AIRun } from "../intelligence-types";
import type { Page } from "../navigation";
import { Empty, Panel } from "../ui";
export default function AIDesk({
  seed,
  go,
  show,
}: {
  seed: { question: string; symbol: string } | null;
  go: (page: Page) => void;
  show: (message: string, error?: boolean) => void;
}) {
  const [status, setStatus] = useState<{
      configured: boolean;
      model: string;
    } | null>(null),
    [key, setKey] = useState(""),
    [model, setModel] = useState("gpt-5.5"),
    [question, setQuestion] = useState(seed?.question || ""),
    [symbol, setSymbol] = useState(seed?.symbol || ""),
    [includePortfolio, setIncludePortfolio] = useState(false),
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
        title="Turn research into a clearer view"
        sub="Ask about themes, conflicting evidence, catalysts or a setup you’re watching."
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
              Use an OpenAI API key. It is encrypted on this server. Each
              analysis uses your API account and may incur charges; no analysis
              runs automatically.
            </p>
            <form
              className="token-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await post("/ai/credentials", { key, model });
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
                OpenAI API key
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
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                  pattern="gpt-[a-zA-Z0-9.\-]+"
                />
              </label>
              <div className="button-row">
                <button disabled={busy || !key}>Check & save connection</button>
                <a
                  href="https://platform.openai.com/api-keys"
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
                setThreadId(id);
                setError("");
                try {
                  setRuns(id ? await api(`/ai/threads/${id}`) : []);
                } catch (e) {
                  setError((e as Error).message);
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
          <Report key={run.id} run={run} />
        ) : (
          <details className="disclosure" key={run.id}>
            <summary>{run.question}</summary>
            <Report run={run} />
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
          <div className="button-row">
            <label>
              Focus symbol · optional
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
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
              sent to OpenAI
            </label>
          </div>
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
              Up to 50 recent articles or forum posts per answer. Follow-ups use
              the last four discussion summaries plus current evidence.
            </span>
          </div>
        </form>
      </Panel>
    </>
  );
}
function Report({ run }: { run: AIRun }) {
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
    >
      <div className="ai-report">
        <p className="ai-summary">{run.answer.summary}</p>
        <div className="evidence-findings">
          {run.answer.findings.map((f, i) => (
            <section key={i}>
              <span className={`tag ${f.kind === "hypothesis" ? "amber" : ""}`}>
                {f.kind === "observation"
                  ? "Sourced observation"
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
              <li key={i}>{q}</li>
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
                    {source.source} · {timestamp(source.asOf)}
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
