import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHODS, PaymentMethodKey } from "@/components/wallet/PaymentLogo";

export interface PaymentMethodConfig {
  key: PaymentMethodKey;
  number: string;
  enabled: boolean;
}

export interface PaymentMethodsConfig {
  all_enabled: boolean;
  methods: PaymentMethodConfig[];
}

export const DEFAULT_PAYMENT_CONFIG: PaymentMethodsConfig = {
  all_enabled: true,
  methods: PAYMENT_METHODS.map((m) => ({ key: m.key, number: "", enabled: false })),
};

export async function loadPaymentMethodsConfig(): Promise<PaymentMethodsConfig> {
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["payment_methods_config", "payment_receive_number"]);
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));
  const raw = map.get("payment_methods_config");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.methods)) {
        const byKey = new Map(parsed.methods.map((m: any) => [m.key, m]));
        return {
          all_enabled: parsed.all_enabled !== false,
          methods: PAYMENT_METHODS.map((m) => {
            const existing = byKey.get(m.key) as any;
            return {
              key: m.key,
              number: existing?.number || "",
              enabled: !!existing?.enabled,
            };
          }),
        };
      }
      // legacy: array form [{id,label,number}]
      if (Array.isArray(parsed)) {
        const legacyNum = parsed[0]?.number || map.get("payment_receive_number") || "";
        return {
          all_enabled: true,
          methods: PAYMENT_METHODS.map((m, i) => ({
            key: m.key,
            number: i === 0 ? legacyNum : "",
            enabled: i === 0 && !!legacyNum,
          })),
        };
      }
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  }
  const fallback = map.get("payment_receive_number") || "";
  return {
    all_enabled: true,
    methods: PAYMENT_METHODS.map((m, i) => ({
      key: m.key,
      number: i === 0 ? fallback : "",
      enabled: i === 0 && !!fallback,
    })),
  };
}

export async function savePaymentMethodsConfig(config: PaymentMethodsConfig) {
  const value = JSON.stringify(config);
  const { data: existing } = await supabase
    .from("platform_settings")
    .select("id")
    .eq("key", "payment_methods_config")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("platform_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("id", (existing as any).id);
  } else {
    await supabase.from("platform_settings").insert({ key: "payment_methods_config", value });
  }
  // keep legacy single number in sync (first enabled)
  const firstEnabled = config.methods.find((m) => m.enabled && m.number);
  if (firstEnabled) {
    const { data: ex2 } = await supabase
      .from("platform_settings")
      .select("id")
      .eq("key", "payment_receive_number")
      .maybeSingle();
    if (ex2) {
      await supabase
        .from("platform_settings")
        .update({ value: firstEnabled.number, updated_at: new Date().toISOString() })
        .eq("id", (ex2 as any).id);
    } else {
      await supabase.from("platform_settings").insert({ key: "payment_receive_number", value: firstEnabled.number });
    }
  }
}
