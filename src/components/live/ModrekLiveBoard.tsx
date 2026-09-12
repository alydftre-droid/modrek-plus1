import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getFileUrl, uploadFile } from "@/lib/storage";
import {
  X, Upload, Eraser, Undo2, ChevronLeft, ChevronRight, Loader2, Pencil, FileText, PenLine,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Stroke = { page: number; color: string; width: number; points: [number, number][] };

interface BoardRow {
  group_id: string;
  teacher_id: string;
  session_id: string | null;
  file_ref: string | null;
  file_kind: "blank" | "image" | "pdf";
  file_name: string | null;
  page: number;
  page_count: number;
  strokes: Stroke[] | null;
  is_open: boolean;
}

const COLORS = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#f59e0b"];

interface Props {
  groupId: string;
  isTeacher: boolean;
  sessionId?: string;
  onClose: () => void;
}

export default function ModrekLiveBoard({ groupId, isTeacher, sessionId, onClose }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileKind, setFileKind] = useState<"blank" | "image" | "pdf">("blank");
  const [fileRef, setFileRef] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [bgUrl, setBgUrl] = useState("");

  const surfaceRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pdfDocRef = useRef<any>(null);
  const renderToken = useRef(0);

  const pageStrokes = useMemo(() => strokes.filter((s) => s.page === page), [strokes, page]);

  // ------------------------------------------------------------ load + realtime
  const applyRow = useCallback((row: BoardRow) => {
    setFileKind(row.file_kind || "blank");
    setFileRef(row.file_ref);
    setFileName(row.file_name);
    setPage(row.page || 1);
    setPageCount(row.page_count || 1);
    setStrokes(Array.isArray(row.strokes) ? row.strokes : []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("live_boards")
        .select("*")
        .eq("group_id", groupId)
        .maybeSingle();
      if (!active) return;
      if (data) applyRow(data as unknown as BoardRow);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [groupId, applyRow]);

  useEffect(() => {
    // Students follow the teacher live; the teacher ignores echoes of own writes.
    if (isTeacher) return;
    const channel = supabase
      .channel(`live-board-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_boards", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as unknown as BoardRow | null;
          if (row) applyRow(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, isTeacher, applyRow]);

  const persist = useCallback(
    (patch: Partial<BoardRow>, immediate = false) => {
      if (!isTeacher || !user?.id) return;
      const run = async () => {
        const { error } = await supabase.from("live_boards").upsert(
          {
            group_id: groupId,
            teacher_id: user.id,
            session_id: sessionId ?? null,
            is_open: true,
            updated_at: new Date().toISOString(),
            ...patch,
          } as any,
          { onConflict: "group_id" },
        );
        if (error) toast.error("تعذر مزامنة السبورة مع الطلاب");
      };
      window.clearTimeout(saveTimer.current);
      if (immediate) void run();
      else saveTimer.current = window.setTimeout(() => void run(), 400);
    },
    [groupId, isTeacher, sessionId, user?.id],
  );

  // ------------------------------------------------------------------ background
  useEffect(() => {
    let active = true;
    (async () => {
      if (!fileRef) return setBgUrl("");
      const url = await getFileUrl(fileRef, { media: true });
      if (active) setBgUrl(url);
    })();
    return () => {
      active = false;
    };
  }, [fileRef]);

  useEffect(() => {
    if (fileKind !== "pdf" || !bgUrl) {
      pdfDocRef.current = null;
      return;
    }
    let active = true;
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url: bgUrl, withCredentials: false }).promise;
        if (!active) return;
        pdfDocRef.current = doc;
        setPageCount(doc.numPages);
        if (isTeacher) persist({ page_count: doc.numPages });
        await renderPdfPage();
      } catch {
        toast.error("تعذر عرض ملف PDF على السبورة");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgUrl, fileKind]);

  const renderPdfPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = pdfCanvasRef.current;
    if (!doc || !canvas) return;
    const token = ++renderToken.current;
    const pdfPage = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
    if (token !== renderToken.current) return;
    const containerWidth = surfaceRef.current?.clientWidth || 900;
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: Math.min(2.5, containerWidth / base.width) });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
  }, [page]);

  useEffect(() => {
    if (fileKind === "pdf") void renderPdfPage();
  }, [page, fileKind, renderPdfPage]);

  // ------------------------------------------------------------------- ink layer
  const redraw = useCallback(() => {
    const canvas = inkRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return;
    const w = surface.clientWidth;
    const h = surface.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of pageStrokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      stroke.points.forEach(([x, y], i) => {
        const px = x * w;
        const py = y * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }, [pageStrokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const onResize = () => {
      redraw();
      if (fileKind === "pdf") void renderPdfPage();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw, renderPdfPage, fileKind]);

  const pointFrom = (e: React.PointerEvent) => {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height] as [number, number];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTeacher) return;
    const point = pointFrom(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { page, color, width, points: [point] };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const stroke = drawingRef.current;
    if (!isTeacher || !stroke) return;
    const point = pointFrom(e);
    if (!point) return;
    stroke.points.push(point);
    setStrokes((prev) => [...prev.filter((s) => s !== stroke), stroke]);
  };

  const onPointerUp = () => {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke) return;
    setStrokes((prev) => {
      const next = prev.includes(stroke) ? [...prev] : [...prev, stroke];
      persist({ strokes: next as any });
      return next;
    });
  };

  const undo = () => {
    setStrokes((prev) => {
      const lastIndex = [...prev].reverse().findIndex((s) => s.page === page);
      if (lastIndex < 0) return prev;
      const next = [...prev];
      next.splice(prev.length - 1 - lastIndex, 1);
      persist({ strokes: next as any }, true);
      return next;
    });
  };

  const clearPage = () => {
    setStrokes((prev) => {
      const next = prev.filter((s) => s.page !== page);
      persist({ strokes: next as any }, true);
      return next;
    });
  };

  const changePage = (delta: number) => {
    const next = Math.min(Math.max(page + delta, 1), pageCount);
    setPage(next);
    persist({ page: next }, true);
  };

  const useBlankBoard = () => {
    setFileKind("blank");
    setFileRef(null);
    setFileName(null);
    setPage(1);
    setPageCount(1);
    persist({ file_kind: "blank", file_ref: null, file_name: null, page: 1, page_count: 1 }, true);
  };

  const handleUpload = async (file: File) => {
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast.error("اختر صورة أو ملف PDF");
      return;
    }
    setUploading(true);
    try {
      const stored = await uploadFile({ scope: { kind: "course", id: groupId }, category: "live-board", file });
      setFileKind(isPdf ? "pdf" : "image");
      setFileRef(stored.url);
      setFileName(file.name);
      setPage(1);
      setStrokes([]);
      persist(
        {
          file_kind: isPdf ? "pdf" : "image",
          file_ref: stored.url,
          file_name: file.name,
          page: 1,
          page_count: 1,
          strokes: [] as any,
        },
        true,
      );
      toast.success("تم عرض الملف على السبورة");
    } catch {
      toast.error("تعذر رفع الملف");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (isTeacher) persist({ is_open: false }, true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10050] bg-slate-900/95 flex flex-col" dir="rtl">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white/95 border-b flex-wrap">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <PenLine className="h-4 w-4 text-primary" />
          سبورة مدرك
          {fileName && <span className="text-xs font-normal text-slate-500 truncate max-w-[140px]">{fileName}</span>}
        </div>

        {isTeacher && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleUpload(f);
              }}
            />
            <Button size="sm" variant="outline" className="gap-1" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} رفع ملف
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={useBlankBoard}>
              <FileText className="h-3.5 w-3.5" /> سبورة فارغة
            </Button>
            <div className="flex items-center gap-1 px-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`لون ${c}`}
                  className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-primary scale-110" : "border-white"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {[2, 4, 8].map((w) => (
                <Button key={w} size="sm" variant={width === w ? "default" : "outline"} className="h-7 w-7 p-0" onClick={() => setWidth(w)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="gap-1" onClick={undo}>
              <Undo2 className="h-3.5 w-3.5" /> تراجع
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={clearPage}>
              <Eraser className="h-3.5 w-3.5" /> مسح
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {fileKind === "pdf" && (
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={!isTeacher || page <= 1} onClick={() => changePage(-1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <span>{page} / {pageCount}</span>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={!isTeacher || page >= pageCount} onClick={() => changePage(1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Button size="sm" variant="ghost" className="gap-1" onClick={handleClose}>
            <X className="h-4 w-4" /> إغلاق
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 sm:p-4">
        <div
          ref={surfaceRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`relative mx-auto w-full max-w-4xl overflow-hidden rounded-lg bg-card shadow-2xl ${fileKind === "blank" ? "min-h-[60vh]" : ""}`}
          style={{ touchAction: isTeacher ? "none" : "auto" }}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {fileKind === "image" && bgUrl && <img src={bgUrl} alt="ملف الشرح" className="w-full block select-none" draggable={false} />}
          {fileKind === "pdf" && <canvas ref={pdfCanvasRef} className="w-full block" />}
          <canvas ref={inkRef} className="absolute inset-0 h-full w-full" />
          {!isTeacher && (
            <div className="absolute bottom-2 start-2 rounded-full bg-slate-900/70 text-white text-[11px] px-3 py-1">
              متابعة شرح المعلم مباشرة
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
