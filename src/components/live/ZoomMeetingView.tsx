import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, X, Copy, Camera, Mic, ShieldCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ZoomLiveError,
  endZoomSession,
  joinZoomSession,
  leaveZoomSession,
  loadZoomSdk,
  requestZoomMediaPermissions,
  setZoomRootVisible,
  startZoomArabicLocalization,
  startZoomSession,
  stopZoomArabicLocalization,
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
  const [status, setStatus] = useState<
    "permission" | "requesting-permission" | "permission-blocked" | "preparing" | "joining" | "in-meeting" | "error"
  >("permission");
  const [mediaPermission, setMediaPermission] = useState({ audio: false, video: false });
  const [errorText, setErrorText] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      startingRef.current = false;
      stopZoomArabicLocalization();
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
  }, [mode]);

  const beginMeeting = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setErrorText("");
    setStatus("requesting-permission");

    try {
      // This call must remain directly inside the button handler. Moving it to
      // useEffect loses the user gesture and Android/Chrome suppresses its prompt.
      const perms = await requestZoomMediaPermissions();
      if (cancelledRef.current) return;
      setMediaPermission({ audio: perms.audio, video: perms.video });

      if (!perms.audio) {
        setErrorText(
          perms.reason === "TimeoutError"
            ? "لم يتم الرد على طلب الإذن. اضغط إعادة المحاولة ثم اختر «سماح» من رسالة الهاتف."
            : "تم رفض إذن الميكروفون. فعّله من علامة القفل بجوار عنوان الموقع، ثم اضغط إعادة طلب الإذن.",
        );
        setStatus("permission-blocked");
        return;
      }

      if (!perms.video) {
        toast.info("تعذر تشغيل الكاميرا، وسيتم دخول الحصة بالصوت. يمكنك تشغيلها لاحقًا من أدوات الحصة.");
      }

      setStatus("preparing");
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

        if (cancelledRef.current) return;

        if (payload.provider !== "zoom") {
          throw new ZoomLiveError(
            "هذه الجلسة أُنشئت بنظام البث القديم. اطلب من المعلم إنهاء الجلسة وبدء بث جديد.",
            "legacy_session",
          );
        }

        activeSessionId.current = payload.session?.id ?? sessionId ?? null;

        const ZoomMtg = await loadZoomSdk();
        if (cancelledRef.current) return;
        setStatus("joining");
        setZoomRootVisible(true);
        startZoomArabicLocalization();

        // Zoom raises its own in-meeting status events; rely on them so a
        // pending permission dialog can never leave us in a forever-loading state.
        try {
          ZoomMtg.inMeetingServiceListener?.("onMeetingStatus", (data: any) => {
            if (cancelledRef.current) return;
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
            if (!cancelledRef.current) setStatus("in-meeting");
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
              const joinPayload = {
                sdkKey: payload.sdkKey,
                signature: payload.signature,
                meetingNumber: payload.meetingNumber,
                passWord: payload.password || "",
                userName: payload.userName || "مستخدم",
                zak: payload.role === 1 ? payload.zak || undefined : undefined,
                success: () => finish(),
                error: (err: any) => abort(new ZoomLiveError(
                  err?.errorMessage || err?.reason || "فشل الانضمام للاجتماع",
                  `zoom_join_${err?.errorCode ?? err?.errorCodeName ?? "unknown"}`,
                  {
                    step: "sdk_join",
                    source: "ZoomMtg.join",
                    zoomCode: err?.errorCode ?? err?.errorCodeName ?? "unknown",
                    zoomMessage: err?.errorMessage || err?.reason || "Zoom join failed",
                  },
                )),
              };
              if (!joinPayload.sdkKey || !joinPayload.signature || !joinPayload.meetingNumber) {
                abort(new ZoomLiveError(
                  "بيانات دخول اجتماع Zoom غير مكتملة. أغلق الحصة وابدأ حصة جديدة.",
                  "zoom_join_payload_missing",
                  { step: "sdk_join", source: "ZoomMtg.join" },
                ));
                return;
              }
              if (payload.role === 1 && !joinPayload.zak) {
                abort(new ZoomLiveError(
                  "تعذر إصدار رمز المضيف. أغلق الحصة وابدأ حصة جديدة.",
                  "zoom_host_zak_missing",
                  { step: "sdk_join", source: "ZoomMtg.join" },
                ));
                return;
              }
              ZoomMtg.join(joinPayload);
            },
            error: (err: any) =>
              abort(new ZoomLiveError(err?.errorMessage || "فشل تهيئة Zoom", `zoom_init_${err?.errorCode ?? "unknown"}`)),
          });
        });

        if (cancelledRef.current) return;
        joinedRef.current = true;
        setStatus("in-meeting");
      } catch (error) {
        if (cancelledRef.current) return;
        setZoomRootVisible(false);
        const code = error instanceof ZoomLiveError ? error.code : "unknown";
        // Zoom 3000 = "already has other meetings in progress": a previous
        // browser session of this same meeting has not been released yet.
        // The server reuses/clears it, so one silent retry restores the class.
        if (/_3000$/.test(code) && !retriedRef.current) {
          retriedRef.current = true;
          startingRef.current = false;
          setStatus("preparing");
          await new Promise((resolve) => setTimeout(resolve, 2500));
          if (cancelledRef.current) return;
          return await beginMeeting();
        }
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
    } finally {
      startingRef.current = false;
    }
  };

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

  if (status === "permission" || status === "requesting-permission" || status === "permission-blocked") {
    const requesting = status === "requesting-permission";
    const blocked = status === "permission-blocked";
    return (
      <div className="fixed inset-0 z-[10001] bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full rounded-lg border bg-card p-6 space-y-5 text-center shadow-lg">
          {blocked ? (
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          ) : (
            <ShieldCheck className="h-12 w-12 mx-auto text-primary" />
          )}
          <div className="space-y-2">
            <h2 className="text-xl font-bold">
              {blocked ? "يلزم السماح بالميكروفون" : "السماح بالصوت والكاميرا"}
            </h2>
            <p className="text-sm text-muted-foreground leading-6">
              {blocked
                ? errorText
                : "اضغط الزر التالي، ثم اختر «سماح» من رسالة الهاتف حتى تعمل الحصة بالصوت والصورة."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3" aria-label="حالة أذونات الحصة">
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">الميكروفون {mediaPermission.audio ? "مسموح" : "مطلوب"}</span>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">الكاميرا {mediaPermission.video ? "مسموحة" : "مطلوبة"}</span>
            </div>
          </div>

          <Button className="w-full min-h-12 gap-2 text-base" onClick={beginMeeting} disabled={requesting}>
            {requesting ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> في انتظار موافقتك...</>
            ) : blocked ? (
              <><RotateCcw className="h-5 w-5" /> إعادة طلب الإذن</>
            ) : (
              <><Mic className="h-5 w-5" /><Camera className="h-5 w-5" /> السماح بالكاميرا والميكروفون</>
            )}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose} disabled={requesting}>
            إلغاء والعودة
          </Button>
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
