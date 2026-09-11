import * as React from "react";
import { Expand, Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/**
 * Lazy Mermaid diagram block. The AI emits ```mermaid fences for geometry,
 * flow, mind maps and comparison trees; we render them as real SVG diagrams.
 */

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = (mod.default ?? mod) as MermaidApi;
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

function InteractiveDiagram({ html, label }: { html: string; label: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <figure
        dir="ltr"
        className="my-5 overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2" dir="rtl">
          <span className="text-xs font-bold text-slate-600">اسحب أفقيًا لرؤية التفاصيل</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 bg-white px-2.5 text-xs"
            onClick={() => setOpen(true)}
            aria-label={`تكبير ${label}`}
          >
            <Expand className="h-4 w-4" />
            تكبير
          </Button>
        </div>
        <div
          className="modrek-diagram overflow-x-auto overscroll-x-contain p-3 text-center [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:!w-[56rem] [&_svg]:!max-w-none"
          // Mermaid/SVG output is sanitized or generated locally before rendering.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </figure>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir="rtl"
          className="flex h-[92dvh] w-[96vw] max-w-[96vw] flex-col gap-3 overflow-hidden rounded-2xl p-3 sm:max-w-6xl"
        >
          <div className="shrink-0 pl-10">
            <DialogTitle className="text-right text-base font-extrabold text-foreground">{label}</DialogTitle>
            <DialogDescription className="mt-1 text-right text-xs">
              استخدم إصبعين للتكبير، أو اضغط مرتين على الرسم، ثم اسحب لرؤية كل التفاصيل.
            </DialogDescription>
          </div>

          <TransformWrapper
            initialScale={1}
            minScale={0.55}
            maxScale={6}
            centerOnInit
            wheel={{ step: 0.12 }}
            doubleClick={{ mode: "zoomIn", step: 1.2 }}
            panning={{ velocityDisabled: false }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="flex shrink-0 items-center justify-center gap-2" dir="ltr">
                  <Button type="button" variant="outline" size="icon" onClick={() => zoomOut()} aria-label="تصغير الرسم">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => resetTransform()} aria-label="إعادة ضبط التكبير">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => zoomIn()} aria-label="تكبير الرسم">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <TransformComponent
                  wrapperClass="!h-full !w-full flex-1 overflow-hidden rounded-xl border border-border bg-muted/30"
                  contentClass="flex h-full w-full items-center justify-center"
                >
                  <div
                    dir="ltr"
                    className="select-none bg-white p-5 [&_svg]:block [&_svg]:h-auto [&_svg]:!w-[70rem] [&_svg]:!max-w-none"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </DialogContent>
      </Dialog>
    </>
  );
}

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

  return <InteractiveDiagram html={svg} label="الرسم التوضيحي" />;
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

  return <InteractiveDiagram html={safe} label="الرسم التوضيحي" />;
}

export default DiagramBlock;
