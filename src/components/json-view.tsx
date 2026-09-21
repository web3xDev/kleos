// Pretty-printed JSON with light tokenization. Falls back to plain text when
// the input is not JSON. Client-safe, no dependencies.

import { Fragment } from "react";

type Tok = { t: "key" | "str" | "num" | "bool" | "null" | "punct" | "ws"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false)|(null)|([{}\[\],:])|(\s+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out.push({ t: "key", v: m[1] });
        out.push({ t: "punct", v: m[2] });
      } else out.push({ t: "str", v: m[1] });
    } else if (m[3] !== undefined) out.push({ t: "num", v: m[3] });
    else if (m[4] !== undefined) out.push({ t: "bool", v: m[4] });
    else if (m[5] !== undefined) out.push({ t: "null", v: m[5] });
    else if (m[6] !== undefined) out.push({ t: "punct", v: m[6] });
    else if (m[7] !== undefined) out.push({ t: "ws", v: m[7] });
  }
  return out;
}

const color: Record<Tok["t"], string> = {
  key: "text-primary",
  str: "text-secondary",
  num: "text-accent-text",
  bool: "text-accent-text",
  null: "text-tertiary",
  punct: "text-tertiary",
  ws: "",
};

export function JsonView({ value, className = "" }: { value: string; className?: string }) {
  let pretty = value;
  let isJson = false;
  try {
    pretty = JSON.stringify(JSON.parse(value), null, 2);
    isJson = true;
  } catch {
    // not JSON; show as-is
  }
  return (
    <pre
      className={`overflow-auto rounded-[8px] border border-border-subtle bg-surface p-4 font-mono text-[13px] leading-relaxed text-primary ${className}`}
    >
      {isJson
        ? tokenize(pretty).map((tok, i) => (
            <Fragment key={i}>
              {tok.t === "ws" ? tok.v : <span className={color[tok.t]}>{tok.v}</span>}
            </Fragment>
          ))
        : pretty}
    </pre>
  );
}
