export type SourceType = "docs" | "github" | "community" | "code";

export interface SourceDoc {
  id: string;
  type: SourceType;
  title: string;
  publisher: string;
  url: string;
  relevance: number; // 0-100
  excerpt: string;
  used: boolean;
}

export interface FixStep {
  title: string;
  detail: string;
}

export interface CodeFix {
  file: string;
  lines: string;
  before: string;
  after: string;
  language: "python" | "typescript" | "javascript" | "bash" | "sql";
}

export interface AlternativeFix {
  title: string;
  tradeoff: string;
  summary: string;
}

export interface Diagnosis {
  sessionId?: string;
  status: "likely-cause-found" | "investigating" | "no-cause";
  confidence: number;
  detected: string[];
  rootCause: string;
  whyThisHappens: string;
  recommendedFix: FixStep[];
  codeFix: CodeFix;
  alternatives: AlternativeFix[];
  sources: SourceDoc[];
  rag: {
    query: string;
    expansions: string[];
    retrieved: number;
    reranked: number;
    sourcesUsed: number;
    topChunks: { doc: string; score: number }[];
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "fixflow";
  text: string;
  sources?: { title: string; type: SourceType }[];
  pending?: boolean;
}

export type SessionStatus = "resolved" | "unresolved" | "in-progress";

export interface DebugSession {
  id: string;
  title: string;
  technology: string[];
  createdAt: string;
  status: SessionStatus;
  confidence: number | null;
  errorMessage: string;
}

export interface KnowledgeIndex {
  name: string;
  kind: "docs" | "github" | "community" | "upload";
  status: "indexed" | "indexing" | "queued" | "error";
  chunks: number;
  updated: string;
  detail: string;
}

export interface SavedSolution {
  id: string;
  problem: string;
  rootCause: string;
  technology: string[];
  fixSummary: string;
  sources: { title: string; type: SourceType }[];
  savedAt: string;
}

export const TECH_OPTIONS = [
  "Python",
  "FastAPI",
  "Django",
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Node.js",
  "Docker",
  "PostgreSQL",
  "Git",
  "LangChain",
] as const;

export type TechOption = (typeof TECH_OPTIONS)[number];
