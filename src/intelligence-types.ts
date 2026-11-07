export type Evidence = {
  id: string;
  kind: "article" | "forum" | "market" | "setup" | "portfolio";
  title: string;
  source: string;
  url: string | null;
  asOf: string;
  content: string;
};
export type AIAnswer = {
  summary: string;
  findings: {
    heading: string;
    kind: "observation" | "hypothesis";
    assessment: string;
    implication: string;
    evidenceIds: string[];
  }[];
  risks: string[];
  scenarios: {
    condition: string;
    whatItWouldMean: string;
    evidenceIds: string[];
  }[];
  openQuestions: string[];
};
export type AIRun = {
  id: string;
  threadId: string;
  question: string;
  model: string;
  answer: AIAnswer;
  sources: Evidence[];
  coverage: {
    items: number;
    publishers: number;
    oldest: string | null;
    newest: string | null;
    excerptOnly: boolean;
    portfolioIncluded: boolean;
  };
  createdAt: string;
  usage: { inputTokens: number; outputTokens: number } | null;
};
