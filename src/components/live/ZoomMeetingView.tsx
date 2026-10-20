import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, X, Copy, Camera, Mic, ShieldCheck, RotateCcw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  ZoomLiveError,
  disableZoomSelfMirror,
  endZoomSession,
  joinZoomSession,
  leaveZoomSession,
  loadZoomSdk,
  reconcileZoomSession,
  requestZoomMediaPermissions,
  setZoomRootVisible,
  startZoomArabicLocalization,
  startZoomSession,
  stopZoomArabicLocalization,
  type ZoomJoinPayload,
} from "@/lib/zoomMeeting";
import { isLiveRecordingActive, startLiveRecording, stopAndSaveLiveRecording } from "@/lib/liveRecorder";

/** Saves the teacher's class recording and reports progress in one toast. */
async function saveRecordingWithToast() {
  if (!isLiveRecordingActive()) return;
  const toastId = toast.loading("جاري حفظ تسجيل الحصة... لا تغلق الصفحة");
  try {
    const result = await stopAndSaveLiveRecording((percent) =>
      toast.loading(`جاري رفع تسجيل الحصة ${percent}% — لا تغلق الصفحة`, { id: toastId }),
    );
    if (result.saved) toast.success("تم حفظ تسجيل الحصة في الحصص المسجلة ✅", { id: toastId });
    else toast.dismiss(toastId);
  } catch (error) {
    toast.error(error instanceof Error ? `تعذر حفظ التسجيل: ${error.message}` : "تعذر حفظ تسجيل الحصة", { id: toastId });
  }
}

interface Props {
  mode: "host" | "attendee";
  /** Required for host mode (start/reuse a session for this group). */
  groupId?: string;
  groupTitle?: string;
  /** Required for attendee mode. */
  sessionId?: string;
  title?: string;
  onClose: () => void;
  onSessionReady?: (session: any) => void;
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
  onSessionReady,
  onUnavailable,
}: Props) {
  const { user } = useAuth();
  const [status, setStatus] = useState<
    "permission" | "requesting-permission" | "permission-blocked" | "preparing" | "joining" | "in-meeting" | "disconnected" | "error"
  >("permission");
  const [mediaPermission, setMediaPermission] = useState({ audio: false, video: false });
  const [errorText, setErrorText] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [diagnostic, setDiagnostic] = useState<Record<string, unknown> | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startingRef = useRef(false);
  const retriedRef = useRef(false);
  const endedRef = useRef(false);
  const lastConnectedAtRef = useRef(0);
  const sessionInfoRef = useRef<{ id: string; groupId: string; title: string } | null>(null);
  const recordingScheduledRef = useRef(false);

  /** Zoom's default mirror makes the teacher's right hand look like the left. */
  const applyNoMirror = () => {
    disableZoomSelfMirror();
    window.setTimeout(disableZoomSelfMirror, 3000);
    window.setTimeout(disableZoomSelfMirror, 10000);
  };

  /** The teacher's browser records the class so it can be saved afterwards. */
  const scheduleRecording = () => {
    if (mode !== "host" || recordingScheduledRef.current || !user?.id) return;
    const info = sessionInfoRef.current;
    if (!info) return;
    recordingScheduledRef.current = true;
    // Give Zoom a few seconds to own the camera before opening a second reader.
    window.setTimeout(() => {
      if (cancelledRef.current || endedRef.current) return;
      void startLiveRecording({ sessionId: info.id, groupId: info.groupId, teacherId: user.id, title: info.title })
        .then((started) => {
          if (started) toast.success("بدأ تسجيل الحصة تلقائيًا، وسيُحفظ في الحصص المسجلة عند إنهاء البث");
        });
    }, 6000);
  };

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      startingRef.current = false;
      stopZoomArabicLocalization();
      setZoomRootVisible(false);
      if (mode === "host") void saveRecordingWithToast();
      const id = activeSessionId.current;
      if (id && mode === "attendee") void leaveZoomSession(id);
      if (joinedRef.current) {
        try {
          (window as any).ZoomMtg?.leaveMeeting({
            success: () => {
              joinedRef.current = false;
            },
          });
        } catch {
          /* SDK already torn down */
        }
      }
    };
  }, [mode]);

  const beginMeeting = async () => {
    if (startingRef.current) return;
    // Zoom's Client View can only join once per page load. A second join in
    // the same page (after leaving) is done through a clean reload that the
    // user asked for, never automatically.
    if ((window as any).__modrekZoomUsed) {
      window.location.reload();
      return;
    }
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
        if (payload.session?.id) {
          sessionInfoRef.current = {
            id: String(payload.session.id),
            groupId: String(payload.session.group_id || groupId || ""),
            title: String(payload.session.title || title || groupTitle || "حصة مباشرة"),
          };
        }
        onSessionReady?.(payload.session);

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
              lastConnectedAtRef.current = Date.now();
              setStatus("in-meeting");
              applyNoMirror();
              scheduleRecording();
              return;
            }
            if (data?.meetingStatus !== 3 || !joinedRef.current || endedRef.current) return;
            // Zoom emits status 3 transiently while its own audio/video
            // permission dialog is open. Never end the class on that signal:
            // wait, then confirm with the server before closing anything.
            const closedAt = Date.now();
            window.setTimeout(() => {
              if (cancelledRef.current || endedRef.current) return;
              // A newer "connected" event means the meeting is still alive.
              if (lastConnectedAtRef.current > closedAt) return;
              const id = activeSessionId.current;
              if (!id) {
                endedRef.current = true;
                onClose();
                return;
              }
              void reconcileZoomSession(id)
                .then((result) => {
                  if (cancelledRef.current || endedRef.current) return;
                  if (lastConnectedAtRef.current > closedAt) return;
                  if (result?.active) {
                    // The class is still running: show a clear way back in
                    // instead of a frozen Zoom screen or a surprise reload.
                    setZoomRootVisible(false);
                    setStatus("disconnected");
                    return;
                  }
                  endedRef.current = true;
                  if (mode === "attendee") void leaveZoomSession(id);
                  onClose();
                })
                .catch(() => {
                  setZoomRootVisible(false);
                  setStatus("disconnected");
                });
            }, 4000);
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
                signature: payload.signature,
                meetingNumber: payload.meetingNumber,
                passWord: payload.password || "",
                userName: payload.userName || "مستخدم",
                zak: payload.role === 1 ? payload.zak || undefined : undefined,
                success: () => finish(),
                error: (err: any) => abort(new ZoomLiveError(
                  err?.errorMessage === "Token error"
                    ? "انتهى اجتماع Zoom السابق أثناء خروج المعلم. أعد المحاولة لفتح حصة جديدة تلقائيًا."
                    : err?.errorMessage || err?.reason || "فشل الانضمام للاجتماع",
                  `zoom_join_${err?.errorCode ?? err?.errorCodeName ?? "unknown"}`,
                  {
                    step: "sdk_join",
                    source: "ZoomMtg.join",
                    zoomCode: err?.errorCode ?? err?.errorCodeName ?? "unknown",
                    zoomMessage: err?.errorMessage || err?.reason || "Zoom join failed",
                  },
                )),
              };
              if (!payload.sdkKey || !joinPayload.signature || !joinPayload.meetingNumber) {
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
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      if (mode === "host" && id) await endZoomSession(id);
      if (mode === "attendee" && id) await leaveZoomSession(id);
    } catch (error) {
      endedRef.current = false;
      toast.error(error instanceof Error ? error.message : "تعذر إنهاء البث");
      return;
    }
    setZoomRootVisible(false);
    onClose();
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
