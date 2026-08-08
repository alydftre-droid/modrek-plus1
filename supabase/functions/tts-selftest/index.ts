// TEMPORARY diagnostic: validates the unified "معلم Modrek Plus" TTS voice
// across the mandatory test sentences. Deleted after verification.
import { getActiveAiApiKey } from "../_shared/aiProvider.ts";
import {
  openRouterTts,
  estimatePcmDurationSeconds,
  preprocessSpeechForTeacher,
  MODREK_TTS_SETTINGS,
  EGYPTIAN_TEACHER_TTS_INSTRUCTIONS,
} from "../_shared/openrouter.ts";

const SELFTEST_TOKEN = "modrek-tts-selftest-2026";

Deno.serve(async (req) => {
  if (req.headers.get("x-selftest-token") !== SELFTEST_TOKEN) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const cases: Array<{ name: string; text: string }> = body.cases || [];
  const apiKey = await getActiveAiApiKey();
  const results: unknown[] = [];
  for (const c of cases) {
    const started = Date.now();
    const res = await openRouterTts({
      apiKey,
      input: c.text,
      format: "pcm",
      timeoutMs: 120_000,
    });
    if (!res.ok) {
      results.push({ name: c.name, ok: false, status: res.status, error: String(res.lastError).slice(0, 300) });
      continue;
    }
    const pcm = new Uint8Array(await res.response.arrayBuffer());
    results.push({
      name: c.name,
      ok: true,
      chars: c.text.length,
      normalized_preview: preprocessSpeechForTeacher(c.text).slice(0, 160),
      pcm_bytes: pcm.byteLength,
      duration_s: estimatePcmDurationSeconds(pcm.byteLength),
      chars_per_second: Number((c.text.length / Math.max(0.1, estimatePcmDurationSeconds(pcm.byteLength))).toFixed(1)),
      latency_ms: Date.now() - started,
    });
  }
  return new Response(JSON.stringify({ settings: MODREK_TTS_SETTINGS, prompt_length: EGYPTIAN_TEACHER_TTS_INSTRUCTIONS.length, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
