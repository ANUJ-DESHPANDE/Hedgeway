import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  MessageSquare,
  BookOpen,
  FlaskConical,
  Bell,
} from "lucide-react";
import { api, timestamp } from "../api";
import type { Page } from "../navigation";
import type { Article } from "../types";
export default function Notebook({
  go,
  onThread,
}: {
  go: (page: Page) => void;
  onThread: (id: string) => void;
}) {
  const [threads, setThreads] = useState<
      { id: string; title: string; created_at: string }[]
    >([]),
    [saved, setSaved] = useState<Article[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api<typeof threads>("/ai/threads"),
      api<Article[]>("/research?saved=true"),
    ])
      .then(([t, s]) => {
        if (active) {
          setThreads(t);
          setSaved(s);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="notebook">
      <div className="notebook-intro">
        <span className="desk-kicker">KEEP YOUR REASONING</span>
        <h1>Your work, ready to return to.</h1>
        <p>Discussions, sources and hypotheses. Pick up where you left off.</p>
      </div>
      {error && <p className="error-box">{error}</p>}
      <div className="notebook-actions">
        <button onClick={() => go("Journal")}>
          <BookOpen size={18} /> Notes & decisions <ArrowUpRight size={16} />
        </button>
        <button onClick={() => go("Strategy lab")}>
          <FlaskConical size={18} /> Test a hypothesis{" "}
          <ArrowUpRight size={16} />
        </button>
        <button onClick={() => go("Journal")}>
          <Bell size={18} /> Price alerts <ArrowUpRight size={16} />
        </button>
        <button onClick={() => go("Setup scanner")}>
          Review saved setups <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="notebook-grid">
        <section>
          <h2>Conversations</h2>
          {threads.map((t) => (
            <button
              className="notebook-thread"
              key={t.id}
              onClick={() => onThread(t.id)}
            >
              <MessageSquare size={18} />
              <span>
                <strong>{t.title}</strong>
                <small>{timestamp(t.created_at)}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!threads.length && (
            <p>Conversations you start with Hedgeway will be saved here.</p>
          )}
        </section>
        <section>
          <h2>Saved reading</h2>
          {saved.map((a) => (
            <a
              className="notebook-source"
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
            >
              <small>
                {a.source} · {timestamp(a.publishedAt)}
              </small>
              <strong>{a.title}</strong>
            </a>
          ))}
          {!saved.length && (
            <p>
              Save an article while exploring to return to its original source.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
