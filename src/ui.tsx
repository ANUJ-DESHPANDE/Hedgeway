import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Plus,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { date, money, pct, timestamp } from "./api";
import type { Article, Quote } from "./types";

export const colors = [
  "#b8ec87",
  "#89b5ec",
  "#c3a6e8",
  "#f3be79",
  "#7bd7c4",
  "#df8fac",
  "#a4b2aa",
  "#d9d99c",
];
export const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 12,
};
export function Change({ value }: { value: number | null | undefined }) {
  return (
    <span
      className={value == null ? "muted" : value >= 0 ? "positive" : "negative"}
    >
      {value != null &&
        (value >= 0 ? (
          <ArrowUpRight size={13} />
        ) : (
          <ArrowDownRight size={13} />
        ))}
      {pct(value)}
    </span>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Activity size={24} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  change,
}: {
  label: string;
  value: string;
  detail?: string;
  change?: number | null;
}) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span className="stat-foot">
        {change !== undefined ? <Change value={change} /> : null}
        {detail && <span>{detail}</span>}
      </span>
    </div>
  );
}
export function Panel({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Modal({
  title,
  onClose,
  children,
  open = true,
  variant = "default",
}: {
  open?: boolean;
  variant?: "default" | "assistant";
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [wide, setWide] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1100px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const docked = variant === "assistant" && wide;
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    if (!docked) document.body.style.overflow = "hidden";
    const nodes = () =>
      [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),summary,a[href],[tabindex="0"]',
        ) || []),
      ].filter((node) => node.getClientRects().length > 0);
    nodes()?.[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        (!docked || ref.current?.contains(document.activeElement))
      )
        closeRef.current();
      if (e.key === "Tab" && !docked) {
        const list = nodes();
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      if (!docked) document.body.style.overflow = previousOverflow;
      prev?.focus();
    };
  }, [open, docked]);
  return (
    <div
      className={`modal-backdrop ${variant === "assistant" ? `assistant-backdrop ${docked ? "docked" : ""}` : ""}`}
      style={open ? undefined : { display: "none" }}
      onMouseDown={(e) => {
        if (!docked && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal={docked ? undefined : true}
        aria-label={title}
        ref={ref}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Sparkline({
  values,
  positive = true,
}: {
  values: number[];
  positive?: boolean;
}) {
  const min = Math.min(...values),
    range = Math.max(...values) - min || 1;
  return (
    <svg width="94" height="30" viewBox="0 0 94 30" aria-hidden="true">
      <polyline
        fill="none"
        stroke={positive ? "var(--accent)" : "var(--red)"}
        strokeWidth="1.6"
        points={values
          .map(
            (v, i) =>
              `${(i / (values.length - 1)) * 94},${27 - ((v - min) / range) * 24}`,
          )
          .join(" ")}
      />
    </svg>
  );
}
export function QuoteTable({
  quotes,
  watch,
  onWatch,
  compact = false,
}: {
  quotes: Quote[];
  watch: string[];
  onWatch: (q: Quote) => void;
  compact?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Instrument</th>
            <th>Last price</th>
            <th>Change</th>
            {!compact && <th>Sector / trend</th>}
            <th>Source & time</th>
            <th>
              <span className="sr-only">Watchlist</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={`${q.exchange}:${q.symbol}`}>
              <td>
                <div className="instrument">
                  <span className="monogram">{q.symbol.slice(0, 2)}</span>
                  <div>
                    <strong>{q.symbol}</strong>
                    <small>
                      {q.name} <span className="exchange">{q.exchange}</span>
                    </small>
                  </div>
                </div>
              </td>
              <td className="numeric">{money(q.price, 2)}</td>
              <td>
                <Change value={q.change} />
              </td>
              {!compact && (
                <td>
                  {q.history ? (
                    <Sparkline values={q.history} positive={q.change >= 0} />
                  ) : (
                    <span className="muted">{q.sector}</span>
                  )}
                </td>
              )}
              <td>
                <span className="source-cell">
                  {q.source}
                  <small>{timestamp(q.asOf)}</small>
                </span>
              </td>
              <td>
                <button
                  className={`icon-button ${watch.includes(`${q.exchange}:${q.symbol}`) ? "active-icon" : ""}`}
                  onClick={() => onWatch(q)}
                  aria-label={`${watch.includes(`${q.exchange}:${q.symbol}`) ? "Remove" : "Add"} ${q.symbol} ${watch.includes(`${q.exchange}:${q.symbol}`) ? "from" : "to"} watchlist`}
                >
                  {watch.includes(`${q.exchange}:${q.symbol}`) ? (
                    <Check size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Story({
  article,
  onSave,
}: {
  article: Article;
  onSave?: (a: Article) => void;
}) {
  return (
    <article className="story">
      <div className="story-meta">
        <span
          className={`source-dot ${article.kind === "forum" ? "blue" : ""}`}
        />
        <span>{article.source}</span>
        <span>·</span>
        <span>{date(article.publishedAt)}</span>
        <span className="tag">{article.kind}</span>
      </div>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="story-title"
      >
        {article.title}
        <ArrowUpRight size={16} />
      </a>
      <p>{article.summary}</p>
      <div className="story-footer">
        <div>
          {article.symbols.map((s) => (
            <span key={s} className="ticker-tag">
              {s}
            </span>
          ))}
          {article.sentiment !== 0 && (
            <span
              className="subtle"
              title="Rule-based headline word score; not a prediction"
            >
              Headline tone: {article.sentiment > 0 ? "positive" : "negative"}
            </span>
          )}
        </div>
        {onSave && (
          <button
            className={`icon-button ${article.saved ? "active-icon" : ""}`}
            aria-label={article.saved ? "Unsave article" : "Save article"}
            onClick={() => onSave(article)}
          >
            <Bookmark size={16} />
          </button>
        )}
      </div>
    </article>
  );
}
