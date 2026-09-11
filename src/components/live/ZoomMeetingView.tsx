import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ZoomLiveError,
  endZoomSession,
  joinZoomSession,
  leaveZoomSession,
  loadZoomSdk,
  setZoomRootVisible,
  startZoomSession,
  type ZoomJoinPayload,
} from "@/lib/zoomMeeting";

interface Props {
  mode: "host" | "attendee";
  /** Required for host mode (start/reuse a session for this group). */
  groupId?: string;
  groupTitle?: string;
  /** Required for attendee mode. */
  sessionId?: string;
  title?: string;
  onClose: () => void;
  /** Called when Zoom cannot be used (diagnostics only — there is no fallback). */
  onUnavailable?: (reason: string) => void;
}

export default function ZoomMeetingView({
  mode,
  groupId,
  groupTitle,
  sessionId,
  title,
  onClose,
  onUnavailable,
}: Props) {
  const [status, setStatus] = useState<"preparing" | "joining" | "in-meeting" | "error">("preparing");
  const [errorText, setErrorText] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        let payload: ZoomJoinPayload;
        if (mode === "host") {
          if (!groupId) throw new ZoomLiveError("لا توجد مجموعة محددة", "invalid_payload");
          payload = await startZoomSession({
            groupId,
            title: title || `حصة مباشرة — ${groupTitle || ""}`.trim(),
          });
        } else {
          if (!sessionId) throw new ZoomLiveError("لا توجد جلسة محددة", "invalid_payload");
          payload = await joinZoomSession(sessionId);
        }

        if (cancelled) return;

        if (payload.provider !== "zoom") {
          throw new ZoomLiveError(
            "هذه الجلسة أُنشئت بنظام البث القديم. اطلب من المعلم إنهاء الجلسة وبدء بث جديد.",
            "legacy_session",
          );
        }

        activeSessionId.current = payload.session?.id ?? sessionId ?? null;

        const ZoomMtg = await loadZoomSdk();
        if (cancelled) return;
        setStatus("joining");
        setZoomRootVisible(true);

        // Zoom raises its own in-meeting status events; rely on them so a
        // pending permission dialog can never leave us in a forever-loading state.
        try {
          ZoomMtg.inMeetingServiceListener?.("onMeetingStatus", (data: any) => {
            if (cancelled) return;
            if (data?.meetingStatus === 2) {
              joinedRef.current = true;
              setStatus("in-meeting");
            }
          });
        } catch {
          /* listener is optional */
        }

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          const fail = (err: ZoomLiveError) => {
            if (settled) return;
            settled = true;
            reject(err);
          };
          // Once Zoom's own UI is on screen the user drives the flow (device
          // permissions, pre-join prompts). Release our overlay so it is visible.
          const uiHandoff = window.setTimeout(() => {
            if (!cancelled) setStatus("in-meeting");
          }, 2500);
          const hardTimeout = window.setTimeout(() => {
            clearTimeout(uiHandoff);
            if (joinedRef.current) return done();
            fail(
              new ZoomLiveError(
                "تعذر إكمال الانضمام إلى الاجتماع. تأكد من السماح للمتصفح باستخدام الميكروفون والكاميرا ثم حاول مرة أخرى.",
                "zoom_join_timeout",
              ),
            );
          }, 60000);
          const finish = () => {
            clearTimeout(uiHandoff);
            clearTimeout(hardTimeout);
            done();
          };
          const abort = (err: ZoomLiveError) => {
            clearTimeout(uiHandoff);
            clearTimeout(hardTimeout);
            fail(err);
          };
          ZoomMtg.init({
            leaveUrl: window.location.href,
            patchJsMedia: true,
            leaveOnPageUnload: true,
            disableInvite: true,
            disableRecord: mode !== "host",
            isSupportAV: true,
            success: () => {
              ZoomMtg.join({
                sdkKey: payload.sdkKey,
                signature: payload.signature,
                meetingNumber: payload.meetingNumber,
                passWord: payload.password || "",
                userName: payload.userName || "مستخدم",
                zak: payload.role === 1 ? payload.zak || undefined : undefined,
                success: () => finish(),
                error: (err: any) => abort(new ZoomLiveError(err?.errorMessage || "فشل الانضمام للاجتماع", `zoom_join_${err?.errorCode ?? "unknown"}`)),
              });
            },
            error: (err: any) =>
              abort(new ZoomLiveError(err?.errorMessage || "فشل تهيئة Zoom", `zoom_init_${err?.errorCode ?? "unknown"}`)),
          });
        });

        if (cancelled) return;
        joinedRef.current = true;
        setStatus("in-meeting");
      } catch (error) {
        if (cancelled) return;
        setZoomRootVisible(false);
        const code = error instanceof ZoomLiveError ? error.code : "unknown";
        setErrorCode(code);
        setDiagnostic(error instanceof ZoomLiveError ? error.diagnostic || null : null);
        setErrorText(
          code === "zoom_credentials_missing"
            ? "لم يتم ضبط بيانات ربط Zoom بعد على الخادم. تواصل مع الدعم لتفعيل البث المباشر."
            : error instanceof Error
              ? error.message
              : String(error),
        );
        setStatus("error");
        onUnavailable?.(code);
      }
    };

    run();

    return () => {
      cancelled = true;
      setZoomRootVisible(false);
      const id = activeSessionId.current;
      if (id && mode === "attendee") void leaveZoomSession(id);
      if (joinedRef.current) {
        try {
          (window as any).ZoomMtg?.leaveMeeting({});
        } catch {
          /* SDK already torn down */
        }
      }
    };
  }, [mode, groupId, sessionId]);

  const handleEnd = async () => {
    const id = activeSessionId.current;
    try {
      if (mode === "host" && id) await endZoomSession(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنهاء البث");
    } finally {
      onClose();
    }
  };

  const copyReport = async () => {
    const report = [
      "تقرير خطأ البث المباشر — Modrek Live (Zoom)",
      `الوضع: ${mode}`,
      `رمز الخطأ: ${errorCode}`,
      `الرسالة: ${errorText}`,
      `خطوة الفشل: ${String(diagnostic?.step ?? "غير محددة")}`,
      `طلب Zoom: ${String(diagnostic?.source ?? "غير محدد")}`,
      `HTTP Status: ${String(diagnostic?.httpStatus ?? "-")}`,
      `Zoom Error Code: ${String(diagnostic?.zoomCode ?? "-")}`,
      `Zoom Error Message: ${String(diagnostic?.zoomMessage ?? "-")}`,
      `Zoom Request ID: ${String(diagnostic?.requestId ?? "-")}`,
      `المجموعة: ${groupId ?? "-"}`,
      `الجلسة: ${activeSessionId.current ?? sessionId ?? "-"}`,
      "الملف: src/components/live/ZoomMeetingView.tsx",
      "الخدمة: supabase/functions/zoom-live/index.ts",
      `الوقت: ${new Date().toISOString()}`,
    ].join("\n");
    await navigator.clipboard.writeText(report);
    toast.success("تم نسخ تقرير الخطأ");
  };

  if (status === "error") {
    return (
      <div className="fixed inset-0 z-[80] bg-background/95 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border bg-card p-6 space-y-4 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
          <h3 className="font-bold text-lg">تعذر بدء البث المباشر</h3>
          <p className="text-sm text-muted-foreground break-words">{errorText}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">{errorCode}</p>
          {diagnostic && (
            <div className="rounded-lg border bg-muted/40 p-3 text-start text-xs space-y-1" dir="ltr">
              <p>Step: {String(diagnostic.step ?? "unknown")}</p>
              <p>HTTP: {String(diagnostic.httpStatus ?? "-")}</p>
              <p>Zoom code: {String(diagnostic.zoomCode ?? "-")}</p>
              <p className="break-words">Zoom message: {String(diagnostic.zoomMessage ?? "-")}</p>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <Button variant="outline" className="gap-1" onClick={copyReport}>
              <Copy className="h-4 w-4" /> نسخ التقرير
            </Button>
            <Button onClick={onClose} className="gap-1">
              <X className="h-4 w-4" /> إغلاق
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "in-meeting") {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000]">
        <Button variant="destructive" onClick={handleEnd} className="shadow-lg">
          {mode === "host" ? "إنهاء البث" : "خروج"}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-background/95 flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-muted-foreground">
        {status === "preparing" ? "جاري تحضير البث المباشر..." : "جاري الانضمام إلى الاجتماع..."}
      </p>
    </div>
  );
}
