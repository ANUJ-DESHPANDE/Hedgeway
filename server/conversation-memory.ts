import type { AIRun } from "../src/intelligence-types.js";
/** Extractive retrieval only: original turns remain authoritative; no background model call. */
export function conversationMemory(
  runs: AIRun[],
  question: string,
  includePrivate: boolean,
  maxCharacters = 14000,
) {
  const eligible = runs.filter(
    (run) => includePrivate || !run.coverage.portfolioIncluded,
  );
  const terms = [
    ...new Set(question.toLowerCase().match(/[a-z0-9]{4,}/g) || []),
  ].filter(
    (t) =>
      ![
        "what",
        "with",
        "that",
        "this",
        "have",
        "would",
        "could",
        "should",
        "about",
        "please",
      ].includes(t),
  );
  const tail = eligible.slice(-8),
    older = eligible.slice(0, -8);
  const relevant = older.map((run, index) => ({
    run,
    index,
    score: terms.reduce(
      (n, t) =>
        n +
        ((run.question + " " + run.answer.summary).toLowerCase().includes(t)
          ? 1
          : 0),
      0,
    ),
  }));
  // Retain explicit corrections even if their vocabulary differs from the new question.
  for (const item of relevant)
    if (
      /\b(correction|actually|i meant|remember|my timeframe)\b/i.test(
        item.run.question,
      )
    )
      item.score += 3;
  const selected = relevant
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 4)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.run)
    .concat(tail);
  const memory = selected.map((run) => ({
    turnId: run.id,
    asOf: run.createdAt,
    question: run.question.slice(0, 1200),
    summary: run.answer.summary.slice(0, 1200),
    concepts: run.answer.findings.slice(0, 2).map((f) => ({
      heading: f.heading,
      assessment: f.assessment.slice(0, 350),
    })),
    openQuestions: run.answer.openQuestions.slice(0, 3),
  }));
  while (JSON.stringify(memory).length > maxCharacters && memory.length > 1) {
    const index = memory.length > 8 ? memory.length - 8 : 0;
    memory.splice(index, 1);
  }
  return memory;
}
