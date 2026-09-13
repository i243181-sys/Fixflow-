import type { Diagnosis } from "./types";

export function diagnosisMarkdown(diagnosis: Diagnosis): string {
  const steps = diagnosis.recommendedFix
    .map((step, index) => `${index + 1}. **${step.title}** — ${step.detail}`)
    .join("\n");
  const sources = diagnosis.sources
    .map((source) => {
      const location = source.url ? ` — ${source.url}` : "";
      return `- ${source.title}${location}`;
    })
    .join("\n");

  return [
    "# FixFlow diagnosis",
    "",
    `**Confidence:** ${diagnosis.confidence}%`,
    "",
    "## Root cause",
    "",
    diagnosis.rootCause,
    "",
    "## Why this happens",
    "",
    diagnosis.whyThisHappens,
    "",
    "## Recommended fix",
    "",
    steps,
    "",
    "## Sources",
    "",
    sources || "No sources were returned.",
  ].join("\n");
}
