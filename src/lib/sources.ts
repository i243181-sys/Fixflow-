import type { KnowledgeSource } from "./types";

export const SOURCE_STATUS: Record<KnowledgeSource["status"], {
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
}> = {
  uploaded: { label: "Uploaded", tone: "muted" },
  processing: { label: "Processing", tone: "warning" },
  chunked: { label: "Chunked", tone: "warning" },
  ready_for_embedding: { label: "Ready for embedding", tone: "success" },
  indexed: { label: "Indexed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function isSourcePending(source: KnowledgeSource): boolean {
  return ["uploaded", "processing", "chunked"].includes(source.status);
}
