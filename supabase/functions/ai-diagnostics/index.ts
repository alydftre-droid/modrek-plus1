// ai-diagnostics — developer-only test bench for the unified AI Provider Layer.
// Every test below goes through _shared/aiProvider.ts (no direct gateway
// calls), and can target one provider independently via `provider`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  aiChatCompletion,
  aiEmbeddings,
  aiListModels,
  aiSpeech,
  aiTranscription,
  getActiveAiProvider,
  probeAiProviderFileApi,
  resolveAiProvider,
} from "../_shared/aiProvider.ts";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type TestResult = {
  service: string;
  label: string;
  ok: boolean;
  status: number;
  provider: string;
  endpoint: string;
  duration_ms: number;
  detail: string;
  error: string | null;
};

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=";

// 1 second of silence, 8 kHz mono WAV — enough to prove the STT endpoint answers.
function silentWav(seconds = 1, sampleRate = 8000): Uint8Array {
  const dataSize = seconds * sampleRate * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buf);
}

function toResult(service: string, label: string, r: {
  ok: boolean; status: number; provider: string; endpoint: string; duration_ms: number; error?: string | null;
}, detail = ""): TestResult {
  return {
    service,
    label,
    ok: r.ok,
    status: r.status,
    provider: r.provider,
    endpoint: r.endpoint,
    duration_ms: r.duration_ms,
    detail,
    error: r.error ? String(r.error).slice(0, 700) : null,
  };
}

async function testModels(provider?: string | null) {
  const r = await aiListModels(provider);
  const count = Array.isArray((r.data as any)?.data) ? (r.data as any).data.length : 0;
  return toResult("models", "قائمة الموديلات", r, count ? `${count} موديل متاح` : "");
}

async function testChat(provider: string | null | undefined, model: string) {
  const r = await aiChatCompletion({
    providerName: provider,
    timeoutMs: 30_000,
    body: {
      model,
      messages: [
        { role: "system", content: "أجب بكلمة واحدة فقط: جاهز" },
        { role: "user", content: "اختبار اتصال" },
      ],
      max_tokens: 24,
    },
  });
  const reply = String((r.data as any)?.choices?.[0]?.message?.content || "").trim();
  const ok = r.ok && !!reply;
  return toResult("chat", "المحادثة (Chat)", { ...r, ok, error: r.error ?? (reply ? null : "EMPTY_RESPONSE") }, reply.slice(0, 120));
}

async function testStreaming(provider: string | null | undefined, model: string) {
  const r = await aiChatCompletion({
    providerName: provider,
    timeoutMs: 30_000,
    stream: true,
    body: {
      model,
      messages: [{ role: "user", content: "اكتب رقم 1 فقط" }],
      stream: true,
      max_tokens: 24,
    },
  });
  if (!r.ok || !r.response?.body) {
    return toResult("streaming", "البث المباشر (Streaming)", { ...r, ok: false, error: r.error ?? "NO_STREAM_BODY" });
  }
  const reader = r.response.body.getReader();
  const decoder = new TextDecoder();
  let received = "";
  try {
    for (let i = 0; i < 6; i++) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += decoder.decode(chunk.value, { stream: true });
      if (received.includes("data:")) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const ok = received.includes("data:");
  return toResult(
    "streaming",
    "البث المباشر (Streaming)",
    { ...r, ok, error: ok ? null : "NO_SSE_CHUNKS" },
    ok ? "تم استقبال أول شرائح SSE بنجاح" : received.slice(0, 200),
  );
}

async function testVision(provider: string | null | undefined, model: string) {
  const r = await aiChatCompletion({
    providerName: provider,
    timeoutMs: 45_000,
    body: {
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "صف هذه الصورة بكلمة واحدة." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG_BASE64}` } },
        ],
      }],
      max_tokens: 32,
    },
  });
  const reply = String((r.data as any)?.choices?.[0]?.message?.content || "").trim();
  const ok = r.ok && !!reply;
  return toResult("vision", "تحليل الصور (Vision)", { ...r, ok, error: r.error ?? (reply ? null : "EMPTY_RESPONSE") }, reply.slice(0, 120));
}

async function testOcr(provider: string | null | undefined, model: string) {
  const r = await aiChatCompletion({
    providerName: provider,
    timeoutMs: 45_000,
    body: {
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "استخرج أي نص مرئي. إن لم يوجد نص فاكتب: لا نص" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG_BASE64}` } },
        ],
      }],
      max_tokens: 48,
    },
  });
  const reply = String((r.data as any)?.choices?.[0]?.message?.content || "").trim();
  const ok = r.ok && !!reply;
  return toResult("ocr", "استخراج النصوص (OCR)", { ...r, ok, error: r.error ?? (reply ? null : "EMPTY_RESPONSE") }, reply.slice(0, 120));
}

async function testEmbeddings(provider: string | null | undefined, model: string) {
  const r = await aiEmbeddings({
    providerName: provider,
    model,
    input: ["اختبار التمثيل الرقمي للنصوص"],
    dimensions: 768,
  });
  const vec = (r.data as any)?.data?.[0]?.embedding;
  const ok = r.ok && Array.isArray(vec) && vec.length > 0;
  return toResult(
    "embeddings",
    "التمثيل الرقمي (Embeddings)",
    { ...r, ok, error: r.error ?? (ok ? null : "EMPTY_EMBEDDING") },
    ok ? `طول المتجه: ${vec.length}` : "",
  );
}

async function testTts(provider: string | null | undefined, model: string, voice: string) {
  const r = await aiSpeech({
    providerName: provider,
    timeoutMs: 60_000,
    body: {
      model,
      input: "اختبار الصوت داخل منصة مدرك بلس.",
      voice,
      response_format: "pcm",
    },
  });
  if (!r.ok) return toResult("tts", "تحويل النص لصوت (TTS)", r);
  const bytes = new Uint8Array(await r.response!.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const ok = bytes.byteLength > 1000;
  return toResult(
    "tts",
    "تحويل النص لصوت (TTS)",
    { ...r, ok, error: ok ? null : "EMPTY_AUDIO" },
    ok ? `حجم الصوت: ${(bytes.byteLength / 1024).toFixed(1)} كيلوبايت` : "",
  );
}

async function testStt(provider: string | null | undefined, model: string) {
  const wav = silentWav();
  const r = await aiTranscription({
    providerName: provider,
    model,
    language: "ar",
    fileName: "diagnostic.wav",
    file: new Blob([wav], { type: "audio/wav" }),
  });
  const text = String((r.data as any)?.text ?? "");
  return toResult(
    "stt",
    "تحويل الصوت لنص (STT)",
    r,
    r.ok ? `النص المُستخرج: "${text.slice(0, 80)}"` : "",
  );
}

// File API — reports whether the active provider can host book files, or whether
// this single service stays independent on GEMINI_API_KEY.
async function testFileApi(provider: string | null | undefined) {
  const st = await probeAiProviderFileApi(provider);
  const ok = st.route === "provider" ? true : st.key_present;
  return {
    service: "file_api",
    label: "رفع ملفات الكتب (File API)",
    ok,
    status: st.probe_status,
    provider: st.provider,
    endpoint: st.endpoint,
    duration_ms: st.probe_duration_ms,
    detail: st.route === "provider"
      ? "يمر عبر المزوّد النشط"
      : `خدمة مستقلة عن المزوّد النشط — تعتمد على ${st.key_env}${st.key_present ? " (المفتاح موجود)" : ""}`,
    error: ok ? null : `${st.key_env}_MISSING`,
  } as TestResult;
}

const DEFAULTS = {
  chat: "google/gemini-2.5-flash",
  vision: "google/gemini-2.5-flash",
  ocr: "google/gemini-2.5-flash",
  embeddings: "openai/text-embedding-3-small",
  tts: "google/gemini-3.1-flash-tts-preview",
  stt: "openai/whisper-1",
  voice: "Charon",
};

Deno.serve(async (req) => {
  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  // Preflight and service-role/cron callers carry no user token and pass through.
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (isAdmin !== true) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const providerName = body.provider ? String(body.provider) : null;
    const requested: string[] = Array.isArray(body.services) && body.services.length
      ? body.services.map((s: unknown) => String(s))
      : ["models", "chat", "streaming", "vision", "ocr", "embeddings", "tts", "stt", "file_api"];
    const models = { ...DEFAULTS, ...(body.models && typeof body.models === "object" ? body.models : {}) };

    const target = await resolveAiProvider(providerName);
    const active = await getActiveAiProvider();
    const fileApi = await probeAiProviderFileApi(providerName);

    const runners: Record<string, () => Promise<TestResult>> = {
      models: () => testModels(providerName),
      chat: () => testChat(providerName, models.chat),
      streaming: () => testStreaming(providerName, models.chat),
      vision: () => testVision(providerName, models.vision),
      ocr: () => testOcr(providerName, models.ocr),
      embeddings: () => testEmbeddings(providerName, models.embeddings),
      tts: () => testTts(providerName, models.tts, models.voice),
      stt: () => testStt(providerName, models.stt),
      file_api: () => testFileApi(providerName),
    };

    const results: TestResult[] = [];
    for (const service of requested) {
      const runner = runners[service];
      if (!runner) continue;
      try {
        results.push(await runner());
      } catch (err) {
        results.push({
          service,
          label: service,
          ok: false,
          status: 0,
          provider: target.provider,
          endpoint: target.baseUrl,
          duration_ms: 0,
          detail: "",
          error: String((err as Error)?.message || err).slice(0, 500),
        });
      }
    }

    return json({
      provider: {
        provider: target.provider,
        label: target.label,
        base_url: target.baseUrl,
        api_key_env: target.apiKeyEnv,
        has_key: target.hasKey,
        is_active: target.provider === active.provider,
      },
      active_provider: active.provider,
      layer: "unified_ai_provider_layer",
      file_api: fileApi,
      results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });
  } catch (err) {
    console.error("ai-diagnostics error", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
