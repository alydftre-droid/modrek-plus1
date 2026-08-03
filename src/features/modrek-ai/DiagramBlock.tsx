import * as React from "react";

/**
 * Lazy Mermaid diagram block. The AI emits ```mermaid fences for geometry,
 * flow, mind maps and comparison trees; we render them as real SVG diagrams.
 */

let mermaidPromise: Promise<any> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default ?? mod;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "Cairo, system-ui, sans-serif",
        themeVariables: {
          primaryColor: "#EFF6FF",
          primaryBorderColor: "#2563EB",
          primaryTextColor: "#0F172A",
          lineColor: "#2563EB",
          fontSize: "15px",
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let seq = 0;

export function DiagramBlock({ code }: { code: string }) {
  const [svg, setSvg] = React.useState<string>("");
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = await getMermaid();
        const id = `modrek-diagram-${++seq}`;
        const { svg } = await mermaid.render(id, code.trim());
        if (alive) setSvg(svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (failed) {
    return (
      <pre dir="ltr" className="my-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-[13px] leading-7 text-slate-100">
        <code>{code}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 h-28 animate-pulse rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50" aria-hidden />
    );
  }

  return (
    <figure
      dir="ltr"
      className="modrek-diagram my-5 overflow-x-auto rounded-2xl border-2 border-slate-200 bg-white p-3 text-center shadow-sm [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // Mermaid output is generated locally from model text with securityLevel: strict.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Raw inline SVG the AI may emit inside a ```svg fence (geometry drawings). */
export function SvgBlock({ code }: { code: string }) {
  const safe = React.useMemo(() => {
    const src = code.trim();
    if (!/^<svg[\s>]/i.test(src)) return null;
    // Strip anything scriptable before injecting.
    return src
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/javascript:/gi, "");
  }, [code]);

  if (!safe) {
    return (
      <pre dir="ltr" className="my-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-[13px] text-slate-100">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <figure
      dir="ltr"
      className="my-5 overflow-x-auto rounded-2xl border-2 border-slate-200 bg-white p-3 text-center shadow-sm [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export default DiagramBlock;
