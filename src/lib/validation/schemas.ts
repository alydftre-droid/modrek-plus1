/**
 * Central Zod validation schemas for user-facing forms.
 *
 * Use these in any component that accepts user input (auth, wallet, profile,
 * exams, uploads). Validate BEFORE hitting Supabase or edge functions.
 *
 *   const parsed = loginSchema.safeParse(values);
 *   if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
 *   await signIn(parsed.data);
 */
import { z } from "zod";

// -------- Auth --------
export const emailSchema = z
  .string()
  .trim()
  .min(1, "البريد الإلكتروني مطلوب")
  .max(255, "البريد الإلكتروني طويل جداً")
  .email("صيغة البريد الإلكتروني غير صحيحة");

export const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف")
  .max(128, "كلمة المرور طويلة جداً");

export const strongPasswordSchema = passwordSchema
  .regex(/[A-Za-z]/, "يجب أن تحتوي كلمة المرور على حرف على الأقل")
  .regex(/\d/, "يجب أن تحتوي كلمة المرور على رقم على الأقل");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم قصير جداً").max(80, "الاسم طويل جداً"),
  email: emailSchema,
  password: strongPasswordSchema,
});

// -------- Wallet --------
export const walletAmountSchema = z
  .number({ invalid_type_error: "المبلغ يجب أن يكون رقماً" })
  .finite("قيمة غير صالحة")
  .positive("المبلغ يجب أن يكون أكبر من صفر")
  .max(1_000_000, "المبلغ يتجاوز الحد المسموح");

export const depositRequestSchema = z.object({
  amount: walletAmountSchema,
  paymentMethod: z.string().trim().min(1, "اختر طريقة الدفع").max(50),
  referenceNumber: z.string().trim().min(3, "رقم المرجع قصير").max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500, "الملاحظة طويلة").optional().or(z.literal("")),
});

export const withdrawalRequestSchema = z.object({
  amount: walletAmountSchema,
  paymentMethodId: z.string().uuid("طريقة الدفع غير صالحة"),
});

// -------- Profile --------
export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9\-\s()]{6,20}$/, "رقم الهاتف غير صالح")
    .optional()
    .or(z.literal("")),
  bio: z.string().trim().max(500, "النبذة طويلة جداً").optional().or(z.literal("")),
});

// -------- Exams --------
export const examCreateSchema = z.object({
  title: z.string().trim().min(3, "العنوان قصير جداً").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  duration_minutes: z.number().int().min(1, "المدة يجب أن تكون دقيقة على الأقل").max(600),
  question_count: z.number().int().min(1).max(200).optional(),
});

// -------- File uploads --------
export const uploadFileSchema = z.object({
  name: z.string().max(255),
  size: z.number().max(200 * 1024 * 1024, "حجم الملف يتجاوز 200MB"),
  type: z.string().max(120),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type DepositRequestInput = z.infer<typeof depositRequestSchema>;
export type WithdrawalRequestInput = z.infer<typeof withdrawalRequestSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ExamCreateInput = z.infer<typeof examCreateSchema>;
