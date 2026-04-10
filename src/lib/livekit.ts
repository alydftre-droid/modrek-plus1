type LiveKitErrorShape = {
  code?: number;
  message?: string;
  name?: string;
  reason?: number;
  reasonName?: string;
  status?: number;
};

function toErrorShape(error: unknown): LiveKitErrorShape | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as LiveKitErrorShape;
  return {
    code: candidate.code,
    message: candidate.message,
    name: candidate.name,
    reason: candidate.reason,
    reasonName: candidate.reasonName,
    status: candidate.status,
  };
}

export function getLiveKitErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  const candidate = toErrorShape(error);
  if (!candidate) return fallback;

  if (candidate.status === 401) return "فشل الاتصال بالبث: التوكن غير صالح أو بيانات LiveKit غير متطابقة";
  if (candidate.message) return candidate.message;

  return fallback;
}

export function logLiveKitDiagnostic(scope: string, error: unknown, extra: Record<string, unknown> = {}) {
  const candidate = toErrorShape(error);

  console.error(`[${scope}]`, {
    ...extra,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...candidate,
          }
        : candidate || error,
  });
}