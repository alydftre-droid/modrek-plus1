import { useEffect, useMemo, useState } from "react";
import { Clock3, Eye, PenLine, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import LiveSessionChat from "./LiveSessionChat";
import ModrekLiveBoard from "./ModrekLiveBoard";

interface Props {
  sessionId: string;
  groupId: string;
  title: string;
  viewerCount?: number;
  startedAt?: string;
  isTeacher: boolean;
  userName: string;
}

function elapsedLabel(startedAt?: string) {
  if (!startedAt) return "بدأت الآن";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} س ${remainder} د` : `${minutes} دقيقة`;
}

export default function LiveClassroomShell({ sessionId, groupId, title, viewerCount = 0, startedAt, isTeacher, userName }: Props) {
  const [showBoard, setShowBoard] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => elapsedLabel(startedAt), [startedAt, tick]);

  return (
    <div className="fixed inset-0 z-[10002] pointer-events-none" dir="rtl" aria-label="أدوات حصة مدرك">
      <header className="pointer-events-auto absolute inset-x-2 top-2 mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 shrink-0 text-destructive" />
            <strong className="truncate text-sm">{title || "حصة مباشرة"}</strong>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{elapsed}</span>
            <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{viewerCount} حاضر</span>
          </div>
        </div>
        <Button size="sm" variant="secondary" className="shrink-0 gap-1.5" onClick={() => setShowBoard(true)}>
          <PenLine className="h-4 w-4" /> السبورة والكتاب
        </Button>
      </header>
      <div className="pointer-events-auto">
        <LiveSessionChat sessionId={sessionId} isTeacher={isTeacher} userName={userName} />
      </div>
      {showBoard && (
        <div className="pointer-events-auto">
          <ModrekLiveBoard groupId={groupId} isTeacher={isTeacher} sessionId={sessionId} onClose={() => setShowBoard(false)} />
        </div>
      )}
    </div>
  );
}