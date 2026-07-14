// Zod schemas for the small set of "critical" models that must be identical
// across Web / PWA / Android. These schemas run inside `validated()` after
// every Supabase read of one of these tables. A validation failure means the
// row shape drifted from what the client expects (schema migration, backend
// change, corrupted cache) — the response is discarded and the query is
// force-refetched.
//
// Deliberately loose: unknown extra fields are allowed (`.passthrough()`) so
// backend additions do NOT break the app. We only assert the fields the UI
// actually reads.
import { z } from "zod";

const isoOrDate = z.union([z.string(), z.date()]);

export const walletSchema = z
  .object({
    id: z.string().uuid().or(z.string().min(1)),
    user_id: z.string().min(1),
    balance: z.number().finite(),
  })
  .passthrough();

export const teacherWalletSchema = z
  .object({
    id: z.string().min(1),
    teacher_id: z.string().min(1),
    balance: z.number().finite(),
  })
  .passthrough();

export const subscriptionSchema = z
  .object({
    id: z.string().min(1),
    student_id: z.string().min(1),
    subject_id: z.string().min(1),
    start_date: isoOrDate,
    end_date: isoOrDate,
    is_active: z.boolean(),
  })
  .passthrough();

export const notificationSchema = z
  .object({
    id: z.string().min(1),
    user_id: z.string().min(1).optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    created_at: isoOrDate,
    is_read: z.boolean().optional(),
  })
  .passthrough();

export const profileSchema = z
  .object({
    id: z.string().min(1),
    full_name: z.string().nullable().optional(),
    role: z.string().optional(),
  })
  .passthrough();

export const libraryBookSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
  })
  .passthrough();

export const dataIntegritySchemas = {
  wallet: walletSchema,
  teacherWallet: teacherWalletSchema,
  subscription: subscriptionSchema,
  notification: notificationSchema,
  profile: profileSchema,
  libraryBook: libraryBookSchema,
} as const;

export type DataIntegritySchemaKey = keyof typeof dataIntegritySchemas;
