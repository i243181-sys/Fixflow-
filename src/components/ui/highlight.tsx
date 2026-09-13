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

const KEYWORDS: Record<Lang, Set<string>> = {
  python: new Set(PY_KEYWORDS.split("|")),
  typescript: new Set(JS_KEYWORDS.split("|")),
  javascript: new Set(JS_KEYWORDS.split("|")),
  bash: new Set(BASH_KEYWORDS.split("|")),
  sql: new Set(SQL_KEYWORDS.split("|")),
};

const BUILTINS: Record<Lang, Set<string>> = {
  python: new Set(
    "print|len|range|str|int|float|bool|list|dict|set|tuple|open|super|isinstance|getattr|setattr|asyncio|loop|self".split("|")
  ),
  typescript: new Set("console|window|document|React|Array|Object|JSON|Promise|Map|Set|Number|String".split("|")),
  javascript: new Set("console|window|document|React|Array|Object|JSON|Promise|Map|Set".split("|")),
  bash: new Set(),
  sql: new Set(),
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

function wordClass(word: string, line: string, index: number, language: Lang): string {
  if (KEYWORDS[language].has(word)) return "keyword";
  if (BUILTINS[language].has(word)) return "builtin";
  if (/^[A-Z]/.test(word) || (word.length > 2 && line[index + word.length] === "(")) {
    return "func";
  }
  return "";
}

function matchedToken(
  groups: Record<string, string | undefined>,
  line: string,
  index: number,
  language: Lang
): Token | null {
  if (groups.comment) return { cls: "comment", text: groups.comment };
  if (groups.string) return { cls: "string", text: groups.string };
  if (groups.decorator) return { cls: "decorator", text: groups.decorator };
  if (groups.number) return { cls: "number", text: groups.number };
  if (groups.word) {
    return { cls: wordClass(groups.word, line, index, language), text: groups.word };
  }
  return null;
}

function tokenizeLine(line: string, language: Lang): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ cls: "", text: line.slice(last, index) });
    }
    if (match.groups) {
      const token = matchedToken(match.groups, line, index, language);
      if (token) tokens.push(token);
    }
    last = index + match[0].length;
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
