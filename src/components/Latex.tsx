import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

/**
 * Render text with embedded LaTeX. Supports:
 *   - $...$ inline math
 *   - $$...$$ block math
 * Anything outside delimiters is rendered as plain text.
 */
export function Latex({ children, block = false }: { children: string; block?: boolean }) {
  const text = children ?? "";
  if (!text) return null;

  // Quick path: caller marked it as pure block math
  if (block && !text.includes("$")) {
    try { return <BlockMath math={text} />; } catch { return <span>{text}</span>; }
  }

  const parts: Array<{ type: "text" | "inline" | "block"; value: string }> = [];
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("$$")) parts.push({ type: "block", value: tok.slice(2, -2) });
    else parts.push({ type: "inline", value: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return (
    <span className="latex-content">
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        try {
          return p.type === "block"
            ? <BlockMath key={i} math={p.value} />
            : <InlineMath key={i} math={p.value} />;
        } catch {
          return <span key={i} className="text-destructive">{p.value}</span>;
        }
      })}
    </span>
  );
}