/**
 * Minimal regex-based syntax highlighter.
 * Produces React spans — no external highlighter dependency.
 * Supported: python, typescript/javascript, bash, sql.
 */

type Lang = "python" | "typescript" | "javascript" | "bash" | "sql";

const PY_KEYWORDS =
  "def|async|await|return|import|from|class|if|elif|else|for|while|try|except|finally|with|as|raise|yield|pass|break|continue|and|or|not|in|is|None|True|False|lambda|global|nonlocal|del|assert|match|case";
const JS_KEYWORDS =
  "const|let|var|function|return|import|export|from|default|class|extends|new|this|async|await|if|else|for|while|try|catch|finally|throw|typeof|instanceof|interface|type|enum|implements|public|private|readonly|static|null|undefined|true|false|switch|case|break|continue|as|of|in";
const BASH_KEYWORDS =
  "if|then|else|fi|for|while|do|done|export|echo|source|return|function|local|sudo|npm|npx|cd|ls|cat|curl|git|docker|pip";
const SQL_KEYWORDS =
  "SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|ON|GROUP|BY|ORDER|LIMIT|OFFSET|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|ALTER|DROP|AS";

const KEYWORDS: Record<Lang, string> = {
  python: PY_KEYWORDS,
  typescript: JS_KEYWORDS,
  javascript: JS_KEYWORDS,
  bash: BASH_KEYWORDS,
  sql: SQL_KEYWORDS,
};

const BUILTINS: Record<Lang, string> = {
  python:
    "print|len|range|str|int|float|bool|list|dict|set|tuple|open|super|isinstance|getattr|setattr|asyncio|loop|self",
  typescript: "console|window|document|React|Array|Object|JSON|Promise|Map|Set|Number|String",
  javascript: "console|window|document|React|Array|Object|JSON|Promise|Map|Set",
  bash: "",
  sql: "",
};

interface Token {
  cls: string;
  text: string;
}

const TOKEN_RE = new RegExp(
  [
    "(?<comment>#[^\\n]*|/\\*[\\s\\S]*?\\*/|//[^\\n]*|--[^\\n]*)",
    "(?<string>\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
    "(?<decorator>@[A-Za-z_][A-Za-z0-9_.]*)",
    "(?<number>\\b\\d+(?:\\.\\d+)?\\b)",
    "(?<word>[A-Za-z_][A-Za-z0-9_]*)",
  ].join("|"),
  "g"
);

function tokenizeLine(line: string, lang: Lang): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ cls: "", text: line.slice(last, idx) });
    const g = m.groups!;
    if (g.comment) tokens.push({ cls: "comment", text: g.comment });
    else if (g.string) tokens.push({ cls: "string", text: g.string });
    else if (g.decorator) tokens.push({ cls: "decorator", text: g.decorator });
    else if (g.number) tokens.push({ cls: "number", text: g.number });
    else if (g.word) {
      const w = g.word;
      const cls = KEYWORDS[lang].split("|").includes(w)
        ? "keyword"
        : BUILTINS[lang].split("|").includes(w)
          ? "builtin"
          : /^[A-Z]/.test(w)
            ? "func"
            : w.length > 2 && line[idx + w.length] === "("
              ? "func"
              : "";
      tokens.push({ cls, text: w });
    }
    last = idx + m[0].length;
  }
  if (last < line.length) tokens.push({ cls: "", text: line.slice(last) });
  return tokens;
}

export function HighlightedCode({
  code,
  language,
  className,
}: {
  code: string;
  language: Lang;
  className?: string;
}) {
  const lines = code.split("\n");
  return (
    <pre
      className={className}
      aria-label={`${language} code snippet`}
    >
      <code className="block font-mono text-[13px] leading-relaxed">
        {lines.map((line, i) => (
          <span key={i} className="block">
            <span aria-hidden className="mr-4 inline-block w-6 select-none text-right text-[11px] text-muted/40">
              {i + 1}
            </span>
            {tokenizeLine(line, language).map((t, j) =>
              t.cls ? (
                <span key={j} className={`code-token code-token-${t.cls}`}>
                  {t.text}
                </span>
              ) : (
                <span key={j}>{t.text}</span>
              )
            )}
            {line.length === 0 ? " " : null}
          </span>
        ))}
      </code>
    </pre>
  );
}
